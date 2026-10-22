import { useMemo } from "react";
import { useBonificacaoRows } from "@/hooks/useBonificacoes";
import { buildCustoProdutoIndex, type CustoProdutoIndex } from "@/lib/produtoCusto";

/** Índice de custo (R$/kg) por produto, com histórico por data. */
export function useCustoProdutos(): { index: CustoProdutoIndex; loading: boolean } {
  const { data: rows = [], isLoading } = useBonificacaoRows();
  const index = useMemo(
    () =>
      buildCustoProdutoIndex(
        rows.map((r) => ({
          produto: r.produto,
          quantidade: Number(r.quantidade) || 0,
          custo: Number(r.custo) || 0,
          data: r.data,
        })),
      ),
    [rows],
  );
  return { index, loading: isLoading };
}
