import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesData, shortVendedorName, type SaleRow } from "./useSalesData";
import { calcularFaturamentoTodosMesesPorVendedor } from "@/lib/faturamentoMensal";
import { calcPlanoEsforco } from "@/lib/planoVendedor";

export interface VendorMetaOverride {
  vendedor: string;
  year_month: string;
  meta_gasolina: number | null;
  meta_verde: number | null;
  meta_aceleracao: number | null;
  meta_azul: number | null;
}

// Team vendedores (short names)
export const TEAM_VENDEDORES = ["Ednei", "Henrique", "João Paulo", "Juliano", "Raiane"];

export interface MetaConfig {
  pct_gasolina: number;
  pct_verde: number;
  pct_roxa: number;
  pct_azul: number;
  valor_fixo_gasolina?: number | null;
  valor_fixo_verde?: number | null;
  valor_fixo_azul?: number | null;
}

export interface VendedorMeta {
  vendedor: string;
  media3meses: number;
  metaImpulso: number;
  metaGasolina: number;  // kept for backward compat, = metaImpulso
  metaPerformance: number;
  metaVerde: number;     // kept for backward compat, = metaPerformance
  metaAceleracao: number;
  metaRoxa: number;      // kept for backward compat, = metaAceleracao
  metaExcelencia: number;
  metaAzul: number;      // kept for backward compat, = metaExcelencia
  faturamentoMes: number;
  percentualAtingido: number;
  faltaImpulso: number;
  faltaPerformance: number;
  faltaAceleracao: number;
  faltaExcelencia: number;
  // legacy aliases
  faltaGasolina: number;
  faltaVerde: number;
  faltaRoxa: number;
  faltaAzul: number;
  mediaDiaria: number;
  projecaoMes: number;
  necessarioDiaGasolina: number;
  necessarioDiaVerde: number;
  necessarioDiaRoxa: number;
  necessarioDiaAzul: number;
  faturamentoMesAnteriorAno: number | null;
  statusCor: "red" | "yellow" | "green" | "blue";
}

export interface DiasUteis {
  passados: number;
  restantes: number;
  total: number;
}

// ---- Working days calculation ----
export function calcDiasUteis(year: number, month: number): DiasUteis {
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  let total = 0;
  let passados = 0;

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) {
      total++;
      if (date <= today && !(date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() > today.getDate())) {
        passados++;
      }
    }
  }

  // If we're in a future month, passados = 0
  if (year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth())) {
    passados = 0;
  }
  // If we're in a past month, passados = total
  if (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth())) {
    passados = total;
  }

  return { passados, restantes: total - passados, total };
}

// ---- Aggregate faturamento by vendedor by month ----
export type FaturamentoByVendedorMonth = Map<string, Map<string, number>>;

export function getFaturamentoByVendedorMonth(sales: SaleRow[]): FaturamentoByVendedorMonth {
  // Delega para a FONTE ÚNICA. Ranking, Metas e Pagamento usam o mesmo agrupamento.
  return calcularFaturamentoTodosMesesPorVendedor(sales);
}

function getPrev3MonthKeys(year: number, month: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 3; i++) {
    let m = month - i;
    let y = year;
    while (m < 0) { m += 12; y--; }
    keys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return keys;
}

function getSameMonthLastYearKey(year: number, month: number): string {
  return `${year - 1}-${String(month + 1).padStart(2, "0")}`;
}

