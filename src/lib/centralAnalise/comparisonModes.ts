/**
 * Central de Análise — modos de comparação.
 *
 * REGRA: toda variação apresentada precisa dizer explicitamente contra QUAL período
 * está sendo comparada. Este módulo é a fonte única dos rótulos usados na interface,
 * na análise da IA e na apresentação executiva.
 */

export type ComparisonMode =
  | "ano_contra_ano"
  | "trimestre_contra_trimestre"
  | "mes_contra_mes"
  | "periodo_personalizado"
  | "evolucao_no_periodo";

export const COMPARISON_MODE_LABELS: Record<ComparisonMode, string> = {
  ano_contra_ano: "Ano contra ano",
  trimestre_contra_trimestre: "Trimestre contra trimestre",
  mes_contra_mes: "Mês contra mês",
  periodo_personalizado: "Período personalizado",
  evolucao_no_periodo: "Evolução dentro do período",
};

export interface Periodo {
  inicio: string;
  fim: string;
}

export interface PeriodoRotulado extends Periodo {
  rotulo: string;
}

export interface ComparisonConfig {
  modo: ComparisonMode;
  /** ano_contra_ano / periodo_personalizado / evolucao_no_periodo */
  periodoA?: Periodo;
  /** periodo_personalizado */
  periodoB?: Periodo;
  /** trimestre_contra_trimestre */
  trimestreA?: { ano: number; trimestre: 1 | 2 | 3 | 4 };
  trimestreB?: { ano: number; trimestre: 1 | 2 | 3 | 4 };
  /** mes_contra_mes — formato YYYY-MM */
  mesA?: string;
  mesB?: string;
}

