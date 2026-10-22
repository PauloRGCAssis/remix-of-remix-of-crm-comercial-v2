import { useCallback, useMemo } from "react";
import { useVendorScope } from "@/hooks/useVendorScope";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useSalesData } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";

/**
 * Escopo por CLIENTE, derivado do escopo global de vendedor.
 *
 * Usado nos módulos cujos registros não guardam o vendedor diretamente
 * (Degustações, Ações Comerciais, Agenda de Pedidos): o login enxerga apenas
 * clientes da carteira dos vendedores autorizados. Nada é apagado da base.
 */
export function useClientScope() {
  const scope = useVendorScope();
  const { data: profiles } = useClientProfiles();
  const { data: sales } = useSalesData();

  const permitidos = useMemo(() => {
    if (scope.todos) return null;
    const set = new Set<string>();
    for (const p of profiles ?? []) set.add(normalizeClientName(p.nome));
    for (const s of sales ?? []) set.add(normalizeClientName(s.cliente));
    return set;
  }, [scope.todos, profiles, sales]);

  const podeVerCliente = useCallback(
    (cliente?: string | null) => {
      if (permitidos === null) return true;
      if (!cliente) return false;
      return permitidos.has(normalizeClientName(cliente));
    },
    [permitidos],
  );

  const filtrarPorCliente = useCallback(
    <T,>(rows: T[], getCliente: (row: T) => string | null | undefined) => {
      if (permitidos === null) return rows;
      return rows.filter((r) => podeVerCliente(getCliente(r)));
    },
    [permitidos, podeVerCliente],
  );

  return useMemo(
    () => ({ todos: permitidos === null, podeVerCliente, filtrarPorCliente }),
    [permitidos, podeVerCliente, filtrarPorCliente],
  );
}