// ---- Hook: vendor metas (per-vendor fixed values) ----
export function useVendorMetas(yearMonth?: string) {
  return useQuery({
    queryKey: ["vendor-metas", yearMonth],
    queryFn: async () => {
      let query = supabase.from("vendor_metas").select("*");
      if (yearMonth) query = query.eq("year_month", yearMonth);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as (VendorMetaOverride & { id: string })[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertVendorMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meta: VendorMetaOverride) => {
      const { error } = await supabase
        .from("vendor_metas")
        .upsert({
          vendedor: meta.vendedor,
          year_month: meta.year_month,
          meta_gasolina: meta.meta_gasolina,
          meta_verde: meta.meta_verde,
          meta_aceleracao: meta.meta_aceleracao,
          meta_azul: meta.meta_azul,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "vendedor,year_month" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-metas"] }),
  });
}

// ---- Hook: meta config ----
export function useMetaConfig() {
  return useQuery({
    queryKey: ["meta-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_config")
        .select("*")
        .eq("id", "global")
        .single();
      if (error) throw error;
      return data as MetaConfig & { id: string; updated_at: string };
    },
    staleTime: 60_000,
  });
}

export function useUpdateMetaConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: MetaConfig) => {
      const { error } = await supabase
        .from("meta_config")
        .update({
          pct_gasolina: config.pct_gasolina,
          pct_verde: config.pct_verde,
          pct_roxa: config.pct_roxa,
          pct_azul: config.pct_azul,
          valor_fixo_gasolina: config.valor_fixo_gasolina ?? null,
          valor_fixo_verde: config.valor_fixo_verde ?? null,
          valor_fixo_azul: config.valor_fixo_azul ?? null,
        })
        .eq("id", "global");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-config"] }),
  });
}

// ---- Main computation ----
export function computeVendedorMetas(
  sales: SaleRow[],
  config: MetaConfig,
  year: number,
  month: number,
  vendorOverrides?: VendorMetaOverride[],
  vendedoresList?: string[],
): VendedorMeta[] {
  const faturamentoMap = getFaturamentoByVendedorMonth(sales);
  return computeVendedorMetasFromMap(faturamentoMap, config, year, month, vendorOverrides, vendedoresList);
}

