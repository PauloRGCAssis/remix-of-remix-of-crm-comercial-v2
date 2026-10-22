/**
 * Fonte ÚNICA das métricas de período do Estudo de Vendas.
 *
 * REGRA CENTRAL: o período selecionado (primeiro → último mês visível) é o
 * universo de análise. Toda ordenação/ranking consome estas funções — nunca
 * apenas o último mês.
 *
 * Não recalcula vendas: consome exatamente os dados já consolidados dos cards
 * (`products[].months[mes] = { qty, fat }`), que vêm de `useSalesData`.
 */

export interface PeriodoMonthData {
  qty: number;
  fat: number;
  pctQty?: number | null;
}

export interface PeriodoProduct {
  productName: string;
  months: Record<string, PeriodoMonthData>;
}

export interface PeriodoClient {
  clientName: string;
  products: PeriodoProduct[];
}

export type PeriodoStatus = "critical" | "warning" | "neutral" | "positive";

export interface PeriodoMetrics {
  /** SUM do faturamento de TODOS os meses do período */
  fat: number;
  /** SUM da quantidade (kg) de TODOS os meses do período */
  qty: number;
  /** Faturamento apenas do último mês do período (informativo) */
  fatUltimoMes: number;
  qtyUltimoMes: number;
  /** Variação % do período: primeiro mês com venda → último mês com venda */
  pctFat: number | null;
  pctQty: number | null;
  /** Alertas dentro do período (produtos que caíram ou zeraram no período) */
  alertCount: number;
  status: PeriodoStatus;
}

function somaMes(client: PeriodoClient, mes: string | undefined) {
  let qty = 0;
  let fat = 0;
  if (!mes) return { qty, fat };
  for (const p of client.products) {
    const d = p.months[mes];
    qty += d?.qty ?? 0;
    fat += d?.fat ?? 0;
  }
  return { qty, fat };
}

/** SUM do faturamento de todo o período selecionado. */
export function getRevenueForPeriod(client: PeriodoClient, months: string[]): number {
  let total = 0;
  for (const p of client.products) {
    for (const m of months) total += p.months[m]?.fat ?? 0;
  }
  return total;
}

/** SUM da quantidade (kg) de todo o período selecionado. */
export function getQuantityForPeriod(client: PeriodoClient, months: string[]): number {
  let total = 0;
  for (const p of client.products) {
    for (const m of months) total += p.months[m]?.qty ?? 0;
  }
  return total;
}

function variacaoPeriodo(
  series: { qty: number; fat: number }[],
): { pctFat: number | null; pctQty: number | null } {
  const comVenda = series.filter((s) => s.qty > 0 || s.fat > 0);
  if (series.length < 2) return { pctFat: null, pctQty: null };
  // Base = primeiro mês com venda dentro do período.
  const base = comVenda[0];
  if (!base) return { pctFat: null, pctQty: null };
  const baseIndex = series.indexOf(base);
  const fim = series[series.length - 1];
  if (baseIndex === series.length - 1) return { pctFat: null, pctQty: null };
  const pct = (atual: number, anterior: number): number | null => {
    if (anterior > 0) return ((atual - anterior) / anterior) * 100;
    return atual > 0 ? 100 : null;
  };
  return { pctFat: pct(fim.fat, base.fat), pctQty: pct(fim.qty, base.qty) };
}

/** Alertas do PERÍODO: produtos que zeraram ou caíram ≥20% do início ao fim. */
export function getAlertsForPeriod(client: PeriodoClient, months: string[]): number {
  if (months.length < 2) return 0;
  let alertas = 0;
  for (const p of client.products) {
    const serie = months.map((m) => p.months[m]?.qty ?? 0);
    const baseIndex = serie.findIndex((q) => q > 0);
    if (baseIndex < 0 || baseIndex === serie.length - 1) continue;
    const base = serie[baseIndex];
    const fim = serie[serie.length - 1];
    if (fim === 0) alertas++;
    else if (((fim - base) / base) * 100 <= -20) alertas++;
  }
  return alertas;
}

/** Situação do cliente calculada sobre o período selecionado. */
export function getPerformanceForPeriod(
  client: PeriodoClient,
  months: string[],
): PeriodoStatus {
  if (months.length < 2) return "neutral";
  const serie = months.map((m) => somaMes(client, m));
  const { pctQty } = variacaoPeriodo(serie);
  const totalQty = serie.reduce((s, m) => s + m.qty, 0);
  const ultimo = serie[serie.length - 1];
  if (totalQty === 0) return "neutral";
  if (ultimo.qty === 0) return "critical";
  if (pctQty === null) return "neutral";
  if (pctQty <= -30) return "critical";
  if (pctQty < 0) return "warning";
  if (pctQty > 0) return "positive";
  return "neutral";
}

/** Todas as métricas do período em uma única passada. */
export function getMetricsForPeriod(client: PeriodoClient, months: string[]): PeriodoMetrics {
  const serie = months.map((m) => somaMes(client, m));
  const { pctFat, pctQty } = variacaoPeriodo(serie);
  const ultimo = serie[serie.length - 1] ?? { qty: 0, fat: 0 };
  return {
    fat: getRevenueForPeriod(client, months),
    qty: getQuantityForPeriod(client, months),
    fatUltimoMes: ultimo.fat,
    qtyUltimoMes: ultimo.qty,
    pctFat,
    pctQty,
    alertCount: getAlertsForPeriod(client, months),
    status: getPerformanceForPeriod(client, months),
  };
}
