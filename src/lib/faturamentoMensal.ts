import { shortVendedorName, type SaleRow } from "@/hooks/useSalesData";
import type { CommissionBatch } from "@/lib/commissionImport";

/**
 * FONTE ÚNICA de faturamento mensal por vendedor.
 *
 * Ranking, Metas Comerciais e Pagamento Vendedores DEVEM usar esta função —
 * garantindo o mesmo resultado nas três telas.
 *
 * Regras:
 * - Lê SOMENTE `sales` (que vem de `sales_raw_rows`, a tabela alimentada pelo
 *   importador). Nunca consulta cache, histórico ou outras fontes.
 * - Agrupa `preco_total` por vendedor normalizado (`shortVendedorName`) e mês.
 * - Filtra pelo `yearMonth` no formato "YYYY-MM".
 *
 * A competência é determinada EXCLUSIVAMENTE pela coluna `data` importada.
 * Nenhuma regra comercial pode mover uma linha para outro mês.
 */
function monthFromSpreadsheetDate(data: string): string {
  return String(data ?? "").slice(0, 7);
}

export function calcularFaturamentoMensalPorVendedor(
  sales: SaleRow[],
  yearMonth: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sales) {
    if (monthFromSpreadsheetDate(s.data) !== yearMonth) continue;
    const vend = shortVendedorName(s.vendedor);
    map.set(vend, (map.get(vend) || 0) + Number(s.preco_total || 0));
  }
  return map;
}

/**
 * Versão que retorna Map<vendedor, Map<"YYYY-MM", total>> — usada por Metas/Ranking
 * para calcular média de 3 meses, comparativos ano-a-ano etc.
 * Delega para a mesma normalização, garantindo consistência com
 * `calcularFaturamentoMensalPorVendedor`.
 */
export function calcularFaturamentoTodosMesesPorVendedor(
  sales: SaleRow[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const s of sales) {
    const vend = shortVendedorName(s.vendedor);
    const key = monthFromSpreadsheetDate(s.data);
    if (!map.has(vend)) map.set(vend, new Map());
    const vm = map.get(vend)!;
    vm.set(key, (vm.get(key) || 0) + Number(s.preco_total || 0));
  }
  return map;
}

/**
 * Faturamento Bruto por vendedor extraído DIRETAMENTE do batch de comissão
 * (planilha importada) — somando a coluna "Preço Venda Total (R$)" das linhas
 * de tipo VENDA. Fonte oficial usada pelas abas Metas Comerciais, Ranking e
 * Pagamento Vendedores quando um batch existe para o mês selecionado.
 */
export function faturamentoBrutoBatchByVendedor(batch: CommissionBatch): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of batch.rows) {
    if (r.tipo !== "VENDA") continue;
    const vend = shortVendedorName(r.vendedor);
    const valor = Number(r.precoVendaTotal ?? r.valor ?? 0);
    map.set(vend, (map.get(vend) || 0) + valor);
  }
  return map;
}

/**
 * FONTE CANÔNICA — `getFaturamentoBruto(vendedor, yearMonth)`.
 *
 * Retorna o Faturamento Bruto oficial de um vendedor no mês de referência.
 * Fonte única: `sales_raw_rows`, espelho persistido da importação oficial.
 *
 * REGRA: qualquer tela que precise do "Realizado" para metas — Ranking, DRE,
 * Meta Média, Combustível, 0,5%, 1%, PDF, Excel — DEVE usar esta função.
 * Não usar cache derivado, estado React ou faturamento líquido como base.
 */
export function getFaturamentoBruto(
  vendedor: string,
  yearMonth: string,
  sales?: SaleRow[],
): number {
  const vendShort = shortVendedorName(vendedor);
  if (sales && sales.length > 0) {
    const totals = calcularFaturamentoMensalPorVendedor(sales, yearMonth);
    return totals.get(vendShort) ?? 0;
  }
  return 0;
}
