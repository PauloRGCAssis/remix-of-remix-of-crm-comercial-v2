import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type SaleRow, shortVendedorName } from "./useSalesData";
import { TEAM_VENDEDORES } from "./useMetasData";
import { clientKey } from "@/lib/clientClassification";

// ---- Performance Tiers (progressive thresholds) ----
export const PERFORMANCE_TIERS = [
  { key: "impulso", label: "Meta Média", reward: "Comissão mantida", pct: 90, color: "#eab308", icon: "🔥" },
  { key: "performance", label: "Meta Combustível", reward: "Combustível", pct: 100, color: "#f97316", icon: "⚡" },
  { key: "aceleracao", label: "Meta 0,5%", reward: "+0,5% comissão", pct: 110, color: "#22c55e", icon: "🚀" },
  { key: "excelencia", label: "Meta 1%", reward: "+1% comissão", pct: 110, color: "#3b82f6", icon: "👑" },
] as const;

// ---- Progressive tier fill calculation ----
export interface ProgressiveTierFill {
  impulso: number;   // 0-100 fill of this band
  performance: number;
  aceleracao: number;
  excelencia: number;
  nivelAtual: string;
  pctTotal: number;
}

/**
 * Calculate progressive tier fill using absolute meta thresholds.
 * Each band fills 0-100% based on faturamento position between thresholds.
 * Overload 1: (pctMeta) - legacy percentage-based (fallback)
 * Overload 2: (faturamento, metaImpulso, metaPerformance, metaAceleracao, metaExcelencia) - absolute values
 */
export function calcProgressiveTierFill(
  faturamentoOrPct: number,
  metaImpulso?: number,
  metaPerformance?: number,
  metaAceleracao?: number,
  metaExcelencia?: number,
): ProgressiveTierFill {
  // If called with 4 meta values, use absolute threshold logic
  if (metaImpulso != null && metaPerformance != null && metaAceleracao != null && metaExcelencia != null) {
    const fat = faturamentoOrPct;

    // Impulso: 0 → metaImpulso
    const impulso = metaImpulso > 0
      ? Math.min(Math.max(fat / metaImpulso, 0), 1) * 100
      : (fat > 0 ? 100 : 0);

    // Performance: metaImpulso → metaPerformance
    const perfRange = metaPerformance - metaImpulso;
    const performance = fat >= metaImpulso && perfRange > 0
      ? Math.min((fat - metaImpulso) / perfRange, 1) * 100
      : fat >= metaPerformance && metaPerformance > 0 ? 100 : 0;

    // Aceleração: metaPerformance → metaAceleracao
    const acelRange = metaAceleracao - metaPerformance;
    const aceleracao = fat >= metaPerformance && acelRange > 0
      ? Math.min((fat - metaPerformance) / acelRange, 1) * 100
      : fat >= metaAceleracao && metaAceleracao > 0 ? 100 : 0;

    // Excelência: metaAceleracao → metaExcelencia
    const excelRange = metaExcelencia - metaAceleracao;
    const excelencia = fat >= metaAceleracao && excelRange > 0
      ? Math.min((fat - metaAceleracao) / excelRange, 1) * 100
      : fat >= metaExcelencia && metaExcelencia > 0 ? 100 : 0;

    let nivelAtual: string;
    if (fat >= metaExcelencia && metaExcelencia > 0) nivelAtual = "Meta 1%";
    else if (fat >= metaAceleracao && metaAceleracao > 0) nivelAtual = "Meta 0,5%";
    else if (fat >= metaPerformance && metaPerformance > 0) nivelAtual = "Meta Combustível";
    else nivelAtual = "Meta Média";

    const pctTotal = metaPerformance > 0 ? (fat / metaPerformance) * 100 : 0;

    return { impulso, performance, aceleracao, excelencia, nivelAtual, pctTotal };
  }

  // Legacy: percentage-based fallback
  const pctMeta = faturamentoOrPct;
  const impulso = Math.min(Math.max(pctMeta / 90, 0), 1) * 100;
  const performance = pctMeta > 90 ? Math.min((pctMeta - 90) / 10, 1) * 100 : 0;
  const aceleracao = pctMeta > 100 ? Math.min((pctMeta - 100) / 10, 1) * 100 : 0;
  const excelencia = pctMeta > 110 ? Math.min((pctMeta - 110) / 10, 1) * 100 : 0;

  let nivelAtual: string;
  if (pctMeta >= 110) nivelAtual = "Meta 1%";
  else if (pctMeta >= 100) nivelAtual = "Meta 0,5%";
  else if (pctMeta >= 90) nivelAtual = "Meta Combustível";
  else nivelAtual = "Meta Média";

  return { impulso, performance, aceleracao, excelencia, nivelAtual, pctTotal: pctMeta };
}

