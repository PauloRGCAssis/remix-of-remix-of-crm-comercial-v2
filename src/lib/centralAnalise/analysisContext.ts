/**
 * Central de Análise — CAMADA DE DADOS PARA A IA (analysisContext).
 *
 * Tudo aqui é determinístico: números, deltas, percentuais, rankings, migração
 * e consolidação de grupos econômicos são calculados em código, nunca pela IA.
 * A IA recebe apenas este resumo estruturado (não a base bruta) e escreve a narrativa.
 */

import { SaleRow, filterByDateRange, shortVendedorName, cleanProductName } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import {
  ComparisonResolved,
  Periodo,
  mesLabel,
  rotuloColunaReferencia,
} from "./comparisonModes";
import { detectarGruposEconomicos, type GrupoEconomico } from "./economicGroups";
import {
  chaveProduto,
  codigoProduto,
  ehRecheado,
  familiaProduto,
  getMigracoesProdutos,
  getProdutosDescontinuados,
  nomeCompletoProduto,
  type MigracaoProdutos,
} from "./productCatalog";

// ------------------------------------------------------------------ helpers

const MS_DIA = 86400000;

function parseISO(s: string): number {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
function diffDias(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / MS_DIA) + 1;
}
function round(v: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((Number.isFinite(v) ? v : 0) * f) / f;
}
function pctVar(a: number, b: number): number | null {
  if (!b) return null;
  return round(((a - b) / Math.abs(b)) * 100, 1);
}
function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export interface Metricas {
  faturamento: number;
  kg: number;
  pedidos: number;
  clientes: number;
  ticketMedio: number;
  precoMedioKg: number;
  linhas: number;
}

function metricas(rows: SaleRow[]): Metricas {
  let fat = 0;
  let kg = 0;
  const pedidos = new Set<string>();
  const clientes = new Set<string>();
  for (const r of rows) {
    fat += Number(r.preco_total ?? 0);
    kg += Number(r.quantidade ?? 0);
    pedidos.add(String(r.codigo_venda));
    clientes.add(normalizeClientName(r.cliente));
  }
  return {
    faturamento: round(fat),
    kg: round(kg),
    pedidos: pedidos.size,
    clientes: clientes.size,
    ticketMedio: pedidos.size ? round(fat / pedidos.size) : 0,
    precoMedioKg: kg ? round(fat / kg) : 0,
    linhas: rows.length,
  };
}

