import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, normalizeVendorName, sameVendor } from "@/hooks/useUserRole";
import { type PermissionAction } from "@/lib/modulesCatalog";

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
  /** Clientes/grupos permitidos pelo escopo personalizado; `null` = sem restrição. */
  clientesPermitidos: string[] | null;
  regioesPermitidas: string[] | null;
  /** Nome do perfil de permissão atribuído ao usuário (quando houver). */
  perfilNome: string | null;
  /** Somente Administrador e Gestor podem usar recursos de IA. */
  podeUsarIA: boolean;
  can: (modulo: string, acao?: PermissionAction) => boolean;
  canSee: (vendedor?: string | null) => boolean;
}


/**
 * Permissões efetivas = perfil do usuário + exceções individuais.
 * Gestores (admin) recebem acesso total. A checagem também existe no banco
 * (`tem_permissao` / `pode_ver_vendedor`), então a tela é apenas a 1ª camada.
 */
export function usePermissions(): PermissionsState {
  const { userId, isGestor, vendedor, vendedores, loading: roleLoading } = useUserRole();

  const query = useQuery({
    queryKey: ["user-permissions", userId],
    enabled: !!userId,
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
      if (access?.profile_id) {
        const perfilRes = await supabase
          .from("permission_profiles")
          .select("nome")
          .eq("id", access.profile_id)
          .maybeSingle();
        perfilNome = (perfilRes.data as { nome?: string } | null)?.nome ?? null;
        const res = await supabase
          .from("profile_permissions")
          .select("modulo, acao, permitido")
          .eq("profile_id", access.profile_id);
        if (res.error) throw res.error;
        profilePerms = res.data ?? [];
      }
      let scope: ResolvedScope | null = null;
      if (access?.scope_id) {
        const res = await supabase
          .from("data_scopes" as never)
          .select("id, nome, base, vendedores, clientes, grupos_economicos, regioes, ativo")
          .eq("id", access.scope_id)
          .maybeSingle();
        const row = res.data as unknown as (ResolvedScope & { ativo: boolean }) | null;
        if (row?.ativo) scope = row;
      }

      return {
        access,
        perfilNome,
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
  const ativo = access?.ativo ?? true;
  const perfilNome = query.data?.perfilNome ?? null;
  const podeUsarIA =
    isGestor || ["administrador", "gestor"].includes((perfilNome ?? "").trim().toLowerCase());

  const can = useCallback(
    (modulo: string, acao: PermissionAction = "acessar") => {
      if (isGestor) return true;
      if (!ativo) return false;
      // Sem registro de acesso configurado, mantém o comportamento legado
      // (vendedor com acesso aos módulos não exclusivos de gestor).
      if (!access) return !modulo.startsWith("administracao");
      return map.get(`${modulo}:${acao}`) === true;
    },
    [isGestor, ativo, access, map],
  );

  const vinculados = useMemo(
    () => (vendedores.length ? vendedores : vendedor ? [vendedor] : []),
    [vendedores, vendedor],
  );

  const vendedoresPermitidos = useMemo(() => {
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
  }, [isGestor, escopo, access, vinculados, escopoPersonalizado]);

  const clientesPermitidos = useMemo(() => {
    if (isGestor) return null;
    const list = [
      ...(escopoPersonalizado?.clientes ?? []),
      ...(escopoPersonalizado?.grupos_economicos ?? []),
    ].filter(Boolean);
    return list.length ? Array.from(new Set(list)) : null;
  }, [isGestor, escopoPersonalizado]);

  const regioesPermitidas = useMemo(() => {
    if (isGestor) return null;
    const list = (escopoPersonalizado?.regioes ?? []).filter(Boolean);
    return list.length ? Array.from(new Set(list)) : null;
  }, [isGestor, escopoPersonalizado]);

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
    can,
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
