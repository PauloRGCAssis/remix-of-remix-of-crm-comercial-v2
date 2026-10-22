/**
 * Cálculo do resultado das Ações Comerciais.
 *
 * REGRA OFICIAL: a planilha importada é a única fonte de verdade.
 * - Faturamento = soma direta de "Preço Venda Total (R$)" (preco_total).
 * - Kg = soma direta da coluna "Quantidade".
 * - Pedidos = COUNT DISTINCT da coluna "Código Venda" (sempre inteiro).
 * - Itens/linhas = número de linhas da planilha no período.
 * - NENHUM ajuste proporcional é aplicado: comparamos meses completos.
 * - O cliente é localizado preferencialmente por CNPJ/CPF; o nome é fallback.
 */

import { promotorasDaDegustacao, type PromotoraItem } from "@/lib/degustacaoPromotoras";
import { calcularCustoDegustacoes, type CustoProdutoIndex } from "@/lib/produtoCusto";

import type { SaleRow } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import type { CommercialAction } from "@/hooks/useCommercialActions";

export interface PeriodoMetrics {
  inicio: string;
  fim: string;
  dias: number;
  /** Quantidade de meses completos agregados (1 = período simples) */
  meses: number;
  faturamento: number;
  kg: number;
  pedidos: number;
  itens: number;
  ticketMedio: number;
  precoMedioKg: number;
}

export interface Comparativo {
  label: string;
  /** Métricas já na escala de comparação (média mensal quando aplicável) */
  base: PeriodoMetrics | null;
  /** true quando os valores exibidos são médias (ex.: média dos últimos 3 meses) */
  media: boolean;
  deltaFaturamento: number;
  deltaKg: number;
  deltaPedidos: number;
  pctFaturamento: number | null;
  pctKg: number | null;
  pctPedidos: number | null;
}

export interface CustoDegustacao {
  id: string;
  data: string;
  loja: string;
  promotora: string | null;
  promotoras: PromotoraItem[];
  produtos: string;
  kg: number;
  custoProdutos: number;
  custoPromotora: number;
  total: number;
  /** Detalhamento por produto (quantidade × custo cadastrado) */
  itens: { nome: string; quantidade: number; custoKg: number | null; total: number }[];
  /** Produtos sem custo cadastrado nesta degustação */
  produtosSemCusto: string[];
}


export interface RoiInfo {
  /** Investimento informado na ação */
  investimento: number;
  /** Bonificação convertida em R$ (valor negociado ou kg × custo médio) */
  bonificacao: number;
  /** Bonificação negociada em kg (quando aplicável) */
  bonificacaoKg: number;
  custoDegustacoes: number;
  custoPromotoras: number;
  outrosCustos: number;
  /** Kg total degustado */
  kgDegustados: number;
  /** Custo médio ponderado por kg degustado */
  custoMedioKg: number | null;
  /** Produtos degustados sem custo cadastrado */
  produtosSemCusto: string[];
  /** true quando algum produto degustado não tem custo cadastrado */
  custoIncompleto: boolean;
  /** Soma de tudo acima */
  custo: number;
  investido: number;
  /** Faturamento no período da ação */
  resultado: number;
  /** Ganho de faturamento vs. a referência */
  retorno: number;
  roi: number | null;
}

export interface InvestimentoReal {
  investimentoDireto: number;
  bonificacao: number;
  bonificacaoKg: number;
  custoDegustacoes: number;
  custoPromotoras: number;
  outrosCustos: number;
  total: number;
  produtosSemCusto: string[];
  custoPendente: boolean;
}


/**
 * Bonificação negociada em PERCENTUAL do volume vendido.
 * Regra: kg bonificados = kg vendidos no período × percentual / 100.
 * NÃO é desconto financeiro sobre o faturamento.
 */