// ---- Requirements per tier ----
// Escada de Metas: requisito OBRIGATÓRIO de clientes NOVOS VÁLIDOS por nível.
// Cliente novo válido = primeira compra em TODA a base histórica (reativado NÃO conta).
// Cursos foram REMOVIDOS das metas e não interferem em nenhum cálculo.
export const TIER_REQUIREMENTS: Record<string, { minClientes: number }> = {
  impulso: { minClientes: 1 },      // Meta Média
  performance: { minClientes: 3 },  // Meta Combustível
  aceleracao: { minClientes: 4 },   // Meta 0,5%
  excelencia: { minClientes: 5 },   // Meta 1%
};


// ---- Commission Ladder ----
// Everyone STARTS at level 5 (Elite, 10%). Level 0 (Recuperação, 5%) is the floor.
// Regression: 2 consecutive months below meta → drop 1 level.
// Progression: 2 consecutive months hitting meta → climb 1 level.
export const COMMISSION_LEVELS = [
  { level: 0, pct: 5, name: "Recuperação" },
  { level: 1, pct: 6, name: "Base" },
  { level: 2, pct: 7, name: "Bronze" },
  { level: 3, pct: 8, name: "Prata" },
  { level: 4, pct: 9, name: "Ouro" },
  { level: 5, pct: 10, name: "Elite" },
];

export const DEFAULT_COMMISSION_LEVEL = 5;
export const MIN_COMMISSION_LEVEL = 0;
export const MAX_COMMISSION_LEVEL = 5;

export function commissionLevelName(level: number): string {
  return COMMISSION_LEVELS.find(l => l.level === level)?.name ?? "—";
}

// ---- Voucher Gasolina ----
export function calcVoucherGasolina(faturamento: number): number {
  if (faturamento >= 200_000) return 300;
  if (faturamento >= 150_000) return 250;
  if (faturamento >= 100_000) return 200;
  if (faturamento >= 50_000) return 150;
  return 100;
}

// ---- Constância bonus ----
export function calcConstanciaBonus(consecutiveMonths: number): number {
  if (consecutiveMonths >= 12) return 800;
  if (consecutiveMonths >= 9) return 500;
  if (consecutiveMonths >= 6) return 250;
  if (consecutiveMonths >= 3) return 100;
  return 0;
}

// ---- Commission bonus for performance tiers ----
export function calcCommissionBonus(tierKey: string): number {
  if (tierKey === "excelencia") return 1;
  if (tierKey === "aceleracao") return 0.5;
  return 0;
}

// ---- Client Classification ----
export interface ClientClassification {
  cliente: string;
  type: "novo" | "validacao" | "recorrente" | "sem_recompra" | "reativado";
  firstPurchase: string;
  lastPurchase: string;
  totalPurchases: number;
  // Auditoria / validação (preenchidos para todos)
  firstPurchaseValor?: number;
  firstPurchaseVendedor?: string;
  totalNoMes?: number;
  pedidosNoMes?: number;
  /** Faturamento no MÊS ANTERIOR (com este vendedor) — usado p/ validação na UI */
  totalNoMesAnterior?: number;
  pedidosNoMesAnterior?: number;
  temHistoricoAnterior?: boolean;
}

/**
 * Classifica os clientes ATIVOS de um vendedor no mês corrente.
 *
 * REGRA CRÍTICA (corrigida):
 * - "Cliente NOVO" exige que a PRIMEIRA compra histórica do cliente em TODA a base
 *   (todos os vendedores, todos os produtos) ocorra dentro do mês selecionado.
 *   Se o cliente comprou em qualquer mês anterior — mesmo que com outro vendedor —
 *   NÃO pode ser contado como novo. É REATIVADO (se ficou >= 6 meses sem comprar)
 *   ou RECORRENTE/VALIDAÇÃO/SEM_RECOMPRA conforme o caso.
 * - A comparação entre clientes é feita por chave normalizada (acentos, caixa,
 *   sufixos como "(IM)", aliases) para evitar duplicidades.
 */
