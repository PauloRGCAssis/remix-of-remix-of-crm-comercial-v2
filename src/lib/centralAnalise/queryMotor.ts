// Motor de consultas SEM IA — responde perguntas comerciais diretamente do
// contexto de análise já calculado programaticamente (analysisContext).
// NENHUMA chamada de modelo de IA acontece aqui.

import type { AnalysisContext, LinhaComparada, ClienteAnalisado, ProdutoAnalisado } from "./analysisContext";
import type { AnaliseEstruturada, AnaliseBloco, AnaliseKpi } from "@/hooks/useCentralAnalise";
import { normalizeSearchText } from "@/lib/clientSearch";

export type IntencaoConsulta =
  | "resumo_empresa"
  | "ranking_vendedores"
  | "produtos_queda"
  | "produtos_crescimento"
  | "clientes_queda"
  | "clientes_crescimento"
  | "clientes_novos"
  | "clientes_perdidos"
  | "clientes_recuperados"
  | "grupos"
  | "evolucao"
  | "migracao"
  | "vendedor_especifico";

export interface ResultadoConsultaLocal {
  ok: true;
  intencao: IntencaoConsulta;
  analise: AnaliseEstruturada;
}
export interface ConsultaNaoSuportada {
  ok: false;
  motivo: string;
}
export type SaidaMotor = ResultadoConsultaLocal | ConsultaNaoSuportada;

// ------------------------------------------------------------------ formatação
const fmtBRL = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKg = (v: number) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtNum = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR");
const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR")}%`);
const sentidoDe = (v: number): AnaliseKpi["sentido"] => (v > 0 ? "positivo" : v < 0 ? "negativo" : "neutro");

// ------------------------------------------------------------------ termos interpretativos
const TERMOS_INTERPRETATIVOS = [
  "por que", "porque", "por quê", "explique", "explicar", "motivo", "causa", "causou",
  "estrategia", "estrategica", "recomend", "sugest", "sugira", "o que fazer", "como reverter",
  "plano de acao", "hipotese", "opiniao", "acha", "avalie", "interprete", "analise critica",
  "diagnostico", "riscos", "oportunidades", "apresentacao", "diretoria", "narrativa", "redija",
];

const MAPA_INTENCOES: { intencao: IntencaoConsulta; termos: string[] }[] = [
  { intencao: "migracao", termos: ["migracao", "migrar", "migraram", "substitut", "1531", "1858", "101/104"] },
  { intencao: "clientes_novos", termos: ["cliente novo", "clientes novos", "novos clientes", "primeira compra"] },
  { intencao: "clientes_perdidos", termos: ["cliente perdido", "clientes perdidos", "perdemos cliente", "deixaram de comprar", "pararam de comprar"] },
  { intencao: "clientes_recuperados", termos: ["recuperado", "recuperados", "reativad"] },
  { intencao: "grupos", termos: ["grupo economico", "grupos economicos", "grupo consolidado", "matriz e filiais"] },
  { intencao: "evolucao", termos: ["evolucao", "mes a mes", "mensal", "tendencia", "historico mensal", "por mes"] },
  { intencao: "ranking_vendedores", termos: ["vendedor", "vendedores", "ranking", "equipe", "carteira"] },
  { intencao: "produtos_queda", termos: ["produto", "produtos", "sku", "item"] },
  { intencao: "clientes_queda", termos: ["cliente", "clientes"] },
  { intencao: "resumo_empresa", termos: ["faturamento", "vendas", "volume", "quanto vendeu", "quanto faturou", "resumo", "total", "empresa", "kg", "ticket"] },
];

const TERMOS_CRESCIMENTO = ["cresceu", "crescimento", "cresceram", "subiu", "aumentou", "maiores altas", "melhores", "top "];
const TERMOS_QUEDA = ["caiu", "cairam", "caíram", "queda", "quedas", "reduziu", "reducao", "perda", "diminuiu", "pior"];

