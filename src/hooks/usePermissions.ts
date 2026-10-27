import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, normalizeVendorName, sameVendor, RELEITURA_ACESSO_MS } from "@/hooks/useUserRole";
import { exigeVisualizar, type PermissionAction } from "@/lib/modulesCatalog";
import { useAuth } from "@/contexts/AuthContext";

export type DataScope = "meus_dados" | "vendedores_selecionados" | "empresa";

export interface UserAccessRow {
  user_id: string;
  profile_id: string | null;
  ativo: boolean;
  escopo: DataScope;
  vendedores_autorizados: string[];
  scope_id: string | null;
}

export interface ResolvedScope {
  id: string;
  nome: string;
  base: DataScope;
  vendedores: string[];
  clientes: string[];
  grupos_economicos: string[];
  regioes: string[];
}

export interface PermissionsState {
  loading: boolean;
  isGestor: boolean;
  ativo: boolean;
  vendedor: string | null;
  escopo: DataScope;
  /** Escopo personalizado aplicado ao usuário (quando houver). */
  escopoPersonalizado: ResolvedScope | null;
  /** Vendedores que o usuário pode enxergar; `null` = todos. */
  vendedoresPermitidos: string[] | null;
  /** Clientes permitidos pelo escopo personalizado; `null` = sem restrição. */
  clientesPermitidos: string[] | null;
  /** Regiões (campo `regiao` da ficha) permitidas; `null` = sem restrição. */
  regioesPermitidas: string[] | null;
  /** Escopo com grupos econômicos: bloqueia dados de clientes (sem vínculo no banco). */
  gruposBloqueiam: boolean;
  /** Nome do perfil de permissão atribuído ao usuário (quando houver). */
  perfilNome: string | null;
  /** IA liberada pela matriz: `inteligencia` + `inteligencia.central_analise` (ou role admin). */
  podeUsarIA: boolean;
  can: (modulo: string, acao?: PermissionAction) => boolean;
  /** Pode abrir o módulo (menu e rota): ver `exigeVisualizar`. */
  podeAbrir: (modulo: string) => boolean;
  canSee: (vendedor?: string | null) => boolean;
}


/**
 * Permissões efetivas = perfil do usuário + exceções individuais.
 * Gestores (admin) recebem acesso total. A checagem também existe no banco
 * (`tem_permissao` / `pode_ver_vendedor`), então a tela é apenas a 1ª camada.
 */