function agrupar(rows: SaleRow[], keyFn: (r: SaleRow) => string): Map<string, SaleRow[]> {
  const map = new Map<string, SaleRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export interface LinhaComparada {
  chave: string;
  nome: string;
  codigo?: string;
  familia?: string;
  vendedor?: string;
  fatA: number;
  fatB: number;
  deltaFat: number;
  deltaFatPct: number | null;
  kgA: number;
  kgB: number;
  deltaKg: number;
  deltaKgPct: number | null;
  pedidosA: number;
  pedidosB: number;
  clientesA: number;
  clientesB: number;
  ticketA: number;
  ticketB: number;
}

function comparar(
  gA: Map<string, SaleRow[]>,
  gB: Map<string, SaleRow[]>,
  nome: (chave: string, rows: SaleRow[]) => string,
  extra?: (chave: string, rows: SaleRow[]) => Partial<LinhaComparada>,
): LinhaComparada[] {
  const chaves = new Set([...gA.keys(), ...gB.keys()]);
  const vazio = metricas([]);
  return Array.from(chaves).map((chave) => {
    const rowsA = gA.get(chave) ?? [];
    const rowsB = gB.get(chave) ?? [];
    const a = rowsA.length ? metricas(rowsA) : vazio;
    const b = rowsB.length ? metricas(rowsB) : vazio;
    const ref = rowsA.length ? rowsA : rowsB;
    return {
      chave,
      nome: nome(chave, ref),
      fatA: a.faturamento,
      fatB: b.faturamento,
      deltaFat: round(a.faturamento - b.faturamento),
      deltaFatPct: pctVar(a.faturamento, b.faturamento),
      kgA: a.kg,
      kgB: b.kg,
      deltaKg: round(a.kg - b.kg),
      deltaKgPct: pctVar(a.kg, b.kg),
      pedidosA: a.pedidos,
      pedidosB: b.pedidos,
      clientesA: a.clientes,
      clientesB: b.clientes,
      ticketA: a.ticketMedio,
      ticketB: b.ticketMedio,
      ...(extra ? extra(chave, ref) : {}),
    };
  });
}

// ------------------------------------------------------------------ tipos do contexto

export interface ClienteAnalisado extends LinhaComparada {
  grupo: string | null;
  primeiraCompraHistorica: string | null;
  ultimaCompra: string | null;
  diasSemCompra: number | null;
  status: "novo" | "recuperado" | "perdido" | "reducao_forte" | "queda" | "crescimento" | "estavel";
}

export interface ProdutoAnalisado extends LinhaComparada {
  descontinuado: boolean;
  recheado: boolean;
  clientesQueExplicam: {
    quedas: { cliente: string; grupo: string | null; kgA: number; kgB: number; deltaKg: number; deltaFat: number; parou: boolean }[];
    altas: { cliente: string; grupo: string | null; kgA: number; kgB: number; deltaKg: number; deltaFat: number; novoNoProduto: boolean }[];
  };
}

export interface MigracaoResultado {
  id: string;
  nome: string;
  produtosOrigem: { codigo: string; nome: string }[];
  produtosSubstitutos: { codigo: string; nome: string }[];
  antes: { periodo: Periodo; rotulo: string; clientesPorProduto: { codigo: string; nome: string; clientes: number }[]; clientesUnicos: number; kg: number; faturamento: number; kgMedioPorCliente: number; faturamentoMedioPorCliente: number };
  depois: { periodo: Periodo; rotulo: string; clientesPorProduto: { codigo: string; nome: string; clientes: number }[]; clientesUnicos: number; kg: number; faturamento: number; kgMedioPorCliente: number; faturamentoMedioPorCliente: number };
  migracaoDireta: { cliente: string; grupo: string | null; kgAntes: number; kgDepois: number; faturamentoAntes: number; faturamentoDepois: number }[];
  naoConvertidos: { cliente: string; grupo: string | null; kgAntes: number; faturamentoAntes: number; comprouOutrosProdutos: boolean }[];
  jaCompravamSubstitutos: { cliente: string; grupo: string | null; kgAntes: number; kgDepois: number }[];
  expansao: { cliente: string; grupo: string | null; kgDepois: number; faturamentoDepois: number }[];
  taxaMigracaoPct: number | null;
  volumePerdidoOrigemKg: number;
  volumeGanhoSubstitutosKg: number;
  faturamentoPerdidoOrigem: number;
  faturamentoGanhoSubstitutos: number;
  percentualRecuperacaoVolume: number | null;
  percentualRecuperacaoFaturamento: number | null;
  variacaoBaseCompradora: number;
  clientesDisponiveisParaConversao: number;
}

export interface AnalysisContext {
  versao: string;
  geradoEm: string;
  fonte: string;
  comparacao: {
    modo: string;
    modoLabel: string;
    descricao: string;
    referenciaTexto: string;
    rotuloA: string;
    rotuloB: string | null;
    periodoA: Periodo;
    periodoB: Periodo | null;
    diasA: number;
    diasB: number | null;
    rotuloColunaReferencia: string;
    regraApresentacao: string;
  };
  filtro: {
    carteira: string | null;
    equipe: string[];
    vendedores: string[];
    clientes: string[];
    produtos: string[];
    grupos: string[];
    descricao: string;
  };
  empresa: {
    A: Metricas;
    B: Metricas | null;
    deltas: Record<string, number | null> | null;
    diferencaFaturamento: number | null;
    diferencaKg: number | null;
    clientesAtivosA: number;
    clientesNovos: number;
    clientesPerdidos: number;
    clientesRecuperados: number;
    leituraVolumePrecoMix: {
      efeitoVolume: number | null;
      efeitoPreco: number | null;
      precoMedioKgA: number;
      precoMedioKgB: number | null;
      comentario: string;
    };
  };
  evolucao: {
    mensal: { mes: string; rotulo: string; faturamento: number; kg: number; pedidos: number; clientes: number; variacaoPctVsMesAnterior: number | null }[];
    primeiraMetade: { periodo: Periodo; faturamento: number; kg: number } | null;
    segundaMetade: { periodo: Periodo; faturamento: number; kg: number } | null;
    tendencia: string | null;
  };
  produtos: {
    total: number;
    maioresQuedas: ProdutoAnalisado[];
    maioresCrescimentos: ProdutoAnalisado[];
    todos: LinhaComparada[];
  };
  familias: LinhaComparada[];
  recheados: {
    descontinuados: LinhaComparada[];
    ativos: LinhaComparada[];
    familiaConsolidada: LinhaComparada | null;
  };
  clientes: {
    resumo: { ativosA: number; ativosB: number; novos: number; perdidos: number; recuperados: number; comReducaoForte: number; cresceram: number; cairam: number };
    maioresQuedas: ClienteAnalisado[];
    maioresCrescimentos: ClienteAnalisado[];
    perdidos: ClienteAnalisado[];
    novos: ClienteAnalisado[];
    recuperados: ClienteAnalisado[];
    reducaoForte: ClienteAnalisado[];
  };
  grupos: {
    consolidados: (LinhaComparada & {
      unidades: (LinhaComparada & { ativaA: boolean; ativaB: boolean })[];
      unidadesAtivasA: number;
      unidadesAtivasB: number;
    })[];
  };
  vendedores: LinhaComparada[];
  equipe: { nome: string; membros: LinhaComparada[]; consolidado: LinhaComparada | null } | null;
  migracao: MigracaoResultado[];
  alertas: string[];
}

export interface AnalysisContextInput {
  comparacao: ComparisonResolved;
  /** compatibilidade: um único vendedor ("__todos__" = empresa inteira) */
  carteira?: string | null;
  /** multisseleção de vendedores (nomes curtos). Vazio = empresa inteira. */
  vendedores?: string[];
  /** multisseleção de clientes (chaves normalizadas). Vazio = todos. */
  clientes?: string[];
  /** multisseleção de produtos (chave = código ou nome limpo). Vazio = todos. */
  produtos?: string[];
  /** multisseleção de grupos econômicos (grupoKey). Vazio = todos. */
  grupos?: string[];
  equipe?: string[];
  equipeNome?: string;
  /** identificador da versão dos dados importados (invalida cache) */
  versaoDados: string;
}

// ------------------------------------------------------------------ cache

const cache = new Map<string, AnalysisContext>();

const ord = (l?: string[]) => (l ?? []).slice().sort();

function cacheKey(input: AnalysisContextInput): string {
  const c = input.comparacao;
  return JSON.stringify({
    v: input.versaoDados,
    m: c.modo,
    a: c.periodoA,
    b: c.periodoB,
    carteira: input.carteira ?? null,
    vend: ord(input.vendedores),
    cli: ord(input.clientes),
    prod: ord(input.produtos),
    grp: ord(input.grupos),
    equipe: ord(input.equipe),
  });
}

export function invalidarCacheAnalise() {
  cache.clear();
}

export function versaoDosDados(sales: SaleRow[]): string {
  let max = "";
  for (const r of sales) {
    const d = String(r.data ?? "").slice(0, 10);
    if (d > max) max = d;
  }
  return `${sales.length}|${max}`;
}

export type ProgressoEtapa =
  | "Calculando indicadores"
  | "Analisando produtos"
  | "Analisando clientes"
  | "Analisando grupos econômicos"
  | "Analisando vendedores"
  | "Analisando migração"
  | "Montando apresentação";

// ------------------------------------------------------------------ build

export async function buildAnalysisContext(
  salesAll: SaleRow[],
  input: AnalysisContextInput,
  onProgress?: (etapa: ProgressoEtapa) => void,
): Promise<AnalysisContext> {
  const chave = cacheKey(input);
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  const cmp = input.comparacao;
  const alertas: string[] = [];
  const carteiraUnica = input.carteira && input.carteira !== "__todos__" ? shortVendedorName(input.carteira) : null;
  const vendedoresSel = new Set(
    [...(input.vendedores ?? []), ...(carteiraUnica ? [carteiraUnica] : [])]
      .map(shortVendedorName)
      .filter(Boolean),
  );
  const carteira = vendedoresSel.size ? Array.from(vendedoresSel).join(" + ") : null;
  const clientesSel = new Set((input.clientes ?? []).map((c) => normalizeClientName(c)).filter(Boolean));
  const produtosSel = new Set((input.produtos ?? []).filter(Boolean));
  const gruposSel = new Set((input.grupos ?? []).filter(Boolean));
  const equipeNomes = (input.equipe ?? []).map(shortVendedorName).filter(Boolean);

  onProgress?.("Calculando indicadores");
  await yieldToUI();

  const mapaGrupoFiltro = gruposSel.size
    ? detectarGruposEconomicos(salesAll.map((r) => String(r.cliente ?? ""))).clienteParaGrupo
    : null;

  const precisaFiltro = vendedoresSel.size || clientesSel.size || produtosSel.size || gruposSel.size;
  const base = !precisaFiltro
    ? salesAll
    : salesAll.filter((r) => {
        if (vendedoresSel.size && !vendedoresSel.has(shortVendedorName(r.vendedor))) return false;
        if (produtosSel.size && !produtosSel.has(chaveProduto(r.descricao))) return false;
        if (clientesSel.size || gruposSel.size) {
          const key = normalizeClientName(r.cliente);
          const noCliente = clientesSel.has(key);
          const noGrupo = gruposSel.size ? gruposSel.has(mapaGrupoFiltro?.get(key) ?? "") : false;
          if (!noCliente && !noGrupo) return false;
        }
        return true;
      });
  const rowsA = filterByDateRange(base, cmp.periodoA.inicio, cmp.periodoA.fim);
  const rowsB = cmp.periodoB ? filterByDateRange(base, cmp.periodoB.inicio, cmp.periodoB.fim) : [];

  const mA = metricas(rowsA);
  const mB = cmp.periodoB ? metricas(rowsB) : null;

  if (!rowsA.length) alertas.push(`Não há vendas no período ${cmp.periodoA.rotulo}.`);
  if (cmp.periodoB && !rowsB.length) alertas.push(`Não há vendas no período de referência ${cmp.periodoB.rotulo} — variações percentuais não são calculáveis.`);
  const semVendedor = rowsA.filter((r) => !String(r.vendedor ?? "").trim()).length;
  if (semVendedor) alertas.push(`${semVendedor} linha(s) do período ${cmp.periodoA.rotulo} sem vendedor informado.`);

  const diasA = Math.max(1, diffDias(cmp.periodoA.inicio, cmp.periodoA.fim));
  const diasB = cmp.periodoB ? Math.max(1, diffDias(cmp.periodoB.inicio, cmp.periodoB.fim)) : null;
  if (diasB && Math.abs(diasA - diasB) > 2) {
    alertas.push(
      `Os períodos têm tamanhos diferentes: ${cmp.periodoA.rotulo} tem ${diasA} dias e ${cmp.periodoB.rotulo} tem ${diasB} dias. Considere médias diárias ao comparar.`,
    );
  }

  const deltas = mB
    ? {
        faturamento: pctVar(mA.faturamento, mB.faturamento),
        kg: pctVar(mA.kg, mB.kg),
        pedidos: pctVar(mA.pedidos, mB.pedidos),
        clientes: pctVar(mA.clientes, mB.clientes),
        ticketMedio: pctVar(mA.ticketMedio, mB.ticketMedio),
        precoMedioKg: pctVar(mA.precoMedioKg, mB.precoMedioKg),
      }
    : null;

  // efeito volume x preço (decomposição simples e determinística)
  const efeitoVolume = mB ? round((mA.kg - mB.kg) * mB.precoMedioKg) : null;
  const efeitoPreco = mB ? round((mA.precoMedioKg - mB.precoMedioKg) * mA.kg) : null;

  // ---------------------------------------------------------------- evolução
  const serieMap = agrupar(rowsA, (r) => String(r.data ?? "").slice(0, 7));
  const mensal = Array.from(serieMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, lista]) => {
      const m = metricas(lista);
      return { mes, rotulo: mesLabel(mes), faturamento: m.faturamento, kg: m.kg, pedidos: m.pedidos, clientes: m.clientes, variacaoPctVsMesAnterior: null as number | null };
    });
  for (let i = 1; i < mensal.length; i++) {
    mensal[i].variacaoPctVsMesAnterior = pctVar(mensal[i].faturamento, mensal[i - 1].faturamento);
  }
  const meioMs = (parseISO(cmp.periodoA.inicio) + parseISO(cmp.periodoA.fim)) / 2;
  const meioISO = new Date(meioMs).toISOString().slice(0, 10);
  const primeiraMetadeRows = filterByDateRange(rowsA, cmp.periodoA.inicio, meioISO);
  const segundaMetadeRows = filterByDateRange(rowsA, new Date(parseISO(meioISO) + MS_DIA).toISOString().slice(0, 10), cmp.periodoA.fim);
  const m1 = metricas(primeiraMetadeRows);
  const m2 = metricas(segundaMetadeRows);
  const tendPct = pctVar(m2.faturamento, m1.faturamento);
  const evolucao = {
    mensal,
    primeiraMetade: { periodo: { inicio: cmp.periodoA.inicio, fim: meioISO }, faturamento: m1.faturamento, kg: m1.kg },
    segundaMetade: { periodo: { inicio: new Date(parseISO(meioISO) + MS_DIA).toISOString().slice(0, 10), fim: cmp.periodoA.fim }, faturamento: m2.faturamento, kg: m2.kg },
    tendencia:
      tendPct === null
        ? null
        : `2ª metade de ${cmp.periodoA.rotulo} ${tendPct >= 0 ? "acelerou" : "desacelerou"} ${Math.abs(tendPct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% versus a 1ª metade do mesmo período`,
  };

  // ---------------------------------------------------------------- grupos econômicos
  onProgress?.("Analisando grupos econômicos");
  await yieldToUI();
  const nomesClientes = new Set<string>();
  const nomeExibicao = new Map<string, string>();
  for (const r of [...rowsA, ...rowsB]) {
    const bruto = String(r.cliente ?? "").trim();
    if (!bruto) continue;
    nomesClientes.add(bruto);
    const k = normalizeClientName(bruto);
    if (!nomeExibicao.has(k)) nomeExibicao.set(k, bruto);
  }
  const { clienteParaGrupo, grupos } = detectarGruposEconomicos(nomesClientes);
  const grupoDoCliente = (clienteKey: string) => clienteParaGrupo.get(clienteKey) ?? null;
  const nomeGrupo = (grupoKey: string | null) => (grupoKey ? grupos.get(grupoKey)?.nome ?? null : null);

  // ---------------------------------------------------------------- produtos
  onProgress?.("Analisando produtos");
  await yieldToUI();
  const descontinuados = new Set(getProdutosDescontinuados());

  const prodA = agrupar(rowsA, (r) => chaveProduto(r.descricao));
  const prodB = agrupar(rowsB, (r) => chaveProduto(r.descricao));
  const produtosTodos = comparar(prodA, prodB, (_k, rows) => nomeCompletoProduto(rows[0]?.descricao), (_k, rows) => ({
    codigo: codigoProduto(rows[0]?.descricao),
    familia: familiaProduto(rows[0]?.descricao),
  })).sort((a, b) => b.fatA - a.fatA);

  const investigarProduto = (linha: LinhaComparada): ProdutoAnalisado => {
    const rA = prodA.get(linha.chave) ?? [];
    const rB = prodB.get(linha.chave) ?? [];
    const cliA = agrupar(rA, (r) => normalizeClientName(r.cliente));
    const cliB = agrupar(rB, (r) => normalizeClientName(r.cliente));
    const comp = comparar(cliA, cliB, (k) => nomeExibicao.get(k) ?? k);
    return {
      ...linha,
      descontinuado: !!linha.codigo && descontinuados.has(linha.codigo),
      recheado: ehRecheado(linha.nome),
      clientesQueExplicam: {
        quedas: comp
          .filter((c) => c.deltaKg < 0)
          .sort((a, b) => a.deltaKg - b.deltaKg)
          .slice(0, 10)
          .map((c) => ({
            cliente: c.nome,
            grupo: nomeGrupo(grupoDoCliente(c.chave)),
            kgA: c.kgA,
            kgB: c.kgB,
            deltaKg: c.deltaKg,
            deltaFat: c.deltaFat,
            parou: c.kgA === 0,
          })),
        altas: comp
          .filter((c) => c.deltaKg > 0)
          .sort((a, b) => b.deltaKg - a.deltaKg)
          .slice(0, 10)
          .map((c) => ({
            cliente: c.nome,
            grupo: nomeGrupo(grupoDoCliente(c.chave)),
            kgA: c.kgA,
            kgB: c.kgB,
            deltaKg: c.deltaKg,
            deltaFat: c.deltaFat,
            novoNoProduto: c.kgB === 0,
          })),
      },
    };
  };

  const maioresQuedas = produtosTodos
    .filter((p) => p.deltaKg < 0)
    .sort((a, b) => a.deltaKg - b.deltaKg)
    .slice(0, 10)
    .map(investigarProduto);
  const maioresCrescimentos = produtosTodos
    .filter((p) => p.deltaKg > 0)
    .sort((a, b) => b.deltaKg - a.deltaKg)
    .slice(0, 10)
    .map(investigarProduto);

  const famA = agrupar(rowsA, (r) => familiaProduto(r.descricao));
  const famB = agrupar(rowsB, (r) => familiaProduto(r.descricao));
  const familias = comparar(famA, famB, (k) => k).sort((a, b) => b.fatA - a.fatA);

  const recheadosTodos = produtosTodos.filter((p) => ehRecheado(p.nome));
  const familiaLanches = familias.find((f) => f.nome === "Lanches Recheados") ?? null;
  const recheados = {
    descontinuados: recheadosTodos.filter((p) => p.codigo && descontinuados.has(p.codigo)),
    ativos: recheadosTodos.filter((p) => !p.codigo || !descontinuados.has(p.codigo)).slice(0, 25),
    familiaConsolidada: familiaLanches,
  };

  // ---------------------------------------------------------------- clientes
  onProgress?.("Analisando clientes");
  await yieldToUI();
  const historico = new Map<string, { primeira: string; ultima: string }>();
  for (const r of base) {
    const k = normalizeClientName(r.cliente);
    const d = String(r.data ?? "").slice(0, 10);
    const cur = historico.get(k);
    if (!cur) historico.set(k, { primeira: d, ultima: d });
    else {
      if (d < cur.primeira) cur.primeira = d;
      if (d > cur.ultima) cur.ultima = d;
    }
  }
  const historicoAntesDeA = new Map<string, string>();
  for (const r of base) {
    const d = String(r.data ?? "").slice(0, 10);
    if (d >= cmp.periodoA.inicio) continue;
    const k = normalizeClientName(r.cliente);
    const cur = historicoAntesDeA.get(k);
    if (!cur || d > cur) historicoAntesDeA.set(k, d);
  }

  const cliA = agrupar(rowsA, (r) => normalizeClientName(r.cliente));
  const cliB = agrupar(rowsB, (r) => normalizeClientName(r.cliente));
  const clientesComparados: ClienteAnalisado[] = comparar(cliA, cliB, (k) => nomeExibicao.get(k) ?? k).map((c) => {
    const h = historico.get(c.chave);
    const ultimaAntes = historicoAntesDeA.get(c.chave) ?? null;
    const diasSemCompra = h ? diffDias(h.ultima, cmp.periodoA.fim) - 1 : null;
    let status: ClienteAnalisado["status"] = "estavel";
    if (c.fatA > 0 && h && h.primeira >= cmp.periodoA.inicio) status = "novo";
    else if (c.fatA > 0 && c.fatB === 0 && ultimaAntes && diffDias(ultimaAntes, cmp.periodoA.inicio) - 1 >= 60) status = "recuperado";
    else if (c.fatA === 0 && c.fatB > 0) status = "perdido";
    else if (c.deltaFatPct !== null && c.deltaFatPct <= -30) status = "reducao_forte";
    else if (c.deltaFat < 0) status = "queda";
    else if (c.deltaFat > 0) status = "crescimento";
    return {
      ...c,
      grupo: nomeGrupo(grupoDoCliente(c.chave)),
      primeiraCompraHistorica: h?.primeira ?? null,
      ultimaCompra: h?.ultima ?? null,
      diasSemCompra,
      status,
    };
  });

  const clientes = {
    resumo: {
      ativosA: clientesComparados.filter((c) => c.fatA > 0).length,
      ativosB: clientesComparados.filter((c) => c.fatB > 0).length,
      novos: clientesComparados.filter((c) => c.status === "novo").length,
      perdidos: clientesComparados.filter((c) => c.status === "perdido").length,
      recuperados: clientesComparados.filter((c) => c.status === "recuperado").length,
      comReducaoForte: clientesComparados.filter((c) => c.status === "reducao_forte").length,
      cresceram: clientesComparados.filter((c) => c.deltaFat > 0).length,
      cairam: clientesComparados.filter((c) => c.deltaFat < 0).length,
    },
    maioresQuedas: clientesComparados.filter((c) => c.deltaFat < 0).sort((a, b) => a.deltaFat - b.deltaFat).slice(0, 25),
    maioresCrescimentos: clientesComparados.filter((c) => c.deltaFat > 0).sort((a, b) => b.deltaFat - a.deltaFat).slice(0, 25),
    perdidos: clientesComparados.filter((c) => c.status === "perdido").sort((a, b) => b.fatB - a.fatB).slice(0, 25),
    novos: clientesComparados.filter((c) => c.status === "novo").sort((a, b) => b.fatA - a.fatA).slice(0, 25),
    recuperados: clientesComparados.filter((c) => c.status === "recuperado").sort((a, b) => b.fatA - a.fatA).slice(0, 25),
    reducaoForte: clientesComparados.filter((c) => c.status === "reducao_forte").sort((a, b) => a.deltaFat - b.deltaFat).slice(0, 25),
  };

  // grupos consolidados
  const grupoKeyDe = (r: SaleRow) => grupoDoCliente(normalizeClientName(r.cliente)) ?? "";
  const grpA = agrupar(rowsA, grupoKeyDe);
  const grpB = agrupar(rowsB, grupoKeyDe);
  const gruposConsolidados = comparar(grpA, grpB, (k) => grupos.get(k)?.nome ?? k)
    .map((g) => {
      const grupo: GrupoEconomico | undefined = grupos.get(g.chave);
      const unidadeKeys = new Set((grupo?.unidades ?? []).map((u) => u.clienteKey));
      const unidades = clientesComparados
        .filter((c) => unidadeKeys.has(c.chave))
        .map((c) => ({ ...c, ativaA: c.fatA > 0, ativaB: c.fatB > 0 }))
        .sort((a, b) => b.fatA - a.fatA);
      return {
        ...g,
        unidades,
        unidadesAtivasA: unidades.filter((u) => u.ativaA).length,
        unidadesAtivasB: unidades.filter((u) => u.ativaB).length,
      };
    })
    .sort((a, b) => b.fatA - a.fatA);

  // ---------------------------------------------------------------- vendedores / equipe
  onProgress?.("Analisando vendedores");
  await yieldToUI();
  const vendA = agrupar(rowsA, (r) => shortVendedorName(r.vendedor));
  const vendB = agrupar(rowsB, (r) => shortVendedorName(r.vendedor));
  const vendedores = comparar(vendA, vendB, (k) => k).sort((a, b) => b.fatA - a.fatA);

  const equipe = equipeNomes.length
    ? (() => {
        const membros = vendedores.filter((v) => equipeNomes.includes(v.nome));
        const rowsEqA = rowsA.filter((r) => equipeNomes.includes(shortVendedorName(r.vendedor)));
        const rowsEqB = rowsB.filter((r) => equipeNomes.includes(shortVendedorName(r.vendedor)));
        const consolidado =
          comparar(agrupar(rowsEqA, () => "equipe"), agrupar(rowsEqB, () => "equipe"), () => input.equipeNome ?? "Equipe")[0] ?? null;
        return { nome: input.equipeNome ?? "Equipe", membros, consolidado };
      })()
    : null;

  // ---------------------------------------------------------------- migração de produtos
  onProgress?.("Analisando migração");
  await yieldToUI();
  const migracao = cmp.periodoB
    ? getMigracoesProdutos().map((cfg) =>
        calcularMigracao(cfg, base, cmp, nomeExibicao, (k) => nomeGrupo(grupoDoCliente(k))),
      )
    : [];

  const ctx: AnalysisContext = {
    versao: input.versaoDados,
    geradoEm: new Date().toISOString(),
    fonte: "Base Comercial Interna — planilha oficial importada (sales_raw_rows)",
    comparacao: {
      modo: cmp.modo,
      modoLabel: cmp.modoLabel,
      descricao: cmp.descricao,
      referenciaTexto: cmp.referenciaTexto,
      rotuloA: cmp.periodoA.rotulo,
      rotuloB: cmp.periodoB?.rotulo ?? null,
      periodoA: { inicio: cmp.periodoA.inicio, fim: cmp.periodoA.fim },
      periodoB: cmp.periodoB ? { inicio: cmp.periodoB.inicio, fim: cmp.periodoB.fim } : null,
      diasA,
      diasB,
      rotuloColunaReferencia: rotuloColunaReferencia(cmp),
      regraApresentacao:
        `Toda variação DEVE citar o período comparado. Ex.: "caiu 14% ${cmp.referenciaTexto}". ` +
        `Nunca escrever apenas "base" em tabelas — usar "${rotuloColunaReferencia(cmp)}".`,
    },
    filtro: {
      carteira,
      equipe: equipeNomes,
      vendedores: Array.from(vendedoresSel),
      clientes: Array.from(clientesSel),
      produtos: Array.from(produtosSel),
      grupos: Array.from(gruposSel),
      descricao:
        `Vendedores: ${vendedoresSel.size ? Array.from(vendedoresSel).join(", ") : "empresa inteira"}. ` +
        `Clientes: ${clientesSel.size ? Array.from(clientesSel).join(", ") : "todos"}. ` +
        `Produtos: ${produtosSel.size ? Array.from(produtosSel).join(", ") : "todos"}. ` +
        `Grupos econômicos: ${gruposSel.size ? Array.from(gruposSel).join(", ") : "todos"}.`,
    },
    empresa: {
      A: mA,
      B: mB,
      deltas,
      diferencaFaturamento: mB ? round(mA.faturamento - mB.faturamento) : null,
      diferencaKg: mB ? round(mA.kg - mB.kg) : null,
      clientesAtivosA: clientes.resumo.ativosA,
      clientesNovos: clientes.resumo.novos,
      clientesPerdidos: clientes.resumo.perdidos,
      clientesRecuperados: clientes.resumo.recuperados,
      leituraVolumePrecoMix: {
        efeitoVolume,
        efeitoPreco,
        precoMedioKgA: mA.precoMedioKg,
        precoMedioKgB: mB?.precoMedioKg ?? null,
        comentario: mB
          ? `Decomposição determinística: efeito volume = (kg ${cmp.periodoA.rotulo} - kg ${cmp.periodoB!.rotulo}) × preço médio/kg de ${cmp.periodoB!.rotulo}; efeito preço = (preço médio/kg ${cmp.periodoA.rotulo} - preço médio/kg ${cmp.periodoB!.rotulo}) × kg de ${cmp.periodoA.rotulo}.`
          : "Sem período de referência: leitura apenas de evolução interna.",
      },
    },
    evolucao,
    produtos: {
      total: produtosTodos.length,
      maioresQuedas,
      maioresCrescimentos,
      todos: produtosTodos.slice(0, 60),
    },
    familias,
    recheados,
    clientes,
    grupos: { consolidados: gruposConsolidados.slice(0, 25) },
    vendedores,
    equipe,
    migracao,
    alertas,
  };

  cache.set(chave, ctx);
  return ctx;
}