function contem(texto: string, termos: string[]) {
  return termos.some((t) => texto.includes(normalizeSearchText(t)));
}

/** Classifica a pergunta. Retorna null quando exige interpretação (só com IA). */
export function classificarIntencao(pergunta: string): IntencaoConsulta | null {
  const q = normalizeSearchText(pergunta);
  if (!q.trim()) return null;
  if (contem(q, TERMOS_INTERPRETATIVOS)) return null;

  const crescimento = contem(q, TERMOS_CRESCIMENTO);
  const queda = contem(q, TERMOS_QUEDA);

  for (const { intencao, termos } of MAPA_INTENCOES) {
    if (!contem(q, termos)) continue;
    if (intencao === "produtos_queda") return crescimento && !queda ? "produtos_crescimento" : "produtos_queda";
    if (intencao === "clientes_queda") return crescimento && !queda ? "clientes_crescimento" : "clientes_queda";
    return intencao;
  }
  return "resumo_empresa";
}

/** Detecta um vendedor citado nominalmente na pergunta. */
function vendedorCitado(pergunta: string, ctx: AnalysisContext): LinhaComparada | null {
  const q = normalizeSearchText(pergunta);
  let melhor: LinhaComparada | null = null;
  for (const v of ctx.vendedores ?? []) {
    const nome = normalizeSearchText(v.nome);
    if (!nome) continue;
    const partes = nome.split(" ").filter((p) => p.length >= 4);
    const bate = q.includes(nome) || partes.filter((p) => q.includes(p)).length >= (partes.length > 1 ? 2 : 1);
    if (bate && (!melhor || v.nome.length > melhor.nome.length)) melhor = v;
  }
  return melhor;
}

// ------------------------------------------------------------------ blocos reutilizáveis
function tabelaComparada(
  linhas: LinhaComparada[],
  rotuloA: string,
  rotuloB: string | null,
  limite = 15,
): AnaliseBloco["tabela"] {
  const colunas = rotuloB
    ? ["Nome", `Faturamento ${rotuloA}`, `Faturamento ${rotuloB}`, "Diferença R$", "Var. %", `Volume ${rotuloA}`, `Volume ${rotuloB}`, "Diferença kg"]
    : ["Nome", `Faturamento ${rotuloA}`, `Volume ${rotuloA}`, "Pedidos", "Clientes", "Ticket médio"];
  const dados = linhas.slice(0, limite).map((l) =>
    rotuloB
      ? [l.nome, fmtBRL(l.fatA), fmtBRL(l.fatB), fmtBRL(l.deltaFat), fmtPct(l.deltaFatPct), fmtKg(l.kgA), fmtKg(l.kgB), fmtKg(l.deltaKg)]
      : [l.nome, fmtBRL(l.fatA), fmtKg(l.kgA), fmtNum(l.pedidosA), fmtNum(l.clientesA), fmtBRL(l.ticketA)],
  );
  return { colunas, linhas: dados };
}

