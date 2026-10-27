import { useCallback, useMemo } from "react";
import { chaveCliente, useVendorScope } from "@/hooks/useVendorScope";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useSalesData } from "@/hooks/useSalesData";

/**
 * Escopo dos registros de Degustações, Ações Comerciais e Agenda de Pedidos.
 *
 * - Registro COM vendedor: vale o vendedor da linha (`podeVer`). Um cliente
 *   homônimo ou compartilhado de outro vendedor não abre o registro.
 * - Registro SEM vendedor (legado): regra antiga por nome do cliente — visível
 *   se o cliente está nas fichas/vendas da carteira autorizada. Nada é
 *   reatribuído automaticamente.
 * - Em ambos, vale também a restrição de clientes do escopo personalizado.
 */
export function useClientScope() {
  const scope = useVendorScope();
  const { data: profiles } = useClientProfiles();
  const { data: sales } = useSalesData();

  // Nomes da carteira (fichas e vendas já vêm filtradas pelo escopo).
  const carteira = useMemo(() => {
    if (scope.todos) return null;
    const set = new Set<string>();
    for (const p of profiles ?? []) set.add(chaveCliente(p.nome));
    for (const s of sales ?? []) set.add(chaveCliente(s.cliente));
    return set;
  }, [scope.todos, profiles, sales]);

  /** Regra legada por nome (só para registros sem vendedor). */
  const podeVerCliente = useCallback(
    (cliente?: string | null) => {
      if (!scope.podeVerCliente(cliente)) return false;
      if (carteira === null) return true;
      if (!cliente) return false;
      return carteira.has(chaveCliente(cliente));
    },
    [carteira, scope],
  );

  const podeVerRegistro = useCallback(
    (vendedor: string | null | undefined, cliente: string | null | undefined) => {
      if (vendedor) return scope.podeVer(vendedor) && scope.podeVerCliente(cliente);
      return podeVerCliente(cliente);
    },
    [scope, podeVerCliente],
  );

  const filtrarRegistros = useCallback(
    <T,>(
      rows: T[],
      getVendedor: (row: T) => string | null | undefined,
      getCliente: (row: T) => string | null | undefined,
    ) => (scope.semRestricao ? rows : rows.filter((r) => podeVerRegistro(getVendedor(r), getCliente(r)))),
    [scope.semRestricao, podeVerRegistro],
  );

  return useMemo(
    () => ({ todos: scope.semRestricao, podeVerCliente, podeVerRegistro, filtrarRegistros }),
    [scope.semRestricao, podeVerCliente, podeVerRegistro, filtrarRegistros],
  );
}