export function computeVendedorMetasFromMap(
  faturamentoMap: FaturamentoByVendedorMonth,
  config: MetaConfig,
  year: number,
  month: number,
  vendorOverrides?: VendorMetaOverride[],
  vendedoresList?: string[],
): VendedorMeta[] {
  const prev3Keys = getPrev3MonthKeys(year, month);
  const sameLastYearKey = getSameMonthLastYearKey(year, month);
  const currentKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const dias = calcDiasUteis(year, month);
  const teamList = vendedoresList && vendedoresList.length > 0 ? vendedoresList : TEAM_VENDEDORES;

  // Build lookup for vendor overrides
  const overrideMap = new Map<string, VendorMetaOverride>();
  if (vendorOverrides) {
    for (const vo of vendorOverrides) {
      overrideMap.set(vo.vendedor, vo);
    }
  }

  return teamList.map((vend) => {
    const vm = faturamentoMap.get(vend) || new Map<string, number>();
    const vendorOvr = overrideMap.get(vend);

    // Media 3 meses
    const prev3Values = prev3Keys.map((k) => vm.get(k) || 0);
    const validMonths = prev3Values.filter((v) => v > 0);
    const media3meses = validMonths.length > 0
      ? validMonths.reduce((a, b) => a + b, 0) / validMonths.length
      : 0;

    // DB column mapping: meta_gasolina=Impulso, meta_verde=Performance, meta_aceleracao=Aceleração, meta_azul=Excelência
    // Per-vendor fixed value takes priority, then global fixed, then percentage
    const metaImpulso = (vendorOvr?.meta_gasolina != null && vendorOvr.meta_gasolina > 0)
      ? vendorOvr.meta_gasolina
      : (config.valor_fixo_gasolina != null && config.valor_fixo_gasolina > 0)
        ? config.valor_fixo_gasolina
        : media3meses * (1 + config.pct_gasolina / 100);

    const metaPerformance = (vendorOvr?.meta_verde != null && vendorOvr.meta_verde > 0)
      ? vendorOvr.meta_verde
      : (config.valor_fixo_verde != null && config.valor_fixo_verde > 0)
        ? config.valor_fixo_verde
        : metaImpulso * (1 + config.pct_verde / 100);

    const metaAceleracao = (vendorOvr?.meta_aceleracao != null && vendorOvr.meta_aceleracao > 0)
      ? vendorOvr.meta_aceleracao
      : metaImpulso * (1 + config.pct_roxa / 100);

    const metaExcelencia = (vendorOvr?.meta_azul != null && vendorOvr.meta_azul > 0)
      ? vendorOvr.meta_azul
      : (config.valor_fixo_azul != null && config.valor_fixo_azul > 0)
        ? config.valor_fixo_azul
        : metaImpulso * (1 + config.pct_azul / 100);

    // Faturamento atual
    const faturamentoMes = vm.get(currentKey) || 0;

    // Percentual atingido (relativo à meta performance que é o target principal)
    const percentualAtingido = metaPerformance > 0 ? (faturamentoMes / metaPerformance) * 100 : 0;

    // Falta
    const faltaImpulso = Math.max(0, metaImpulso - faturamentoMes);
    const faltaPerformance = Math.max(0, metaPerformance - faturamentoMes);
    const faltaAceleracao = Math.max(0, metaAceleracao - faturamentoMes);
    const faltaExcelencia = Math.max(0, metaExcelencia - faturamentoMes);

    // Media diária
    const mediaDiaria = dias.passados > 0 ? faturamentoMes / dias.passados : 0;

    // Projeção
    const projecaoMes = mediaDiaria * dias.total;

    // Necessário por dia — usa DIAS OPERACIONAIS (dias úteis restantes do mês
    // + 2 dias úteis de janela de entrega). Fonte única em `diasOperacionais.ts`.
    // Vendedores configurados "por rotas" (ex.: Ednei) usam ROTAS RESTANTES como divisor.
    const plano = calcPlanoEsforco(shortVendedorName(vend), new Date(year, month, 15));
    const dr = plano.unidadesRestantes || 1;
    const necessarioDiaGasolina = faltaImpulso > 0 ? faltaImpulso / dr : 0;
    const necessarioDiaVerde = faltaPerformance > 0 ? faltaPerformance / dr : 0;
    const necessarioDiaRoxa = faltaAceleracao > 0 ? faltaAceleracao / dr : 0;
    const necessarioDiaAzul = faltaExcelencia > 0 ? faltaExcelencia / dr : 0;

    // Mesmo mês ano anterior
    const faturamentoMesAnteriorAno = vm.get(sameLastYearKey) ?? null;

    // Status cor based on thresholds
    let statusCor: "red" | "yellow" | "green" | "blue" = "red";
    if (faturamentoMes >= metaExcelencia && metaExcelencia > 0) statusCor = "blue";
    else if (faturamentoMes >= metaAceleracao && metaAceleracao > 0) statusCor = "green";
    else if (faturamentoMes >= metaPerformance && metaPerformance > 0) statusCor = "yellow";

    return {
      vendedor: vend,
      media3meses,
      metaImpulso,
      metaGasolina: metaImpulso,
      metaPerformance,
      metaVerde: metaPerformance,
      metaAceleracao,
      metaRoxa: metaAceleracao,
      metaExcelencia,
      metaAzul: metaExcelencia,
      faturamentoMes,
      percentualAtingido,
      faltaImpulso,
      faltaPerformance,
      faltaAceleracao,
      faltaExcelencia,
      faltaGasolina: faltaImpulso,
      faltaVerde: faltaPerformance,
      faltaRoxa: faltaAceleracao,
      faltaAzul: faltaExcelencia,
      mediaDiaria,
      projecaoMes,
      planoTipo: plano.tipo,
      planoUnidade: plano.unidadeSingular,
      planoUnidadesRestantes: plano.unidadesRestantes,
      planoProximasDatas: plano.proximasDatas,
      planoNota: plano.notaCalendario,
      necessarioDiaGasolina,
      necessarioDiaVerde,
      necessarioDiaRoxa,
      necessarioDiaAzul,
      faturamentoMesAnteriorAno,
      statusCor,
    };
  });
}

