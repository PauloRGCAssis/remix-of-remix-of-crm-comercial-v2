import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AccessDeniedError } from "@/lib/accessDeniedError";

export interface UserAccess {
  deniedReason: 'missing' | 'inactive' | null;
  error: boolean;
  retry: () => void;
  verified: boolean;
  loading: boolean;
  userId: string | null;
  nome: string | null;
  /** Nome do vendedor principal vinculado ao login (null para gestor sem vínculo). */
  vendedor: string | null;
  /** Todos os vendedores vinculados ao login (carteiras do usuário). */
  vendedores: string[];
  /** Está usando senha temporária e precisa definir uma senha pessoal. */
  mustChangePassword: boolean;
  /** Gestor enxerga e edita tudo. */
  isGestor: boolean;
}

/** Normaliza nomes de vendedor para comparação (sem acento, maiúsculas). */
export function normalizeVendorName(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/** Compara dois nomes de vendedor de forma tolerante (nome completo x primeiro nome). */
export function sameVendor(a?: string | null, b?: string | null): boolean {
  const na = normalizeVendorName(a);
  const nb = normalizeVendorName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
}

export function useUserRole(): UserAccess {
  const { user, loading: authLoading, authorizationVersion } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["user-access", userId, authorizationVersion],
    retry: (count, error) => !(error instanceof AccessDeniedError) && count < 1,
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 15000);
      try {
      const accessRes = await supabase.from('user_access').select('ativo').eq('user_id', userId!).abortSignal(controller.signal).maybeSingle();
      if (accessRes.error) throw accessRes.error;
      if (!accessRes.data) throw new AccessDeniedError('missing');
      if (accessRes.data.ativo !== true) throw new AccessDeniedError('inactive');
      const [profileRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("nome, vendedor, vendedores, must_change_password")
          .eq("id", userId!)
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!).abortSignal(controller.signal),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const profile = profileRes.data as
        | {
            nome?: string | null;
            vendedor?: string | null;
            vendedores?: string[] | null;
            must_change_password?: boolean | null;
          }
        | null;
      return {
        nome: profile?.nome ?? null,
        vendedor: profile?.vendedor ?? null,
        vendedores: profile?.vendedores?.length
          ? profile.vendedores
          : profile?.vendedor
            ? [profile.vendedor]
            : [],
        mustChangePassword: profile?.must_change_password === true,
        isGestor: (rolesRes.data ?? []).some((r) => r.role === "admin"),
      };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    },
  });

  return {
    deniedReason: query.error instanceof AccessDeniedError ? query.error.reason : null,
    error: query.isError && !(query.error instanceof AccessDeniedError),
    retry: () => { void query.refetch(); },
    verified: !!userId && !authLoading && query.isSuccess && !!query.data,
    loading: authLoading || (!!userId && query.isLoading),
    userId,
    nome: query.data?.nome ?? null,
    vendedor: query.data?.vendedor ?? null,
    vendedores: query.data?.vendedores ?? [],
    mustChangePassword: query.data?.mustChangePassword ?? false,
    isGestor: !!userId && !authLoading && query.isSuccess && query.data?.isGestor === true,
  };
}
