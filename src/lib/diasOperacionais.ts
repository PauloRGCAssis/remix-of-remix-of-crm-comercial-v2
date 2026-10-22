/**
 * FONTE ÚNICA de "dias operacionais" usados no Plano de Ação / meta diária.
 *
 * Regra comercial:
 *   Os pedidos precisam ser tirados até o ÚLTIMO DIA do mês, porém a entrega
 *   pode ocorrer nos DOIS PRIMEIROS DIAS ÚTEIS do mês seguinte. Portanto, o
 *   esforço diário necessário para bater a meta considera:
 *
 *     diasOperacionaisRestantes =
 *        (dias úteis restantes do mês até o último dia)
 *        + (2 próximos dias úteis após o último dia do mês — janela de entrega)
 *
 * Regras:
 *   - Dias úteis = seg–sex, excluindo sábado (6) e domingo (0).
 *   - Feriados podem ser informados via parâmetro `holidays` (Set<string> "YYYY-MM-DD").
 *   - A janela de entrega SEMPRE tem 2 dias úteis, buscados sequencialmente
 *     a partir do 1º dia após o último dia do mês (pulando sábados, domingos
 *     e feriados).
 *   - Novos pedidos criados na janela de entrega NÃO contam para a meta do
 *     mês anterior — a janela é apenas de entrega. Faturamento e metas não
 *     são alterados por esta função.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const isBusinessDay = (d: Date, holidays?: Set<string>) => {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  if (holidays && holidays.has(iso(d))) return false;
  return true;
};

/** Retorna os N próximos dias úteis a partir do dia SEGUINTE a `from` (exclusivo). */
export function getNextBusinessDays(from: Date, n: number, holidays?: Set<string>): Date[] {
  const out: Date[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (out.length < n) {
    cur.setDate(cur.getDate() + 1);
    if (isBusinessDay(cur, holidays)) {
      out.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    }
  }
  return out;
}

export interface DiasOperacionais {
  /** Dias úteis já decorridos no mês (até hoje). */
  diasUteisDecorridos: number;
  /** Dias úteis restantes até o último dia do mês (inclui hoje se for útil e ainda não fechado). */
  diasUteisRestantes: number;
  /** Total de dias úteis do mês. */
  diasUteisTotal: number;
  /** Últimos 2 dias úteis pertencentes ao mês SEGUINTE que compõem a janela de entrega. */
  diasEntrega: Date[];
  /** diasUteisRestantes + diasEntrega.length. Base do cálculo de meta diária. */
  diasOperacionaisRestantes: number;
  /** Último dia do mês de referência. */
  ultimoDiaMes: Date;
}

/**
 * Calcula os dias operacionais para o mês de `refDate` considerando "hoje"
 * como referência para o que já decorreu.
 */
export function calcDiasOperacionais(
  refDate: Date,
  holidays?: Set<string>,
  today: Date = new Date(),
): DiasOperacionais {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const ultimoDiaMes = new Date(year, month + 1, 0);
  const totalDays = ultimoDiaMes.getDate();

  const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const refIsPastMonth =
    year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
  const refIsFutureMonth =
    year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());

  let total = 0;
  let passados = 0;
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    if (!isBusinessDay(date, holidays)) continue;
    total++;
    if (!refIsFutureMonth && date <= todayYmd) passados++;
  }
  if (refIsPastMonth) passados = total;
  if (refIsFutureMonth) passados = 0;

  const diasEntrega = getNextBusinessDays(ultimoDiaMes, 2, holidays);
  const diasUteisRestantes = total - passados;

  return {
    diasUteisDecorridos: passados,
    diasUteisRestantes,
    diasUteisTotal: total,
    diasEntrega,
    diasOperacionaisRestantes: diasUteisRestantes + diasEntrega.length,
    ultimoDiaMes,
  };
}

/** Formata "DD/MM" — usado na observação discreta do card do Plano de Ação. */
export const formatDiaMes = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
