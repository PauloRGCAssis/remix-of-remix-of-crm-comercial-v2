import { useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { crudAtivo } from "@/lib/crudEnforcement";

export type CrudAcao = "criar" | "editar" | "excluir";

/** Operação recusada por falta de permissão (não chega ao Supabase). */
export class PermissionDeniedError extends Error {
  constructor(acao: CrudAcao, descricao: string) {
    super(`Sem permissão para ${acao} ${descricao}.`);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Permissões CRUD de um módulo, reaproveitando `can()` (perfil + exceções
 * individuais + role admin). Com o módulo desativado em `crudEnforcement`,
 * tudo segue liberado como antes. `exigir` protege a gravação em si, não só o botão.
 */
export function useModuleCrud(modulo: string, descricao: string) {
  const { can } = usePermissions();
  const ativo = crudAtivo(modulo);

  const pode = useCallback((acao: CrudAcao) => !ativo || can(modulo, acao), [ativo, can, modulo]);

  const exigir = useCallback(
    (acao: CrudAcao) => {
      if (!pode(acao)) throw new PermissionDeniedError(acao, descricao);
    },
    [pode, descricao],
  );

  return {
    podeCriar: pode("criar"),
    podeEditar: pode("editar"),
    podeExcluir: pode("excluir"),
    pode,
    exigir,
  };
}