export function classifyClients(
  sales: SaleRow[],
  vendedor: string,
  year: number,
  month: number,
): ClientClassification[] {
  const currentKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const prevMonthKey = month === 0
    ? `${year - 1}-12`
    : `${year}-${String(month).padStart(2, "0")}`;

  // 1) Primeira compra GLOBAL por chave de cliente (toda a base, todos os vendedores)
  const firstGlobalByKey = new Map<string, Date>();
  // 2) Conjunto de meses (YYYY-MM) em que a chave aparece em TODA a base
  const monthsByKey = new Map<string, Set<string>>();
  // 3) Para o vendedor em questão: meses em que ele vendeu para essa chave
  const vendorMonthsByKey = new Map<string, Set<string>>();
  // 4) Display name preferido (do mês corrente; cai para qualquer outro)
  const displayByKey = new Map<string, string>();
  // 5) Total de pedidos do cliente (na base inteira)
  const totalDatesByKey = new Map<string, Date[]>();
  // 6) Detalhes da primeira compra global
  const firstDetailByKey = new Map<string, { valor: number; vendedor: string }>();
  // 7) Total e pedidos no MÊS CORRENTE para ESTE vendedor
  const monthTotalByKey = new Map<string, { total: number; pedidos: Set<number> }>();
  // 8) Total e pedidos no MÊS ANTERIOR para ESTE vendedor
  const prevMonthTotalByKey = new Map<string, { total: number; pedidos: Set<number> }>();

  for (const s of sales) {
    const k = clientKey(s.cliente);
    if (!k) continue;
    const d = new Date(s.data);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const fg = firstGlobalByKey.get(k);
    if (!fg || d < fg) {
      firstGlobalByKey.set(k, d);
      firstDetailByKey.set(k, { valor: Number(s.preco_total ?? 0), vendedor: shortVendedorName(s.vendedor) });
    }

    let m = monthsByKey.get(k);
    if (!m) { m = new Set(); monthsByKey.set(k, m); }
    m.add(mk);

    let dates = totalDatesByKey.get(k);
    if (!dates) { dates = []; totalDatesByKey.set(k, dates); }
    dates.push(d);

    if (shortVendedorName(s.vendedor) === vendedor) {
      let vm = vendorMonthsByKey.get(k);
      if (!vm) { vm = new Set(); vendorMonthsByKey.set(k, vm); }
      vm.add(mk);
      if (mk === currentKey) {
        displayByKey.set(k, s.cliente);
        let mt = monthTotalByKey.get(k);
        if (!mt) { mt = { total: 0, pedidos: new Set() }; monthTotalByKey.set(k, mt); }
        mt.total += Number(s.preco_total ?? 0);
        mt.pedidos.add(s.codigo_venda);
      } else {
        if (!displayByKey.has(k)) displayByKey.set(k, s.cliente);
        if (mk === prevMonthKey) {
          let pt = prevMonthTotalByKey.get(k);
          if (!pt) { pt = { total: 0, pedidos: new Set() }; prevMonthTotalByKey.set(k, pt); }
          pt.total += Number(s.preco_total ?? 0);
          pt.pedidos.add(s.codigo_venda);
        }
      }
    } else if (!displayByKey.has(k)) {
      displayByKey.set(k, s.cliente);
    }
  }

  const results: ClientClassification[] = [];

  // Set de chaves processadas no atual (p/ identificar SEM_RECOMPRA depois)
  const processedKeys = new Set<string>();

  // Apenas clientes ATIVOS este mês COM ESTE VENDEDOR.
  for (const [k, vmonths] of vendorMonthsByKey.entries()) {
    if (!vmonths.has(currentKey)) continue;
    processedKeys.add(k);

    const allMonths = monthsByKey.get(k) ?? new Set<string>();
    const monthsBefore = Array.from(allMonths).filter(m => m < currentKey).sort();
    const firstGlobal = firstGlobalByKey.get(k)!;
    const firstGlobalMonth = `${firstGlobal.getFullYear()}-${String(firstGlobal.getMonth() + 1).padStart(2, "0")}`;
    const dates = totalDatesByKey.get(k) ?? [];
    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const lastPurchase = sortedDates[sortedDates.length - 1] ?? firstGlobal;

    let type: ClientClassification["type"];

    // Regras (alinhadas com clientClassification.ts):
    // - NOVO:  primeira compra global está no mês atual.
    // - RECORRENTE: comprou também no mês anterior (qualquer vendedor).
    // - REATIVADO: tem histórico anterior global, mas NÃO comprou no mês anterior.
    if (firstGlobalMonth === currentKey) {
      type = "novo";
    } else if (allMonths.has(prevMonthKey)) {
      type = "recorrente";
    } else {
      type = "reativado";
    }

    const fd = firstDetailByKey.get(k);
    const mt = monthTotalByKey.get(k);
    const pt = prevMonthTotalByKey.get(k);
    results.push({
      cliente: displayByKey.get(k) ?? k,
      type,
      firstPurchase: firstGlobal.toISOString(),
      lastPurchase: lastPurchase.toISOString(),
      totalPurchases: dates.length,
      firstPurchaseValor: fd?.valor ?? 0,
      firstPurchaseVendedor: fd?.vendedor ?? "",
      totalNoMes: mt?.total ?? 0,
      pedidosNoMes: mt?.pedidos.size ?? 0,
      totalNoMesAnterior: pt?.total ?? 0,
      pedidosNoMesAnterior: pt?.pedidos.size ?? 0,
      temHistoricoAnterior: monthsBefore.length > 0,
    });
  }

  // SEM_RECOMPRA: cliente comprou com este vendedor no mês anterior, mas NÃO no atual
  for (const [k, pt] of prevMonthTotalByKey.entries()) {
    if (processedKeys.has(k)) continue;
    const fg = firstGlobalByKey.get(k);
    if (!fg) continue;
    const fd = firstDetailByKey.get(k);
    const dates = totalDatesByKey.get(k) ?? [];
    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const lastPurchase = sortedDates[sortedDates.length - 1] ?? fg;
    results.push({
      cliente: displayByKey.get(k) ?? k,
      type: "sem_recompra",
      firstPurchase: fg.toISOString(),
      lastPurchase: lastPurchase.toISOString(),
      totalPurchases: dates.length,
      firstPurchaseValor: fd?.valor ?? 0,
      firstPurchaseVendedor: fd?.vendedor ?? "",
      totalNoMes: 0,
      pedidosNoMes: 0,
      totalNoMesAnterior: pt.total,
      pedidosNoMesAnterior: pt.pedidos.size,
      temHistoricoAnterior: true,
    });
  }

  return results;
}