function kpisEmpresa(ctx: AnalysisContext): AnaliseKpi[] {
  const a = ctx.empresa.A;
  const b = ctx.empresa.B;
  const rotB = ctx.comparacao.rotuloB;
  const kpi = (label: string, valor: string, deltaAbs: number | null, deltaPct: number | null, sub?: string): AnaliseKpi => ({
    label,
    valor,
    sub: sub ?? (rotB && deltaAbs != null ? `${rotB}: ${fmtPct(deltaPct)}` : undefined),
    variacao: deltaAbs != null ? fmtPct(deltaPct) : undefined,
    sentido: deltaAbs != null ? sentidoDe(deltaAbs) : "neutro",
  });
  return [
    kpi("Faturamento", fmtBRL(a.faturamento), b ? a.faturamento - b.faturamento : null, b ? pct(a.faturamento, b.faturamento) : null),
    kpi("Volume", fmtKg(a.kg), b ? a.kg - b.kg : null, b ? pct(a.kg, b.kg) : null),
    kpi("Pedidos", fmtNum(a.pedidos), b ? a.pedidos - b.pedidos : null, b ? pct(a.pedidos, b.pedidos) : null),
    kpi("Clientes ativos", fmtNum(a.clientes), b ? a.clientes - b.clientes : null, b ? pct(a.clientes, b.clientes) : null),
    kpi("Ticket médio", fmtBRL(a.ticketMedio), b ? a.ticketMedio - b.ticketMedio : null, b ? pct(a.ticketMedio, b.ticketMedio) : null),
    kpi("Preço médio por kg", fmtBRL(a.precoMedioKg), b ? a.precoMedioKg - b.precoMedioKg : null, b ? pct(a.precoMedioKg, b.precoMedioKg) : null),
  ];
}

function pct(a: number, b: number): number | null {
  if (!b) return null;
  return Math.round(((a - b) / Math.abs(b)) * 1000) / 10;
}

function tabelaClientes(itens: ClienteAnalisado[], rotuloA: string, rotuloB: string | null): AnaliseBloco["tabela"] {
  return {
    colunas: ["Cliente", "Grupo econômico", `Faturamento ${rotuloA}`, rotuloB ? `Faturamento ${rotuloB}` : "Volume", "Diferença R$", "Diferença kg", "Situação"],
    linhas: itens.slice(0, 20).map((c) => [
      c.nome,
      c.grupo ?? "—",
      fmtBRL(c.fatA),
      rotuloB ? fmtBRL(c.fatB) : fmtKg(c.kgA),
      fmtBRL(c.deltaFat),
      fmtKg(c.deltaKg),
      c.status,
    ]),
  };
}

function tabelaProdutos(itens: ProdutoAnalisado[], rotuloA: string, rotuloB: string | null): AnaliseBloco["tabela"] {
  return {
    colunas: ["Produto", `Faturamento ${rotuloA}`, rotuloB ? `Faturamento ${rotuloB}` : "Volume", "Diferença R$", `Volume ${rotuloA}`, "Diferença kg", "Var. %"],
    linhas: itens.slice(0, 20).map((p) => [
      p.nome,
      fmtBRL(p.fatA),
      rotuloB ? fmtBRL(p.fatB) : fmtKg(p.kgA),
      fmtBRL(p.deltaFat),
      fmtKg(p.kgA),
      fmtKg(p.deltaKg),
      fmtPct(p.deltaKgPct),
    ]),
  };
}

