/**
 * Central de Análise — motor de cálculo determinístico.
 *
 * REGRA CRÍTICA: todos os números apresentados pela Central de Análise são
 * calculados aqui (programaticamente, a partir das linhas oficiais da planilha
 * importada). A IA apenas INTERPRETA este pacote de fatos — nunca inventa,
 * estima ou recalcula grandes conjuntos numéricos.
 */
import { SaleRow, filterByDateRange, shortVendedorName, cleanProductName } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";

export interface PeriodoRef {
  inicio: string;
  fim: string;
}

export interface BonificacaoRow {
  data: string;
  categoria: string | null;
  cliente: string | null;
  produto: string | null;
  vendedor: string | null;
  quantidade: number;
  custo: number;
}

export interface FactPackOptions {
  periodo?: Partial<PeriodoRef>;
  vendedores?: string[];
  bonificacoes?: BonificacaoRow[];
  equipe?: string[];
}

const MS_DIA = 24 * 60 * 60 * 1000;

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function diffDias(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_DIA) + 1;
}

function shiftDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * MS_DIA));
}

function shiftYear(iso: string, years: number): string {
  const d = parseISO(iso);
  return toISO(new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate())));
}

function round(v: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((Number.isFinite(v) ? v : 0) * f) / f;
}

function pctVar(atual: number, comp: number): number | null {
  if (!comp) return null;
  return round(((atual - comp) / Math.abs(comp)) * 100, 1);
}

export function familiaDoProduto(descricao: string): string {
  const n = cleanProductName(String(descricao ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/isopor|frete|papelao|caixa/.test(n)) return "Não comercial";
  if (/premium/.test(n)) return "Premium Empanado";
  if (/super lanche/.test(n)) return "Super Lanche";
  if (/lanchinho/.test(n)) return "Lanchinho";
  if (/lanche/.test(n)) return "Lanches Recheados";
  if (/recheado|requeijao|goiabada|frango|lombinho|chocolate|doce de leite/.test(n)) return "Tradicional Recheado";
  if (/mini|coquetel|biscoito/.test(n)) return "Mini / Coquetel";
  if (/tradicional/.test(n)) return "Tradicional";
  return "Outros";
}

interface Metricas {
  faturamento: number;
  kg: number;
  pedidos: number;
  clientes: number;
  ticketMedio: number;
  precoMedioKg: number;
  linhas: number;
}

function metricas(rows: SaleRow[]): Metricas {
  const fat = rows.reduce((s, r) => s + Number(r.preco_total ?? 0), 0);
  const kg = rows.reduce((s, r) => s + Number(r.quantidade ?? 0), 0);
  const pedidos = new Set(rows.map((r) => `${r.codigo_venda}`)).size;
  const clientes = new Set(rows.map((r) => normalizeClientName(r.cliente))).size;
  return {
    faturamento: round(fat),
    kg: round(kg),
    pedidos,
    clientes,
    ticketMedio: pedidos ? round(fat / pedidos) : 0,
    precoMedioKg: kg ? round(fat / kg) : 0,
    linhas: rows.length,
  };
}

function agrupar<T>(rows: SaleRow[], keyFn: (r: SaleRow) => string, extra?: (rows: SaleRow[]) => T) {
  const map = new Map<string, SaleRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return Array.from(map.entries()).map(([chave, lista]) => ({
    chave,
    rows: lista,
    m: metricas(lista),
    extra: extra ? extra(lista) : (undefined as unknown as T),
  }));
}

function comparaGrupos(
  atual: ReturnType<typeof agrupar>,
  comp: ReturnType<typeof agrupar>,
) {
  const compMap = new Map(comp.map((g) => [g.chave, g]));
  const chaves = new Set([...atual.map((g) => g.chave), ...comp.map((g) => g.chave)]);
  const atualMap = new Map(atual.map((g) => [g.chave, g]));
  return Array.from(chaves).map((chave) => {
    const a = atualMap.get(chave)?.m ?? metricas([]);
    const c = compMap.get(chave)?.m ?? metricas([]);
    return {
      nome: chave,
      fatAtual: a.faturamento,
      fatComp: c.faturamento,
      deltaFat: round(a.faturamento - c.faturamento),
      deltaFatPct: pctVar(a.faturamento, c.faturamento),
      kgAtual: a.kg,
      kgComp: c.kg,
      deltaKg: round(a.kg - c.kg),
      deltaKgPct: pctVar(a.kg, c.kg),
      pedidosAtual: a.pedidos,
      pedidosComp: c.pedidos,
      clientesAtual: a.clientes,
      clientesComp: c.clientes,
      ticketAtual: a.ticketMedio,
      ticketComp: c.ticketMedio,
    };
  });
}

export type GrupoComparado = ReturnType<typeof comparaGrupos>[number];

function serieMensal(rows: SaleRow[], meses = 18) {
  const map = new Map<string, SaleRow[]>();
  for (const r of rows) {
    const mes = String(r.data ?? "").slice(0, 7);
    if (!mes) continue;
    const arr = map.get(mes);
    if (arr) arr.push(r);
    else map.set(mes, [r]);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-meses)
    .map(([mes, lista]) => {
      const m = metricas(lista);
      return { mes, faturamento: m.faturamento, kg: m.kg, pedidos: m.pedidos, clientes: m.clientes };
    });
}

function ultimaCompraPorCliente(rows: SaleRow[]) {
  const map = new Map<string, { primeira: string; ultima: string; datas: Set<string>; pedidos: Set<string> }>();
  for (const r of rows) {
    const k = normalizeClientName(r.cliente);
    const dia = String(r.data ?? "").slice(0, 10);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { primeira: dia, ultima: dia, datas: new Set([dia]), pedidos: new Set([String(r.codigo_venda)]) });
    } else {
      if (dia < cur.primeira) cur.primeira = dia;
      if (dia > cur.ultima) cur.ultima = dia;
      cur.datas.add(dia);
      cur.pedidos.add(String(r.codigo_venda));
    }
  }
  return map;
}

