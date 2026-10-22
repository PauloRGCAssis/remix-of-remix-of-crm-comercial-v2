import { useMemo } from "react";
import { SaleRow, shortVendedorName, cleanProductName, filterByDateRange, isExcludedProduct, normalizeSelectedProduto } from "./useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import {
  calcFaturamento, calcPedidos, calcClientesAtivos, calcVolume,
  calcTicketMedio, calcPrecoMedioKg, type AuditInfo,
} from "@/lib/salesAggregation";
import { classifyClientsForPeriod, type ClientClassificationResult } from "@/lib/clientClassification";
import { rankVariation } from "@/lib/variationRanking";
import { calcProjecaoMensal } from "@/lib/projecaoMensal";

export interface InteligenciaFilters {
  inicio: string;
  fim: string;
  compInicio: string;
  compFim: string;
  vendedores: string[];
  /** Filtro legado (1 cliente). Mantido para compatibilidade. */
  cliente: string;
  /** Filtro multi-seleção. Quando preenchido tem precedência sobre `cliente`. */
  clientes?: string[];
  /** Filtro legado (1 produto). Mantido para compatibilidade — produtos[] tem precedência. */
  produto: string;
  /** Filtro multi-seleção de produtos. Lógica OR (IN). */
  produtos?: string[];
  /**
   * "continuous": calcula tendência de produtos comparando 1ª metade vs 2ª metade do
   * período atual (sem usar compInicio/compFim).
   */
  analysisMode?: "compare" | "continuous";
  /**
   * Dias sem compra para considerar cliente REATIVADO (padrão 60).
   * Fonte: `app_settings.reativacao_dias_sem_compra`.
   */
  reativacaoDiasSemCompra?: number;
}

export interface KpiDecomposition {
  pedidosAtual: number;
  pedidosComp: number;
  clientesAtivosAtual: number;
  clientesAtivosComp: number;
  volumeAtual: number;
  volumeComp: number;
  precoMedioKgAtual: number;
  precoMedioKgComp: number;
  ticketMedioAtual: number;
  ticketMedioComp: number;
}

export interface RawMirrorAudit {
  totalLinhasPlanilha: number;
  totalLinhasImportadas: number;
  linhasFiltradasVendedor: number;
  linhasFiltradasPeriodo: number;
  linhasUsadasNoCalculo: number;
  linhasIgnoradasNoCalculo: number;
  somaQuantidade: number;
  pedidosUnicos: number;
  clientesUnicos: number;
  linhasComVendedorVazioPeriodo: number;
  linhasComProdutoVazioPeriodo: number;
  linhasComClienteVazioPeriodo: number;
  linhasComValorNuloPeriodo: number;
  codigosVendaRepetidosPeriodo: number;
  duplicatasExatasPeriodo: number;
  somaPrecoVendaTotal: number;
  /** Soma BRUTA do Preço Venda Total (R$) das linhas no período, ignorando filtros de vendedor/cliente/produto. */
  somaBrutoPeriodo: number;
  /** Quantidade de linhas no período antes de qualquer filtro de vendedor/cliente/produto. */
  linhasBrutoPeriodo: number;
  /** Quebra por vendedor (raw name) das linhas no período, marcando se está incluído nos filtros atuais. */
  vendorBreakdownPeriodo: Array<{ vendedorRaw: string; vendedorCurto: string; linhas: number; faturamento: number; incluidoNoFiltro: boolean }>;
  linhasIgnoradas: Array<{
    originalRowNumber?: number;
    codigoVenda: number;
    data: string;
    vendedor: string;
    cliente: string;
    descricao: string;
    quantidade: number;
    precoTotal: number;
    motivo: string;
  }>;
  arquivoMaisRecente: string | null;
  importacaoMaisRecente: string | null;
}

export interface ComparisonAudit {
  hasComparisonRequested: boolean;
  hasComparisonFailure: boolean;
  isComparisonEmpty: boolean;
  message: string | null;
  atualPeriodo: { inicio: string; fim: string };
  comparativoPeriodo: { inicio: string; fim: string } | null;
  linhasComparativas: number;
  linhasBaseAposFiltros: number;
  filtrosRecebidos: { vendedores: string[]; clientes: string[]; produtos: string[] };
  etapasComparativas: FilterTraceStage[];
  metricasComparativas: {
    faturamento: number;
    pedidos: number;
    clientesAtivos: number;
    volume: number;
  };
}

interface FilterLists {
  vendedores: string[];
  clientes: string[];
  produtos: string[];
}

export interface FilterTraceStage {
  etapa: "periodo" | "vendedor" | "cliente" | "produto";
  filtroAplicado: string;
  linhas: number;
  faturamento: number;
  pedidos: number;
  clientesAtivos: number;
  volume: number;
}

export interface ClienteMovimento {
  nome: string;
  chaveCliente: string;
  fatAtual: number;
  fatComp: number;
  diff: number;
  diffPct: number | null;
  pedidosAtual: number;
  pedidosComp: number;
  primeiraVendaAtual: Date | null;
  ultimaVendaAtual: Date | null;
  nomesEncontrados: string[];
  fonte: "sales_raw_rows";
}

export interface ProdutoMovimento {
  nome: string;
  volAtual: number;
  volComp: number;
  fatAtual: number;
  fatComp: number;
  diff: number;
  diffPct: number | null;
  pedidosAtual: number;
  pedidosComp: number;
  idsAtual: number[];
  idsComp: number[];
}

export interface VendedorResumo {
  nome: string;
  fatAtual: number;
  fatComp: number;
  diff: number;
  diffPct: number | null;
  pedidos: number;
  pedidosComp: number;
  clientes: number;
  clientesComp: number;
}

export interface AlertaComercial {
  tipo: "cliente_queda" | "cliente_perdido" | "cliente_inativo" | "produto_queda" | "produto_crescimento" | "vendedor_queda" | "ticket_mudanca" | "faturamento_queda" | "faturamento_crescimento" | "cliente_risco_a";
  mensagem: string;
  severidade: "alta" | "media" | "baixa";
  /** Optional debug payload — populated for client-level alerts. */
  debug?: {
    cliente?: string;
    fatAtual?: number;
    fatComp?: number;
    diff?: number;
    diffPct?: number | null;
    pedidosAtual?: number;
    pedidosComp?: number;
    primeiraVendaAtual?: string | null;
    ultimaVendaAtual?: string | null;
    fonte?: "sales_raw_rows";
    motivo?: string;
    nomesEncontrados?: string[];
  };
}

export interface PrevisaoVendedor {
  nome: string;
  fatAcumulado: number;
  mediaDiaria: number;
  projecao: number;
}

export interface ClientePrevisao {
  nome: string;
  mediaMensal: number;
  frequencia: number;
  ultimaCompra: Date;
  previsaoMes: number;
  mesesConsiderados: number;
  vendedor: string;
}

export interface ClienteInativo {
  nome: string;
  ultimaCompra: Date;
  diasSemCompra: number;
  faixa: "30-90" | "90-200" | "200+";
  faturamentoHistorico: number;
  /** Média mensal dos últimos 6 meses ativos antes da inatividade */
  mediaMensalHistorica: number;
  /** Receita potencial mensal de recuperação (igual à média mensal histórica) */
  receitaRecuperavel: number;
  /** Quantidade de meses ativos considerados no cálculo (até 6) */
  mesesAtivosConsiderados: number;
}

export interface ClienteDebug {
  nome: string;
  fatAtual: number;
  fatComp: number;
  diff: number;
  diffPct: number | null;
  pedidosAtual: number;
  pedidosComp: number;
  primeiraVendaAtual: Date | null;
  ultimaVendaAtual: Date | null;
  fonte: "sales_raw_rows";
  classificacao: "novo" | "reativado" | "crescimento" | "queda" | "estavel" | "perdido";
}

export interface AbcItem {
  nome: string;
  faturamento: number;
  quantidade: number;
  pedidos: number;
  ticketMedio: number;
  participacao: number;
  acumulado: number;
  classe: "A" | "B" | "C";
}

export interface AbcAlerta {
  tipo: "a_sem_pedido" | "a_queda" | "b_crescendo" | "c_crescendo";
  mensagem: string;
  classe: "A" | "B" | "C";
}

export interface VendedorScatterPoint {
  nome: string;
  pedidos: number;
  faturamento: number;
}

export interface AnaliseInteligente {
  resumo: string;
  fatores: string[];
  recomendacoes: string[];
}

function getFilterLists(filters: InteligenciaFilters): FilterLists {
  const clientes = (filters.clientes && filters.clientes.length > 0)
    ? filters.clientes
    : (filters.cliente ? [filters.cliente] : []);
  const produtos = (filters.produtos && filters.produtos.length > 0)
    ? filters.produtos
    : (filters.produto ? [filters.produto] : []);
  return {
    vendedores: [...new Set((filters.vendedores ?? []).map((v) => String(v ?? "").trim()).filter(Boolean))],
    clientes: [...new Set(clientes.map((c) => String(c ?? "").trim()).filter(Boolean))],
    produtos: [...new Set(produtos.map(normalizeSelectedProduto).filter(Boolean))],
  };
}

function summarizeRows(rows: SaleRow[]): Omit<FilterTraceStage, "etapa" | "filtroAplicado"> {
  return {
    linhas: rows.length,
    faturamento: calcFaturamento(rows),
    pedidos: calcPedidos(rows),
    clientesAtivos: calcClientesAtivos(rows),
    volume: calcVolume(rows),
  };
}