export interface BonificacaoPercentualInfo {
  percentual: number;
  kgVendidos: number;
  /** kg que deveriam ser bonificados pela regra */
  kgPrevisto: number;
  /** custo (R$/kg) usado na conversão */
  custoKg: number | null;
  custoPrevisto: number;
  /** kg efetivamente bonificados (planilha de bonificações), null quando não há base */
  kgConcedido: number | null;
  custoConcedido: number;
  /** concedido − previsto (kg) */
  diferencaKg: number | null;
  /** produtos configurados para a bonificação (vazio = usa o mix vendido) */
  produtos: string[];
  produtosSemCusto: string[];
}

export interface AuditoriaLinha {
  id: number;
  codigo_venda: number;
  data: string;
  cliente: string;
  cnpj_cpf: string | null;
  descricao: string;
  quantidade: number;
  preco_total: number;
}

export interface AcaoResultado {
  durante: PeriodoMetrics;
  comparativos: Comparativo[];
  referencia: Comparativo | null;
  roi: RoiInfo;
  /** Preenchido apenas quando a bonificação da ação é em % */
  bonificacaoPercentual: BonificacaoPercentualInfo | null;
  degustacoes: CustoDegustacao[];
  conclusao: { tom: "positivo" | "neutro" | "negativo"; texto: string };
  serieMensal: { mes: string; faturamento: number; fase: "antes" | "durante" | "depois" }[];
  auditoria: AuditoriaLinha[];
  /** Como o cliente foi localizado na base */
  vinculo: { tipo: "cnpj" | "nome" | "nenhum"; valor: string };
}

const DAY = 86_400_000;

function toDate(d: string) {
  return new Date(`${d}T00:00:00`);
}
function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: string, n: number) {
  return toIso(new Date(toDate(d).getTime() + n * DAY));
}
export function diffDays(inicio: string, fim: string) {
  return Math.max(1, Math.round((toDate(fim).getTime() - toDate(inicio).getTime()) / DAY) + 1);
}

const onlyDigits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/**
 * Vendas do cliente da ação.
 * Prioridade 1: CNPJ/CPF. Prioridade 2: nome normalizado (inclui aliases).
 */
export function salesForCliente(
  sales: SaleRow[],
  cliente: string,
  extraNames: string[] = [],
  cnpj?: string | null,
): { rows: SaleRow[]; vinculo: AcaoResultado["vinculo"] } {
  const doc = onlyDigits(cnpj);
  if (doc.length >= 11) {
    const rows = sales.filter((s) => onlyDigits(s.cnpj_cpf) === doc);
    if (rows.length) return { rows, vinculo: { tipo: "cnpj", valor: doc } };
  }
  const keys = new Set(
    [cliente, ...extraNames].filter(Boolean).map((n) => normalizeClientName(n).toLowerCase()),
  );
  if (keys.size === 0) return { rows: [], vinculo: { tipo: "nenhum", valor: "" } };
  const rows = sales.filter((s) => keys.has(normalizeClientName(s.cliente).toLowerCase()));
  return { rows, vinculo: { tipo: rows.length ? "nome" : "nenhum", valor: cliente } };
}

export function rowsInPeriod(rows: SaleRow[], inicio: string, fim: string): SaleRow[] {
  return rows.filter((r) => {
    const d = String(r.data).slice(0, 10);
    return d >= inicio && d <= fim;
  });
}

export function metricsForPeriod(
  rows: SaleRow[],
  inicio: string,
  fim: string,
  meses = 1,
): PeriodoMetrics {
  const inPeriod = rowsInPeriod(rows, inicio, fim);
  let faturamento = 0;
  let kg = 0;
  const pedidos = new Set<number>();
  for (const r of inPeriod) {
    faturamento += Number(r.preco_total) || 0;
    kg += Number(r.quantidade) || 0;
    pedidos.add(Number(r.codigo_venda));
  }
  const divisor = Math.max(1, meses);
  const fat = faturamento / divisor;
  const quilos = kg / divisor;
  const qtdPedidos = pedidos.size / divisor;
  return {
    inicio,
    fim,
    dias: diffDays(inicio, fim),
    meses: divisor,
    faturamento: fat,
    kg: quilos,
    pedidos: qtdPedidos,
    itens: inPeriod.length / divisor,
    ticketMedio: qtdPedidos > 0 ? fat / qtdPedidos : 0,
    precoMedioKg: quilos > 0 ? fat / quilos : 0,
  };
}