// ---- Compute current tier ----
export interface TierInfo {
  key: string;
  label: string;
  reward: string;
  pct: number;
  color: string;
  icon: string;
}

export const TIER_ABAIXO: TierInfo = {
  key: "abaixo",
  label: "Abaixo da Meta",
  reward: "",
  pct: 0,
  color: "#ef4444",
  icon: "⚠️",
};

export function computeTier(pctMeta: number): TierInfo {
  if (pctMeta >= 110) return { ...PERFORMANCE_TIERS[3] }; // Excelência
  if (pctMeta >= 100) return { ...PERFORMANCE_TIERS[2] }; // Aceleração
  if (pctMeta >= 90) return { ...PERFORMANCE_TIERS[1] };  // Performance
  if (pctMeta > 0) return { ...PERFORMANCE_TIERS[0] };    // Impulso
  return { ...TIER_ABAIXO };
}

export interface MetasAbsolutas {
  media: number;         // Meta Média (impulso)
  combustivel: number;   // Meta Combustível (performance)
  meta05: number;        // Meta 0,5% (aceleração)
  meta1: number;         // Meta 1% (excelência)
}

/**
 * Tier CONQUISTADO no mês, por valores absolutos de faturamento.
 * Uma meta só é atingida quando o faturamento do mês é >= o valor daquela meta.
 * Abaixo da Meta Média => nenhuma premiação.
 */