function applyHeaderFiltersWithTrace(sales: SaleRow[], filters: InteligenciaFilters) {
  const lists = getFilterLists(filters);
  const stages: FilterTraceStage[] = [];
  let filtered = sales;
  const pushStage = (etapa: FilterTraceStage["etapa"], filtroAplicado: string) => {
    stages.push({ etapa, filtroAplicado, ...summarizeRows(filtered) });
  };

  pushStage("periodo", "Período informado");

  if (lists.vendedores.length > 0) {
    const rawSet = new Set(lists.vendedores);
    const shortSet = new Set(lists.vendedores.map(shortVendedorName));
    filtered = filtered.filter((s) => rawSet.has(String(s.vendedor ?? "").trim()) || shortSet.has(shortVendedorName(s.vendedor)));
  }
  pushStage("vendedor", lists.vendedores.length > 0 ? lists.vendedores.join(" | ") : "Todos");

  if (lists.clientes.length > 0) {
    const set = new Set(lists.clientes.map(normalizeClienteKey));
    filtered = filtered.filter((s) => set.has(normalizeClienteKey(s.cliente)));
  }
  pushStage("cliente", lists.clientes.length > 0 ? lists.clientes.join(" | ") : "Todos");

  if (lists.produtos.length > 0) {
    const set = new Set(lists.produtos);
    filtered = filtered.filter((s) => set.has(normalizeSelectedProduto(s.descricao)));
  }
  pushStage("produto", lists.produtos.length > 0 ? lists.produtos.join(" | ") : "Todos");

  return { rows: filtered, stages, lists };
}

function runPeriodQuery(allSales: SaleRow[], filters: InteligenciaFilters, inicio: string, fim: string) {
  const periodRows = filterByDateRange(allSales, inicio, fim);
  const trace = applyHeaderFiltersWithTrace(periodRows, filters);
  const rows = trace.rows;
  return {
    periodRows,
    trace,
    rows,
    summary: summarizeRows(rows),
  };
}

function logInteligenciaQueries(
  filters: InteligenciaFilters,
  principal: ReturnType<typeof runPeriodQuery>,
  comparativa: ReturnType<typeof runPeriodQuery>,
) {
  const lists = getFilterLists(filters);
  // Logs temporários obrigatórios para validar que as duas consultas são
  // executadas separadamente com o mesmo recorte de vendedor/cliente/produto.
  // eslint-disable-next-line no-console
  console.log("QUERY PRINCIPAL", {
    dataInicio: filters.inicio,
    dataFim: filters.fim,
    vendedor: lists.vendedores,
    cliente: lists.clientes,
    produto: lists.produtos,
    registros: principal.rows.length,
    faturamento: principal.summary.faturamento,
    pedidos: principal.summary.pedidos,
    volume: principal.summary.volume,
  });
  // eslint-disable-next-line no-console
  console.log("QUERY COMPARATIVA", {
    dataInicioComparativo: filters.compInicio,
    dataFimComparativo: filters.compFim,
    vendedor: lists.vendedores,
    cliente: lists.clientes,
    produto: lists.produtos,
    registrosComparativo: comparativa.rows.length,
    faturamentoComparativo: comparativa.summary.faturamento,
    pedidosComparativo: comparativa.summary.pedidos,
    volumeComparativo: comparativa.summary.volume,
  });
}

function applyFilters(sales: SaleRow[], filters: InteligenciaFilters) {
  let filtered = sales;
  const lists = getFilterLists(filters);
  if (lists.vendedores.length > 0) {
    const rawSet = new Set(lists.vendedores);
    const shortSet = new Set(lists.vendedores.map(shortVendedorName));
    filtered = filtered.filter(s => rawSet.has(String(s.vendedor ?? "").trim()) || shortSet.has(shortVendedorName(s.vendedor)));
  }
  if (lists.clientes.length > 0) {
    const set = new Set(lists.clientes.map(normalizeClienteKey));
    filtered = filtered.filter(s => set.has(normalizeClienteKey(s.cliente)));
  }
  if (lists.produtos.length > 0) {
    const set = new Set(lists.produtos);
    filtered = filtered.filter(s => set.has(normalizeSelectedProduto(s.descricao)));
  }
  return filtered;
}

function auditIgnoreReason(sale: SaleRow, filters: InteligenciaFilters): string | null {
  if (filters.vendedores.length > 0 && !filters.vendedores.includes(sale.vendedor) && !filters.vendedores.includes(shortVendedorName(sale.vendedor))) {
    return `Vendedor diferente do filtro (${sale.vendedor || "sem vendedor"})`;
  }

  const clientesList = (filters.clientes && filters.clientes.length > 0)
    ? filters.clientes
    : (filters.cliente ? [filters.cliente] : []);
  if (clientesList.length > 0 && !clientesList.includes(sale.cliente)) {
    return "Cliente diferente do filtro";
  }

  const produtosList = (filters.produtos && filters.produtos.length > 0)
    ? filters.produtos
    : (filters.produto ? [filters.produto] : []);
  if (produtosList.length > 0) {
    const set = new Set(produtosList.map((p) => cleanProductName(String(p ?? "").replace(/^\s*\d+\s*-\s*/, ""))));
    if (!set.has(cleanProductName(sale.descricao))) {
      return "Produto diferente do filtro";
    }
  }

  return null;
}

