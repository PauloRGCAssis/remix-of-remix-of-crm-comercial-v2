import type { SaleRow } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";

/**
 * Chave canônica para comparar clientes (insensível a acento, caixa, espaço,
 * sufixos como "(IM)" e variações conhecidas via alias map).
 */
export function clientKey(rawName: string): string {
  return normalizeClientName(rawName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ClientClass = "novo" | "reativado" | "recorrente" | "sem_recompra";

export interface ClientClassificationResult {
  chave: string;
  cliente: string; // display name (preferred from current period)
  classe: ClientClass;
  primeiraCompraGlobal: Date;
  valorPrimeiraCompra: number;
  vendedorPrimeiraCompra: string;
  totalNoPeriodo: number;
  pedidosNoPeriodo: number;
  primeiraCompraNoPeriodo: Date | null;
  ultimaCompraNoPeriodo: Date | null;
  /** Última compra anterior ao período atual (global, qualquer vendedor). */
  ultimaCompraAnterior: Date | null;
  /** Dias entre a última compra anterior e a primeira compra do período atual. */
  diasSemComprar: number | null;
  /** Se houver QUALQUER linha anterior ao período atual em TODA a base. */
  temHistoricoAnterior: boolean;
  /** Se houver linha no período comparado (em TODA a base). */
  comprouNoComparado: boolean;
  /** Texto de auditoria explicando a classificação. */
  motivo: string;
}

export interface ClassifyOptions {
  /**
   * Linhas globais (TODAS as vendas, sem filtro de vendedor/produto). Usado para
   * detectar primeira compra histórica e determinar novo vs reativado.
   */
  todasAsVendas: SaleRow[];
  /**
   * Linhas do período atual JÁ filtradas por vendedor/produto/cliente.
   * Define o universo de clientes a classificar (precisam ter compra no atual,
   * dentro do recorte de filtros selecionado).
   */
  vendasNoPeriodoAtualFiltradas: SaleRow[];
  /**
   * Datas (string YYYY-MM-DD) do período atual e do período comparado.
   */
  inicio: string;
  fim: string;
  compInicio?: string;
  compFim?: string;
  /**
   * Dias sem compra a partir dos quais um cliente é considerado REATIVADO
   * quando volta a comprar. Padrão 60.
   */
  reativacaoDiasSemCompra?: number;
}

function inRange(d: Date, startISO: string, endISO: string): boolean {
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = endISO.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0));
  const end = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999));
  return d >= start && d <= end;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Classifica clientes do período atual em NOVO / REATIVADO / RECORRENTE / SEM_RECOMPRA.
 *
 * Regras (rígidas e centralizadas — fonte única para toda a Inteligência Comercial):
 *
 * - NOVO: primeira compra na HISTÓRIA da base ocorreu dentro do período atual.
 *         Nenhuma venda anterior em qualquer vendedor/produto.
 * - REATIVADO: já comprou antes, e o intervalo entre a última compra anterior
 *              ao período e a primeira compra do período atual é ≥ N dias
 *              (parâmetro `reativacaoDiasSemCompra`, padrão 60).
 * - RECORRENTE: já comprou antes e o gap é < N dias — continua comprando
 *               normalmente.
 * - SEM_RECOMPRA: comprou no período comparado e NÃO comprou no atual
 *                  (mantido para compatibilidade).
 */