function pct(atual: number, base: number): number | null {
  if (base <= 0) return null;
  return ((atual - base) / base) * 100;
}

function buildComparativo(
  label: string,
  durante: PeriodoMetrics,
  base: PeriodoMetrics | null,
  media = false,
): Comparativo {
  if (!base || base.faturamento <= 0) {
    return {
      label,
      base: null,
      media,
      deltaFaturamento: 0,
      deltaKg: 0,
      deltaPedidos: 0,
      pctFaturamento: null,
      pctKg: null,
      pctPedidos: null,
    };
  }
  return {
    label,
    base,
    media,
    deltaFaturamento: durante.faturamento - base.faturamento,
    deltaKg: durante.kg - base.kg,
    deltaPedidos: durante.pedidos - base.pedidos,
    pctFaturamento: pct(durante.faturamento, base.faturamento),
    pctKg: pct(durante.kg, base.kg),
    pctPedidos: pct(durante.pedidos, base.pedidos),
  };
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

/** Primeiro e último dia de um mês deslocado em `offset` meses a partir de `ref`. */
function monthRange(ref: string, offset: number): { inicio: string; fim: string } {
  const y = Number(ref.slice(0, 4));
  const m = Number(ref.slice(5, 7)) - 1 + offset;
  const inicio = new Date(Date.UTC(y, m, 1));
  const fim = new Date(Date.UTC(y, m + 1, 0));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

function buildSerieMensal(rows: SaleRow[], inicio: string, fim: string) {
  const from = addDays(inicio, -120);
  const to = addDays(fim, 90);
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = String(r.data).slice(0, 10);
    if (d < from || d > to) continue;
    const k = monthKey(d);
    map.set(k, (map.get(k) ?? 0) + (Number(r.preco_total) || 0));
  }
  const mIni = monthKey(inicio);
  const mFim = monthKey(fim);
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, faturamento]) => ({
      mes,
      faturamento,
      fase: (mes < mIni ? "antes" : mes > mFim ? "depois" : "durante") as "antes" | "durante" | "depois",
    }));
}

export interface DegustacaoVinculada {
  id: string;
  cliente: string;
  data: string;
  promotora: string | null;
  /** Lista de promotoras da degustação (fonte oficial do custo de promotoras). */
  promotoras?: PromotoraItem[];
  produtos: { produto_id?: string; nome: string; quantidade: number }[];
}

export type AcaoResultadoInput = Pick<
  CommercialAction,
  | "cliente"
  | "data_inicio"
  | "data_fim"
  | "status"
  | "valor_investimento"
  | "quantidade_bonificada"
  | "bonificacao_unidade"
> &
  Partial<
    Pick<
      CommercialAction,
      "custo_kg_degustacao" | "valor_promotora" | "outros_custos" | "bonificacao_produtos"
    >
  >;

/** Linha da planilha oficial de bonificações (bonificacao_rows). */
export interface BonificacaoConcedidaRow {
  cliente: string;
  cnpj_cpf?: string | null;
  data: string | null;
  produto: string;
  quantidade: number;
  custo: number;
}

interface InvestimentoRealInput {
  action: AcaoResultadoInput;
  durante: PeriodoMetrics;
  rowsCliente: SaleRow[];
  degustacoes: CustoDegustacao[];
  custoProdutos?: CustoProdutoIndex;
  bonificacoesConcedidas?: BonificacaoConcedidaRow[];
  cnpj?: string | null;
  extraNames?: string[];
}

/**
 * Fonte única do investimento real de uma ação.
 * Todo card, relatório e ROI deve consumir este resultado, nunca apenas
 * `valor_investimento`.
 */
