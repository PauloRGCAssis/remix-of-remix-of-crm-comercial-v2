import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  email: z.string({ required_error: "Informe um e-mail válido." }).trim().email("Informe um e-mail válido.").max(320, "Informe um e-mail válido.").transform((value) => value.toLowerCase()),
  password: z.string({ required_error: "A senha precisa ter de 8 a 128 caracteres." }).min(8, "A senha precisa ter de 8 a 128 caracteres.").max(128, "A senha precisa ter de 8 a 128 caracteres."),
  token: z.string({ required_error: "Informe o código recebido por e-mail." })
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^[0-9]{6,8}$/, "Informe o código de 6 a 8 dígitos recebido por e-mail.")),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return json({ error: message }, 400);
  }

  const backendUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!backendUrl || !serviceKey || !anonKey) {
    console.error("ativar-acesso: configuração administrativa indisponível");
    return json({ error: "Não foi possível concluir seu primeiro acesso. Contate o administrador." }, 500);
  }

  const { email, password, token } = parsed.data;
  const admin = createClient(backendUrl, serviceKey, { auth: { persistSession: false } });

  try {
    let { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, nome, email, senha_definida")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      console.error("ativar-acesso: falha ao localizar cadastro", profileError.code);
      return json({ error: "Não foi possível validar seu cadastro. Contate o administrador." }, 500);
    }
    // O ID é o vínculo definitivo entre Auth e o cadastro administrativo.
    // Este fallback cobre cadastros antigos cujo e-mail em profiles esteja vazio
    // ou temporariamente divergente, sem autorizar um usuário que não tenha perfil.
    if (!profile) {
      let authUserId: string | null = null;
      for (let page = 1; page <= 20 && !authUserId; page += 1) {
        const { data: authList, error: authListError } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (authListError) {
          console.error("ativar-acesso: falha ao consultar vínculo Auth", authListError.status);
          return json({ error: "Não foi possível validar seu cadastro. Contate o administrador." }, 500);
        }
        const users = authList?.users ?? [];
        authUserId = users.find((user) => (user.email ?? "").trim().toLowerCase() === email)?.id ?? null;
        if (users.length < 200) break;
      }

      if (authUserId) {
        const { data: linkedProfile, error: linkedError } = await admin
          .from("profiles")
          .select("id, nome, email, senha_definida")
          .eq("id", authUserId)
          .maybeSingle();
        if (linkedError) {
          console.error("ativar-acesso: falha ao localizar perfil vinculado", linkedError.code);
          return json({ error: "Não foi possível validar seu cadastro. Contate o administrador." }, 500);
        }
        profile = linkedProfile;
      }
    }

    if (!profile) {
      console.warn("ativar-acesso: recusado na etapa cadastro");
      return json({ ok: false, code: "EMAIL_NAO_AUTORIZADO", error: "Este e-mail não está autorizado a acessar o CRM." });
    }

    const { data: access, error: accessError } = await admin
      .from("user_access")
      .select("ativo")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (accessError) {
      console.error("ativar-acesso: falha ao validar status", accessError.code);
      return json({ error: "Não foi possível validar sua autorização. Contate o administrador." }, 500);
    }
    if (access?.ativo !== true) {
      console.warn("ativar-acesso: recusado na etapa status");
      return json({ ok: false, code: "EMAIL_NAO_AUTORIZADO", error: "Este e-mail não está autorizado a acessar o CRM." });
    }
    if (profile.senha_definida === true) {
      console.warn("ativar-acesso: recusado na etapa acesso-ja-ativo");
      return json({ ok: false, code: "ACESSO_JA_ATIVO", error: "Este usuário já possui acesso. Utilize a tela de login." });
    }

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(profile.id);
    if (authError || !authData.user) {
      console.error("ativar-acesso: conta Auth ausente", authError?.status);
      return json({ error: "Cadastro de acesso incompleto. Contate o administrador." }, 500);
    }
    if ((authData.user.email ?? "").trim().toLowerCase() !== email) {
      console.warn("ativar-acesso: recusado na etapa vinculo-email");
      return json({ ok: false, code: "EMAIL_NAO_AUTORIZADO", error: "Este e-mail não está autorizado a acessar o CRM." });
    }

    // A existência de um cadastro não comprova titularidade do e-mail.
    // O código de uso único deve ser confirmado no Supabase Auth antes de mudar a senha.
    const otpClient = createClient(backendUrl, anonKey, { auth: { persistSession: false } });
    const { data: otpData, error: otpError } = await otpClient.auth.verifyOtp({
      email, token, type: "email",
    });
    if (otpError || otpData.user?.id !== profile.id ||
        (otpData.user?.email ?? "").trim().toLowerCase() !== email) {
      return json({ error: "Código de verificação inválido ou expirado." }, 403);
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, {
      password,
      email_confirm: true,
    });
    if (passwordError) {
      const weakPassword = passwordError.status === 422 || /weak|guess|pwned|compromised/i.test(passwordError.message);
      if (weakPassword) {
        console.warn("ativar-acesso: senha recusada pela política de segurança");
        return json({
          ok: false,
          code: "SENHA_FRACA",
          error: "Esta senha é muito comum ou já apareceu em vazamentos. Escolha uma senha diferente e mais forte.",
        });
      }
      console.error("ativar-acesso: falha ao definir senha", passwordError.status);
      return json({ error: "Não foi possível criar sua senha. Contate o administrador." }, 500);
    }

    const { error: stateError } = await admin
      .from("profiles")
      .update({ senha_definida: true, must_change_password: false })
      .eq("id", profile.id)
      .eq("senha_definida", false);

    if (stateError) {
      console.error("ativar-acesso: falha ao concluir ativação", stateError.code);
      return json({ error: "A senha foi criada, mas não foi possível concluir a ativação. Contate o administrador." }, 500);
    }

    const { error: auditError } = await admin.from("access_audit_log").insert({
      user_id: profile.id,
      usuario_nome: profile.nome,
      evento: "primeiro_acesso_concluido",
      modulo: "auth",
      detalhe: "Primeira senha criada pelo usuário.",
      metadata: {},
    });
    if (auditError) console.error("ativar-acesso: auditoria não bloqueante", auditError.code);

    return json({ ok: true });
  } catch (error) {
    console.error("ativar-acesso: erro inesperado", error instanceof Error ? error.message : error);
    return json({ error: "Não foi possível concluir seu primeiro acesso. Contate o administrador." }, 500);
  }
});