export function classifyClientsForPeriod(opts: ClassifyOptions): {
  novos: ClientClassificationResult[];
  reativados: ClientClassificationResult[];
  recorrentes: ClientClassificationResult[];
  semRecompra: ClientClassificationResult[];
  reativacaoDiasSemCompra: number;
} {
  const {
    todasAsVendas,
    vendasNoPeriodoAtualFiltradas,
    inicio,
    fim,
    compInicio,
    compFim,
    reativacaoDiasSemCompra = 60,
  } = opts;

  const inicioTs = new Date(`${inicio}T00:00:00Z`).getTime();

  // 1) Primeira compra global + última compra anterior ao período atual
  const primeiraGlobal = new Map<
    string,
    { data: Date; valor: number; vendedor: string; cliente: string }
  >();
  const ultimaAntes = new Map<string, Date>();
  const comprouComparado = new Set<string>();

  for (const row of todasAsVendas) {
    const k = clientKey(row.cliente);
    if (!k) continue;
    const d = new Date(row.data);
    const existing = primeiraGlobal.get(k);
    if (!existing || d < existing.data) {
      primeiraGlobal.set(k, {
        data: d,
        valor: Number(row.preco_total ?? 0),
        vendedor: row.vendedor,
        cliente: row.cliente,
      });
    }
    if (d.getTime() < inicioTs) {
      const prev = ultimaAntes.get(k);
      if (!prev || d > prev) ultimaAntes.set(k, d);
    }
    if (compInicio && compFim && inRange(d, compInicio, compFim)) {
      comprouComparado.add(k);
    }
  }

  // 2) Agrega vendas do período atual filtradas por cliente
  const aggAtual = new Map<
    string,
    {
      cliente: string;
      total: number;
      pedidos: Set<number>;
      primeira: Date | null;
      ultima: Date | null;
    }
  >();
  for (const row of vendasNoPeriodoAtualFiltradas) {
    const k = clientKey(row.cliente);
    if (!k) continue;
    const d = new Date(row.data);
    const e = aggAtual.get(k) ?? {
      cliente: row.cliente,
      total: 0,
      pedidos: new Set<number>(),
      primeira: null,
      ultima: null,
    };
    e.total += Number(row.preco_total ?? 0);
    e.pedidos.add(row.codigo_venda);
    if (!e.primeira || d < e.primeira) e.primeira = d;
    if (!e.ultima || d > e.ultima) e.ultima = d;
    aggAtual.set(k, e);
  }

  const novos: ClientClassificationResult[] = [];
  const reativados: ClientClassificationResult[] = [];
  const recorrentes: ClientClassificationResult[] = [];
  const semRecompra: ClientClassificationResult[] = [];

  for (const [k, agg] of aggAtual.entries()) {
    const pg = primeiraGlobal.get(k);
    const ua = ultimaAntes.get(k) ?? null;
    const teveAntes = ua != null;
    const naCompar = comprouComparado.has(k);

    let diasSemComprar: number | null = null;
    if (ua && agg.primeira) {
      diasSemComprar = Math.max(0, Math.floor((agg.primeira.getTime() - ua.getTime()) / 86_400_000));
    }

    let classe: ClientClass;
    let motivo: string;
    if (!teveAntes) {
      classe = "novo";
      motivo = `Primeira compra em ${fmtDate(agg.primeira)} — sem histórico anterior.`;
    } else if ((diasSemComprar ?? 0) >= reativacaoDiasSemCompra) {
      classe = "reativado";
      motivo = `Última compra em ${fmtDate(ua)} · ${diasSemComprar} dias sem comprar (≥ ${reativacaoDiasSemCompra}).`;
    } else {
      classe = "recorrente";
      motivo = `Última compra em ${fmtDate(ua)} · ${diasSemComprar} dias (< ${reativacaoDiasSemCompra}).`;
    }

    const item: ClientClassificationResult = {
      chave: k,
      cliente: agg.cliente,
      classe,
      primeiraCompraGlobal: pg?.data ?? agg.primeira ?? new Date(),
      valorPrimeiraCompra: pg?.valor ?? 0,
      vendedorPrimeiraCompra: pg?.vendedor ?? "",
      totalNoPeriodo: agg.total,
      pedidosNoPeriodo: agg.pedidos.size,
      primeiraCompraNoPeriodo: agg.primeira,
      ultimaCompraNoPeriodo: agg.ultima,
      ultimaCompraAnterior: ua,
      diasSemComprar,
      temHistoricoAnterior: teveAntes,
      comprouNoComparado: naCompar,
      motivo,
    };

    if (classe === "novo") novos.push(item);
    else if (classe === "reativado") reativados.push(item);
    else recorrentes.push(item);
  }

  // SEM RECOMPRA: comprou no comparado mas NÃO no atual (na base filtrada do atual)
  if (compInicio && compFim) {
    const atualKeys = new Set(aggAtual.keys());
    const aggComp = new Map<
      string,
      { cliente: string; total: number; ultima: Date | null }
    >();
    for (const row of todasAsVendas) {
      const k = clientKey(row.cliente);
      if (!k) continue;
      const d = new Date(row.data);
      if (!inRange(d, compInicio, compFim)) continue;
      const e = aggComp.get(k) ?? { cliente: row.cliente, total: 0, ultima: null };
      e.total += Number(row.preco_total ?? 0);
      if (!e.ultima || d > e.ultima) e.ultima = d;
      aggComp.set(k, e);
    }
    for (const [k, e] of aggComp.entries()) {
      if (atualKeys.has(k)) continue;
      const pg = primeiraGlobal.get(k);
      semRecompra.push({
        chave: k,
        cliente: e.cliente,
        classe: "sem_recompra",
        primeiraCompraGlobal: pg?.data ?? e.ultima ?? new Date(),
        valorPrimeiraCompra: pg?.valor ?? 0,
        vendedorPrimeiraCompra: pg?.vendedor ?? "",
        totalNoPeriodo: 0,
        pedidosNoPeriodo: 0,
        primeiraCompraNoPeriodo: null,
        ultimaCompraNoPeriodo: e.ultima,
        ultimaCompraAnterior: e.ultima,
        diasSemComprar: null,
        temHistoricoAnterior: true,
        comprouNoComparado: true,
        motivo: `Última compra em ${fmtDate(e.ultima)} — não voltou a comprar no período atual.`,
      });
    }
  }

  novos.sort((a, b) => (a.primeiraCompraNoPeriodo?.getTime() ?? 0) - (b.primeiraCompraNoPeriodo?.getTime() ?? 0));
  reativados.sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);
  recorrentes.sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);
  semRecompra.sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);

  return { novos, reativados, recorrentes, semRecompra, reativacaoDiasSemCompra };
}