// ---- Derive REAL monthly history from sales (faturamento vs META MÉDIA por mês) ----
// Usado para as sequências (streaks) da escada de comissão.
// REGRA HIERÁRQUICA: as metas são degraus cumulativos
// (Meta Média → Meta Combustível → Meta 0,5% → Meta 1%). Atingir QUALQUER degrau
// superior implica ter cumprido a Meta Média. Portanto `meta_atingida` = faturamento
// >= Meta Média (o menor valor entre os degraus configurados).
// O MÊS CORRENTE (em andamento) NUNCA entra no histórico — só competências fechadas.

export function deriveVendorHistoryFromSales(
  sales: SaleRow[],
  vendedor: string,
  config: MetaConfig,
  vendorOverridesAllMonths: VendorMetaOverride[] | undefined,
  uptoYear: number,
  uptoMonth: number,
  monthsBack: number = 24,
): { vendedor: string; year_month: string; faturamento: number; meta_atingida: boolean }[] {
  return deriveVendorHistoryFromMap(
    getFaturamentoByVendedorMonth(sales),
    vendedor,
    config,
    vendorOverridesAllMonths,
    uptoYear,
    uptoMonth,
    monthsBack,
  );
}

export function deriveVendorHistoryFromMap(
  faturamentoMap: FaturamentoByVendedorMonth,
  vendedor: string,
  config: MetaConfig,
  vendorOverridesAllMonths: VendorMetaOverride[] | undefined,
  uptoYear: number,
  uptoMonth: number,
  monthsBack: number = 24,
): { vendedor: string; year_month: string; faturamento: number; meta_atingida: boolean }[] {
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const out: { vendedor: string; year_month: string; faturamento: number; meta_atingida: boolean }[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    let m = uptoMonth - i;
    let y = uptoYear;
    while (m < 0) { m += 12; y--; }
    // Skip future months AND the current (still open) month — só competências fechadas
    if (y > todayY || (y === todayY && m >= todayM)) continue;

    const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
    const overridesForMonth = (vendorOverridesAllMonths ?? []).filter(o => o.year_month === ym);
    const monthMetas = computeVendedorMetasFromMap(faturamentoMap, config, y, m, overridesForMonth, [vendedor]);
    const vm = monthMetas.find(v => v.vendedor === vendedor);
    if (!vm) continue;
    // Only include months that have ANY sales (avoid counting empty months as "miss")
    if (vm.faturamentoMes <= 0) continue;
    // Hierarquia cumulativa: bater qualquer degrau superior implica bater a Meta Média.
    // O menor alvo configurado (> 0) é o piso a ser superado.
    const alvos = [vm.metaImpulso, vm.metaPerformance, vm.metaAceleracao, vm.metaExcelencia].filter(v => v > 0);
    const pisoMetaMedia = alvos.length > 0 ? Math.min(...alvos) : 0;
    const meta_atingida = pisoMetaMedia > 0 && vm.faturamentoMes >= pisoMetaMedia;
    out.push({ vendedor, year_month: ym, faturamento: vm.faturamentoMes, meta_atingida });

  }
  return out;
}

// Monthly evolution data for charts
export function getMonthlyEvolution(
  sales: SaleRow[],
  months: number = 6,
): { month: string; [vendedor: string]: number | string }[] {
  return getMonthlyEvolutionFromMap(getFaturamentoByVendedorMonth(sales), months);
}

export function getMonthlyEvolutionFromMap(
  faturamentoMap: FaturamentoByVendedorMonth,
  months: number = 6,
  vendedoresList?: string[],
): { month: string; [vendedor: string]: number | string }[] {
  const now = new Date();
  const result: { month: string;[vendedor: string]: number | string }[] = [];
  const teamList = vendedoresList && vendedoresList.length > 0 ? vendedoresList : TEAM_VENDEDORES;

  for (let i = months - 1; i >= 0; i--) {
    let m = now.getMonth() - i;
    let y = now.getFullYear();
    while (m < 0) { m += 12; y--; }
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const entry: Record<string, number | string> = { month: `${monthNames[m]}/${y % 100}` };
    for (const v of teamList) {
      const vm = faturamentoMap.get(v) || new Map();
      entry[v] = vm.get(key) || 0;
    }
    result.push(entry as { month: string;[vendedor: string]: number | string });
  }
  return result;
}
