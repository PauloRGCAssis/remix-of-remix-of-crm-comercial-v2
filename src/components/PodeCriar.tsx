import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionAction } from "@/lib/modulesCatalog";

/** Mostra o conteúdo só quando o perfil do usuário tem a permissão. O banco também bloqueia. */
export function PodeCriar({ modulo, acao = "criar" as PermissionAction, children }: { modulo: string | string[]; acao?: PermissionAction; children: ReactNode }) {
  const { can, loading } = usePermissions();
  if (loading) return null;
  const mods = Array.isArray(modulo) ? modulo : [modulo];
  return mods.some((m) => can(m, acao)) ? <>{children}</> : null;
}
