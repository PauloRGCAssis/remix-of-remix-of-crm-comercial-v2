/**
 * Comparativo "mesmo ponto operacional" com o mês anterior.
 *
 * NÃO compara por dia do mês. Compara o faturamento acumulado do mês atual
 * com o acumulado do mês anterior no MESMO estágio operacional:
 *
 *  • Vendedores por DIAS (padrão): o ponto do mês anterior é o dia útil em que
 *    também faltavam os mesmos dias úteis restantes (+ a mesma janela fixa de
 *    2 dias úteis de entrega, idêntica nos dois meses).
 *  • Vendedores por ROTAS (ex.: Ednei): o ponto é a MESMA quantidade de rotas
 *    já realizadas (ex.: acumulado até a 3ª rota em cada mês).
 *
 * Reaproveita as mesmas fontes únicas já existentes: `calcDiasOperacionais`
 * (calendário), `listarRotasDoCiclo` (rotas) e as linhas de venda já filtradas
 * pelos filtros da tela.
 */
import { shortVendedorName, type SaleRow } from "@/hooks/useSalesData";
import { calcDiasOperacionais, formatDiaMes } from "@/lib/diasOperacionais";
import { getPlanoConfig, listarRotasDoCiclo } from "@/lib/planoVendedor";

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface ComparativoMesmoPonto {
  modo: "dias" | "rotas";
  /** Rótulo curto da linha ("Mesmo ponto mês anterior" / "Após 3 rotas"). */
  label: string;
  atual: number;
  anterior: number;
  delta: number;
  /** Variação percentual sobre o mês anterior (0 quando não há base). */
  pct: number;
  acima: boolean;
  /** Complemento opcional ("3/5 rotas atuais | mês anterior: 3/4"). */
  detalhe?: string;
  /** Data de corte usada no mês anterior (DD/MM) — exibida no tooltip. */
  cortePrevio?: string;
  /** Quanto o vendedor faturou no mês anterior DEPOIS do ponto equivalente. */
  restanteAnterior: number;
  /** Total faturado no mês anterior (acumulado + restante). */
  totalAnterior: number;
}

/** Soma o faturamento entre duas datas, inclusive. */
function somarIntervalo(
  sales: SaleRow[],
  inicio: Date,
  fim: Date,
  vendedorShort?: string | null,
): number {
  const inicioIso = isoDay(inicio);
  const fimIso = isoDay(fim);
  let total = 0;
  for (const s of sales) {
    const data = String(s.data ?? "").slice(0, 10);
    if (data < inicioIso || data > fimIso) continue;
    if (vendedorShort && shortVendedorName(s.vendedor) !== vendedorShort) continue;
    total += Number(s.preco_total || 0);
  }
  return total;
}

/** Dias úteis (seg–sex) do mês de `refDate`, em ordem. */
function diasUteisDoMes(refDate: Date, holidays?: Set<string>): Date[] {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    if (holidays?.has(isoDay(date))) continue;
    out.push(date);
  }
  return out;
}

export function calcComparativoMesmoPonto(params: {
  sales: SaleRow[];
  /** Linhas oficiais do ciclo anterior, quando vierem do lote mensal fechado. */
  previousCycleSales?: SaleRow[];
  refDate: Date;
  vendedorShort?: string | null;
  /** Faturamento atual já exibido no card (fonte única da tela). */
  faturamentoAtual: number;
  today?: Date;
  holidays?: Set<string>;
}): ComparativoMesmoPonto | null {
  const { sales, previousCycleSales, refDate, vendedorShort, faturamentoAtual, holidays } = params;
  const today = params.today ?? new Date();
  if (!sales || sales.length === 0) return null;

  const prevRef = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
  const previousSales = previousCycleSales ?? sales;

  const cfg = getPlanoConfig(vendedorShort);

  let anterior = 0;
  let label = "Mesmo ponto mês anterior";
  let detalhe: string | undefined;
  let corte: Date | null = null;
  const modo: "dias" | "rotas" = cfg.tipo === "rotas" ? "rotas" : "dias";

  if (modo === "rotas") {
    const rotasAtuais = listarRotasDoCiclo(vendedorShort, refDate, holidays);
    const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const realizadas = rotasAtuais.filter((d) => d <= todayYmd).length;
    if (realizadas === 0) return null;

    const rotasPrev = listarRotasDoCiclo(vendedorShort, prevRef, holidays);
    if (rotasPrev.length === 0) return null;
    const idx = Math.min(realizadas, rotasPrev.length);
    corte = rotasPrev[idx - 1];
    anterior = somarIntervalo(previousSales, prevRef, corte, vendedorShort);
    label = `Após ${realizadas} rota${realizadas > 1 ? "s" : ""}`;
    detalhe = `${realizadas}/${rotasAtuais.length} rotas atuais | mês anterior: ${idx}/${rotasPrev.length}`;
  } else {
    const op = calcDiasOperacionais(refDate, holidays, today);
    const prevDias = diasUteisDoMes(prevRef, holidays);
    if (prevDias.length === 0) return null;
    // Mesmo ponto: restar a mesma quantidade de dias úteis (a janela de
    // entrega é fixa em 2 dias úteis nos dois meses).
    const decorridosPrev = Math.max(0, Math.min(prevDias.length, prevDias.length - op.diasUteisRestantes));
    if (decorridosPrev === 0) return null;
    corte = prevDias[decorridosPrev - 1];
    anterior = somarIntervalo(previousSales, prevRef, corte, vendedorShort);
  }

  const delta = faturamentoAtual - anterior;
  const pct = anterior > 0 ? (delta / anterior) * 100 : 0;

  // Quanto foi faturado no mês anterior DEPOIS do ponto equivalente — ou seja,
  // dentro da mesma janela final (dias válidos restantes + dias de entrega).
  const fimCicloAnterior = modo === "rotas"
    ? listarRotasDoCiclo(vendedorShort, prevRef, holidays).at(-1) ?? new Date(prevRef.getFullYear(), prevRef.getMonth() + 1, 0)
    : calcDiasOperacionais(prevRef, holidays).diasEntrega.at(-1) ?? new Date(prevRef.getFullYear(), prevRef.getMonth() + 1, 0);
  const totalAnterior = somarIntervalo(previousSales, prevRef, fimCicloAnterior, vendedorShort);
  const diaAposCorte = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate() + 1);
  const restanteAnterior = somarIntervalo(previousSales, diaAposCorte, fimCicloAnterior, vendedorShort);

  return {
    modo,
    label,
    atual: faturamentoAtual,
    anterior,
    delta,
    pct,
    acima: delta >= 0,
    detalhe,
    cortePrevio: corte ? formatDiaMes(corte) : undefined,
    restanteAnterior,
    totalAnterior,
  };
}