export interface ComparisonResolved {
  modo: ComparisonMode;
  modoLabel: string;
  periodoA: PeriodoRotulado;
  /** null apenas no modo "evolução dentro do período" */
  periodoB: PeriodoRotulado | null;
  /** Ex.: "Comparando: 2º trimestre/2026 × 1º trimestre/2026" */
  descricao: string;
  /** Sufixo obrigatório em toda variação. Ex.: "no 2º trimestre/2026 versus 1º trimestre/2026" */
  referenciaTexto: string;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function ultimoDiaDoMes(ano: number, mes1a12: number): string {
  const d = new Date(Date.UTC(ano, mes1a12, 0));
  return d.toISOString().slice(0, 10);
}

export function trimestreRange(ano: number, trimestre: 1 | 2 | 3 | 4): Periodo {
  const mesInicio = (trimestre - 1) * 3 + 1;
  const mesFim = mesInicio + 2;
  return {
    inicio: `${ano}-${String(mesInicio).padStart(2, "0")}-01`,
    fim: ultimoDiaDoMes(ano, mesFim),
  };
}

/** Nunca usar Q1/Q2 — sempre "1º trimestre/2026". */
export function trimestreLabel(ano: number, trimestre: 1 | 2 | 3 | 4): string {
  return `${trimestre}º trimestre/${ano}`;
}

export function mesRange(yyyyMM: string): Periodo {
  const ano = Number(yyyyMM.slice(0, 4));
  const mes = Number(yyyyMM.slice(5, 7));
  return { inicio: `${yyyyMM}-01`, fim: ultimoDiaDoMes(ano, mes) };
}

export function mesLabel(yyyyMM: string): string {
  const ano = yyyyMM.slice(0, 4);
  const mes = Number(yyyyMM.slice(5, 7));
  return `${MESES[mes - 1] ?? yyyyMM}/${ano}`;
}

export function mesLabelCurto(yyyyMM: string): string {
  const ano = yyyyMM.slice(0, 4);
  const mes = Number(yyyyMM.slice(5, 7));
  return `${MESES_CURTOS[mes - 1] ?? yyyyMM}/${ano}`;
}

export function fmtDataBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function shiftAno(iso: string, anos: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  // 29/02 → 28/02 em ano não bissexto
  const ultimo = Number(ultimoDiaDoMes(y + anos, m).slice(8, 10));
  return `${y + anos}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

const ORDINAIS = ["primeiro", "segundo", "terceiro", "quarto"];

/**
 * Reconhece automaticamente trimestres e semestres exatos.
 * Nunca usar Q1/Q2 — sempre "primeiro trimestre de 2026".
 */
export function rotuloPeriodoNatural(p: Periodo): string | null {
  if (!p?.inicio || !p?.fim) return null;
  const anoI = Number(p.inicio.slice(0, 4));
  const anoF = Number(p.fim.slice(0, 4));
  if (anoI !== anoF) return null;
  const mesI = Number(p.inicio.slice(5, 7));
  const mesF = Number(p.fim.slice(5, 7));
  if (p.inicio.slice(8, 10) !== "01") return null;
  if (p.fim !== ultimoDiaDoMes(anoF, mesF)) return null;

  if (mesI === 1 && mesF === 12) return `ano de ${anoI}`;
  if (mesF - mesI === 5 && (mesI === 1 || mesI === 7)) {
    return `${ORDINAIS[mesI === 1 ? 0 : 1]} semestre de ${anoI}`;
  }
  if (mesF - mesI === 2 && (mesI - 1) % 3 === 0) {
    return `${ORDINAIS[(mesI - 1) / 3]} trimestre de ${anoI}`;
  }
  return null;
}

/** Rótulo curto de um intervalo: "Jan–Jul/2026" quando cabe, senão datas completas. */
export function rotuloPeriodo(p: Periodo): string {
  const natural = rotuloPeriodoNatural(p);
  if (natural) return natural;

  const anoI = p.inicio.slice(0, 4);
  const anoF = p.fim.slice(0, 4);
  const mesI = Number(p.inicio.slice(5, 7));
  const mesF = Number(p.fim.slice(5, 7));
  const comecaNoInicioDoMes = p.inicio.slice(8, 10) === "01";
  const terminaNoFimDoMes = p.fim === ultimoDiaDoMes(Number(anoF), mesF);

  if (anoI === anoF && comecaNoInicioDoMes && terminaNoFimDoMes) {
    if (mesI === mesF) return mesLabel(p.inicio.slice(0, 7));
    if (mesI === 1 && mesF === 12) return `Ano ${anoI}`;
    return `${MESES_CURTOS[mesI - 1]}–${MESES_CURTOS[mesF - 1]}/${anoI}`;
  }
  if (anoI === anoF && comecaNoInicioDoMes) {
    return `${MESES_CURTOS[mesI - 1]}/${anoI} a ${fmtDataBR(p.fim)}`;
  }
  return `${fmtDataBR(p.inicio)} a ${fmtDataBR(p.fim)}`;
}

// ------------------------------------------------------------------ atalhos

export type AtalhoComparacao =
  | "mes_anterior"
  | "mesmo_periodo_ano_anterior"
  | "periodo_anterior_equivalente"
  | "ano_anterior"
  | "sem_comparacao";

export const ATALHO_LABELS: Record<AtalhoComparacao, string> = {
  mes_anterior: "Mês anterior",
  mesmo_periodo_ano_anterior: "Mesmo período ano anterior",
  periodo_anterior_equivalente: "Período anterior equivalente",
  ano_anterior: "Ano anterior",
  sem_comparacao: "Sem comparação",
};

const MS_DIA = 86400000;
function toUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function shiftMes(iso: string, meses: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const total = (y * 12 + (m - 1)) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = Number(ultimoDiaDoMes(ano, mes).slice(8, 10));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** Apenas SUGERE datas para o período de comparação — continuam editáveis. */
export function calcularAtalho(atual: Periodo, atalho: AtalhoComparacao): Periodo | null {
  if (!atual.inicio || !atual.fim) return null;
  switch (atalho) {
    case "mes_anterior":
      return { inicio: shiftMes(atual.inicio, -1), fim: shiftMes(atual.fim, -1) };
    case "mesmo_periodo_ano_anterior":
      return { inicio: shiftAno(atual.inicio, -1), fim: shiftAno(atual.fim, -1) };
    case "periodo_anterior_equivalente": {
      const dias = Math.round((toUTC(atual.fim) - toUTC(atual.inicio)) / MS_DIA) + 1;
      const fim = fromUTC(toUTC(atual.inicio) - MS_DIA);
      const inicio = fromUTC(toUTC(fim) - (dias - 1) * MS_DIA);
      return { inicio, fim };
    }
    case "ano_anterior": {
      const ano = Number(atual.inicio.slice(0, 4)) - 1;
      return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
    }
    case "sem_comparacao":
    default:
      return null;
  }
}

export function resolveComparison(cfg: ComparisonConfig): ComparisonResolved {
  const modoLabel = COMPARISON_MODE_LABELS[cfg.modo];

  const montar = (a: Periodo, b: Periodo | null, rotA?: string, rotB?: string): ComparisonResolved => {
    const periodoA: PeriodoRotulado = { ...a, rotulo: rotA ?? rotuloPeriodo(a) };
    const periodoB: PeriodoRotulado | null = b ? { ...b, rotulo: rotB ?? rotuloPeriodo(b) } : null;
    return {
      modo: cfg.modo,
      modoLabel,
      periodoA,
      periodoB,
      descricao: periodoB
        ? `Comparando: ${periodoA.rotulo} × ${periodoB.rotulo}`
        : `Evolução dentro do período: ${periodoA.rotulo}`,
      referenciaTexto: periodoB
        ? `em ${periodoA.rotulo} versus ${periodoB.rotulo}`
        : `ao longo de ${periodoA.rotulo}`,
    };
  };

  switch (cfg.modo) {
    case "ano_contra_ano": {
      const a = cfg.periodoA ?? { inicio: "", fim: "" };
      const b: Periodo = { inicio: shiftAno(a.inicio, -1), fim: shiftAno(a.fim, -1) };
      return montar(a, b);
    }
    case "trimestre_contra_trimestre": {
      const ta = cfg.trimestreA ?? { ano: new Date().getUTCFullYear(), trimestre: 1 as const };
      const tb = cfg.trimestreB ?? { ano: ta.ano, trimestre: (ta.trimestre === 1 ? 4 : (ta.trimestre - 1)) as 1 | 2 | 3 | 4 };
      return montar(
        trimestreRange(ta.ano, ta.trimestre),
        trimestreRange(tb.ano, tb.trimestre),
        trimestreLabel(ta.ano, ta.trimestre),
        trimestreLabel(tb.ano, tb.trimestre),
      );
    }
    case "mes_contra_mes": {
      const ma = cfg.mesA ?? new Date().toISOString().slice(0, 7);
      const mb = cfg.mesB ?? ma;
      return montar(mesRange(ma), mesRange(mb), mesLabel(ma), mesLabel(mb));
    }
    case "periodo_personalizado": {
      const a = cfg.periodoA ?? { inicio: "", fim: "" };
      const b = cfg.periodoB ?? null;
      return montar(a, b);
    }
    case "evolucao_no_periodo":
    default: {
      const a = cfg.periodoA ?? { inicio: "", fim: "" };
      return montar(a, null);
    }
  }
}

/**
 * Sufixo obrigatório para qualquer variação apresentada.
 * Ex.: variacaoTexto(-27.6, cmp) → "-27,6% no 2º trimestre/2026 versus 1º trimestre/2026"
 */
export function variacaoTexto(pct: number | null, cmp: ComparisonResolved): string {
  if (pct === null || !Number.isFinite(pct)) return `sem base comparável ${cmp.referenciaTexto}`;
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${cmp.referenciaTexto}`;
}

/** Rótulo da coluna de referência em tabelas — nunca usar apenas "base". */
export function rotuloColunaReferencia(cmp: ComparisonResolved): string {
  return cmp.periodoB ? `${cmp.periodoB.rotulo} (período de referência)` : "Período de referência";
}