export function computeTierAbsoluto(faturamento: number, metas: MetasAbsolutas): TierInfo {
  if (metas.meta1 > 0 && faturamento >= metas.meta1) return { ...PERFORMANCE_TIERS[3] };
  if (metas.meta05 > 0 && faturamento >= metas.meta05) return { ...PERFORMANCE_TIERS[2] };
  if (metas.combustivel > 0 && faturamento >= metas.combustivel) return { ...PERFORMANCE_TIERS[1] };
  if (metas.media > 0 && faturamento >= metas.media) return { ...PERFORMANCE_TIERS[0] };
  return { ...TIER_ABAIXO };
}

/**
 * Metas conquistadas no mês (HIERÁRQUICAS E CUMULATIVAS).
 * Ordem: Meta Média → Meta Combustível → Meta 0,5% → Meta 1%.
 * Cada degrau exige faturamento >= valor da meta E o mínimo de clientes novos válidos.
 * Como valores e requisitos são crescentes, conquistar um degrau superior implica
 * automaticamente ter conquistado todos os anteriores.
 */
export interface TiersConquistados {
  impulso: boolean;      // Meta Média
  performance: boolean;  // Meta Combustível
  aceleracao: boolean;   // Meta 0,5%
  excelencia: boolean;   // Meta 1%
  /** true se conquistou a Meta Média OU qualquer degrau superior */
  metaMedia: boolean;
}

export function computeTiersConquistados(
  faturamento: number,
  metas: MetasAbsolutas,
  clientesNovos: number,
): TiersConquistados {
  const hit = (alvo: number, key: string) =>
    alvo > 0 && faturamento >= alvo && clientesNovos >= (TIER_REQUIREMENTS[key]?.minClientes ?? 0);

  const excelencia = hit(metas.meta1, "excelencia");
  const aceleracao = excelencia || hit(metas.meta05, "aceleracao");
  const performance = aceleracao || hit(metas.combustivel, "performance");
  const impulso = performance || hit(metas.media, "impulso");

  return { impulso, performance, aceleracao, excelencia, metaMedia: impulso };
}

// ---- Validate tier requirements ----
export function validateTierRequirements(
  tierKey: string,
  clientesNovos: number,
): { valid: boolean; faltaClientes: number } {
  // Nenhuma meta de faturamento atingida => nada conquistado.
  if (!tierKey || tierKey === "abaixo") {
    return { valid: false, faltaClientes: 0 };
  }
  const req = TIER_REQUIREMENTS[tierKey];
  if (!req) return { valid: true, faltaClientes: 0 };
  const faltaClientes = Math.max(0, req.minClientes - clientesNovos);
  return { valid: faltaClientes === 0, faltaClientes };
}




// ---- DB hooks ----
export interface VendorMonthlyHistory {
  id: string;
  vendedor: string;
  year_month: string;
  clientes_novos: number;

  clientes_validados: number;
  clientes_sem_recompra: number;
  clientes_reativados: number;
  commission_level: number;
  consecutive_months: number;
  faturamento: number;
  meta_atingida: boolean;
  override_comissao_pct: number | null;
}