export function calcularInvestimentoReal({
  action,
  durante,
  rowsCliente,
  degustacoes,
  custoProdutos,
  bonificacoesConcedidas,
  cnpj,
  extraNames = [],
}: InvestimentoRealInput): InvestimentoReal & { bonificacaoPercentual: BonificacaoPercentualInfo | null } {
  const produtosSemCusto = new Set(degustacoes.flatMap((d) => d.produtosSemCusto));
  const produtosBonificacao = (action.bonificacao_produtos ?? []).filter(Boolean);
  const unidade = action.bonificacao_unidade;
  const valorBonificacao = Number(action.quantidade_bonificada ?? 0) || 0;
  let bonificacaoKg = 0;
  let bonificacao = 0;
  let bonificacaoPercentual: BonificacaoPercentualInfo | null = null;

  const custoMedioBonificacao = (): number | null => {
    if (!custoProdutos) return null;
    if (produtosBonificacao.length > 0) {
      let soma = 0;
      let quantidade = 0;
      for (const produto of produtosBonificacao) {
        const custo = custoProdutos.buscar(produto, action.data_fim).custoKg;
        if (custo == null) produtosSemCusto.add(produto);
        else {
          soma += custo;
          quantidade += 1;
        }
      }
      return quantidade > 0 ? soma / quantidade : null;
    }

    let kgComCusto = 0;
    let custoTotal = 0;
    for (const row of rowsInPeriod(rowsCliente, action.data_inicio, action.data_fim)) {
      const kg = Number(row.quantidade) || 0;
      if (kg <= 0) continue;
      const custo = custoProdutos.buscar(row.descricao, String(row.data).slice(0, 10)).custoKg;
      if (custo == null) {
        produtosSemCusto.add(row.descricao);
        continue;
      }
      kgComCusto += kg;
      custoTotal += kg * custo;
    }
    return kgComCusto > 0 ? custoTotal / kgComCusto : null;
  };

  if (unidade === "R$") {
    bonificacao = valorBonificacao;
  } else {
    const custoKg = custoMedioBonificacao();
    bonificacaoKg = unidade === "%" ? (durante.kg * valorBonificacao) / 100 : valorBonificacao;
    bonificacao = custoKg == null ? 0 : bonificacaoKg * custoKg;

    if (unidade === "%") {
      let kgConcedido: number | null = null;
      let custoConcedido = 0;
      if (bonificacoesConcedidas?.length) {
        const doc = onlyDigits(cnpj);
        const nomes = new Set(
          [action.cliente, ...extraNames]
            .filter(Boolean)
            .map((nome) => normalizeClientName(nome).toLowerCase()),
        );
        let kg = 0;
        for (const row of bonificacoesConcedidas) {
          const data = String(row.data ?? "").slice(0, 10);
          if (!data || data < action.data_inicio || data > action.data_fim) continue;
          const mesmoDoc = doc.length >= 11 && onlyDigits(row.cnpj_cpf) === doc;
          const mesmoNome = nomes.has(normalizeClientName(row.cliente).toLowerCase());
          if (!mesmoDoc && !mesmoNome) continue;
          kg += Number(row.quantidade) || 0;
          custoConcedido += Number(row.custo) || 0;
        }
        kgConcedido = kg;
      }
      if (custoConcedido > 0) bonificacao = custoConcedido;
      bonificacaoPercentual = {
        percentual: valorBonificacao,
        kgVendidos: durante.kg,
        kgPrevisto: bonificacaoKg,
        custoKg,
        custoPrevisto: custoKg == null ? 0 : bonificacaoKg * custoKg,
        kgConcedido,
        custoConcedido,
        diferencaKg: kgConcedido == null ? null : kgConcedido - bonificacaoKg,
        produtos: produtosBonificacao,
        produtosSemCusto: [...produtosSemCusto],
      };
      bonificacaoKg = kgConcedido ?? bonificacaoKg;
    }
  }

  const custoDegustacoes = degustacoes.reduce((s, d) => s + d.custoProdutos, 0);
  const custoPromotoras = degustacoes.reduce((s, d) => s + d.custoPromotora, 0);
  const investimentoDireto = Number(action.valor_investimento) || 0;
  const outrosCustos = Number(action.outros_custos ?? 0) || 0;
  const total = investimentoDireto + bonificacao + custoDegustacoes + custoPromotoras + outrosCustos;

  return {
    investimentoDireto,
    bonificacao,
    bonificacaoKg,
    custoDegustacoes,
    custoPromotoras,
    outrosCustos,
    total,
    produtosSemCusto: [...produtosSemCusto],
    custoPendente: produtosSemCusto.size > 0,
    bonificacaoPercentual,
  };
}

