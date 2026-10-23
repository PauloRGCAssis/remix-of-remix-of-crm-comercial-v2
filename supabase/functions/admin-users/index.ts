import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData } = await caller.auth.getUser();
    const callerId = userData.user?.id;
    if (!callerId) return json({ error: "Sessão inválida" }, 401);

    // Mesmo administradores devem possuir cadastro de acesso ativo.
    const { data: access, error: accessError } = await admin.from("user_access")
      .select("ativo").eq("user_id", callerId).maybeSingle();
    if (accessError) return json({ error: "Falha ao validar autorização" }, 503);
    if (access?.ativo !== true) return json({ error: "Acesso desativado" }, 403);

    const { data: isAdmin, error: roleError } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (roleError) return json({ error: "Falha ao validar autorização" }, 503);
    if (isAdmin !== true) return json({ error: "Apenas administradores" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      return json({
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email,
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at,
        })),
      });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const nome = String(body.nome ?? "").trim();
      const vendedoresLista: string[] = Array.isArray(body.vendedores)
        ? body.vendedores.map((v: unknown) => String(v)).filter(Boolean)
        : body.vendedor
        ? [String(body.vendedor)]
        : [];
      const vendedor = vendedoresLista[0] ?? null;
      if (!email) return json({ error: "Informe o e-mail do usuário." }, 400);

      // Sem senha: o próprio usuário define a dele em "Primeiro acesso".
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: nome || email.split("@")[0], vendedor },
      });

      let newId: string;
      if (error) {
        const jaExiste = /already been registered|already exists|duplicate/i.test(error.message);
        if (!jaExiste) return json({ error: error.message }, 400);
        // E-mail já cadastrado: reaproveita a conta existente e apenas reaplica
        // perfil/escopo/permissões, sem recriar login nem apagar histórico.
        const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existente = lista?.users.find((u) => (u.email ?? "").toLowerCase() === email);
        if (!existente) {
          return json(
            { error: "Já existe um usuário com este e-mail. Use a ação Editar usuário." },
            400,
          );
        }
        newId = existente.id;
        await admin.auth.admin.updateUserById(newId, {
          user_metadata: { full_name: nome || email.split("@")[0], vendedor },
        });
      } else {
        newId = data.user!.id;
      }


      await admin
        .from("profiles")
        .update({
          nome: nome || email.split("@")[0],
          vendedor,
          vendedores: vendedoresLista,
          email,
          senha_definida: false,
          must_change_password: false,
        })
        .eq("id", newId);

      await admin.from("user_access").upsert(
        {
          user_id: newId,
          profile_id: body.profile_id ?? null,
          ativo: true,
          escopo: body.escopo ?? "meus_dados",
          scope_id: body.scope_id ?? null,
          vendedores_autorizados: Array.isArray(body.vendedores_autorizados)
            ? body.vendedores_autorizados
            : [],

        },
        { onConflict: "user_id" },
      );

      const copyFrom = body.copy_from_user_id ? String(body.copy_from_user_id) : null;
      if (copyFrom) {
        const { data: origPerms } = await admin
          .from("user_permissions")
          .select("modulo, acao, permitido")
          .eq("user_id", copyFrom);
        await admin.from("user_permissions").delete().eq("user_id", newId);
        if (origPerms && origPerms.length > 0) {

          await admin.from("user_permissions").insert(
            origPerms.map((r: { modulo: string; acao: string; permitido: boolean }) => ({
              user_id: newId,
              modulo: r.modulo,
              acao: r.acao,
              permitido: r.permitido,
            })),
          );
        }
      }

      if (body.admin === true) {
        await admin.from("user_roles").upsert(
          { user_id: newId, role: "admin" },
          { onConflict: "user_id,role" },
        );
      }

      await admin.from("access_audit_log").insert({
        user_id: callerId,
        evento: copyFrom ? "usuario_criado_por_copia" : "usuario_criado",
        modulo: "administracao.usuarios",
        detalhe: copyFrom
          ? `Usuário ${email} foi criado a partir de uma cópia do usuário ${
            String(body.copy_from_label ?? copyFrom)
          }.`
          : email,
        metadata: copyFrom ? { copiado_de: copyFrom, novo_usuario: newId } : {},
      });

      return json({ id: newId, email });
    }

    // Edita um usuário existente sem recriar a conta (mesmo id, senha e histórico).
    if (action === "update") {
      const userId = String(body.user_id ?? "");
      if (!userId) return json({ error: "Usuário inválido." }, 400);
      const nome = String(body.nome ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const vendedoresLista: string[] = Array.isArray(body.vendedores)
        ? body.vendedores.map((v: unknown) => String(v)).filter(Boolean)
        : body.vendedor
        ? [String(body.vendedor)]
        : [];
      const vendedor = vendedoresLista[0] ?? null;

      const { data: atual } = await admin
        .from("profiles")
        .select("email, nome")
        .eq("id", userId)
        .maybeSingle();

      const authPatch: Record<string, unknown> = {
        user_metadata: { full_name: nome || email.split("@")[0], vendedor },
      };
      if (email && email !== (atual?.email ?? "").toLowerCase()) {
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      const { error: authErr } = await admin.auth.admin.updateUserById(userId, authPatch);
      if (authErr) return json({ error: authErr.message }, 400);

      const { error: profErr } = await admin
        .from("profiles")
        .update({
          nome: nome || null,
          email: email || null,
          vendedor,
          vendedores: vendedoresLista,
        })
        .eq("id", userId);
      if (profErr) return json({ error: profErr.message }, 400);

      const { error: accErr } = await admin.from("user_access").upsert(
        {
          user_id: userId,
          profile_id: body.profile_id ?? null,
          ativo: body.ativo !== false,
          escopo: body.escopo ?? "meus_dados",
          scope_id: body.scope_id ?? null,
          vendedores_autorizados: Array.isArray(body.vendedores_autorizados)
            ? body.vendedores_autorizados
            : [],
        },
        { onConflict: "user_id" },
      );
      if (accErr) return json({ error: accErr.message }, 400);

      if (body.admin === true) {
        await admin.from("user_roles").upsert(
          { user_id: userId, role: "admin" },
          { onConflict: "user_id,role" },
        );
      } else if (body.admin === false) {
        await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      }

      await admin.from("access_audit_log").insert({
        user_id: callerId,
        usuario_nome: nome || null,
        evento: "usuario_editado",
        modulo: "administracao.usuarios",
        detalhe: `Usuário ${atual?.nome ?? userId} atualizado para ${nome || email}.`,
        metadata: { user_id: userId },
      });

      return json({ ok: true });
    }

    // Libera o usuário para criar novamente a própria senha em "Primeiro acesso".

    if (action === "reset_password" || action === "liberar_primeiro_acesso") {
      const userId = String(body.user_id ?? "");
      if (!userId) return json({ error: "Usuário inválido." }, 400);

      const randomBytes = crypto.getRandomValues(new Uint8Array(24));
      const bloqueio = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await admin.auth.admin.updateUserById(userId, { password: bloqueio });
      if (error) return json({ error: error.message }, 400);

      await admin
        .from("profiles")
        .update({ senha_definida: false, must_change_password: false })
        .eq("id", userId);
      await admin.from("access_audit_log").insert({
        user_id: callerId,
        evento: "acesso_redefinido",
        modulo: "administracao.usuarios",
        detalhe: userId,
      });
      return json({ ok: true });
    }

    if (action === "set_banned") {
      const userId = String(body.user_id ?? "");
      const banned = body.banned === true;
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: banned ? "876000h" : "none",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