function nomeExibicaoCliente(rows: SaleRow[]) {
  const map = new Map<string, string>();
  for (const r of rows) {
    const k = normalizeClientName(r.cliente);
    if (!map.has(k)) map.set(k, String(r.cliente ?? "").trim());
  }
  return map;
}

function vendedorPrincipal(rows: SaleRow[], chave: string, keyFn: (r: SaleRow) => string): string {
  const cont = new Map<string, number>();
  for (const r of rows) {
    if (keyFn(r) !== chave) continue;
    const v = shortVendedorName(r.vendedor);
    cont.set(v, (cont.get(v) ?? 0) + Number(r.preco_total ?? 0));
  }
  return Array.from(cont.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

/** Atribuição: quem explica o movimento de um produto (queda ou alta). */
function atribuicaoPorProduto(
  atuais: SaleRow[],
  comps: SaleRow[],
  produto: string,
  clientesHistoricos: Map<string, { primeira: string; ultima: string }>,
  periodoInicio: string,
) {
  const filtroA = atuais.filter((r) => cleanProductName(r.descricao) === produto);
  const filtroC = comps.filter((r) => cleanProductName(r.descricao) === produto);
  const clientes = comparaGrupos(
    agrupar(filtroA, (r) => normalizeClientName(r.cliente)),
    agrupar(filtroC, (r) => normalizeClientName(r.cliente)),
  );
  const nomes = new Map([...nomeExibicaoCliente(filtroC), ...nomeExibicaoCliente(filtroA)]);
  const enriquecidos = clientes.map((c) => {
    const hist = clientesHistoricos.get(c.nome);
    const primeiraCompra = hist?.primeira ?? null;
    return {
      ...c,
      nome: nomes.get(c.nome) ?? c.nome,
      chave: c.nome,
      vendedor: vendedorPrincipal([...filtroA, ...filtroC], c.nome, (r) => normalizeClientName(r.cliente)),
      ultimaCompraGeral: hist?.ultima ?? null,
      primeiraCompraGeral: primeiraCompra,
      clienteNovo: !!primeiraCompra && primeiraCompra >= periodoInicio,
      comprouNoPeriodo: c.kgAtual > 0,
    };
  });
  const vendedores = comparaGrupos(
    agrupar(filtroA, (r) => shortVendedorName(r.vendedor)),
    agrupar(filtroC, (r) => shortVendedorName(r.vendedor)),
  ).sort((a, b) => a.deltaKg - b.deltaKg);

  return {
    produto,
    familia: familiaDoProduto(produto),
    quedasClientes: enriquecidos.filter((c) => c.deltaKg < 0).sort((a, b) => a.deltaKg - b.deltaKg).slice(0, 12),
    altasClientes: enriquecidos.filter((c) => c.deltaKg > 0).sort((a, b) => b.deltaKg - a.deltaKg).slice(0, 12),
    vendedores: vendedores.slice(0, 12),
  };
}

export interface FactPack {
  meta: {
    geradoEm: string;
    fonte: string;
    periodoAtual: PeriodoRef;
    periodoAnterior: PeriodoRef;
    periodoAnoAnterior: PeriodoRef | null;
    diasPeriodo: number;
    mesEmAndamento: { mes: string; ultimoDiaComDados: string; parcial: boolean; diasDecorridos: number } | null;
    filtroVendedores: string[];
    equipe: string[];
    observacoes: string[];
  };
  empresa: {
    atual: Metricas;
    anterior: Metricas;
    anoAnterior: Metricas | null;
    variacaoVsAnterior: Record<string, number | null>;
    variacaoVsAnoAnterior: Record<string, number | null> | null;
    mediaDiariaFat: number;
    projecaoMesAtual: { mes: string; realizado: number; mediaDiaria: number; projecaoFechamento: number } | null;
  };
  serieMensalEmpresa: ReturnType<typeof serieMensal>;
  familias: (GrupoComparado & { serieKg: { mes: string; kg: number }[] })[];
  produtos: GrupoComparado[];
  vendedores: GrupoComparado[];
  equipe: { membros: GrupoComparado[]; consolidado: GrupoComparado | null };
  clientes: {
    resumo: {
      totalAtivosPeriodo: number;
      novos: number;
      reativados: number;
      recorrentes: number;
      semCompraNoPeriodo: number;
      possiveisInativos: number;
      cresceram: number;
      reduziram: number;
    };
    novos: any[];
    possiveisInativos: any[];
    maioresQuedas: any[];
    maioresAltas: any[];
  };
  concentracao: {
    quedaTotalFat: number;
    altaTotalFat: number;
    top5ClientesQuedaPct: number | null;
    top5ClientesAltaPct: number | null;
    quedaPorClientesSemCompra: number;
    quedaPorClientesQueReduziram: number;
  };
  investigacaoQuedas: ReturnType<typeof atribuicaoPorProduto>[];
  investigacaoAltas: ReturnType<typeof atribuicaoPorProduto>[];
  bonificacoes: {
    disponivel: boolean;
    totalKgAtual: number;
    totalCustoAtual: number;
    totalKgComp: number;
    porCategoria: { categoria: string; kg: number; custo: number }[];
    porProduto: { produto: string; kg: number; custo: number }[];
    porVendedor: { vendedor: string; kg: number; custo: number }[];
  };
  alertasDados: string[];
}

export function resolvePeriodo(sales: SaleRow[], periodo?: Partial<PeriodoRef>): PeriodoRef {
  const maxData = sales.reduce((m, r) => {
    const d = String(r.data ?? "").slice(0, 10);
    return d > m ? d : m;
  }, "");
  const hoje = maxData || toISO(new Date());
  const inicio = periodo?.inicio || `${hoje.slice(0, 4)}-01-01`;
  const fim = periodo?.fim || hoje;
  return { inicio, fim };
}

export function buildFactPack(salesAll: SaleRow[], options: FactPackOptions = {}): FactPack {
  const alertas: string[] = [];
  const observacoes: string[] = [];
  const periodoAtual = resolvePeriodo(salesAll, options.periodo);
  const dias = Math.max(1, diffDias(periodoAtual.inicio, periodoAtual.fim));

  const periodoAnterior: PeriodoRef = {
    inicio: shiftDays(periodoAtual.inicio, -dias),
    fim: shiftDays(periodoAtual.inicio, -1),
  };
  const anoAnteriorRef: PeriodoRef = {
    inicio: shiftYear(periodoAtual.inicio, -1),
    fim: shiftYear(periodoAtual.fim, -1),
  };

  const filtroVend = (options.vendedores ?? []).map(shortVendedorName).filter(Boolean);
  const aplicarFiltro = (rows: SaleRow[]) =>
    filtroVend.length ? rows.filter((r) => filtroVend.includes(shortVendedorName(r.vendedor))) : rows;

  const base = aplicarFiltro(salesAll);
  const atuais = filterByDateRange(base, periodoAtual.inicio, periodoAtual.fim);
  const comps = filterByDateRange(base, periodoAnterior.inicio, periodoAnterior.fim);
  const anoAnt = filterByDateRange(base, anoAnteriorRef.inicio, anoAnteriorRef.fim);
  const temAnoAnterior = anoAnt.length > 0;

  // ---- mês em andamento (regra obrigatória de comparabilidade) ----
  const mesFim = periodoAtual.fim.slice(0, 7);
  const ultimoDiaMes = toISO(new Date(Date.UTC(Number(mesFim.slice(0, 4)), Number(mesFim.slice(5, 7)), 0)));
  const parcial = periodoAtual.fim < ultimoDiaMes;
  const diasDecorridos = Number(periodoAtual.fim.slice(8, 10));
  if (parcial) {
    observacoes.push(
      `O mês ${mesFim} está PARCIAL (dados até ${periodoAtual.fim}). Nunca comparar mês parcial com mês fechado; usar mesmo intervalo de dias, média diária ou projeção claramente identificada.`,
    );
  }

  const mAtual = metricas(atuais);
  const mComp = metricas(comps);
  const mAno = temAnoAnterior ? metricas(anoAnt) : null;

  const variacao = (a: Metricas, c: Metricas) => ({
    faturamento: pctVar(a.faturamento, c.faturamento),
    kg: pctVar(a.kg, c.kg),
    pedidos: pctVar(a.pedidos, c.pedidos),
    clientes: pctVar(a.clientes, c.clientes),
    ticketMedio: pctVar(a.ticketMedio, c.ticketMedio),
    precoMedioKg: pctVar(a.precoMedioKg, c.precoMedioKg),
  });

  // ---- produtos / famílias / vendedores ----
  const prodAtual = agrupar(atuais, (r) => cleanProductName(r.descricao));
  const prodComp = agrupar(comps, (r) => cleanProductName(r.descricao));
  const produtos = comparaGrupos(prodAtual, prodComp).sort((a, b) => b.fatAtual - a.fatAtual);

  const famAtual = agrupar(atuais, (r) => familiaDoProduto(r.descricao));
  const famComp = agrupar(comps, (r) => familiaDoProduto(r.descricao));
  const familias = comparaGrupos(famAtual, famComp)
    .map((f) => ({
      ...f,
      serieKg: serieMensal(base.filter((r) => familiaDoProduto(r.descricao) === f.nome), 18).map((s) => ({
        mes: s.mes,
        kg: s.kg,
      })),
    }))
    .sort((a, b) => b.fatAtual - a.fatAtual);

  const vendAtual = agrupar(atuais, (r) => shortVendedorName(r.vendedor));
  const vendComp = agrupar(comps, (r) => shortVendedorName(r.vendedor));
  const vendedores = comparaGrupos(vendAtual, vendComp).sort((a, b) => b.fatAtual - a.fatAtual);

  const equipeNomes = (options.equipe ?? []).map(shortVendedorName).filter(Boolean);
  const membrosEquipe = vendedores.filter((v) => equipeNomes.includes(v.nome));
  const rowsEquipeAtual = atuais.filter((r) => equipeNomes.includes(shortVendedorName(r.vendedor)));
  const rowsEquipeComp = comps.filter((r) => equipeNomes.includes(shortVendedorName(r.vendedor)));
  const consolidadoEquipe = equipeNomes.length
    ? comparaGrupos(agrupar(rowsEquipeAtual, () => "EQUIPE"), agrupar(rowsEquipeComp, () => "EQUIPE"))[0] ?? null
    : null;

  // ---- clientes ----
  const histAll = ultimaCompraPorCliente(base);
  const histAtePeriodo = ultimaCompraPorCliente(base.filter((r) => String(r.data).slice(0, 10) < periodoAtual.inicio));
  const nomes = new Map([...nomeExibicaoCliente(base)]);
  const cliAtual = agrupar(atuais, (r) => normalizeClientName(r.cliente));
  const cliComp = agrupar(comps, (r) => normalizeClientName(r.cliente));
  const clientesComparados = comparaGrupos(cliAtual, cliComp).map((c) => {
    const hist = histAll.get(c.nome);
    const antes = histAtePeriodo.get(c.nome);
    const intervaloMedio = (() => {
      const datas = Array.from(histAll.get(c.nome)?.datas ?? []).sort();
      if (datas.length < 2) return null;
      let soma = 0;
      for (let i = 1; i < datas.length; i++) soma += diffDias(datas[i - 1], datas[i]) - 1;
      return round(soma / (datas.length - 1), 1);
    })();
    const diasSemCompra = hist ? diffDias(hist.ultima, periodoAtual.fim) - 1 : null;
    const pedidosHistoricos = histAll.get(c.nome)?.pedidos.size ?? 0;

    let status:
      | "novo"
      | "reativado"
      | "recorrente_cresceu"
      | "recorrente_reduziu"
      | "recorrente_estavel"
      | "sem_compra_no_periodo"
      | "possivel_inativo" = "recorrente_estavel";
    if (c.fatAtual > 0 && (!antes || (hist && hist.primeira >= periodoAtual.inicio))) status = "novo";
    else if (c.fatAtual > 0 && antes && diffDias(antes.ultima, periodoAtual.inicio) - 1 >= 60) status = "reativado";
    else if (c.fatAtual === 0) {
      const recorrente = pedidosHistoricos >= 3;
      const atrasado = intervaloMedio !== null && diasSemCompra !== null && diasSemCompra > Math.max(45, intervaloMedio * 2.5);
      status = recorrente && atrasado ? "possivel_inativo" : "sem_compra_no_periodo";
    } else if (c.deltaFat < 0 && Math.abs(c.deltaFatPct ?? 0) >= 5) status = "recorrente_reduziu";
    else if (c.deltaFat > 0 && Math.abs(c.deltaFatPct ?? 0) >= 5) status = "recorrente_cresceu";

    return {
      ...c,
      nome: nomes.get(c.nome) ?? c.nome,
      chave: c.nome,
      vendedor: vendedorPrincipal(base, c.nome, (r) => normalizeClientName(r.cliente)),
      primeiraCompraHistorica: hist?.primeira ?? null,
      ultimaCompra: hist?.ultima ?? null,
      diasSemCompra,
      intervaloMedioDias: intervaloMedio,
      pedidosHistoricos,
      status,
    };
  });

  const resumoClientes = {
    totalAtivosPeriodo: clientesComparados.filter((c) => c.fatAtual > 0).length,
    novos: clientesComparados.filter((c) => c.status === "novo").length,
    reativados: clientesComparados.filter((c) => c.status === "reativado").length,
    recorrentes: clientesComparados.filter((c) => c.status.startsWith("recorrente")).length,
    semCompraNoPeriodo: clientesComparados.filter((c) => c.status === "sem_compra_no_periodo").length,
    possiveisInativos: clientesComparados.filter((c) => c.status === "possivel_inativo").length,
    cresceram: clientesComparados.filter((c) => c.deltaFat > 0).length,
    reduziram: clientesComparados.filter((c) => c.deltaFat < 0).length,
  };

  const quedasClientes = clientesComparados.filter((c) => c.deltaFat < 0).sort((a, b) => a.deltaFat - b.deltaFat);
  const altasClientes = clientesComparados.filter((c) => c.deltaFat > 0).sort((a, b) => b.deltaFat - a.deltaFat);
  const quedaTotal = round(quedasClientes.reduce((s, c) => s + c.deltaFat, 0));
  const altaTotal = round(altasClientes.reduce((s, c) => s + c.deltaFat, 0));

  const concentracao = {
    quedaTotalFat: quedaTotal,
    altaTotalFat: altaTotal,
    top5ClientesQuedaPct: quedaTotal
      ? round((quedasClientes.slice(0, 5).reduce((s, c) => s + c.deltaFat, 0) / quedaTotal) * 100, 1)
      : null,
    top5ClientesAltaPct: altaTotal
      ? round((altasClientes.slice(0, 5).reduce((s, c) => s + c.deltaFat, 0) / altaTotal) * 100, 1)
      : null,
    quedaPorClientesSemCompra: round(
      quedasClientes.filter((c) => c.fatAtual === 0).reduce((s, c) => s + c.deltaFat, 0),
    ),
    quedaPorClientesQueReduziram: round(
      quedasClientes.filter((c) => c.fatAtual > 0).reduce((s, c) => s + c.deltaFat, 0),
    ),
  };

  // ---- investigação dos maiores movimentos de produto ----
  const histSimples = new Map(
    Array.from(histAll.entries()).map(([k, v]) => [k, { primeira: v.primeira, ultima: v.ultima }]),
  );
  const produtosQueda = produtos.filter((p) => p.deltaKg < 0).sort((a, b) => a.deltaKg - b.deltaKg).slice(0, 8);
  const produtosAlta = produtos.filter((p) => p.deltaKg > 0).sort((a, b) => b.deltaKg - a.deltaKg).slice(0, 8);
  const investigacaoQuedas = produtosQueda.map((p) =>
    atribuicaoPorProduto(atuais, comps, p.nome, histSimples, periodoAtual.inicio),
  );
  const investigacaoAltas = produtosAlta.map((p) =>
    atribuicaoPorProduto(atuais, comps, p.nome, histSimples, periodoAtual.inicio),
  );

  // ---- bonificações ----
  const bonis = options.bonificacoes ?? [];
  const bonisAtual = bonis.filter((b) => {
    const d = String(b.data ?? "").slice(0, 10);
    return d >= periodoAtual.inicio && d <= periodoAtual.fim;
  });
  const bonisComp = bonis.filter((b) => {
    const d = String(b.data ?? "").slice(0, 10);
    return d >= periodoAnterior.inicio && d <= periodoAnterior.fim;
  });
  const somaBonis = (lista: BonificacaoRow[], key: (b: BonificacaoRow) => string) => {
    const map = new Map<string, { kg: number; custo: number }>();
    for (const b of lista) {
      const k = key(b) || "—";
      const cur = map.get(k) ?? { kg: 0, custo: 0 };
      cur.kg += Number(b.quantidade ?? 0);
      cur.custo += Number(b.custo ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, kg: round(v.kg), custo: round(v.custo) }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 20);
  };

  // ---- alertas de dados ----
  if (mComp.linhas === 0) alertas.push("Não há linhas no período comparativo — variações percentuais não são calculáveis.");
  if (!temAnoAnterior) alertas.push("Não há histórico suficiente para comparar com o mesmo período do ano anterior.");
  const linhasSemVendedor = atuais.filter((r) => !String(r.vendedor ?? "").trim()).length;
  if (linhasSemVendedor > 0) alertas.push(`${linhasSemVendedor} linha(s) do período sem vendedor informado.`);
  const linhasValorZero = atuais.filter((r) => !Number(r.preco_total)).length;
  if (linhasValorZero > 0) alertas.push(`${linhasValorZero} linha(s) do período com valor R$ 0,00 (possível bonificação lançada como venda).`);

  const mediaDiaria = round(mAtual.faturamento / dias);
  const diasNoMes = Number(ultimoDiaMes.slice(8, 10));
  const rowsMes = filterByDateRange(base, `${mesFim}-01`, periodoAtual.fim);
  const realizadoMes = round(rowsMes.reduce((s, r) => s + Number(r.preco_total ?? 0), 0));
  const projecao = parcial && diasDecorridos > 0
    ? {
        mes: mesFim,
        realizado: realizadoMes,
        mediaDiaria: round(realizadoMes / diasDecorridos),
        projecaoFechamento: round((realizadoMes / diasDecorridos) * diasNoMes),
      }
    : null;

  return {
    meta: {
      geradoEm: new Date().toISOString(),
      fonte: "Base Comercial Interna (planilha oficial importada — sales_raw_rows)",
      periodoAtual,
      periodoAnterior,
      periodoAnoAnterior: temAnoAnterior ? anoAnteriorRef : null,
      diasPeriodo: dias,
      mesEmAndamento: { mes: mesFim, ultimoDiaComDados: periodoAtual.fim, parcial, diasDecorridos },
      filtroVendedores: filtroVend,
      equipe: equipeNomes,
      observacoes,
    },
    empresa: {
      atual: mAtual,
      anterior: mComp,
      anoAnterior: mAno,
      variacaoVsAnterior: variacao(mAtual, mComp),
      variacaoVsAnoAnterior: mAno ? variacao(mAtual, mAno) : null,
      mediaDiariaFat: mediaDiaria,
      projecaoMesAtual: projecao,
    },
    serieMensalEmpresa: serieMensal(base, 18),
    familias,
    produtos: produtos.slice(0, 45),
    vendedores,
    equipe: { membros: membrosEquipe, consolidado: consolidadoEquipe },
    clientes: {
      resumo: resumoClientes,
      novos: clientesComparados.filter((c) => c.status === "novo").sort((a, b) => b.fatAtual - a.fatAtual).slice(0, 25),
      possiveisInativos: clientesComparados
        .filter((c) => c.status === "possivel_inativo")
        .sort((a, b) => b.fatComp - a.fatComp)
        .slice(0, 25),
      maioresQuedas: quedasClientes.slice(0, 40),
      maioresAltas: altasClientes.slice(0, 40),
    },
    concentracao,
    investigacaoQuedas,
    investigacaoAltas,
    bonificacoes: {
      disponivel: bonis.length > 0,
      totalKgAtual: round(bonisAtual.reduce((s, b) => s + Number(b.quantidade ?? 0), 0)),
      totalCustoAtual: round(bonisAtual.reduce((s, b) => s + Number(b.custo ?? 0), 0)),
      totalKgComp: round(bonisComp.reduce((s, b) => s + Number(b.quantidade ?? 0), 0)),
      porCategoria: somaBonis(bonisAtual, (b) => String(b.categoria ?? "")).map((x) => ({ categoria: x.nome, kg: x.kg, custo: x.custo })),
      porProduto: somaBonis(bonisAtual, (b) => cleanProductName(String(b.produto ?? ""))).map((x) => ({ produto: x.nome, kg: x.kg, custo: x.custo })),
      porVendedor: somaBonis(bonisAtual, (b) => shortVendedorName(String(b.vendedor ?? ""))).map((x) => ({ vendedor: x.nome, kg: x.kg, custo: x.custo })),
    },
    alertasDados: alertas,
  };
}

/** Reduz o pacote para caber no contexto do modelo sem perder o essencial. */
export function compactFactPack(fp: FactPack) {
  const slimGrupo = (g: GrupoComparado) => ({
    nome: g.nome,
    fatAtual: g.fatAtual,
    fatComp: g.fatComp,
    deltaFat: g.deltaFat,
    deltaFatPct: g.deltaFatPct,
    kgAtual: g.kgAtual,
    kgComp: g.kgComp,
    deltaKg: g.deltaKg,
    deltaKgPct: g.deltaKgPct,
    pedidosAtual: g.pedidosAtual,
    pedidosComp: g.pedidosComp,
    clientesAtual: g.clientesAtual,
    clientesComp: g.clientesComp,
  });
  const slimCliente = (c: any) => ({
    cliente: c.nome,
    vendedor: c.vendedor,
    status: c.status,
    fatAtual: c.fatAtual,
    fatComp: c.fatComp,
    deltaFat: c.deltaFat,
    deltaFatPct: c.deltaFatPct,
    kgAtual: c.kgAtual,
    kgComp: c.kgComp,
    deltaKg: c.deltaKg,
    ultimaCompra: c.ultimaCompra,
    diasSemCompra: c.diasSemCompra,
    intervaloMedioDias: c.intervaloMedioDias,
    pedidosAtual: c.pedidosAtual,
    pedidosComp: c.pedidosComp,
  });
  return {
    meta: fp.meta,
    empresa: fp.empresa,
    serieMensalEmpresa: fp.serieMensalEmpresa,
    familias: fp.familias.map((f) => ({ ...slimGrupo(f), serieKg: f.serieKg })),
    produtos: fp.produtos.map(slimGrupo),
    vendedores: fp.vendedores.map(slimGrupo),
    equipe: {
      membros: fp.equipe.membros.map(slimGrupo),
      consolidado: fp.equipe.consolidado ? slimGrupo(fp.equipe.consolidado) : null,
    },
    clientes: {
      resumo: fp.clientes.resumo,
      novos: fp.clientes.novos.slice(0, 20).map(slimCliente),
      possiveisInativos: fp.clientes.possiveisInativos.slice(0, 20).map(slimCliente),
      maioresQuedas: fp.clientes.maioresQuedas.slice(0, 30).map(slimCliente),
      maioresAltas: fp.clientes.maioresAltas.slice(0, 25).map(slimCliente),
    },
    concentracao: fp.concentracao,
    investigacaoQuedas: fp.investigacaoQuedas.map((i) => ({
      produto: i.produto,
      familia: i.familia,
      quedasClientes: i.quedasClientes.slice(0, 8).map(slimCliente),
      altasClientes: i.altasClientes.slice(0, 4).map(slimCliente),
      vendedores: i.vendedores.slice(0, 6).map(slimGrupo),
    })),
    investigacaoAltas: fp.investigacaoAltas.map((i) => ({
      produto: i.produto,
      familia: i.familia,
      altasClientes: i.altasClientes.slice(0, 8).map((c: any) => ({ ...slimCliente(c), clienteNovo: c.clienteNovo })),
      quedasClientes: i.quedasClientes.slice(0, 4).map(slimCliente),
      vendedores: i.vendedores.slice(0, 6).map(slimGrupo),
    })),
    bonificacoes: fp.bonificacoes,
    alertasDados: fp.alertasDados,
  };
}