// ------------------------------------------------------------------ migração

function calcularMigracao(
  cfg: MigracaoProdutos,
  base: SaleRow[],
  cmp: ComparisonResolved,
  nomeExibicao: Map<string, string>,
  grupoDe: (clienteKey: string) => string | null,
): MigracaoResultado {
  // Cronologia: "antes" é o período mais antigo, "depois" o mais recente.
  const pA = cmp.periodoA;
  const pB = cmp.periodoB!;
  const antesRef = pA.inicio <= pB.inicio ? pA : pB;
  const depoisRef = pA.inicio <= pB.inicio ? pB : pA;

  const rowsAntes = filterByDateRange(base, antesRef.inicio, antesRef.fim);
  const rowsDepois = filterByDateRange(base, depoisRef.inicio, depoisRef.fim);

  const origem = new Set(cfg.origem);
  const substitutos = new Set(cfg.substitutos);

  const nomePorCodigo = new Map<string, string>();
  for (const r of base) {
    const c = codigoProduto(r.descricao);
    if (!c || nomePorCodigo.has(c)) continue;
    if (origem.has(c) || substitutos.has(c)) nomePorCodigo.set(c, nomeCompletoProduto(r.descricao));
  }

  const resumo = (rows: SaleRow[], codigos: Set<string>) => {
    const filtradas = rows.filter((r) => codigos.has(codigoProduto(r.descricao)));
    const clientesPorProduto = Array.from(codigos).map((cod) => ({
      codigo: cod,
      nome: nomePorCodigo.get(cod) ?? cod,
      clientes: new Set(filtradas.filter((r) => codigoProduto(r.descricao) === cod).map((r) => normalizeClientName(r.cliente))).size,
    }));
    const clientesUnicosSet = new Set(filtradas.map((r) => normalizeClientName(r.cliente)));
    const kg = round(filtradas.reduce((s, r) => s + Number(r.quantidade ?? 0), 0));
    const fat = round(filtradas.reduce((s, r) => s + Number(r.preco_total ?? 0), 0));
    const n = clientesUnicosSet.size || 1;
    return {
      rows: filtradas,
      clientesSet: clientesUnicosSet,
      dados: {
        clientesPorProduto,
        clientesUnicos: clientesUnicosSet.size,
        kg,
        faturamento: fat,
        kgMedioPorCliente: round(kg / n),
        faturamentoMedioPorCliente: round(fat / n),
      },
    };
  };

  const origemAntes = resumo(rowsAntes, origem);
  const origemDepois = resumo(rowsDepois, origem);
  const substAntes = resumo(rowsAntes, substitutos);
  const substDepois = resumo(rowsDepois, substitutos);

  const kgFatCliente = (rows: SaleRow[], clienteKey: string) => {
    let kg = 0;
    let fat = 0;
    for (const r of rows) {
      if (normalizeClientName(r.cliente) !== clienteKey) continue;
      kg += Number(r.quantidade ?? 0);
      fat += Number(r.preco_total ?? 0);
    }
    return { kg: round(kg), faturamento: round(fat) };
  };

  const nomeCli = (k: string) => nomeExibicao.get(k) ?? k;

  const migracaoDireta: MigracaoResultado["migracaoDireta"] = [];
  const naoConvertidos: MigracaoResultado["naoConvertidos"] = [];
  const jaCompravamSubstitutos: MigracaoResultado["jaCompravamSubstitutos"] = [];

  for (const k of origemAntes.clientesSet) {
    const antes = kgFatCliente(origemAntes.rows, k);
    if (substDepois.clientesSet.has(k)) {
      const depois = kgFatCliente(substDepois.rows, k);
      if (substAntes.clientesSet.has(k)) {
        jaCompravamSubstitutos.push({ cliente: nomeCli(k), grupo: grupoDe(k), kgAntes: kgFatCliente(substAntes.rows, k).kg, kgDepois: depois.kg });
      } else {
        migracaoDireta.push({
          cliente: nomeCli(k),
          grupo: grupoDe(k),
          kgAntes: antes.kg,
          kgDepois: depois.kg,
          faturamentoAntes: antes.faturamento,
          faturamentoDepois: depois.faturamento,
        });
      }
    } else {
      const comprouOutros = rowsDepois.some((r) => normalizeClientName(r.cliente) === k);
      naoConvertidos.push({ cliente: nomeCli(k), grupo: grupoDe(k), kgAntes: antes.kg, faturamentoAntes: antes.faturamento, comprouOutrosProdutos: comprouOutros });
    }
  }

  const expansao: MigracaoResultado["expansao"] = [];
  for (const k of substDepois.clientesSet) {
    if (origemAntes.clientesSet.has(k) || substAntes.clientesSet.has(k)) continue;
    const d = kgFatCliente(substDepois.rows, k);
    expansao.push({ cliente: nomeCli(k), grupo: grupoDe(k), kgDepois: d.kg, faturamentoDepois: d.faturamento });
  }

  const baseAntiga = origemAntes.clientesSet.size;
  const converteram = migracaoDireta.length + jaCompravamSubstitutos.length;
  const volumePerdido = round(origemAntes.dados.kg - origemDepois.dados.kg);
  const volumeGanho = round(substDepois.dados.kg - substAntes.dados.kg);
  const fatPerdido = round(origemAntes.dados.faturamento - origemDepois.dados.faturamento);
  const fatGanho = round(substDepois.dados.faturamento - substAntes.dados.faturamento);

  return {
    id: cfg.id,
    nome: cfg.nome,
    produtosOrigem: Array.from(origem).map((c) => ({ codigo: c, nome: nomePorCodigo.get(c) ?? c })),
    produtosSubstitutos: Array.from(substitutos).map((c) => ({ codigo: c, nome: nomePorCodigo.get(c) ?? c })),
    antes: { periodo: { inicio: antesRef.inicio, fim: antesRef.fim }, rotulo: antesRef.rotulo, ...origemAntes.dados },
    depois: { periodo: { inicio: depoisRef.inicio, fim: depoisRef.fim }, rotulo: depoisRef.rotulo, ...substDepois.dados },
    migracaoDireta: migracaoDireta.sort((a, b) => b.kgDepois - a.kgDepois).slice(0, 40),
    naoConvertidos: naoConvertidos.sort((a, b) => b.kgAntes - a.kgAntes).slice(0, 40),
    jaCompravamSubstitutos: jaCompravamSubstitutos.sort((a, b) => b.kgDepois - a.kgDepois).slice(0, 25),
    expansao: expansao.sort((a, b) => b.kgDepois - a.kgDepois).slice(0, 30),
    taxaMigracaoPct: baseAntiga ? round((converteram / baseAntiga) * 100, 1) : null,
    volumePerdidoOrigemKg: volumePerdido,
    volumeGanhoSubstitutosKg: volumeGanho,
    faturamentoPerdidoOrigem: fatPerdido,
    faturamentoGanhoSubstitutos: fatGanho,
    percentualRecuperacaoVolume: volumePerdido > 0 ? round((volumeGanho / volumePerdido) * 100, 1) : null,
    percentualRecuperacaoFaturamento: fatPerdido > 0 ? round((fatGanho / fatPerdido) * 100, 1) : null,
    variacaoBaseCompradora: substDepois.clientesSet.size - origemAntes.clientesSet.size,
    clientesDisponiveisParaConversao: naoConvertidos.length,
  };
}