// ------------------------------------------------------------------ motor
export function responderSemIA(pergunta: string, ctx: AnalysisContext): SaidaMotor {
  const intencaoBase = classificarIntencao(pergunta);
  if (!intencaoBase) {
    return {
      ok: false,
      motivo:
        "Esta pergunta exige uma análise interpretativa e não pode ser respondida no modo Consulta de Dados sem IA.",
    };
  }

  const rotuloA = ctx.comparacao.rotuloA;
  const rotuloB = ctx.comparacao.rotuloB;
  const vend = vendedorCitado(pergunta, ctx);
  const intencao: IntencaoConsulta =
    vend && (intencaoBase === "resumo_empresa" || intencaoBase === "ranking_vendedores") ? "vendedor_especifico" : intencaoBase;

  const blocos: AnaliseBloco[] = [];
  let titulo = "Consulta de dados";
  let resumo = "";

  const cabecalho: AnaliseBloco = {
    tipo: "kpis",
    titulo: `Indicadores do recorte — ${ctx.comparacao.descricao}`,
    kpis: kpisEmpresa(ctx),
  };

  switch (intencao) {
    case "vendedor_especifico": {
      const v = vend!;
      titulo = `Desempenho de ${v.nome}`;
      resumo =
        `**${v.nome}** faturou **${fmtBRL(v.fatA)}** e vendeu **${fmtKg(v.kgA)}** em ${rotuloA}` +
        (rotuloB
          ? `, contra ${fmtBRL(v.fatB)} e ${fmtKg(v.kgB)} em ${rotuloB} (${fmtPct(v.deltaFatPct)} em faturamento).`
          : ".") +
        ` Foram ${fmtNum(v.pedidosA)} pedidos e ${fmtNum(v.clientesA)} clientes atendidos.`;
      blocos.push({
        tipo: "kpis",
        titulo: `Números de ${v.nome} — ${rotuloA}`,
        kpis: [
          { label: "Faturamento", valor: fmtBRL(v.fatA), variacao: rotuloB ? fmtPct(v.deltaFatPct) : undefined, sentido: sentidoDe(v.deltaFat) },
          { label: "Volume", valor: fmtKg(v.kgA), variacao: rotuloB ? fmtPct(v.deltaKgPct) : undefined, sentido: sentidoDe(v.deltaKg) },
          { label: "Pedidos", valor: fmtNum(v.pedidosA) },
          { label: "Clientes atendidos", valor: fmtNum(v.clientesA) },
          { label: "Ticket médio", valor: fmtBRL(v.ticketA) },
        ],
      });
      blocos.push({
        tipo: "tabela",
        titulo: "Todos os vendedores do recorte",
        tabela: tabelaComparada([...ctx.vendedores].sort((a, b) => b.fatA - a.fatA), rotuloA, rotuloB, 30),
      });
      break;
    }
    case "ranking_vendedores": {
      titulo = "Ranking de vendedores";
      const ord = [...ctx.vendedores].sort((a, b) => b.fatA - a.fatA);
      resumo = ord.length
        ? `Ranking por faturamento em ${rotuloA}. Líder: **${ord[0].nome}** com ${fmtBRL(ord[0].fatA)}.`
        : "Não há vendedores com vendas no recorte selecionado.";
      blocos.push({ tipo: "tabela", titulo: `Vendedores — ${rotuloA}`, tabela: tabelaComparada(ord, rotuloA, rotuloB, 30) });
      if (ctx.equipe?.consolidado) {
        const e = ctx.equipe.consolidado;
        blocos.push({
          tipo: "kpis",
          titulo: `${ctx.equipe.nome} (consolidado)`,
          kpis: [
            { label: "Faturamento", valor: fmtBRL(e.fatA), variacao: rotuloB ? fmtPct(e.deltaFatPct) : undefined, sentido: sentidoDe(e.deltaFat) },
            { label: "Volume", valor: fmtKg(e.kgA), variacao: rotuloB ? fmtPct(e.deltaKgPct) : undefined, sentido: sentidoDe(e.deltaKg) },
            { label: "Clientes", valor: fmtNum(e.clientesA) },
          ],
        });
      }
      break;
    }
    case "produtos_queda":
    case "produtos_crescimento": {
      const alta = intencao === "produtos_crescimento";
      titulo = alta ? "Produtos que mais cresceram" : "Produtos que mais caíram";
      const itens = alta ? ctx.produtos.maioresCrescimentos : ctx.produtos.maioresQuedas;
      resumo = itens.length
        ? `${itens.length} produto(s) listados por variação de ${alta ? "crescimento" : "queda"} entre ${rotuloA}${rotuloB ? ` e ${rotuloB}` : ""}. ` +
          `Destaque: **${itens[0].nome}** (${fmtBRL(itens[0].deltaFat)} / ${fmtKg(itens[0].deltaKg)}).`
        : "Não há variação de produtos calculável no recorte selecionado.";
      blocos.push({ tipo: "tabela", titulo, tabela: tabelaProdutos(itens, rotuloA, rotuloB) });
      blocos.push({ tipo: "tabela", titulo: "Famílias de produto", tabela: tabelaComparada([...ctx.familias].sort((a, b) => b.fatA - a.fatA), rotuloA, rotuloB, 20) });
      break;
    }
    case "clientes_queda":
    case "clientes_crescimento": {
      const alta = intencao === "clientes_crescimento";
      titulo = alta ? "Clientes que mais cresceram" : "Clientes que mais caíram";
      const itens = alta ? ctx.clientes.maioresCrescimentos : ctx.clientes.maioresQuedas;
      const r = ctx.clientes.resumo;
      resumo =
        `${fmtNum(r.ativosA)} clientes ativos em ${rotuloA}` +
        (rotuloB ? ` contra ${fmtNum(r.ativosB)} em ${rotuloB}` : "") +
        `. Novos: ${fmtNum(r.novos)} · Perdidos: ${fmtNum(r.perdidos)} · Recuperados: ${fmtNum(r.recuperados)} · Com redução forte: ${fmtNum(r.comReducaoForte)}.`;
      blocos.push({ tipo: "tabela", titulo, tabela: tabelaClientes(itens, rotuloA, rotuloB) });
      break;
    }
    case "clientes_novos":
      titulo = "Clientes novos no período";
      resumo = `${fmtNum(ctx.clientes.novos.length)} cliente(s) com primeira compra em ${rotuloA}.`;
      blocos.push({ tipo: "tabela", titulo, tabela: tabelaClientes(ctx.clientes.novos, rotuloA, rotuloB) });
      break;
    case "clientes_perdidos":
      titulo = "Clientes perdidos";
      resumo = `${fmtNum(ctx.clientes.perdidos.length)} cliente(s) compravam em ${rotuloB ?? "período anterior"} e não compraram em ${rotuloA}.`;
      blocos.push({ tipo: "tabela", titulo, tabela: tabelaClientes(ctx.clientes.perdidos, rotuloA, rotuloB) });
      break;
    case "clientes_recuperados":
      titulo = "Clientes recuperados";
      resumo = `${fmtNum(ctx.clientes.recuperados.length)} cliente(s) voltaram a comprar em ${rotuloA}.`;
      blocos.push({ tipo: "tabela", titulo, tabela: tabelaClientes(ctx.clientes.recuperados, rotuloA, rotuloB) });
      break;
    case "grupos": {
      titulo = "Grupos econômicos consolidados";
      const ord = [...ctx.grupos.consolidados].sort((a, b) => b.fatA - a.fatA);
      resumo = `${ord.length} grupo(s) econômico(s) consolidados (matriz + filiais) no recorte de ${rotuloA}.`;
      blocos.push({ tipo: "tabela", titulo, tabela: tabelaComparada(ord, rotuloA, rotuloB, 25) });
      break;
    }
    case "evolucao": {
      titulo = "Evolução do período";
      const meses = ctx.evolucao.mensal ?? [];
      resumo = meses.length
        ? `Evolução mês a mês do recorte selecionado.${ctx.evolucao.tendencia ? ` Tendência calculada: ${ctx.evolucao.tendencia}.` : ""}`
        : "Não há meses suficientes no recorte para montar a evolução.";
      if (meses.length) {
        blocos.push({
          tipo: "grafico",
          titulo: "Faturamento por mês",
          grafico: {
            tipo: "linha",
            categorias: meses.map((m) => m.rotulo),
            series: [{ nome: "Faturamento (R$)", valores: meses.map((m) => m.faturamento) }],
            unidade: "R$",
          },
        });
        blocos.push({
          tipo: "tabela",
          titulo: "Detalhamento mensal",
          tabela: {
            colunas: ["Mês", "Faturamento", "Volume", "Pedidos", "Clientes", "Var. % vs mês anterior"],
            linhas: meses.map((m) => [m.rotulo, fmtBRL(m.faturamento), fmtKg(m.kg), fmtNum(m.pedidos), fmtNum(m.clientes), fmtPct(m.variacaoPctVsMesAnterior)]),
          },
        });
      }
      break;
    }
    case "migracao": {
      titulo = "Migração de produtos";
      const migs = ctx.migracao ?? [];
      resumo = migs.length
        ? migs
            .map(
              (m) =>
                `**${m.nome}**: ${m.migracaoDireta.length} cliente(s) migraram, ${m.naoConvertidos.length} não convertidos, ` +
                `taxa de migração ${m.taxaMigracaoPct == null ? "—" : `${m.taxaMigracaoPct}%`}.`,
            )
            .join("\n")
        : "Nenhuma régua de migração aplicável ao recorte selecionado.";
      for (const m of migs) {
        blocos.push({
          tipo: "kpis",
          titulo: m.nome,
          kpis: [
            { label: "Clientes migrados", valor: fmtNum(m.migracaoDireta.length) },
            { label: "Não convertidos", valor: fmtNum(m.naoConvertidos.length), sentido: "negativo" },
            { label: "Expansão (novos)", valor: fmtNum(m.expansao.length), sentido: "positivo" },
            { label: "Taxa de migração", valor: m.taxaMigracaoPct == null ? "—" : `${m.taxaMigracaoPct}%` },
            { label: "Volume perdido (linha antiga)", valor: fmtKg(m.volumePerdidoOrigemKg), sentido: "negativo" },
            { label: "Volume ganho (substitutos)", valor: fmtKg(m.volumeGanhoSubstitutosKg), sentido: "positivo" },
            { label: "Recuperação de volume", valor: m.percentualRecuperacaoVolume == null ? "—" : `${m.percentualRecuperacaoVolume}%` },
            { label: "Recuperação de faturamento", valor: m.percentualRecuperacaoFaturamento == null ? "—" : `${m.percentualRecuperacaoFaturamento}%` },
          ],
          detalhes: {
            titulo: "Clientes ainda não convertidos",
            colunas: ["Cliente", "Grupo econômico", "Volume anterior", "Faturamento anterior", "Comprou outros produtos"],
            linhas: m.naoConvertidos.map((c) => [c.cliente, c.grupo ?? "—", fmtKg(c.kgAntes), fmtBRL(c.faturamentoAntes), c.comprouOutrosProdutos ? "Sim" : "Não"]),
          },
        });
      }
      break;
    }
    case "resumo_empresa":
    default: {
      titulo = "Resumo do recorte comercial";
      const a = ctx.empresa.A;
      const b = ctx.empresa.B;
      resumo =
        `Faturamento de **${fmtBRL(a.faturamento)}** e volume de **${fmtKg(a.kg)}** em ${rotuloA}` +
        (b && rotuloB
          ? `, contra ${fmtBRL(b.faturamento)} e ${fmtKg(b.kg)} em ${rotuloB} — diferença de ${fmtBRL(a.faturamento - b.faturamento)} (${fmtPct(pct(a.faturamento, b.faturamento))}).`
          : ".") +
        ` ${fmtNum(a.pedidos)} pedidos e ${fmtNum(a.clientes)} clientes ativos.`;
      blocos.push({
        tipo: "tabela",
        titulo: "Vendedores",
        tabela: tabelaComparada([...ctx.vendedores].sort((x, y) => y.fatA - x.fatA), rotuloA, rotuloB, 20),
      });
      break;
    }
  }

  blocos.unshift(cabecalho);

  const analise: AnaliseEstruturada = {
    titulo,
    resumo_executivo: resumo,
    periodo_descricao: ctx.comparacao.descricao,
    comparacao_descricao: ctx.comparacao.descricao,
    blocos,
    fatos: (ctx.alertas ?? []).length ? undefined : undefined,
    alertas_dados: ctx.alertas?.length ? ctx.alertas : undefined,
    leitura_gerencial: "",
    origem: "consulta",
  };

  return { ok: true, intencao, analise };
}