function normalizeClienteKey(value: string): string {
  return normalizeClientName(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeClientPeriod(rows: SaleRow[]) {
  const pedidos = new Set<number>();
  let faturamento = 0;
  let primeiraVenda: Date | null = null;
  let ultimaVenda: Date | null = null;

  rows.forEach((row) => {
    const valor = Number(row.preco_total ?? 0);
    const data = new Date(row.data);
    faturamento += valor;
    pedidos.add(row.codigo_venda);
    if (!primeiraVenda || data < primeiraVenda) primeiraVenda = data;
    if (!ultimaVenda || data > ultimaVenda) ultimaVenda = data;
  });

  return { faturamento, pedidos: pedidos.size, primeiraVenda, ultimaVenda };
}

export function getComparativoCliente(
  clienteIdOuNome: string,
  periodoAtualInicio: string,
  periodoAtualFim: string,
  periodoComparadoInicio: string,
  periodoComparadoFim: string,
  filtros: InteligenciaFilters & { vendas: SaleRow[] },
): ClienteMovimento {
  const base = applyFilters(filtros.vendas, { ...filtros, cliente: "" });
  const chaveBuscada = normalizeClienteKey(clienteIdOuNome);
  const rowsDoCliente = (rows: SaleRow[]) => rows.filter((row) => normalizeClienteKey(row.cliente) === chaveBuscada);
  const atualRows = rowsDoCliente(filterByDateRange(base, periodoAtualInicio, periodoAtualFim));
  const compRows = periodoComparadoInicio && periodoComparadoFim
    ? rowsDoCliente(filterByDateRange(base, periodoComparadoInicio, periodoComparadoFim))
    : [];
  const atualStats = summarizeClientPeriod(atualRows);
  const compStats = summarizeClientPeriod(compRows);
  const nomesEncontrados = [...new Set([...atualRows, ...compRows].map((row) => row.cliente).filter(Boolean))];
  const nome = nomesEncontrados[0] ?? clienteIdOuNome;
  const diff = atualStats.faturamento - compStats.faturamento;
  const diffPct = compStats.faturamento > 0
    ? (diff / compStats.faturamento) * 100
    : atualStats.faturamento > 0 ? 100 : null;

  return {
    nome,
    chaveCliente: chaveBuscada,
    fatAtual: atualStats.faturamento,
    fatComp: compStats.faturamento,
    diff,
    diffPct,
    pedidosAtual: atualStats.pedidos,
    pedidosComp: compStats.pedidos,
    primeiraVendaAtual: atualStats.primeiraVenda,
    ultimaVendaAtual: atualStats.ultimaVenda,
    nomesEncontrados,
    fonte: "sales_raw_rows",
  };
}

/**
 * OTIMIZAÇÃO: pré-computa o comparativo de TODOS os clientes em uma única passada
 * pelas linhas já filtradas (atual + comp). Evita o padrão O(N×M) de chamar
 * getComparativoCliente dentro de loops.
 */
interface ClientePeriodAcc {
  faturamento: number;
  pedidos: Set<number>;
  primeira: Date | null;
  ultima: Date | null;
  nomes: Set<string>;
}
export type ClienteComparativoCache = Map<string, ClienteMovimento>;

export function buildClienteComparativoCache(
  atual: SaleRow[],
  comp: SaleRow[],
): ClienteComparativoCache {
  const accAtual = new Map<string, ClientePeriodAcc>();
  const accComp = new Map<string, ClientePeriodAcc>();
  const nomeByKey = new Map<string, string>();

  const accumulate = (map: Map<string, ClientePeriodAcc>, row: SaleRow) => {
    const key = normalizeClienteKey(row.cliente);
    if (!key) return;
    let entry = map.get(key);
    if (!entry) {
      entry = { faturamento: 0, pedidos: new Set(), primeira: null, ultima: null, nomes: new Set() };
      map.set(key, entry);
    }
    entry.faturamento += Number(row.preco_total ?? 0);
    entry.pedidos.add(row.codigo_venda);
    const d = new Date(row.data);
    if (!entry.primeira || d < entry.primeira) entry.primeira = d;
    if (!entry.ultima || d > entry.ultima) entry.ultima = d;
    if (row.cliente) entry.nomes.add(row.cliente);
    if (!nomeByKey.has(key)) nomeByKey.set(key, row.cliente);
  };

  for (const r of atual) accumulate(accAtual, r);
  for (const r of comp) accumulate(accComp, r);

  const cache: ClienteComparativoCache = new Map();
  const allKeys = new Set<string>([...accAtual.keys(), ...accComp.keys()]);
  for (const key of allKeys) {
    const a = accAtual.get(key);
    const c = accComp.get(key);
    const fatA = a?.faturamento ?? 0;
    const fatC = c?.faturamento ?? 0;
    const diff = fatA - fatC;
    const diffPct = fatC > 0 ? (diff / fatC) * 100 : fatA > 0 ? 100 : null;
    const nomes = new Set<string>([...(a?.nomes ?? []), ...(c?.nomes ?? [])]);
    cache.set(key, {
      nome: nomeByKey.get(key) ?? key,
      chaveCliente: key,
      fatAtual: fatA,
      fatComp: fatC,
      diff,
      diffPct,
      pedidosAtual: a?.pedidos.size ?? 0,
      pedidosComp: c?.pedidos.size ?? 0,
      primeiraVendaAtual: a?.primeira ?? null,
      ultimaVendaAtual: a?.ultima ?? null,
      nomesEncontrados: [...nomes],
      fonte: "sales_raw_rows",
    });
  }
  return cache;
}

function lookupComparativo(
  cache: ClienteComparativoCache,
  clienteNome: string,
): ClienteMovimento {
  const key = normalizeClienteKey(clienteNome);
  const found = cache.get(key);
  if (found) return found;
  return {
    nome: clienteNome,
    chaveCliente: key,
    fatAtual: 0,
    fatComp: 0,
    diff: 0,
    diffPct: null,
    pedidosAtual: 0,
    pedidosComp: 0,
    primeiraVendaAtual: null,
    ultimaVendaAtual: null,
    nomesEncontrados: [],
    fonte: "sales_raw_rows",
  };
}

function buildAbcList(items: { nome: string; fat: number; qty: number; pedidos: number }[]): AbcItem[] {
  const sorted = [...items].sort((a, b) => b.fat - a.fat);
  const totalFat = sorted.reduce((s, i) => s + i.fat, 0);
  let acum = 0;
  return sorted.map(item => {
    const participacao = totalFat > 0 ? (item.fat / totalFat) * 100 : 0;
    acum += participacao;
    // REGRA: cliente com apenas 1 pedido NÃO pode ser Classe A
    let classe: "A" | "B" | "C" = acum <= 80 ? "A" : acum <= 95 ? "B" : "C";
    if (classe === "A" && item.pedidos <= 1) {
      classe = "B";
    }
    return {
      nome: item.nome, faturamento: item.fat, quantidade: item.qty,
      pedidos: item.pedidos,
      ticketMedio: item.pedidos > 0 ? item.fat / item.pedidos : 0,
      participacao, acumulado: acum, classe,
    };
  });
}

function generateAnaliseInteligente(
  hasComp: boolean,
  fatAtual: number, fatComp: number,
  decomp: KpiDecomposition,
  clientesNovos: string[], clientesPerdidos: string[],
  vendedorFiltro?: string,
): AnaliseInteligente {
  const escopo = vendedorFiltro ? `do vendedor ${vendedorFiltro}` : "da empresa";
  const sujeito = vendedorFiltro ? `O vendedor ${vendedorFiltro}` : "A empresa";
  const fatores: string[] = [];
  const recomendacoes: string[] = [];

  if (!hasComp) {
    return {
      resumo: `O faturamento ${escopo} no período foi de R$ ${fatAtual.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}. Configure um período comparativo para análise detalhada.`,
      fatores: [],
      recomendacoes: ["Defina um período comparativo para obter insights mais profundos."],
    };
  }

  const fatDiffPct = fatComp > 0 ? ((fatAtual - fatComp) / fatComp) * 100 : 0;
  const direction = fatDiffPct >= 0 ? "cresceu" : "caiu";
  const absDiff = Math.abs(fatAtual - fatComp);

  let resumo = `${sujeito} ${direction} ${Math.abs(fatDiffPct).toFixed(1)}% no faturamento (${fatDiffPct >= 0 ? "+" : "-"}R$ ${absDiff.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}).${vendedorFiltro && fatDiffPct >= 0 ? " O crescimento foi puxado pelo aumento de pedidos e ticket médio deste vendedor." : vendedorFiltro && fatDiffPct < 0 ? " A queda foi causada por redução de pedidos ou ticket médio deste vendedor." : ""}`;

  // Analyze pedidos impact
  const pedDiffPct = decomp.pedidosComp > 0 ? ((decomp.pedidosAtual - decomp.pedidosComp) / decomp.pedidosComp) * 100 : 0;
  if (Math.abs(pedDiffPct) > 5) {
    if (pedDiffPct < 0 && fatDiffPct < 0) {
      fatores.push(`A redução de ${Math.abs(pedDiffPct).toFixed(0)}% no número de pedidos contribuiu para a queda.`);
    } else if (pedDiffPct > 0 && fatDiffPct > 0) {
      fatores.push(`O aumento de ${pedDiffPct.toFixed(0)}% no número de pedidos impulsionou o crescimento.`);
    } else if (pedDiffPct > 0 && fatDiffPct < 0) {
      fatores.push(`Mesmo com aumento de ${pedDiffPct.toFixed(0)}% nos pedidos, o faturamento caiu — indicando queda no ticket médio.`);
    } else if (pedDiffPct < 0 && fatDiffPct > 0) {
      fatores.push(`O faturamento cresceu apesar da queda de ${Math.abs(pedDiffPct).toFixed(0)}% nos pedidos — ticket médio subiu.`);
    }
  }

  // Ticket medio impact
  const tickDiffPct = decomp.ticketMedioComp > 0 ? ((decomp.ticketMedioAtual - decomp.ticketMedioComp) / decomp.ticketMedioComp) * 100 : 0;
  if (Math.abs(tickDiffPct) > 10) {
    fatores.push(`O ticket médio ${tickDiffPct > 0 ? "subiu" : "caiu"} ${Math.abs(tickDiffPct).toFixed(0)}% (R$ ${decomp.ticketMedioComp.toFixed(0)} → R$ ${decomp.ticketMedioAtual.toFixed(0)}).`);
  }

  // Client base impact
  const cliDiffPct = decomp.clientesAtivosComp > 0 ? ((decomp.clientesAtivosAtual - decomp.clientesAtivosComp) / decomp.clientesAtivosComp) * 100 : 0;
  if (Math.abs(cliDiffPct) > 5) {
    fatores.push(`A base ativa ${cliDiffPct > 0 ? "cresceu" : "reduziu"} ${Math.abs(cliDiffPct).toFixed(0)}% (${decomp.clientesAtivosComp} → ${decomp.clientesAtivosAtual} clientes).`);
  }

  // New/lost clients
  if (clientesNovos.length > 3) {
    fatores.push(`${clientesNovos.length} clientes novos entraram na base.`);
  }
  if (clientesPerdidos.length > 3) {
    fatores.push(`${clientesPerdidos.length} clientes deixaram de comprar no período.`);
    recomendacoes.push("Verificar clientes perdidos e tentar reativação.");
  }

  // Recommendations
  if (fatDiffPct < -10) {
    recomendacoes.push("Agendar visitas aos principais clientes que reduziram compras.");
  }
  if (tickDiffPct < -10) {
    recomendacoes.push("Revisar mix de produtos — queda no ticket médio pode indicar perda de itens de maior valor.");
  }
  if (cliDiffPct < -5) {
    recomendacoes.push("Intensificar prospecção para recuperar base de clientes.");
  }
  if (fatDiffPct > 10) {
    recomendacoes.push("Manter estratégia atual e consolidar crescimento.");
  }

  return { resumo, fatores, recomendacoes };
}

export function useInteligenciaData(allSales: SaleRow[] | undefined, filters: InteligenciaFilters) {
  return useMemo(() => {
    if (!allSales || !filters.inicio || !filters.fim) {
      return null;
    }

    const hasComp = Boolean(filters.compInicio && filters.compFim);
    const baseSales = applyFilters(allSales, filters);
    const principalQuery = runPeriodQuery(allSales, filters, filters.inicio, filters.fim);
    const periodFilteredRows = principalQuery.periodRows;
    const atualTrace = principalQuery.trace;
    const atual = principalQuery.rows;
    const compQuery = hasComp
      ? runPeriodQuery(allSales, filters, filters.compInicio, filters.compFim)
      : null;
    const compPeriodRows = compQuery?.periodRows ?? [];
    const compTrace = compQuery?.trace ?? { rows: [] as SaleRow[], stages: [] as FilterTraceStage[], lists: getFilterLists(filters) };
    const comp = compQuery?.rows ?? [];
    const vendorFilteredRows = filters.vendedores.length > 0
      ? allSales.filter(s => filters.vendedores.includes(s.vendedor) || filters.vendedores.includes(shortVendedorName(s.vendedor)))
      : allSales;
    const latestImportRow = [...allSales]
      .filter(s => s.data_importacao)
      .sort((a, b) => new Date(b.data_importacao || 0).getTime() - new Date(a.data_importacao || 0).getTime())[0];

    // ========== KPIs ==========
    const fatAtual = calcFaturamento(atual);
    const fatComp = calcFaturamento(comp);
    const volAtual = calcVolume(atual);
    const volComp = calcVolume(comp);
    const pedidosAtual = calcPedidos(atual);
    const pedidosComp = calcPedidos(comp);
    const clientesAtivosAtual = calcClientesAtivos(atual);
    const clientesAtivosComp = calcClientesAtivos(comp);

    const decomposition: KpiDecomposition = {
      pedidosAtual, pedidosComp,
      clientesAtivosAtual, clientesAtivosComp,
      volumeAtual: volAtual, volumeComp: volComp,
      precoMedioKgAtual: calcPrecoMedioKg(fatAtual, volAtual),
      precoMedioKgComp: calcPrecoMedioKg(fatComp, volComp),
      ticketMedioAtual: calcTicketMedio(fatAtual, pedidosAtual),
      ticketMedioComp: calcTicketMedio(fatComp, pedidosComp),
    };

    // Diferencia "falha técnica real" (não detectável aqui, ficou false) de
    // "período comparativo simplesmente sem dados" (informativo, não erro).
    const isComparisonEmpty = hasComp && comp.length === 0;
    const hasComparisonFailure = false;
    if (hasComp && compQuery) logInteligenciaQueries(filters, principalQuery, compQuery);
    const comparisonAudit: ComparisonAudit = {
      hasComparisonRequested: hasComp,
      hasComparisonFailure,
      isComparisonEmpty,
      message: isComparisonEmpty
        ? "Sem dados no período comparativo selecionado."
        : null,
      atualPeriodo: { inicio: filters.inicio, fim: filters.fim },
      comparativoPeriodo: hasComp ? { inicio: filters.compInicio, fim: filters.compFim } : null,
      linhasComparativas: comp.length,
      linhasBaseAposFiltros: baseSales.length,
      filtrosRecebidos: compTrace.lists,
      etapasComparativas: compTrace.stages,
      metricasComparativas: {
        faturamento: fatComp,
        pedidos: pedidosComp,
        clientesAtivos: clientesAtivosComp,
        volume: volComp,
      },
    };



    // ========== Audit ==========
    const auditAtual: AuditInfo = {
      linhasFiltradas: atual.length,
      pedidosUnicos: pedidosAtual,
      clientesUnicos: clientesAtivosAtual,
      faturamentoTotal: fatAtual,
      volumeTotal: volAtual,
      ticketMedio: decomposition.ticketMedioAtual,
      precoMedioKg: decomposition.precoMedioKgAtual,
      formulas: {
        faturamento: "SUM(Preço Venda Total R$)",
        pedidos: "COUNT DISTINCT Código Venda",
        clientesAtivos: "COUNT DISTINCT Cliente",
        volume: "SUM(Quantidade)",
        ticketMedio: "Faturamento / Pedidos",
        precoMedioKg: "Faturamento / Volume",
      },
    };

    const auditComp: AuditInfo | null = hasComp ? {
      linhasFiltradas: comp.length,
      pedidosUnicos: pedidosComp,
      clientesUnicos: clientesAtivosComp,
      faturamentoTotal: fatComp,
      volumeTotal: volComp,
      ticketMedio: decomposition.ticketMedioComp,
      precoMedioKg: decomposition.precoMedioKgComp,
      formulas: auditAtual.formulas,
    } : null;

    // Quebra bruta por vendedor no período (sem qualquer filtro de vendedor/cliente/produto)
    const vendedoresFiltroSet = new Set(filters.vendedores);
    const vendorAcc = new Map<string, { vendedorCurto: string; linhas: number; faturamento: number }>();
    let somaBrutoPeriodo = 0;
    let linhasComVendedorVazioPeriodo = 0;
    let linhasComProdutoVazioPeriodo = 0;
    let linhasComClienteVazioPeriodo = 0;
    let linhasComValorNuloPeriodo = 0;
    const codigoCounts = new Map<number, number>();
    const fullKeyCounts = new Map<string, number>();
    for (const r of periodFilteredRows) {
      somaBrutoPeriodo += Number(r.preco_total ?? 0);
      if (!String(r.vendedor ?? "").trim()) linhasComVendedorVazioPeriodo += 1;
      if (!String(r.descricao ?? "").trim()) linhasComProdutoVazioPeriodo += 1;
      if (!String(r.cliente ?? "").trim()) linhasComClienteVazioPeriodo += 1;
      if (r.preco_total === null || r.preco_total === undefined || !Number.isFinite(Number(r.preco_total))) linhasComValorNuloPeriodo += 1;
      codigoCounts.set(r.codigo_venda, (codigoCounts.get(r.codigo_venda) ?? 0) + 1);
      const fullKey = [r.codigo_venda, cleanProductName(r.descricao ?? ""), normalizeClienteKey(r.cliente), Number(r.quantidade ?? 0).toFixed(4), Number(r.preco_total ?? 0).toFixed(4)].join("|");
      fullKeyCounts.set(fullKey, (fullKeyCounts.get(fullKey) ?? 0) + 1);
      const raw = String(r.vendedor ?? "").trim() || "(sem vendedor)";
      const curto = raw === "(sem vendedor)" ? "(sem vendedor)" : shortVendedorName(raw);
      const entry = vendorAcc.get(raw) ?? { vendedorCurto: curto, linhas: 0, faturamento: 0 };
      entry.linhas += 1;
      entry.faturamento += Number(r.preco_total ?? 0);
      vendorAcc.set(raw, entry);
    }
    const vendorBreakdownPeriodo = [...vendorAcc.entries()]
      .map(([vendedorRaw, v]) => ({
        vendedorRaw,
        vendedorCurto: v.vendedorCurto,
        linhas: v.linhas,
        faturamento: v.faturamento,
        incluidoNoFiltro: vendedoresFiltroSet.size === 0
          ? true
          : vendedoresFiltroSet.has(vendedorRaw) || vendedoresFiltroSet.has(v.vendedorCurto),
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    const linhasIgnoradas = periodFilteredRows
      .map((r) => ({ row: r, motivo: auditIgnoreReason(r, filters) }))
      .filter((entry): entry is { row: SaleRow; motivo: string } => Boolean(entry.motivo))
      .map(({ row, motivo }) => ({
        originalRowNumber: row.original_row_number,
        codigoVenda: row.codigo_venda,
        data: row.data,
        vendedor: row.vendedor,
        cliente: row.cliente,
        descricao: row.descricao,
        quantidade: Number(row.quantidade ?? 0),
        precoTotal: Number(row.preco_total ?? 0),
        motivo,
      }));

    const rawMirrorAudit: RawMirrorAudit = {
      totalLinhasPlanilha: allSales.length,
      totalLinhasImportadas: allSales.length,
      linhasFiltradasVendedor: vendorFilteredRows.length,
      linhasFiltradasPeriodo: periodFilteredRows.length,
      linhasUsadasNoCalculo: atual.length,
      linhasIgnoradasNoCalculo: linhasIgnoradas.length,
      somaQuantidade: volAtual,
      pedidosUnicos: pedidosAtual,
      clientesUnicos: clientesAtivosAtual,
      linhasComVendedorVazioPeriodo,
      linhasComProdutoVazioPeriodo,
      linhasComClienteVazioPeriodo,
      linhasComValorNuloPeriodo,
      codigosVendaRepetidosPeriodo: [...codigoCounts.values()].filter((count) => count > 1).length,
      duplicatasExatasPeriodo: [...fullKeyCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      somaPrecoVendaTotal: fatAtual,
      somaBrutoPeriodo,
      linhasBrutoPeriodo: periodFilteredRows.length,
      vendorBreakdownPeriodo,
      linhasIgnoradas,
      arquivoMaisRecente: latestImportRow?.nome_arquivo_importado ?? null,
      importacaoMaisRecente: latestImportRow?.data_importacao ?? null,
    };

    // ========== Movimento por cliente (REGRA: Atual - Comparado) ==========
    const clientesAtualMap = new Map<string, number>();
    const clientesCompMap = new Map<string, number>();
    const clienteNameByKey = new Map<string, string>();
    const addClienteFat = (map: Map<string, number>, sale: SaleRow) => {
      const key = normalizeClienteKey(sale.cliente);
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + Number(sale.preco_total));
      if (!clienteNameByKey.has(key)) clienteNameByKey.set(key, sale.cliente);
    };
    atual.forEach(s => addClienteFat(clientesAtualMap, s));
    comp.forEach(s => addClienteFat(clientesCompMap, s));

    // OTIMIZAÇÃO: pré-computa o cache uma única vez (passa única pelas linhas filtradas)
    // No modo CONTÍNUO comparamos 1ª metade vs 2ª metade do período atual, garantindo
    // que "Top 10 Quedas" tenha conteúdo mesmo sem período comparativo explícito.
    let clienteMovimentos: ClienteMovimento[];
    let comparativoCache: ClienteComparativoCache;
    if (filters.analysisMode === "continuous" && filters.inicio && filters.fim) {
      const [sy, sm, sd] = filters.inicio.split("-").map(Number);
      const [ey, em, ed] = filters.fim.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd).getTime();
      const end = new Date(ey, em - 1, ed).getTime();
      const mid = start + (end - start) / 2;
      const firstHalf = atual.filter(r => new Date(r.data).getTime() <= mid);
      const lastHalf = atual.filter(r => new Date(r.data).getTime() > mid);
      // Em modo contínuo, "atual" = 2ª metade e "comp" = 1ª metade.
      comparativoCache = buildClienteComparativoCache(lastHalf, firstHalf);
    } else {
      comparativoCache = buildClienteComparativoCache(atual, comp);
    }
    clienteMovimentos = [...comparativoCache.values()];

    // TOP CRESCIMENTO / QUEDAS — evolução real entre períodos (não faturamento bruto).
    // Ordenação CENTRALIZADA: variação absoluta em R$ (valorAtual - valorAnterior).
    const RELEVANCIA_MIN_COMP = 1000;       // R$ mínimos no período anterior (clientes)
    const RELEVANCIA_MIN_DIFF = 300;        // R$ mínimos de variação absoluta (clientes)
    const PRODUTO_MIN_COMP = 100;           // produtos: catálogo curto, threshold menor
    const PRODUTO_MIN_DIFF = 50;
    const clientesCresceram = rankVariation(clienteMovimentos, "growth", {
      minPreviousValue: RELEVANCIA_MIN_COMP,
      minAbsVariation: RELEVANCIA_MIN_DIFF,
      limit: 10,
      label: "clientesCresceram",
      include: c => c.fatAtual > 0,
    });
    const clientesCairam = rankVariation(clienteMovimentos, "drop", {
      minPreviousValue: RELEVANCIA_MIN_COMP,
      minAbsVariation: RELEVANCIA_MIN_DIFF,
      limit: 10,
      label: "clientesCairam",
    });



    // ========== Classificação de clientes (CENTRALIZADA) ==========
    // IMPORTANTE: Para detectar NOVO vs REATIVADO precisamos do histórico
    // GLOBAL (allSales), nunca de baseSales filtrado por vendedor/produto.
    // Caso contrário, um cliente que comprou antes com OUTRO vendedor seria
    // erroneamente contado como "novo" quando aparece com este vendedor.
    const classificacao = classifyClientsForPeriod({
      todasAsVendas: allSales,
      vendasNoPeriodoAtualFiltradas: atual,
      inicio: filters.inicio,
      fim: filters.fim,
      compInicio: filters.compInicio || undefined,
      compFim: filters.compFim || undefined,
      reativacaoDiasSemCompra: filters.reativacaoDiasSemCompra ?? 60,
    });
    // Ordenação global: maior valor primeiro (regra padrão da Inteligência Comercial)
    const clientesNovosDetalhe = [...classificacao.novos].sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);
    const clientesReativadosDetalhe = [...classificacao.reativados].sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);
    const clientesRecorrentesDetalhe = [...classificacao.recorrentes].sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);
    const clientesSemRecompraDetalhe = [...classificacao.semRecompra].sort((a, b) => b.totalNoPeriodo - a.totalNoPeriodo);
    const clientesNovos = clientesNovosDetalhe.map(c => c.cliente);
    const clientesReativados = clientesReativadosDetalhe.map(c => c.cliente);
    const clientesRecorrentes = clientesRecorrentesDetalhe.map(c => c.cliente);

    // PERDIDOS (lista por nome, mantida para compat): clientes que compraram no
    // período comparado mas não no atual — dentro do recorte filtrado.
    const clientesAtualSet = new Set(atual.map(s => normalizeClienteKey(s.cliente)));
    const clientesCompSet = new Set(comp.map(s => normalizeClienteKey(s.cliente)));
    const clientesPerdidos = [...clientesCompSet].filter(c => !clientesAtualSet.has(c)).map(c => clienteNameByKey.get(c) ?? c);

    // Product movement (espelho da planilha — sem exclusão de produtos)
    interface ProdAcc { vol: number; fat: number; pedidos: Set<number>; ids: Set<number> }
    const accumulate = (rows: SaleRow[]) => {
      const map = new Map<string, ProdAcc>();
      rows.forEach(s => {
        const p = cleanProductName(s.descricao);
        const e = map.get(p) ?? { vol: 0, fat: 0, pedidos: new Set<number>(), ids: new Set<number>() };
        e.vol += Number(s.quantidade);
        e.fat += Number(s.preco_total);
        e.pedidos.add(s.codigo_venda);
        e.ids.add(s.codigo_venda);
        map.set(p, e);
      });
      return map;
    };
    const prodAtualMap = accumulate(atual);
    const prodCompMap = accumulate(comp);

    const allProds = new Set([...prodAtualMap.keys(), ...prodCompMap.keys()]);
    const prodMovimentos: ProdutoMovimento[] = [...allProds].map(nome => {
      const a = prodAtualMap.get(nome) ?? { vol: 0, fat: 0, pedidos: new Set<number>(), ids: new Set<number>() };
      const c = prodCompMap.get(nome) ?? { vol: 0, fat: 0, pedidos: new Set<number>(), ids: new Set<number>() };
      return {
        nome, volAtual: a.vol, volComp: c.vol, fatAtual: a.fat, fatComp: c.fat,
        diff: a.fat - c.fat,
        diffPct: c.fat > 0 ? ((a.fat - c.fat) / c.fat) * 100 : a.fat > 0 ? 100 : null,
        pedidosAtual: a.pedidos.size,
        pedidosComp: c.pedidos.size,
        idsAtual: [...a.ids].sort((x, y) => x - y),
        idsComp: [...c.ids].sort((x, y) => x - y),
      };
    });

    // Em modo CONTÍNUO, recalculamos a tendência por produto usando 1ª vs 2ª metade
    // do período atual (sem depender de compInicio/compFim).
    let produtosCresceram: ProdutoMovimento[];
    let produtosCairam: ProdutoMovimento[];
    if (filters.analysisMode === "continuous" && filters.inicio && filters.fim) {
      const [sy, sm, sd] = filters.inicio.split("-").map(Number);
      const [ey, em, ed] = filters.fim.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd).getTime();
      const end = new Date(ey, em - 1, ed).getTime();
      const mid = start + (end - start) / 2;
      const accumulateRange = (rows: SaleRow[]) => {
        const map = new Map<string, ProdAcc>();
        for (const s of rows) {
          const p = cleanProductName(s.descricao);
          const e = map.get(p) ?? { vol: 0, fat: 0, pedidos: new Set<number>(), ids: new Set<number>() };
          e.vol += Number(s.quantidade);
          e.fat += Number(s.preco_total);
          e.pedidos.add(s.codigo_venda);
          e.ids.add(s.codigo_venda);
          map.set(p, e);
        }
        return map;
      };
      const firstHalfRows = atual.filter(r => new Date(r.data).getTime() <= mid);
      const lastHalfRows = atual.filter(r => new Date(r.data).getTime() > mid);
      const map1 = accumulateRange(firstHalfRows);
      const map2 = accumulateRange(lastHalfRows);
      const allProdsCont = new Set([...map1.keys(), ...map2.keys()]);
      const movs: ProdutoMovimento[] = [...allProdsCont].map(nome => {
        const a = map2.get(nome) ?? { vol: 0, fat: 0, pedidos: new Set<number>(), ids: new Set<number>() };
        const c = map1.get(nome) ?? { vol: 0, fat: 0, pedidos: new Set<number>(), ids: new Set<number>() };
        return {
          nome, volAtual: a.vol, volComp: c.vol, fatAtual: a.fat, fatComp: c.fat,
          diff: a.fat - c.fat,
          diffPct: c.fat > 0 ? ((a.fat - c.fat) / c.fat) * 100 : a.fat > 0 ? 100 : null,
          pedidosAtual: a.pedidos.size, pedidosComp: c.pedidos.size,
          idsAtual: [...a.ids].sort((x, y) => x - y),
          idsComp: [...c.ids].sort((x, y) => x - y),
        };
      });
      produtosCresceram = rankVariation(movs, "growth", { minPreviousValue: PRODUTO_MIN_COMP, minAbsVariation: PRODUTO_MIN_DIFF, label: "produtosCresceram" });
      produtosCairam = rankVariation(movs, "drop", { minPreviousValue: PRODUTO_MIN_COMP, minAbsVariation: PRODUTO_MIN_DIFF, label: "produtosCairam" });
    } else {
      produtosCresceram = rankVariation(prodMovimentos, "growth", { minPreviousValue: PRODUTO_MIN_COMP, minAbsVariation: PRODUTO_MIN_DIFF, label: "produtosCresceram" });
      produtosCairam = rankVariation(prodMovimentos, "drop", { minPreviousValue: PRODUTO_MIN_COMP, minAbsVariation: PRODUTO_MIN_DIFF, label: "produtosCairam" });
    }

    // Product mix
    const mixProdutos = [...prodAtualMap.entries()]
      .map(([nome, { fat }]) => ({ nome, fat, pct: fatAtual > 0 ? (fat / fatAtual) * 100 : 0 }))
      .sort((a, b) => b.fat - a.fat);

    // Vendor analysis
    const vendAtualMap = new Map<string, { fat: number; pedidos: Set<number>; clientes: Set<string> }>();
    atual.forEach(s => {
      const v = shortVendedorName(s.vendedor);
      const e = vendAtualMap.get(v) ?? { fat: 0, pedidos: new Set<number>(), clientes: new Set<string>() };
      e.fat += Number(s.preco_total);
      e.pedidos.add(s.codigo_venda);
      e.clientes.add(s.cliente);
      vendAtualMap.set(v, e);
    });
    const vendCompMap = new Map<string, { fat: number; pedidos: Set<number>; clientes: Set<string> }>();
    comp.forEach(s => {
      const v = shortVendedorName(s.vendedor);
      const e = vendCompMap.get(v) ?? { fat: 0, pedidos: new Set<number>(), clientes: new Set<string>() };
      e.fat += Number(s.preco_total);
      e.pedidos.add(s.codigo_venda);
      e.clientes.add(s.cliente);
      vendCompMap.set(v, e);
    });

    const allVends = new Set([...vendAtualMap.keys(), ...vendCompMap.keys()]);
    const vendedorMovimentos: VendedorResumo[] = [...allVends].map(nome => {
      const a = vendAtualMap.get(nome);
      const c = vendCompMap.get(nome);
      const fa = a?.fat ?? 0;
      const fc = c?.fat ?? 0;
      return {
        nome, fatAtual: fa, fatComp: fc, diff: fa - fc,
        diffPct: fc > 0 ? ((fa - fc) / fc) * 100 : fa > 0 ? 100 : null,
        pedidos: a?.pedidos.size ?? 0,
        pedidosComp: c?.pedidos.size ?? 0,
        clientes: a?.clientes.size ?? 0,
        clientesComp: c?.clientes.size ?? 0,
      };
    });
    const vendedoresCresceram = rankVariation(vendedorMovimentos, "growth", { label: "vendedoresCresceram" });
    const vendedoresCairam = rankVariation(vendedorMovimentos, "drop", { label: "vendedoresCairam" });
    const vendedorResumos = hasComp
      ? [...vendedorMovimentos].sort((a, b) => b.diff - a.diff)
      : [...vendedorMovimentos].sort((a, b) => b.fatAtual - a.fatAtual);

    // Vendor scatter data
    const vendedorScatter: VendedorScatterPoint[] = vendedorResumos.map(v => ({
      nome: v.nome,
      pedidos: v.pedidos,
      faturamento: v.fatAtual,
    }));

    // ========== ALERTS (expanded) ==========
    const alertas: AlertaComercial[] = [];

    // Global faturamento alert
    if (hasComp && fatComp > 0) {
      const fatPct = ((fatAtual - fatComp) / fatComp) * 100;
      if (fatPct < -10) {
        alertas.push({
          tipo: "faturamento_queda",
          mensagem: `Faturamento caiu ${Math.abs(fatPct).toFixed(0)}% no período (${fatAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })} vs ${fatComp.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 })})`,
          severidade: fatPct < -20 ? "alta" : "media",
        });
      } else if (fatPct > 15) {
        alertas.push({
          tipo: "faturamento_crescimento",
          mensagem: `Faturamento cresceu ${fatPct.toFixed(0)}% no período — bom desempenho!`,
          severidade: "baixa",
        });
      }
    }

    // ===== Client drop / lost alerts — fonte única: clientesAtualMap / clientesCompMap =====
    // Regras obrigatórias:
    //  • fatAtual > fatComp           → crescimento, NUNCA gera alerta de queda
    //  • fatAtual < fatComp & fatAtual > 0  → queda parcial (texto: "atual R$ Y vs anterior R$ Z")
    //  • fatAtual = 0 & fatComp > 0   → cliente perdido (único caso "sem compra no período atual")
    if (hasComp) {
      clienteMovimentos.forEach(c => {
        // Fonte única: getComparativoCliente, baseada em sales_raw_rows já filtrada por vendedor/produto.
        const fa = c.fatAtual;
        const fc = c.fatComp;

        if (fc <= 3000) return;                     // ignora clientes pequenos
        if (fa >= fc) return;                       // crescimento ou estável → sem alerta
        const pctQueda = ((fc - fa) / fc) * 100;    // sempre positivo, 0–100

        const fmt = (n: number) =>
          n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

        if (fa > 0) {
          // QUEDA PARCIAL — proibido escrever "sem compra no período atual"
          if (pctQueda < 30) return;
          alertas.push({
            tipo: "cliente_queda",
            mensagem: `${c.nome}: queda de ${pctQueda.toFixed(0)}% — atual ${fmt(fa)}; anterior ${fmt(fc)}`,
            severidade: fc > 10000 ? "alta" : "media",
            debug: {
              cliente: c.nome,
              fatAtual: fa,
              fatComp: fc,
              diff: fa - fc,
              diffPct: -pctQueda,
              pedidosAtual: c.pedidosAtual,
              pedidosComp: c.pedidosComp,
              primeiraVendaAtual: c.primeiraVendaAtual?.toISOString() ?? null,
              ultimaVendaAtual: c.ultimaVendaAtual?.toISOString() ?? null,
              fonte: c.fonte,
              nomesEncontrados: c.nomesEncontrados,
              motivo: "Faturamento atual menor que comparado (queda parcial)",
            },
          });
        } else {
          // CLIENTE PERDIDO — único caso onde "sem compra no período atual" é válido
          alertas.push({
            tipo: "cliente_perdido",
            mensagem: `${c.nome}: queda de 100% — sem compra no período atual; anterior ${fmt(fc)}`,
            severidade: fc > 10000 ? "alta" : "media",
            debug: {
              cliente: c.nome,
              fatAtual: 0,
              fatComp: fc,
              diff: -fc,
              diffPct: -100,
              pedidosAtual: c.pedidosAtual,
              pedidosComp: c.pedidosComp,
              primeiraVendaAtual: c.primeiraVendaAtual?.toISOString() ?? null,
              ultimaVendaAtual: c.ultimaVendaAtual?.toISOString() ?? null,
              fonte: c.fonte,
              nomesEncontrados: c.nomesEncontrados,
              motivo: "Sem nenhuma venda no período atual após consulta normalizada em sales_raw_rows (cliente perdido)",
            },
          });
        }
      });
    }

    // Inactive client alerts — só dispara se o cliente NÃO comprou no período atual
    if (hasComp) {
      const lastPurchase = new Map<string, { data: Date; nome: string }>();
      baseSales.forEach(s => {
        const key = normalizeClienteKey(s.cliente);
        const d = new Date(s.data);
        const e = lastPurchase.get(key);
        if (!e || d > e.data) lastPurchase.set(key, { data: d, nome: s.cliente });
      });
      const [endYear, endMonth, endDay] = filters.fim.split("-").map(Number);
      const endDateForAlert = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
      const clientesPerdidosKeys = new Set(clientesPerdidos.map(normalizeClienteKey));
      lastPurchase.forEach(({ data: d, nome }, key) => {
        // Guarda obrigatória: se houve venda no período atual, não é inativo
        if ((clientesAtualMap.get(key) ?? 0) > 0) return;
        const days = (endDateForAlert.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        if (days > 30 && clientesCompSet.has(key) && !clientesPerdidosKeys.has(key)) {
          const comparativo = lookupComparativo(comparativoCache, nome);
          alertas.push({
            tipo: "cliente_inativo",
            mensagem: `${nome}: ${Math.round(days)} dias sem pedido`,
            severidade: days > 60 ? "alta" : "media",
            debug: { cliente: nome, fatAtual: comparativo.fatAtual, fatComp: comparativo.fatComp, pedidosAtual: comparativo.pedidosAtual, pedidosComp: comparativo.pedidosComp, fonte: comparativo.fonte, nomesEncontrados: comparativo.nomesEncontrados, motivo: `${Math.round(days)} dias desde a última compra` },
          });
        }
      });
    }

    // Product/vendor alerts dependem obrigatoriamente do mesmo período comparativo.
    if (hasComp) {
      rankVariation(prodMovimentos, "drop", { minPreviousValue: 2000 }).forEach(p => {
        if (p.fatComp > 2000 && p.diffPct !== null && p.diffPct < -20) {
          alertas.push({ tipo: "produto_queda", mensagem: `${p.nome}: queda de ${Math.abs(p.diffPct).toFixed(0)}% no faturamento`, severidade: "media" });
        }
      });
      rankVariation(prodMovimentos, "growth", { minPreviousValue: 1000 }).forEach(p => {
        if (p.fatComp > 1000 && p.diffPct !== null && p.diffPct > 50) {
          alertas.push({ tipo: "produto_crescimento", mensagem: `${p.nome}: cresceu ${p.diffPct.toFixed(0)}% — destaque positivo`, severidade: "baixa" });
        }
      });

      vendedoresCairam.forEach(v => {
        if (v.fatComp > 10000 && v.diffPct !== null && v.diffPct < -15) {
          alertas.push({ tipo: "vendedor_queda", mensagem: `${v.nome}: queda de ${Math.abs(v.diffPct).toFixed(0)}% no faturamento`, severidade: "alta" });
        }
      });
    }

    // Ticket medio alert
    if (hasComp && decomposition.ticketMedioComp > 0) {
      const ticketVar = ((decomposition.ticketMedioAtual - decomposition.ticketMedioComp) / decomposition.ticketMedioComp) * 100;
      if (Math.abs(ticketVar) > 15) {
        alertas.push({ tipo: "ticket_mudanca", mensagem: `Ticket médio ${ticketVar > 0 ? "subiu" : "caiu"} ${Math.abs(ticketVar).toFixed(0)}%`, severidade: "media" });
      }
    }

    // Forecast — FONTE ÚNICA (`calcProjecaoMensal`).
    // Sempre baseia-se no MÊS calendário do `filters.fim` e em DIAS ÚTEIS.
    // As demais telas (Leitura Estratégica / MetasAcaoPanel) chamam a MESMA
    // função com o mesmo `refDate`, garantindo valor idêntico por vendedor.
    const refDate = new Date(filters.fim + "T12:00:00");
    const vendedorUnicoFiltro = filters.vendedores.length === 1
      ? shortVendedorName(filters.vendedores[0])
      : undefined;
    const projecao = calcProjecaoMensal(allSales, refDate, vendedorUnicoFiltro);
    const diasDecorridos = projecao.diasUteisDecorridos;
    const diasRestantes = projecao.diasUteisRestantes;
    const mediaDiariaGeral = projecao.mediaDiariaUtil;
    const projecaoMes = projecao.projecaoMes;

    const previsaoVendedores: PrevisaoVendedor[] = vendedorResumos.map(v => {
      const p = calcProjecaoMensal(allSales, refDate, v.nome);
      return { nome: v.nome, fatAcumulado: p.fatAcumulado, mediaDiaria: p.mediaDiariaUtil, projecao: p.projecaoMes };
    }).sort((a, b) => b.projecao - a.projecao);


    // ========== Previsibilidade da Carteira ==========
    // Regra: usa APENAS clientes recorrentes do recorte (baseSales já tem filtro de vendedor/produto/cliente).
    // Considera os últimos 6 meses calendário a partir do fim do período atual.
    // Para cada cliente recorrente (>= 2 meses com compra nesse intervalo), calcula:
    //   mediaMensal = soma do faturamento nesses 6 meses / 6  (média sobre TODOS os meses, não só os com compra,
    //   evitando superestimativa de clientes intermitentes).
    // Soma das médias = previsão da carteira.
    const fimDate = new Date(filters.fim + "T23:59:59");
    const inicioJanela = new Date(fimDate.getFullYear(), fimDate.getMonth() - 5, 1);
    const NUM_MESES_JANELA = 6;

    const clienteVendedor = new Map<string, string>();
    const monthsMap = new Map<string, Map<string, number>>();
    baseSales.forEach(s => {
      const d = new Date(s.data);
      if (d < inicioJanela || d > fimDate) return;
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cm = monthsMap.get(s.cliente) ?? new Map<string, number>();
      cm.set(mk, (cm.get(mk) ?? 0) + Number(s.preco_total));
      monthsMap.set(s.cliente, cm);
      if (!clienteVendedor.has(s.cliente)) clienteVendedor.set(s.cliente, shortVendedorName(s.vendedor));
    });

    const lastPurchaseMap = new Map<string, Date>();
    baseSales.forEach(s => { const d = new Date(s.data); const e = lastPurchaseMap.get(s.cliente); if (!e || d > e) lastPurchaseMap.set(s.cliente, d); });

    const clientePrevisoes: ClientePrevisao[] = [];
    monthsMap.forEach((months, nome) => {
      if (months.size < 2) return; // recorrente mínimo: 2 meses dentro da janela
      const total = [...months.values()].reduce((a, b) => a + b, 0);
      const mediaMensal = total / NUM_MESES_JANELA;
      const ultimaCompra = lastPurchaseMap.get(nome) ?? new Date();
      clientePrevisoes.push({
        nome,
        mediaMensal,
        frequencia: months.size,
        ultimaCompra,
        previsaoMes: mediaMensal,
        mesesConsiderados: NUM_MESES_JANELA,
        vendedor: clienteVendedor.get(nome) ?? "",
      });
    });
    clientePrevisoes.sort((a, b) => b.mediaMensal - a.mediaMensal);
    const previsaoCarteira = clientePrevisoes.reduce((s, c) => s + c.previsaoMes, 0);

    // ========== Clientes inativos (faixas) ==========
    // baseSales já está filtrado por vendedor/cliente/produto, então só consideramos
    // clientes que pertencem ao recorte selecionado.
    // Regra adicional: quando há filtro de vendedor, exige-se que a carteira ATUAL do cliente
    // (vendedor da compra mais recente em allSales) esteja entre os vendedores filtrados.
    // Isso evita listar clientes que historicamente compraram do vendedor mas hoje estão
    // sendo atendidos por outro.
    const carteiraAtualPorCliente = new Map<string, { vendedor: string; data: Date }>();
    if (filters.vendedores.length > 0) {
      allSales.forEach(s => {
        const d = new Date(s.data);
        const e = carteiraAtualPorCliente.get(s.cliente);
        if (!e || d > e.data) carteiraAtualPorCliente.set(s.cliente, { vendedor: shortVendedorName(s.vendedor), data: d });
      });
    }
    const vendedoresFilterShort = new Set(filters.vendedores.map(v => shortVendedorName(v)));

    // Para cada cliente, agregamos último dia, total histórico e total por mês (YYYY-MM)
    const lastPurchaseAllMap = new Map<string, { last: Date; total: number; porMes: Map<string, number> }>();
    baseSales.forEach(s => {
      const d = new Date(s.data);
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const val = Number(s.preco_total);
      const e = lastPurchaseAllMap.get(s.cliente);
      if (!e) {
        const porMes = new Map<string, number>();
        porMes.set(ym, val);
        lastPurchaseAllMap.set(s.cliente, { last: d, total: val, porMes });
      } else {
        if (d > e.last) e.last = d;
        e.total += val;
        e.porMes.set(ym, (e.porMes.get(ym) ?? 0) + val);
      }
    });
    const clientesInativos: ClienteInativo[] = [];
    lastPurchaseAllMap.forEach((v, nome) => {
      if (filters.vendedores.length > 0) {
        const carteira = carteiraAtualPorCliente.get(nome);
        if (!carteira || !vendedoresFilterShort.has(carteira.vendedor)) return;
      }
      const dias = Math.floor((fimDate.getTime() - v.last.getTime()) / (1000 * 60 * 60 * 24));
      if (dias < 30) return;
      const faixa: ClienteInativo["faixa"] = dias > 200 ? "200+" : dias > 90 ? "90-200" : "30-90";
      // Últimos 6 meses ATIVOS (com compra) antes da inatividade
      const mesesOrdenados = [...v.porMes.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      const ultimos6 = mesesOrdenados.slice(0, 6);
      const somaUltimos6 = ultimos6.reduce((s, [, val]) => s + val, 0);
      const mesesAtivosConsiderados = ultimos6.length;
      const mediaMensalHistorica = mesesAtivosConsiderados > 0 ? somaUltimos6 / mesesAtivosConsiderados : 0;
      clientesInativos.push({
        nome,
        ultimaCompra: v.last,
        diasSemCompra: dias,
        faixa,
        faturamentoHistorico: v.total,
        mediaMensalHistorica,
        receitaRecuperavel: mediaMensalHistorica,
        mesesAtivosConsiderados,
      });
    });
    // Ordem por maior receita recuperável (impacto financeiro mensal) — dias sem compra como desempate
    clientesInativos.sort((a, b) => (b.receitaRecuperavel - a.receitaRecuperavel) || (b.diasSemCompra - a.diasSemCompra));

    // ========== Debug por cliente ==========
    const novosSet = new Set(clientesNovos);
    const reativadosSet = new Set(clientesReativados);
    const perdidosSet = new Set(clientesPerdidos);
    const clientesDebug: ClienteDebug[] = clienteMovimentos.map(c => {
      let classificacao: ClienteDebug["classificacao"];
      if (novosSet.has(c.nome)) classificacao = "novo";
      else if (reativadosSet.has(c.nome)) classificacao = "reativado";
      else if (perdidosSet.has(c.nome)) classificacao = "perdido";
      else if (c.diff > 0) classificacao = "crescimento";
      else if (c.diff < 0) classificacao = "queda";
      else classificacao = "estavel";
      return { ...c, classificacao };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));


    // Intelligent analysis
    const vendedorFiltro = filters.vendedores.length === 1 ? filters.vendedores[0] : undefined;
    const analiseInteligente = generateAnaliseInteligente(hasComp, fatAtual, fatComp, decomposition, clientesNovos, clientesPerdidos, vendedorFiltro);

    // Legacy diagnostico (keep for backward compat)
    const diagnostico = analiseInteligente.resumo;

    // Monthly evolution for charts
    const monthlyEvolution = new Map<string, number>();
    baseSales.forEach(s => {
      const d = new Date(s.data);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyEvolution.set(mk, (monthlyEvolution.get(mk) ?? 0) + Number(s.preco_total));
    });
    const chartData = hasComp ? [
      { label: "Atual", faturamento: fatAtual },
      { label: "Comparativo", faturamento: fatComp },
    ] : [...monthlyEvolution.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, fat]) => {
        const [y, m] = month.split("-");
        const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return { label: `${months[parseInt(m) - 1]}/${y.slice(2)}`, faturamento: fat };
      });

    // Volume monthly
    const monthlyVolume = new Map<string, number>();
    baseSales.forEach(s => {
      const d = new Date(s.data);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyVolume.set(mk, (monthlyVolume.get(mk) ?? 0) + Number(s.quantidade));
    });
    const chartVolume = hasComp ? [
      { label: "Atual", volume: volAtual },
      { label: "Comparativo", volume: volComp },
    ] : [...monthlyVolume.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, vol]) => {
        const [y, m] = month.split("-");
        const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return { label: `${months[parseInt(m) - 1]}/${y.slice(2)}`, volume: vol };
      });

    // ========== CURVA ABC (usa EXATAMENTE o período selecionado + filtros) ==========
    const abcStartStr = filters.inicio;
    const abcSales = atual;

    // ABC Clientes
    const abcClienteMap = new Map<string, { fat: number; qty: number; pedidos: Set<number> }>();
    abcSales.forEach(s => {
      if (isExcludedProduct(cleanProductName(s.descricao))) return;
      const e = abcClienteMap.get(s.cliente) ?? { fat: 0, qty: 0, pedidos: new Set<number>() };
      e.fat += Number(s.preco_total);
      e.qty += Number(s.quantidade);
      e.pedidos.add(s.codigo_venda);
      abcClienteMap.set(s.cliente, e);
    });
    const abcClientes = buildAbcList(
      [...abcClienteMap.entries()].map(([nome, v]) => ({ nome, fat: v.fat, qty: v.qty, pedidos: v.pedidos.size }))
    );

    // ABC Produtos
    const abcProdutoMap = new Map<string, { fat: number; qty: number; pedidos: Set<number> }>();
    abcSales.forEach(s => {
      const p = cleanProductName(s.descricao);
      if (isExcludedProduct(p)) return;
      const e = abcProdutoMap.get(p) ?? { fat: 0, qty: 0, pedidos: new Set<number>() };
      e.fat += Number(s.preco_total);
      e.qty += Number(s.quantidade);
      e.pedidos.add(s.codigo_venda);
      abcProdutoMap.set(p, e);
    });
    const abcProdutos = buildAbcList(
      [...abcProdutoMap.entries()].map(([nome, v]) => ({ nome, fat: v.fat, qty: v.qty, pedidos: v.pedidos.size }))
    );

    // ABC Alertas
    const abcAlertas: AbcAlerta[] = [];
    const lastPurchaseForAbc = new Map<string, Date>();
    baseSales.forEach(s => {
      const key = normalizeClienteKey(s.cliente);
      const d = new Date(s.data);
      const e = lastPurchaseForAbc.get(key);
      if (!e || d > e) lastPurchaseForAbc.set(key, d);
    });
    const [abcEndYear, abcEndMonth, abcEndDay] = filters.fim.split("-").map(Number);
    const endDateAbc = new Date(Date.UTC(abcEndYear, abcEndMonth - 1, abcEndDay, 23, 59, 59, 999));

    abcClientes.forEach(c => {
      if (c.classe === "A") {
        const clienteKey = normalizeClienteKey(c.nome);
        const comparativo = lookupComparativo(comparativoCache, c.nome);
        const fatAtualA = comparativo.fatAtual;
        const lastP = lastPurchaseForAbc.get(clienteKey);
        // Só alerta "sem pedido" se NÃO houve compra no período atual
        if (lastP && fatAtualA === 0) {
          const days = (endDateAbc.getTime() - lastP.getTime()) / (1000 * 60 * 60 * 24);
          if (days > 15) {
            abcAlertas.push({ tipo: "a_sem_pedido", mensagem: `${c.nome}: ${Math.round(days)} dias sem pedido (Classe A, ${c.participacao.toFixed(1)}% do fat.)`, classe: "A" });
            alertas.push({
              tipo: "cliente_risco_a",
              mensagem: `⚠️ Cliente Classe A "${c.nome}" está há ${Math.round(days)} dias sem pedido`,
              severidade: "alta",
              debug: { cliente: c.nome, fatAtual: comparativo.fatAtual, fatComp: comparativo.fatComp, pedidosAtual: comparativo.pedidosAtual, pedidosComp: comparativo.pedidosComp, fonte: comparativo.fonte, nomesEncontrados: comparativo.nomesEncontrados, motivo: `Classe A sem compra no período atual (${Math.round(days)} dias)` },
            });
          }
        }
        const compFat = comparativo.fatComp;
        if (compFat > 0 && c.faturamento < compFat * 0.7) {
          abcAlertas.push({ tipo: "a_queda", mensagem: `${c.nome}: queda de ${((1 - c.faturamento / compFat) * 100).toFixed(0)}% vs período anterior (Classe A)`, classe: "A" });
        }
      }
      if (c.classe === "B" && hasComp) {
        const compFat = lookupComparativo(comparativoCache, c.nome).fatComp;
        if (compFat > 0 && c.faturamento > compFat * 1.5) {
          abcAlertas.push({ tipo: "b_crescendo", mensagem: `${c.nome}: cresceu ${(((c.faturamento / compFat) - 1) * 100).toFixed(0)}% — potencial para Classe A`, classe: "B" });
        }
      }
      if (c.classe === "C" && hasComp) {
        const compFat = lookupComparativo(comparativoCache, c.nome).fatComp;
        if (compFat > 0 && c.faturamento > compFat * 2) {
          abcAlertas.push({ tipo: "c_crescendo", mensagem: `${c.nome}: cresceu ${(((c.faturamento / compFat) - 1) * 100).toFixed(0)}% — oportunidade de desenvolvimento`, classe: "C" });
        }
      }
    });

    // ABC concentração
    const top10Clientes = abcClientes.slice(0, Math.min(10, abcClientes.length));
    const top20Clientes = abcClientes.slice(0, Math.min(20, abcClientes.length));
    const concentracaoTop10 = top10Clientes.length > 0 ? top10Clientes[top10Clientes.length - 1].acumulado : 0;
    const concentracaoTop20 = top20Clientes.length > 0 ? top20Clientes[top20Clientes.length - 1].acumulado : 0;
    const totalClientesAbc = abcClientes.length;
    const clientesA = abcClientes.filter(c => c.classe === "A").length;
    const clientesB = abcClientes.filter(c => c.classe === "B").length;
    const clientesC = abcClientes.filter(c => c.classe === "C").length;

    const abcResumoClientes = (["A", "B", "C"] as const).map(cl => {
      const items = abcClientes.filter(c => c.classe === cl);
      return {
        classe: cl,
        faturamento: items.reduce((s, i) => s + i.faturamento, 0),
        qtd: items.length,
        participacao: items.reduce((s, i) => s + i.participacao, 0),
      };
    });
    const abcResumoProdutos = (["A", "B", "C"] as const).map(cl => {
      const items = abcProdutos.filter(p => p.classe === cl);
      return {
        classe: cl,
        faturamento: items.reduce((s, i) => s + i.faturamento, 0),
        qtd: items.length,
        participacao: items.reduce((s, i) => s + i.participacao, 0),
      };
    });

    return {
      fatAtual, fatComp, hasComp,
      comparisonAudit,
      decomposition,
      auditAtual, auditComp, rawMirrorAudit,
      linhasUsadasNoCalculo: atual,
      clientesCresceram, clientesCairam,
      clienteMovimentos,
      clientesNovos, clientesPerdidos, clientesReativados, clientesRecorrentes,
      clientesNovosDetalhe, clientesReativadosDetalhe, clientesRecorrentesDetalhe, clientesSemRecompraDetalhe,
      reativacaoDiasSemCompra: filters.reativacaoDiasSemCompra ?? 60,
      produtosCresceram, produtosCairam,
      prodMovimentos,
      mixProdutos,
      vendedorResumos,
      vendedoresCresceram,
      vendedoresCairam,
      vendedorScatter,
      alertas: alertas
        // Sanity guard: alertas de cliente com faturamento atual > 0 NUNCA podem dizer "sem compra no período atual"
        .filter(a => {
          if (!a.mensagem.includes("sem compra no período atual")) return true;
          const fa = a.debug?.fatAtual;
          if (typeof fa === "number" && fa > 0) {
            // mantém o registro silencioso no console para auditoria
            // eslint-disable-next-line no-console
            console.warn("[Inteligência] Alerta inconsistente removido:", a);
            return false;
          }
          return true;
        })
        .sort((a, b) => (a.severidade === "alta" ? 0 : a.severidade === "media" ? 1 : 2) - (b.severidade === "alta" ? 0 : b.severidade === "media" ? 1 : 2)),
      diagnostico,
      analiseInteligente,
      projecaoMes, mediaDiariaGeral, diasRestantes, diasDecorridos,
      previsaoVendedores,
      clientePrevisoes: clientePrevisoes.slice(0, 50),
      clientePrevisoesTodas: clientePrevisoes,
      previsaoCarteira,
      clientesInativos,
      clientesDebug,
      chartData, chartVolume,
      abcClientes, abcProdutos, abcAlertas,
      abcPeriodoLabel: `${new Date(abcStartStr + "T00:00:00").toLocaleDateString("pt-BR")} — ${new Date(filters.fim + "T00:00:00").toLocaleDateString("pt-BR")}`,
      abcPeriodoInicio: abcStartStr,
      abcPeriodoFim: filters.fim,
      concentracaoTop10, concentracaoTop20,
      totalClientesAbc, clientesA, clientesB, clientesC,
      abcResumoClientes, abcResumoProdutos,
    };
  }, [allSales, filters]);
}
