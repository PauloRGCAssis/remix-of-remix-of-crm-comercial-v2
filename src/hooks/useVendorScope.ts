import { useCallback, useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeVendorName, sameVendor } from "@/hooks/useUserRole";

/**
 * Camada GLOBAL de escopo de vendedor.
 *
 * Fonte única de verdade para "quais vendedores este login pode acessar?".
 * Todas as telas (filtros, listagens, cadastros, edição, exclusão e relatórios)
 * devem consultar este hook em vez de criar regra própria.
 *
 * A lista vem exatamente do que o administrador configurou em
 * Administração → Usuários (vendedores vinculados + escopo do perfil +
 * escopo de dados personalizado). O banco aplica a mesma regra via
 * `pode_ver_vendedor`, então a tela é apenas a primeira camada.
 */
export interface VendorScope {
  loading: boolean;
  /** Usuário enxerga a empresa inteira (nenhuma restrição de vendedor). */
  todos: boolean;
  /** Vendedores autorizados (vazio quando `todos` = true). */
  vendedores: string[];
  /** Preenchimento automático quando há exatamente um vendedor autorizado. */
  vendedorPadrao: string | null;
  /** Filtro travado: só existe uma opção possível. */
  travado: boolean;
  /** O login pode ver/editar/excluir registros deste vendedor? */
  podeVer: (vendedor?: string | null) => boolean;
  /** Restringe uma lista de opções de vendedor às autorizadas. */
  opcoesVendedor: (todosOsVendedores: string[]) => string[];
  /** Filtra qualquer coleção pelo vendedor do registro. */
  filtrar: <T>(rows: T[], getVendedor: (row: T) => string | null | undefined) => T[];
}

export function useVendorScope(): VendorScope {
  const perms = usePermissions();
  const permitidos = perms.vendedoresPermitidos;
  const todos = permitidos === null;

  const vendedores = useMemo(
    () => (todos ? [] : Array.from(new Set((permitidos ?? []).filter(Boolean)))),
    [todos, permitidos],
  );

  const podeVer = useCallback(
    (vendedor?: string | null) => {
      if (todos) return true;
      if (!vendedor) return false;
      const alvo = normalizeVendorName(vendedor);
      return vendedores.some((v) => normalizeVendorName(v) === alvo || sameVendor(v, alvo));
    },
    [todos, vendedores],
  );

  const opcoesVendedor = useCallback(
    (lista: string[]) => {
      if (todos) return lista;
      return lista.filter((v) => podeVer(v));
    },
    [todos, podeVer],
  );

  const filtrar = useCallback(
    <T,>(rows: T[], getVendedor: (row: T) => string | null | undefined) => {
      if (todos) return rows;
      return rows.filter((r) => podeVer(getVendedor(r)));
    },
    [todos, podeVer],
  );

  return useMemo(() => ({
    loading: perms.loading,
    todos,
    vendedores,
    vendedorPadrao: !todos && vendedores.length === 1 ? vendedores[0] : null,
    travado: !todos && vendedores.length <= 1,
    podeVer,
    opcoesVendedor,
    filtrar,
  }), [perms.loading, todos, vendedores, podeVer, opcoesVendedor, filtrar]);
}

/** Chave estável para uso em `queryKey` (evita cache cruzado entre logins). */
export function vendorScopeKey(scope: VendorScope): string {
  return scope.todos ? "all" : scope.vendedores.map(normalizeVendorName).sort().join("|") || "none";
}