/** Versão enxuta enviada à IA (limita listas longas mantendo o essencial). */
export function compactAnalysisContext(ctx: AnalysisContext) {
  const slim = (l: LinhaComparada) => ({
    nome: l.nome,
    codigo: l.codigo,
    fatA: l.fatA,
    fatB: l.fatB,
    deltaFat: l.deltaFat,
    deltaFatPct: l.deltaFatPct,
    kgA: l.kgA,
    kgB: l.kgB,
    deltaKg: l.deltaKg,
    deltaKgPct: l.deltaKgPct,
    clientesA: l.clientesA,
    clientesB: l.clientesB,
    pedidosA: l.pedidosA,
    pedidosB: l.pedidosB,
  });
  return {
    comparacao: ctx.comparacao,
    filtro: ctx.filtro,
    empresa: ctx.empresa,
    evolucao: ctx.evolucao,
    produtos: {
      total: ctx.produtos.total,
      maioresQuedas: ctx.produtos.maioresQuedas.map((p) => ({ ...slim(p), descontinuado: p.descontinuado, clientesQueExplicam: p.clientesQueExplicam })),
      maioresCrescimentos: ctx.produtos.maioresCrescimentos.map((p) => ({ ...slim(p), clientesQueExplicam: p.clientesQueExplicam })),
      top: ctx.produtos.todos.slice(0, 30).map(slim),
    },
    familias: ctx.familias.map(slim),
    recheados: {
      descontinuados: ctx.recheados.descontinuados.map(slim),
      ativos: ctx.recheados.ativos.map(slim),
      familiaConsolidada: ctx.recheados.familiaConsolidada ? slim(ctx.recheados.familiaConsolidada) : null,
    },
    clientes: {
      resumo: ctx.clientes.resumo,
      maioresQuedas: ctx.clientes.maioresQuedas.slice(0, 20),
      maioresCrescimentos: ctx.clientes.maioresCrescimentos.slice(0, 20),
      perdidos: ctx.clientes.perdidos.slice(0, 20),
      novos: ctx.clientes.novos.slice(0, 20),
      recuperados: ctx.clientes.recuperados.slice(0, 15),
      reducaoForte: ctx.clientes.reducaoForte.slice(0, 15),
    },
    grupos: {
      consolidados: ctx.grupos.consolidados.slice(0, 12).map((g) => ({
        ...slim(g),
        unidadesAtivasA: g.unidadesAtivasA,
        unidadesAtivasB: g.unidadesAtivasB,
        unidades: g.unidades.slice(0, 10).map(slim),
      })),
    },
    vendedores: ctx.vendedores.map(slim),
    equipe: ctx.equipe
      ? { nome: ctx.equipe.nome, membros: ctx.equipe.membros.map(slim), consolidado: ctx.equipe.consolidado ? slim(ctx.equipe.consolidado) : null }
      : null,
    migracao: ctx.migracao,
    alertas: ctx.alertas,
  };
}