export function useVendorHistory(vendedor?: string) {
  return useQuery({
    queryKey: ["vendor-history", vendedor],
    queryFn: async () => {
      let q = supabase.from("vendor_monthly_history").select("*").order("year_month", { ascending: true });
      if (vendedor) q = q.eq("vendedor", vendedor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VendorMonthlyHistory[];
    },
    staleTime: 30_000,
  });
}

export function useVendorHistoryMonth(yearMonth: string) {
  return useQuery({
    queryKey: ["vendor-history-month", yearMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_monthly_history")
        .select("*")
        .eq("year_month", yearMonth);
      if (error) throw error;
      return (data ?? []) as VendorMonthlyHistory[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertVendorHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: Omit<VendorMonthlyHistory, "id">) => {
      const { error } = await supabase
        .from("vendor_monthly_history")
        .upsert({
          vendedor: record.vendedor,
          year_month: record.year_month,
          clientes_novos: record.clientes_novos,

          clientes_validados: record.clientes_validados,
          clientes_sem_recompra: record.clientes_sem_recompra,
          clientes_reativados: record.clientes_reativados,
          commission_level: record.commission_level,
          consecutive_months: record.consecutive_months,
          faturamento: record.faturamento,
          meta_atingida: record.meta_atingida,
          override_comissao_pct: record.override_comissao_pct,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "vendedor,year_month" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-history"] });
      qc.invalidateQueries({ queryKey: ["vendor-history-month"] });
    },
  });
}

// ---- Compute commission level from history ----
// Rules:
//  - Default starting level = 5 (Elite, 10%)
//  - Drops 1 level for every 2 consecutive missed months
//  - Rises 1 level for every 2 consecutive hit months
//  - Bounded between 0 (5%) and 5 (10%)
export function computeCommissionLevel(history: VendorMonthlyHistory[]): number {
  return computeCommissionStreaks(history).currentLevel;
}

// ---- Compute consecutive months ----
export function computeConsecutiveMonths(history: VendorMonthlyHistory[]): number {
  const sorted = [...history].sort((a, b) => b.year_month.localeCompare(a.year_month));
  let count = 0;
  for (const h of sorted) {
    if (h.meta_atingida) count++;
    else break;
  }
  return count;
}

// ---- Streak info for UI (progressão / regressão) ----
export interface CommissionStreakInfo {
  currentLevel: number;
  currentPct: number;
  currentName: string;
  hitStreak: number;
  missStreak: number;
  nextLevelUp: number | null;
  nextLevelDown: number | null;
  monthsToLevelUp: number;
  monthsToLevelDown: number;
}

export function computeCommissionStreaks(history: VendorMonthlyHistory[]): CommissionStreakInfo {
  const sortedAsc = [...history]
    .filter(h => h && typeof h.meta_atingida === "boolean")
    .sort((a, b) => a.year_month.localeCompare(b.year_month));

  // 1) Compute current commission level by walking history chronologically.
  //    Level moves are consumed in pairs; internal counters reset after a move.
  let level = DEFAULT_COMMISSION_LEVEL;
  let hitAcc = 0;
  let missAcc = 0;
  for (const h of sortedAsc) {
    if (h.meta_atingida) {
      hitAcc += 1;
      missAcc = 0;
      if (hitAcc >= 2) {
        level = Math.min(level + 1, MAX_COMMISSION_LEVEL);
        hitAcc = 0;
      }
    } else {
      missAcc += 1;
      hitAcc = 0;
      if (missAcc >= 2) {
        level = Math.max(level - 1, MIN_COMMISSION_LEVEL);
        missAcc = 0;
      }
    }
  }

  // 2) Compute the TRAILING streak (what the user sees in the card).
  //    Walk from most recent month backwards. Either hit or miss streak is non-zero,
  //    never both. This reflects "is the seller currently hitting or missing?".
  let hitStreak = 0;
  let missStreak = 0;
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    const h = sortedAsc[i];
    if (hitStreak === 0 && missStreak === 0) {
      if (h.meta_atingida) hitStreak = 1;
      else missStreak = 1;
      continue;
    }
    if (hitStreak > 0) {
      if (h.meta_atingida) hitStreak += 1;
      else break;
    } else {
      if (!h.meta_atingida) missStreak += 1;
      else break;
    }
  }

  const currentPct = COMMISSION_LEVELS.find(l => l.level === level)?.pct ?? 5;
  const upPct = level < MAX_COMMISSION_LEVEL
    ? COMMISSION_LEVELS.find(l => l.level === level + 1)?.pct ?? null
    : null;
  const downPct = level > MIN_COMMISSION_LEVEL
    ? COMMISSION_LEVELS.find(l => l.level === level - 1)?.pct ?? null
    : null;

  // Months remaining to trigger the next level move, based on the trailing streak.
  const monthsToLevelUp = hitStreak > 0 ? Math.max(0, 2 - (hitStreak % 2 === 0 ? 2 : hitStreak % 2)) : 2;
  const monthsToLevelDown = missStreak > 0 ? Math.max(0, 2 - (missStreak % 2 === 0 ? 2 : missStreak % 2)) : 2;

  return {
    currentLevel: level,
    currentPct,
    currentName: commissionLevelName(level),
    hitStreak,
    missStreak,
    nextLevelUp: upPct,
    nextLevelDown: downPct,
    monthsToLevelUp,
    monthsToLevelDown,
  };
}

// ---- Full performance summary for a vendor ----
export interface VendorPerformanceSummary {
  vendedor: string;
  faturamento: number;
  metaGasolina: number;
  pctMeta: number;
  tier: TierInfo;
  clientesNovos: number;
  clientesValidados: number;
  clientesSemRecompra: number;
  clientesReativados: number;
  clientesRecorrentes: number;
  commissionLevel: number;
  commissionBasePct: number;
  commissionBonusPct: number;
  commissionFinalPct: number;
  overrideComissao: number | null;
  voucherGasolina: number;
  voucherLiberado: boolean;
  metaAtingidaMes: boolean;
  consecutiveMonths: number;
  constanciaBonus: number;
  tierValid: boolean;
  faltaClientes: number;
  /** Metas conquistadas no mês, de forma hierárquica e cumulativa */
  tiersConquistados: TiersConquistados;
  /** Conquistou a Meta Média (ou qualquer degrau superior) no mês */
  metaMediaAtingida: boolean;


  projecao: number;
  mediaDiaria: number;
}

export function buildPerformanceSummary(
  vendedor: string,
  faturamento: number,
  metaGasolina: number,
  classifications: ClientClassification[],
  history: VendorMonthlyHistory[],
  commissionLevel: number,
  consecutiveMonths: number,
  overrideComissao: number | null,
  diasPassados: number,
  diasTotal: number,
  metasAbsolutas?: MetasAbsolutas,
): VendorPerformanceSummary {
  const pctMeta = metaGasolina > 0 ? (faturamento / metaGasolina) * 100 : 0;
  // Meta CONQUISTADA no mês: sempre por valor absoluto de faturamento quando as metas
  // são conhecidas (nunca pelo nível histórico de comissão).
  const tier = metasAbsolutas
    ? computeTierAbsoluto(faturamento, metasAbsolutas)
    : computeTier(pctMeta);


  // Cliente NOVO VÁLIDO: primeira compra em TODA a base histórica (sem registro anterior).
  const clientesNovos = classifications.filter(
    (c) => c.type === "novo" && c.temHistoricoAnterior !== true,
  ).length;
  const clientesValidados = classifications.filter(c => c.type === "validacao").length;
  const clientesSemRecompra = classifications.filter(c => c.type === "sem_recompra").length;
  const clientesReativados = classifications.filter(c => c.type === "reativado").length;
  const clientesRecorrentes = classifications.filter(c => c.type === "recorrente").length;

  // Apenas clientes novos contam (reativados NÃO substituem o requisito)
  const tierValidation = validateTierRequirements(tier.key, clientesNovos);

  // Metas conquistadas de forma hierárquica/cumulativa no mês
  const metasParaHierarquia: MetasAbsolutas = metasAbsolutas ?? {
    media: metaGasolina,
    combustivel: metaGasolina,
    meta05: 0,
    meta1: 0,
  };
  const tiersConquistados = computeTiersConquistados(faturamento, metasParaHierarquia, clientesNovos);




  const basePct = COMMISSION_LEVELS.find(l => l.level === commissionLevel)?.pct ?? 10;
  const bonusPct = tierValidation.valid ? calcCommissionBonus(tier.key) : 0;
  const finalPct = overrideComissao != null ? overrideComissao : basePct + bonusPct;

  const mediaDiaria = diasPassados > 0 ? faturamento / diasPassados : 0;
  const projecao = mediaDiaria * diasTotal;

  // metaGasolina here represents Meta Performance (passed from MetasPage)
  const metaAtingidaMes = metaGasolina > 0 && faturamento >= metaGasolina;

  return {
    vendedor,
    faturamento,
    metaGasolina,
    pctMeta,
    tier,
    clientesNovos,
    clientesValidados,
    clientesSemRecompra,
    clientesReativados,
    clientesRecorrentes,
    commissionLevel,

    commissionBasePct: basePct,
    commissionBonusPct: bonusPct,
    commissionFinalPct: finalPct,
    overrideComissao,
    voucherGasolina: metaAtingidaMes ? calcVoucherGasolina(faturamento) : 0,
    voucherLiberado: metaAtingidaMes,
    metaAtingidaMes,
    consecutiveMonths,
    constanciaBonus: calcConstanciaBonus(consecutiveMonths),
    tierValid: tierValidation.valid,
    faltaClientes: tierValidation.faltaClientes,
    tiersConquistados,
    metaMediaAtingida: tiersConquistados.metaMedia,


    projecao,
    mediaDiaria,
  };
}
