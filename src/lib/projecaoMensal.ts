/**
 * FONTE ÚNICA da PROJEÇÃO MENSAL de faturamento.
 *
 * Todas as telas da Inteligência Comercial (Resumo, Leitura Estratégica,
 * Previsão, Plano de Ação, Alertas, Curva ABC etc.) DEVEM consumir esta
 * função. Nenhum componente pode recalcular a projeção localmente.
 *
 * Regras oficiais (canônicas):
 *  • Base de faturamento: mês CALENDÁRIO da coluna `Data` da planilha.
 *  • Dias úteis: seg–sex do mês (via `calcDiasUteis`), independentemente da
 *    data final do filtro do usuário. Projeção é indicador MENSAL.
 *  • Fórmula: projecao = (fatAcumulado / diasUteisDecorridos) × diasUteisTotal
 *  • Se `diasUteisDecorridos` == 0 (mês futuro) → projeção = 0.
 *
 * Para consultar por vendedor, informe o nome curto (`shortVendedorName`).
 * Para agregado da equipe/carteira, omita `vendedorShort`.
 */
import { shortVendedorName, type SaleRow } from "@/hooks/useSalesData";
import { calcularFaturamentoMensalPorVendedor } from "@/lib/faturamentoMensal";
import { calcDiasOperacionais } from "@/lib/diasOperacionais";

export interface ProjecaoMensal {
  yearMonth: string;
  fatAcumulado: number;
  mediaDiariaUtil: number;
  diasUteisDecorridos: number;
  diasUteisRestantes: number;
  diasUteisTotal: number;
  /** Últimos 2 dias úteis do mês seguinte — janela de entrega. */
  diasEntrega: Date[];
  /** diasUteisRestantes + 2 dias úteis de entrega. Usado no Plano de Ação. */
  diasOperacionaisRestantes: number;
  /** Último dia do mês de referência. */
  ultimoDiaMes: Date;
  projecaoMes: number;
}

function ymOf(refDate: Date): { ym: string; year: number; month: number } {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  return { ym: `${year}-${String(month + 1).padStart(2, "0")}`, year, month };
}

export function calcProjecaoMensal(
  sales: SaleRow[],
  refDate: Date,
  vendedorShort?: string,
  holidays?: Set<string>,
): ProjecaoMensal {
  const { ym } = ymOf(refDate);
  const totals = calcularFaturamentoMensalPorVendedor(sales, ym);

  let fatAcumulado = 0;
  if (vendedorShort) {
    fatAcumulado = totals.get(shortVendedorName(vendedorShort)) ?? 0;
  } else {
    totals.forEach((v) => { fatAcumulado += v; });
  }

  const op = calcDiasOperacionais(refDate, holidays);
  const mediaDiariaUtil = op.diasUteisDecorridos > 0 ? fatAcumulado / op.diasUteisDecorridos : 0;
  const projecaoMes = mediaDiariaUtil * op.diasUteisTotal;

  return {
    yearMonth: ym,
    fatAcumulado,
    mediaDiariaUtil,
    diasUteisDecorridos: op.diasUteisDecorridos,
    diasUteisRestantes: op.diasUteisRestantes,
    diasUteisTotal: op.diasUteisTotal,
    diasEntrega: op.diasEntrega,
    diasOperacionaisRestantes: op.diasOperacionaisRestantes,
    ultimoDiaMes: op.ultimoDiaMes,
    projecaoMes,
  };
}

/**
 * Retorna a projeção mensal para cada vendedor presente em `sales` no mês do
 * `refDate`. Sempre usa `calcProjecaoMensal` internamente para garantir que
 * qualquer lista por vendedor seja BIT-A-BIT idêntica ao número exibido em
 * outras telas para o mesmo vendedor.
 */
export function calcProjecaoMensalPorVendedor(
  sales: SaleRow[],
  refDate: Date,
): Array<{ vendedor: string } & ProjecaoMensal> {
  const { ym } = ymOf(refDate);
  const totals = calcularFaturamentoMensalPorVendedor(sales, ym);
  const out: Array<{ vendedor: string } & ProjecaoMensal> = [];
  totals.forEach((_v, vendedor) => {
    out.push({ vendedor, ...calcProjecaoMensal(sales, refDate, vendedor) });
  });
  return out.sort((a, b) => b.projecaoMes - a.projecaoMes);
}