export function computeAcaoResultado(
  action: AcaoResultadoInput,
  sales: SaleRow[],
  options: {
    extraNames?: string[];
    cnpj?: string | null;
    degustacoes?: DegustacaoVinculada[];
    /** Índice de custo por produto (R$/kg) — fonte da verdade do custo degustado */
    custoProdutos?: CustoProdutoIndex;
    /** Bonificações efetivamente concedidas (planilha oficial) */
    bonificacoesConcedidas?: BonificacaoConcedidaRow[];
  } = {},
): AcaoResultado {

  const { rows, vinculo } = salesForCliente(
    sales,
    action.cliente,
    options.extraNames ?? [],
    options.cnpj,
  );
  const durante = metricsForPeriod(rows, action.data_inicio, action.data_fim);

  // Comparativos em MESES COMPLETOS anteriores ao mês de início da ação.
  const mesRef = action.data_inicio;
  const mesAnterior = monthRange(mesRef, -1);
  const ultimoMes = metricsForPeriod(rows, mesAnterior.inicio, mesAnterior.fim);
  const tres = { inicio: monthRange(mesRef, -3).inicio, fim: monthRange(mesRef, -1).fim };
  const media3 = metricsForPeriod(rows, tres.inicio, tres.fim, 3);

  const anoAnteriorIni = `${Number(action.data_inicio.slice(0, 4)) - 1}${action.data_inicio.slice(4)}`;
  const anoAnteriorFim = `${Number(action.data_fim.slice(0, 4)) - 1}${action.data_fim.slice(4)}`;
  const anoAnterior = metricsForPeriod(rows, anoAnteriorIni, anoAnteriorFim);

  const comparativos: Comparativo[] = [
    buildComparativo("Último mês", durante, ultimoMes),
    buildComparativo("Média dos últimos 3 meses", durante, media3, true),
    buildComparativo("Mesmo período do ano anterior", durante, anoAnterior),
  ];

  const referencia = comparativos[1].base ? comparativos[1] : comparativos[0].base ? comparativos[0] : null;

  // Custos das degustações vinculadas — Σ (quantidade × custo cadastrado do produto)
  const valorPromotora = Number(action.valor_promotora ?? 100) || 0;
  const custoIndex = options.custoProdutos;
  const resumoCusto = custoIndex
    ? calcularCustoDegustacoes(
        (options.degustacoes ?? []).map((d) => ({ id: d.id, data: d.data, produtos: d.produtos ?? [] })),
        custoIndex,
      )
    : null;

  const degustacoes: CustoDegustacao[] = (options.degustacoes ?? []).map((d) => {
    const detalhe = resumoCusto?.porDegustacao.get(d.id);
    const kg = detalhe?.kg ?? (d.produtos ?? []).reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
    const custoProdutos = detalhe?.custoProdutos ?? 0;
    // Promotoras vêm da degustação (uma linha por promotora). O campo
    // `valor_promotora` da ação é apenas fallback para registros antigos.
    const promotoras = promotorasDaDegustacao(d, valorPromotora);
    const custoPromotora = promotoras.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    return {
      id: d.id,
      data: d.data,
      loja: d.cliente,
      promotora: promotoras.map((p) => p.nome).filter(Boolean).join(", ") || d.promotora,
      promotoras,
      produtos: (d.produtos ?? []).map((p) => `${p.nome} (${p.quantidade})`).join(", "),
      kg,
      custoProdutos,
      custoPromotora,
      total: custoProdutos + custoPromotora,
      itens: (detalhe?.itens ?? []).map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        custoKg: i.custoKg,
        total: i.total,
      })),
      produtosSemCusto: detalhe?.produtosSemCusto ?? [],
    };
  });

  const custoDegustacoes = degustacoes.reduce((s, d) => s + d.custoProdutos, 0);
  const custoPromotoras = degustacoes.reduce((s, d) => s + d.custoPromotora, 0);
  const kgDegustados = degustacoes.reduce((s, d) => s + d.kg, 0);
  const custoMedioKg = kgDegustados > 0 ? custoDegustacoes / kgDegustados : null;
  const produtosSemCusto = resumoCusto?.produtosSemCusto ?? [];

  const investimentoReal = calcularInvestimentoReal({
    action,
    durante,
    rowsCliente: rows,
    degustacoes,
    custoProdutos: custoIndex,
    bonificacoesConcedidas: options.bonificacoesConcedidas,
    cnpj: options.cnpj,
    extraNames: options.extraNames,
  });
  const {
    investimentoDireto: investimento,
    bonificacao,
    bonificacaoKg,
    outrosCustos,
    total: custo,
    bonificacaoPercentual,
  } = investimentoReal;


  const retorno = referencia ? referencia.deltaFaturamento : durante.faturamento;
  const roi = custo > 0 ? ((retorno - custo) / custo) * 100 : null;

  const pctF = referencia?.pctFaturamento ?? null;
  const pctK = referencia?.pctKg ?? null;
  const pctP = referencia?.pctPedidos ?? null;

  let tom: "positivo" | "neutro" | "negativo" = "neutro";
  if (pctF != null) tom = pctF >= 5 ? "positivo" : pctF <= -5 ? "negativo" : "neutro";

  const p = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
  const refLabel = referencia ? referencia.label.toLowerCase() : "período anterior";
  const texto = referencia
    ? `A ação apresentou resultado ${tom.toUpperCase()}. Durante o período houve variação de ${p(pctF)} no faturamento, ${p(pctK)} no volume vendido e ${p(pctP)} no número de pedidos em comparação com a ${refLabel}.`
    : "Ainda não há histórico de compras suficiente deste cliente para comparar o resultado da ação.";

  const auditoria: AuditoriaLinha[] = rowsInPeriod(rows, action.data_inicio, action.data_fim)
    .map((r) => ({
      id: r.id,
      codigo_venda: Number(r.codigo_venda),
      data: String(r.data).slice(0, 10),
      cliente: r.cliente,
      cnpj_cpf: r.cnpj_cpf,
      descricao: r.descricao,
      quantidade: Number(r.quantidade) || 0,
      preco_total: Number(r.preco_total) || 0,
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.codigo_venda - b.codigo_venda);

  return {
    durante,
    comparativos,
    referencia,
    roi: {
      investimento,
      bonificacao,
      bonificacaoKg,
      kgDegustados,
      custoMedioKg,
      produtosSemCusto: investimentoReal.produtosSemCusto,
      custoIncompleto: investimentoReal.custoPendente,
      custoDegustacoes: investimentoReal.custoDegustacoes,
      custoPromotoras: investimentoReal.custoPromotoras,
      outrosCustos,
      custo,
      investido: custo,
      resultado: durante.faturamento,
      retorno,
      roi,
    },
    bonificacaoPercentual,
    degustacoes,
    conclusao: { tom, texto },
    serieMensal: buildSerieMensal(rows, action.data_inicio, action.data_fim),
    auditoria,
    vinculo,
  };
}