export function usePermissions(): PermissionsState {
  const { authorizationVersion } = useAuth();
  const { userId, isGestor, vendedor, vendedores, verified, loading: roleLoading } = useUserRole();

  const query = useQuery({
    queryKey: ["user-permissions", userId, authorizationVersion],
    enabled: !!userId,
    refetchInterval: RELEITURA_ACESSO_MS,
    queryFn: async () => {
      const [accessRes, userPermsRes] = await Promise.all([
        supabase.from("user_access").select("*").eq("user_id", userId!).maybeSingle(),
        supabase.from("user_permissions").select("modulo, acao, permitido").eq("user_id", userId!),
      ]);
      if (accessRes.error) throw accessRes.error;
      if (userPermsRes.error) throw userPermsRes.error;
      const access = (accessRes.data ?? null) as UserAccessRow | null;

      let profilePerms: { modulo: string; acao: string; permitido: boolean }[] = [];
      let perfilNome: string | null = null;
      let perfilInvalido = false;
      if (access?.profile_id) {
        const perfilRes = await supabase
          .from("permission_profiles")
          .select("nome, ativo")
          .eq("id", access.profile_id)
          .maybeSingle();
        if (perfilRes.error) throw perfilRes.error;
        const perfil = perfilRes.data as { nome?: string; ativo?: boolean } | null;
        // Perfil inexistente ou inativo bloqueia o usuário (inclusive exceções);
        // a role técnica `admin` independe do perfil.
        if (perfil?.ativo !== true) {
          perfilInvalido = true;
        } else {
          perfilNome = perfil.nome ?? null;
          const res = await supabase
            .from("profile_permissions")
            .select("modulo, acao, permitido")
            .eq("profile_id", access.profile_id);
          if (res.error) throw res.error;
          profilePerms = res.data ?? [];
        }
      }
      let scope: ResolvedScope | null = null;
      if (access?.scope_id) {
        const res = await supabase
          .from("data_scopes" as never)
          .select("id, nome, base, vendedores, clientes, grupos_economicos, regioes, ativo")
          .eq("id", access.scope_id)
          .maybeSingle();
        const row = res.data as unknown as (ResolvedScope & { ativo: boolean }) | null;
        if (res.error) throw res.error;
        if (!row?.ativo) throw new Error('Escopo indisponível');
        if (row?.ativo) scope = row;
      }

      return {
        access,
        perfilNome,
        perfilInvalido,
        scope,
        profilePerms,
        userPerms: (userPermsRes.data ?? []) as typeof profilePerms,
      };
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of query.data?.profilePerms ?? []) m.set(`${p.modulo}:${p.acao}`, p.permitido);
    for (const p of query.data?.userPerms ?? []) m.set(`${p.modulo}:${p.acao}`, p.permitido);
    return m;
  }, [query.data]);

  const access = query.data?.access ?? null;
  const escopoPersonalizado = query.data?.scope ?? null;
  const escopo: DataScope = isGestor
    ? "empresa"
    : (escopoPersonalizado?.base ?? access?.escopo ?? "meus_dados");
  const ativo =
    !!userId && verified && !roleLoading && query.isSuccess && access?.ativo === true &&
    (isGestor || query.data?.perfilInvalido !== true);
  const perfilNome = query.data?.perfilNome ?? null;

  const can = useCallback(
    (modulo: string, acao: PermissionAction = "acessar") => {
      if (!ativo) return false;
      if (isGestor) return true;
      return map.get(`${modulo}:${acao}`) === true;
    },
    [isGestor, ativo, map],
  );

  /** Abrir o módulo (menu e rota): "acessar" e, quando o módulo oferece, "visualizar". */
  const podeAbrir = useCallback(
    (modulo: string) => can(modulo, "acessar") && (!exigeVisualizar(modulo) || can(modulo, "visualizar")),
    [can],
  );

  // A IA segue a matriz (módulo + sub-aba), nunca o nome do perfil.
  const podeUsarIA = can("inteligencia", "acessar") && can("inteligencia.central_analise", "acessar");

  const vinculados = useMemo(
    () => (vendedores.length ? vendedores : vendedor ? [vendedor] : []),
    [vendedores, vendedor],
  );

  const vendedoresPermitidos = useMemo(() => {
    if (!ativo) return [];
    if (isGestor || escopo === "empresa") return null;
    if (escopo === "vendedores_selecionados") {
      const list = [
        ...(escopoPersonalizado?.vendedores ?? []),
        ...(access?.vendedores_autorizados ?? []),
        ...vinculados,
      ].filter(Boolean);
      return Array.from(new Set(list));
    }
    // "Meus dados" = todas as carteiras vinculadas ao usuário.
    return vinculados;
  }, [ativo, isGestor, escopo, access, vinculados, escopoPersonalizado]);

  const clientesPermitidos = useMemo(() => {
    if (!ativo) return [];
    if (isGestor) return null;
    const list = (escopoPersonalizado?.clientes ?? []).filter(Boolean);
    return list.length ? Array.from(new Set(list)) : null;
  }, [ativo, isGestor, escopoPersonalizado]);

  // Grupos econômicos ainda não têm vínculo no banco: um escopo que os use
  // bloqueia os dados de clientes em vez de liberar tudo.
  const gruposBloqueiam = !isGestor && (escopoPersonalizado?.grupos_economicos ?? []).some(Boolean);

  const regioesPermitidas = useMemo(() => {
    if (!ativo) return [];
    if (isGestor) return null;
    const list = (escopoPersonalizado?.regioes ?? []).filter(Boolean);
    return list.length ? Array.from(new Set(list)) : null;
  }, [ativo, isGestor, escopoPersonalizado]);

  const canSee = useCallback(
    (nome?: string | null) => {
      if (vendedoresPermitidos === null) return true;
      if (!nome) return false;
      const alvo = normalizeVendorName(nome);
      return vendedoresPermitidos.some((v) => sameVendor(v, alvo) || normalizeVendorName(v) === alvo);
    },
    [vendedoresPermitidos],
  );

  return {
    loading: roleLoading || (!!userId && query.isLoading),
    isGestor,
    ativo,
    vendedor,
    escopo,
    perfilNome,
    podeUsarIA,
    escopoPersonalizado,
    vendedoresPermitidos,
    clientesPermitidos,
    regioesPermitidas,
    gruposBloqueiam,
    can,
    podeAbrir,
    canSee,
  };
}


/** Registra um evento na auditoria de acessos (silencioso em caso de falha). */
export async function logAccessEvent(params: {
  userId: string | null;
  nome?: string | null;
  evento: string;
  modulo?: string | null;
  detalhe?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!params.userId) return;
  try {
    await supabase.from("access_audit_log").insert({
      user_id: params.userId,
      usuario_nome: params.nome ?? null,
      evento: params.evento,
      modulo: params.modulo ?? null,
      detalhe: params.detalhe ?? null,
      metadata: (params.metadata ?? {}) as never,
    } as never);
  } catch {
    /* auditoria nunca deve quebrar a navegação */
  }
}
