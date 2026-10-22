import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadMetaDraft, writeMetaDraft, clearMetaDraft, clearQuarantineDraft, applyChanges, diffChanges,
  rebaseValues, countChanges, changedVendors, findClearedFields, VENDOR_FIELDS, VENDOR_FIELD_LABEL,
  type VendorDraftMap, type GlobalDraftValues, type DraftChanges, type DraftReview,
} from "@/lib/metaConfigDraft";
import { Loader2, CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Target, Settings, TrendingUp, TrendingDown, Trophy, Calendar, AlertTriangle,
  Fuel, Leaf, Crown, Diamond, ChevronUp, ChevronDown, DollarSign, BarChart3,
  Clock, Users, ChevronRight, Zap, Star, Award, GraduationCap
} from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend, Cell, ComposedChart } from "recharts";
import { useSalesData, shortVendedorName } from "@/hooks/useSalesData";
import {
  useMetaConfig, useUpdateMetaConfig,
  calcDiasUteis, TEAM_VENDEDORES,
  useVendorMetas, useUpsertVendorMeta,
  computeVendedorMetasFromMap,
  deriveVendorHistoryFromMap,
  getFaturamentoByVendedorMonth,
  getMonthlyEvolutionFromMap,
  type VendedorMeta, type MetaConfig, type VendorMetaOverride
} from "@/hooks/useMetasData";
import {
  classifyClients, buildPerformanceSummary, computeCommissionLevel, computeConsecutiveMonths,
  useVendorHistoryMonth, useUpsertVendorHistory, useVendorHistory,
  PERFORMANCE_TIERS, COMMISSION_LEVELS, calcVoucherGasolina,
  calcProgressiveTierFill,
  type VendorPerformanceSummary, type VendorMonthlyHistory,
} from "@/hooks/usePerformanceData";
import { VendedorPerformanceCard } from "@/components/metas/VendedorPerformanceCard";
import { SmartAlerts } from "@/components/metas/SmartAlerts";
import { PremiacaoBadge } from "@/components/metas/PremiacaoBadge";
import { toast } from "sonner";
import { useTeamVendorNames } from "@/hooks/useVendors";
import { useVendorScope } from "@/hooks/useVendorScope";
import { VendorFormDialog } from "@/components/vendedores/VendorFormDialog";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, FileSpreadsheet } from "lucide-react";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const STATUS_COLORS = {
  red: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/30", fill: "#ef4444", label: "Abaixo" },
  yellow: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/30", fill: "#eab308", label: "Meta Média" },
  green: { bg: "bg-success/10", text: "text-success", border: "border-success/30", fill: "#22c55e", label: "Meta 0,5%" },
  blue: { bg: "bg-info/10", text: "text-info", border: "border-info/30", fill: "#3b82f6", label: "Meta 1%" },
};

function fmt(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtShort(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}k`;
  return fmt(val);
}

function pctChange(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export default function MetasPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const { data: sales, isLoading: salesLoading } = useSalesData();
  const { data: configData, isLoading: configLoading } = useMetaConfig();
  const currentYearMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const { data: vendorMetasData, isLoading: vendorMetasLoading } = useVendorMetas(currentYearMonth);
  // Fetch ALL vendor metas across months (used to derive monthly history correctly)
  const { data: vendorMetasAllMonths } = useVendorMetas();
  const { data: historyMonth, isLoading: historyLoading } = useVendorHistoryMonth(currentYearMonth);
  const { data: allHistory } = useVendorHistory();
  const upsertHistory = useUpsertVendorHistory();
  const teamVendorsDynamic = useTeamVendorNames();
  const vendorScope = useVendorScope();
  const teamVendorsRaw = vendorScope.opcoesVendedor(
    teamVendorsDynamic.length > 0 ? teamVendorsDynamic : TEAM_VENDEDORES,
  );
  // Normaliza nomes do time (ex.: "Vinicius Gomes Menez" → "Vinicius"),
  // garantindo que o mesmo vendedor não apareça duplicado nem zerado por
  // divergência de nome entre planilha (short) e cadastro (longo).
  const teamVendors = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of teamVendorsRaw) {
      const short = shortVendedorName(raw);
      if (!seen.has(short)) { seen.add(short); out.push(short); }
    }
    return out;
  }, [teamVendorsRaw]);

  // Normaliza `vendedor` dos overrides salvos (as metas ficam guardadas pelo
  // nome usado ao salvar; se antes salvamos "Vinicius Gomes Menez", agora
  // renormalizamos para "Vinicius" para casar com o faturamento da planilha).
  const normalizedVendorMetas = useMemo(() => {
    if (!vendorMetasData) return undefined;
    const byShort = new Map<string, typeof vendorMetasData[number]>();
    for (const v of vendorMetasData) {
      const short = shortVendedorName(v.vendedor);
      const prev = byShort.get(short);
      // Preferir o registro com valores preenchidos
      const score = (x: typeof v) => (x.meta_gasolina ?? 0) + (x.meta_verde ?? 0) + (x.meta_aceleracao ?? 0) + (x.meta_azul ?? 0);
      if (!prev || score(v) > score(prev)) byShort.set(short, { ...v, vendedor: short });
    }
    return [...byShort.values()];
  }, [vendorMetasData]);

  const config: MetaConfig = configData ?? { pct_gasolina: 5, pct_verde: 10, pct_roxa: 10, pct_azul: 20 };

  // FONTE ÚNICA — se existir planilha importada em Pagamento Vendedores para
  // o mês selecionado, o faturamento do mês corrente vem EXCLUSIVAMENTE dela
  // (soma de "Preço Venda Total (R$)" por vendedor). Ranking/Metas/Pagamento
  // passam a exibir o mesmo número.
  const queryClient = useQueryClient();

  const faturamentoMap = useMemo(() => {
    if (!sales) return null;
    return getFaturamentoByVendedorMonth(sales);
  }, [sales]);

  const vendedorMetas = useMemo(() => {
    if (!faturamentoMap) return [];
    return computeVendedorMetasFromMap(faturamentoMap, config, selectedYear, selectedMonth, normalizedVendorMetas, teamVendors);
  }, [faturamentoMap, config, selectedYear, selectedMonth, normalizedVendorMetas, teamVendors]);

  const handleRecalcularFaturamento = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sales-data"] });
    queryClient.invalidateQueries({ queryKey: ["vendor-metas"] });
    toast.success("Faturamento atualizado a partir da base oficial importada.");
  }, [queryClient]);

  // Derive REAL monthly history per vendor from sales + meta Performance (last 24 months up to selected)
  const normalizedVendorMetasAll = useMemo(() => {
    if (!vendorMetasAllMonths) return undefined;
    return vendorMetasAllMonths.map(v => ({ ...v, vendedor: shortVendedorName(v.vendedor) }));
  }, [vendorMetasAllMonths]);

  const derivedHistoryByVendor = useMemo(() => {
    const map = new Map<string, { vendedor: string; year_month: string; faturamento: number; meta_atingida: boolean }[]>();
    if (!faturamentoMap) return map;
    for (const vend of teamVendors) {
      map.set(vend, deriveVendorHistoryFromMap(faturamentoMap, vend, config, normalizedVendorMetasAll, selectedYear, selectedMonth, 24));
    }
    return map;
  }, [faturamentoMap, config, normalizedVendorMetasAll, selectedYear, selectedMonth, teamVendors]);

  const diasUteis = useMemo(() => calcDiasUteis(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  // Audit: count sales rows + distinct order codes in selected month (all vendedores)
  const monthAudit = useMemo(() => {
    const empty = { totalRows: 0, distinctOrders: 0, faturamentoBruto: 0, byVendedor: new Map<string, { rows: number; orders: Set<number>; total: number }>() };
    if (!sales) return empty;
    const start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0);
    const end = new Date(selectedYear, selectedMonth + 1, 1, 0, 0, 0);
    let totalRows = 0;
    let faturamentoBruto = 0;
    const orderSet = new Set<number>();
    const byVendedor = new Map<string, { rows: number; orders: Set<number>; total: number }>();
    for (const s of sales) {
      const d = new Date(s.data);
      if (d >= start && d < end) {
        totalRows++;
        orderSet.add(s.codigo_venda);
        faturamentoBruto += Number(s.preco_total);
        const vend = shortVendedorName(s.vendedor);
        const entry = byVendedor.get(vend) ?? { rows: 0, orders: new Set<number>(), total: 0 };
        entry.rows++;
        entry.orders.add(s.codigo_venda);
        entry.total += Number(s.preco_total);
        byVendedor.set(vend, entry);
      }
    }
    return { totalRows, distinctOrders: orderSet.size, faturamentoBruto, byVendedor };
  }, [sales, selectedYear, selectedMonth, teamVendors]);

  // Heuristic: detect missing month data vs avg of last 3 months
  const dataMissingAlert = useMemo(() => {
    if (!sales) return null;
    const start = new Date(selectedYear, selectedMonth, 1);
    const today = new Date();
    if (start > today) return null;
    let totalPrevRows = 0;
    let totalPrevDays = 0;
    for (let i = 1; i <= 3; i++) {
      let pm = selectedMonth - i, py = selectedYear;
      while (pm < 0) { pm += 12; py--; }
      const ps = new Date(py, pm, 1);
      const pe = new Date(py, pm + 1, 1);
      const days = (pe.getTime() - ps.getTime()) / 86400000;
      const rows = sales.filter(s => { const d = new Date(s.data); return d >= ps && d < pe; }).length;
      totalPrevRows += rows; totalPrevDays += days;
    }
    if (totalPrevDays === 0) return null;
    const avgPerDay = totalPrevRows / totalPrevDays;
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 1);
    const elapsedDays = Math.min((today.getTime() - start.getTime()) / 86400000, (monthEnd.getTime() - start.getTime()) / 86400000);
    const expectedRows = avgPerDay * elapsedDays;
    if (expectedRows > 100 && monthAudit.totalRows < expectedRows * 0.3) {
      return { actual: monthAudit.totalRows, expected: Math.round(expectedRows), pct: Math.round((monthAudit.totalRows / Math.max(expectedRows, 1)) * 100) };
    }
    return null;
  }, [sales, monthAudit, selectedYear, selectedMonth]);

  // Build performance summaries + keep classifications by vendor (for the
  // "Clientes Novos" validation dialog).
  const classificationsByVendor = useMemo(() => {
    const map = new Map<string, ReturnType<typeof classifyClients>>();
    if (!sales) return map;
    for (const vend of teamVendors) {
      map.set(vend, classifyClients(sales, vend, selectedYear, selectedMonth));
    }
    return map;
  }, [sales, selectedYear, selectedMonth]);

  const performances = useMemo((): VendorPerformanceSummary[] => {
    if (!sales) return [];
    return teamVendors.map(vend => {
      const meta = vendedorMetas.find(v => v.vendedor === vend);
      const classifications = classificationsByVendor.get(vend) ?? [];
      // Use REAL derived history (sales-based) — DB table is mostly empty and unreliable
      const derivedHist = (derivedHistoryByVendor.get(vend) ?? []) as VendorMonthlyHistory[];
      const monthHist = (historyMonth ?? []).find(h => h.vendedor === vend);

      const commLevel = computeCommissionLevel(derivedHist);
      const consMonths = computeConsecutiveMonths(derivedHist);
      const overrideComissao = monthHist?.override_comissao_pct ?? null;

      return buildPerformanceSummary(
        vend,
        meta?.faturamentoMes ?? 0,
        meta?.metaPerformance ?? 0,
        classifications,
        derivedHist,

        commLevel,
        consMonths,
        overrideComissao,
        diasUteis.passados,
        diasUteis.total,
        {
          media: meta?.metaImpulso ?? 0,
          combustivel: meta?.metaPerformance ?? 0,
          meta05: meta?.metaAceleracao ?? 0,
          meta1: meta?.metaExcelencia ?? 0,
        },
      );

    });
  }, [sales, vendedorMetas, selectedYear, selectedMonth, derivedHistoryByVendor, historyMonth, diasUteis, classificationsByVendor]);

  const ranking = useMemo(
    () => [...vendedorMetas].sort((a, b) => b.faturamentoMes - a.faturamentoMes),
    [vendedorMetas],
  );

  const evolutionData = useMemo(() => {
    if (!faturamentoMap) return [];
    return getMonthlyEvolutionFromMap(faturamentoMap, 6, teamVendors);
  }, [faturamentoMap, teamVendors]);

  const prevMonthMetas = useMemo(() => {
    if (!faturamentoMap) return [];
    let pm = selectedMonth - 1, py = selectedYear;
    if (pm < 0) { pm = 11; py--; }
    return computeVendedorMetasFromMap(faturamentoMap, config, py, pm, undefined, teamVendors);
  }, [faturamentoMap, config, selectedYear, selectedMonth, teamVendors]);

  const faturamentoEquipe = vendedorMetas.reduce((s, v) => s + v.faturamentoMes, 0);
  const projecaoEquipe = vendedorMetas.reduce((s, v) => s + v.projecaoMes, 0);
  const faturamentoPrevMonth = prevMonthMetas.reduce((s, v) => s + v.faturamentoMes, 0);
  const faturamentoLastYear = vendedorMetas.reduce((s, v) => s + (v.faturamentoMesAnteriorAno ?? 0), 0);

  const growthPrev = pctChange(faturamentoEquipe, faturamentoPrevMonth);
  const growthYoY = pctChange(faturamentoEquipe, faturamentoLastYear);

  const lastUpdate = useMemo(() => {
    if (!sales || sales.length === 0) return null;
    let max = 0;
    for (const s of sales) {
      const t = new Date(s.data).getTime();
      if (t > max) max = t;
    }
    return max > 0 ? new Date(max) : null;
  }, [sales]);

  const hoursStale = lastUpdate ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60) : Infinity;
  const alertVendedores = vendedorMetas.filter(v => v.projecaoMes < v.metaPerformance && v.metaPerformance > 0);

  const isLoading = salesLoading || configLoading || vendorMetasLoading || historyLoading;

  useEffect(() => {
    if (!showDebug || !sales) return;

    const start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
    const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
    const debugRows = vendedorMetas.map((vm) => {
      const audit = monthAudit.byVendedor.get(vm.vendedor);
      return {
        vendedor: vm.vendedor,
        inicio: start.toISOString(),
        fim: end.toISOString(),
        itens: audit?.rows ?? 0,
        pedidos: audit?.orders.size ?? 0,
        faturamento: Number(vm.faturamentoMes.toFixed(2)),
        meta_impulso: Number(vm.metaImpulso.toFixed(2)),
        meta_performance: Number(vm.metaPerformance.toFixed(2)),
        meta_aceleracao: Number(vm.metaAceleracao.toFixed(2)),
        meta_excelencia: Number(vm.metaExcelencia.toFixed(2)),
      };
    });

    console.groupCollapsed(`[Metas Debug] ${MESES[selectedMonth]}/${selectedYear}`);
    console.info("origem", "useSalesData -> computeVendedorMetas");
    console.info("resumo", {
      month: selectedMonth + 1,
      year: selectedYear,
      inicio: start.toISOString(),
      fim: end.toISOString(),
      total_linhas: monthAudit.totalRows,
      total_vendedores_lidos: monthAudit.byVendedor.size,
      faturamento_total_mes: Number(monthAudit.faturamentoBruto.toFixed(2)),
    });
    console.table(debugRows);
    console.groupEnd();
  }, [showDebug, sales, selectedMonth, selectedYear, monthAudit, vendedorMetas]);


  // Handler for updating override
  const handleUpdateOverride = useCallback((vendedor: string, value: number | null) => {
    const existing = (historyMonth ?? []).find(h => h.vendedor === vendedor);
    upsertHistory.mutate({
      vendedor,
      year_month: currentYearMonth,

      clientes_novos: existing?.clientes_novos ?? 0,
      clientes_validados: existing?.clientes_validados ?? 0,
      clientes_sem_recompra: existing?.clientes_sem_recompra ?? 0,
      clientes_reativados: existing?.clientes_reativados ?? 0,
      commission_level: existing?.commission_level ?? 0,
      consecutive_months: existing?.consecutive_months ?? 0,
      faturamento: existing?.faturamento ?? 0,
      meta_atingida: existing?.meta_atingida ?? false,
      override_comissao_pct: value,
    });
  }, [historyMonth, currentYearMonth, upsertHistory]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  const selectedMeta = selectedVendedor ? vendedorMetas.find(v => v.vendedor === selectedVendedor) : null;
  const selectedPerf = selectedVendedor ? performances.find(p => p.vendedor === selectedVendedor) : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" /> Metas Comerciais
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {MESES[selectedMonth]} {selectedYear} • Escada de Metas
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVendedor && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedVendedor(null)}>
                ← Voltar ao resumo
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRecalcularFaturamento}>
              <RefreshCw className="h-4 w-4 mr-1" /> Recalcular faturamento do mês
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDebug(s => !s)}>
              {showDebug ? "Ocultar" : "Mostrar"} Debug
            </Button>
            <MetaConfigDialog config={config} vendorMetas={vendorMetasData ?? []} metasLoading={vendorMetasLoading} yearMonth={currentYearMonth} />
          </div>
        </div>

        {/* Origem do faturamento */}
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="font-medium">Fonte oficial: planilha de vendas importada</span>
            <Badge variant="outline">Competência: coluna Data</Badge>
            <Badge variant="outline">Faturamento: Preço Venda Total (R$)</Badge>
          </CardContent>
        </Card>

        {/* Stale data alert */}
        {hoursStale > 48 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Dados desatualizados</AlertTitle>
            <AlertDescription>
              A última venda registrada foi em {lastUpdate?.toLocaleDateString("pt-BR")}.
            </AlertDescription>
          </Alert>
        )}

        {/* Missing month data alert */}
        {dataMissingAlert && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Dados de {MESES[selectedMonth]}/{selectedYear} aparentam estar incompletos</AlertTitle>
            <AlertDescription>
              Foram encontrados apenas <strong>{dataMissingAlert.actual}</strong> registros de venda neste mês,
              quando o esperado (com base nos 3 meses anteriores) seria em torno de <strong>{dataMissingAlert.expected}</strong> ({dataMissingAlert.pct}% do esperado).
              Por isso o faturamento acumulado dos vendedores pode aparecer zerado ou muito baixo. Verifique se a importação do mês foi concluída na aba <strong>Importar</strong>.
            </AlertDescription>
          </Alert>
        )}

        {/* Debug panel: per-vendor audit */}
        {showDebug && (
          <Card className="border-info/30 bg-info/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">🔍 Auditoria — {MESES[selectedMonth]} {selectedYear}</CardTitle>
              <CardDescription className="text-xs">
                Período: {new Date(selectedYear, selectedMonth, 1).toLocaleDateString("pt-BR")} → {new Date(selectedYear, selectedMonth + 1, 0).toLocaleDateString("pt-BR")} •
                Total de itens: <strong>{monthAudit.totalRows}</strong> •
                Pedidos únicos: <strong>{monthAudit.distinctOrders}</strong> •
                Faturamento bruto (todos vendedores): <strong>{fmt(monthAudit.faturamentoBruto)}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="sheet-table overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="text-left p-1.5">Vendedor</th>
                      <th className="text-right p-1.5">Itens</th>
                      <th className="text-right p-1.5">Pedidos</th>
                      <th className="text-right p-1.5">Faturamento</th>
                      <th className="text-right p-1.5">Meta Média</th>
                      <th className="text-right p-1.5">Meta Combustível</th>
                      <th className="text-right p-1.5">Meta 0,5%</th>
                      <th className="text-right p-1.5">Meta 1%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendedorMetas.map(vm => {
                      const audit = monthAudit.byVendedor.get(vm.vendedor);
                      return (
                        <tr key={vm.vendedor} className="border-b border-border/40">
                          <td className="p-1.5 font-medium">{vm.vendedor}</td>
                          <td className="text-right p-1.5">{audit?.rows ?? 0}</td>
                          <td className="text-right p-1.5">{audit?.orders.size ?? 0}</td>
                          <td className="text-right p-1.5 font-semibold">{fmt(vm.faturamentoMes)}</td>
                          <td className="text-right p-1.5 text-muted-foreground">{fmt(vm.metaImpulso)}</td>
                          <td className="text-right p-1.5 text-muted-foreground">{fmt(vm.metaPerformance)}</td>
                          <td className="text-right p-1.5 text-muted-foreground">{fmt(vm.metaAceleracao)}</td>
                          <td className="text-right p-1.5 text-muted-foreground">{fmt(vm.metaExcelencia)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* MAIN VIEW */}
        {selectedVendedor && selectedMeta && selectedPerf ? (
          <VendedorPerformanceCard
            perf={selectedPerf}
            meta={selectedMeta}
            diasUteis={diasUteis}
            derivedHistory={derivedHistoryByVendor.get(selectedVendedor) ?? []}
            classifications={classificationsByVendor.get(selectedVendedor) ?? []}
            
            onUpdateOverride={(v) => handleUpdateOverride(selectedVendedor, v)}
          />
        ) : (
          <>
            {/* Smart Alerts */}
            <SmartAlerts
              performances={performances}
              sales={sales}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />

            {/* KPI Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              <SummaryKpi icon={DollarSign} label="Faturamento Equipe" value={fmtShort(faturamentoEquipe)} />
              <SummaryKpi icon={TrendingUp} label="Projeção do Mês" value={fmtShort(projecaoEquipe)} subtitle={`${diasUteis.restantes} dias restantes`} />
              <SummaryKpi
                icon={BarChart3}
                label="vs Mês Anterior"
                value={fmtShort(faturamentoPrevMonth)}
                subtitle={growthPrev !== null ? `${growthPrev >= 0 ? "+" : ""}${growthPrev.toFixed(1)}%` : undefined}
                positive={growthPrev !== null ? growthPrev >= 0 : undefined}
              />
              <SummaryKpi
                icon={Calendar}
                label={`vs ${MESES[selectedMonth]} ${selectedYear - 1}`}
                value={fmtShort(faturamentoLastYear)}
                subtitle={growthYoY !== null ? `${growthYoY >= 0 ? "+" : ""}${growthYoY.toFixed(1)}%` : undefined}
                positive={growthYoY !== null ? growthYoY >= 0 : undefined}
              />
              <SummaryKpi icon={Clock} label="Dias Úteis" value={`${diasUteis.passados} / ${diasUteis.total}`} />
              <SummaryKpi icon={Clock} label="Dias Restantes" value={String(diasUteis.restantes)} />
              <SummaryKpi
                icon={Calendar}
                label="Última Atualização"
                value={lastUpdate ? lastUpdate.toLocaleDateString("pt-BR") : "—"}
              />
            </div>

            {/* Ranking */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-warning" /> Ranking — {MESES[selectedMonth]} {selectedYear}
                </CardTitle>
                <CardDescription>Clique em um vendedor para ver o painel completo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ranking.map((v, idx) => {
                  const perf = performances.find(p => p.vendedor === v.vendedor);
                  const tierFill = calcProgressiveTierFill(v.faturamentoMes, v.metaImpulso, v.metaPerformance, v.metaAceleracao, v.metaExcelencia);

                  return (
                    <div
                      key={v.vendedor}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedVendedor(v.vendedor)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedVendedor(v.vendedor);
                        }
                      }}
                      className="w-full text-left p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer bg-card border-border"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground w-7 text-center shrink-0">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{v.vendedor}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: perf?.tier.color, borderColor: (perf?.tier.color ?? "#888") + "40" }}>
                                {perf?.tier.icon} {tierFill.nivelAtual}
                              </Badge>
                              {perf && (
                                <span onClick={(e) => e.stopPropagation()}>
                                  <PremiacaoBadge perf={perf} />
                                </span>
                              )}
                            </div>
                            <span className="font-bold text-sm text-foreground">{fmt(v.faturamentoMes)}</span>
                          </div>

                          {/* Progressive tier bars */}
                          <div className="grid grid-cols-4 gap-1 mb-1.5">
                            <TierBar label="Meta Média" fill={tierFill.impulso} color="#eab308" />
                            <TierBar label="Meta Combustível" fill={tierFill.performance} color="#f97316" />
                            <TierBar label="Meta 0,5%" fill={tierFill.aceleracao} color="#22c55e" />
                            <TierBar label="Meta 1%" fill={tierFill.excelencia} color="#3b82f6" />
                          </div>

                          {/* Debug info */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>Meta Média: {fmt(v.metaImpulso)}</span>
                            <span>Meta Combustível: {fmt(v.metaPerformance)}</span>
                            <span>Meta 0,5%: {fmt(v.metaAceleracao)}</span>
                            <span>Meta 1%: {fmt(v.metaExcelencia)}</span>
                            <span>Nível: <strong className="text-foreground">{tierFill.nivelAtual}</strong></span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Faturamento por Vendedor</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={Object.fromEntries(teamVendors.map(v => [v, { label: v, color: "hsl(var(--primary))" }]))} className="h-[250px] w-full">
                    <BarChart data={ranking} layout="vertical" margin={{ left: 70, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => fmtShort(v)} />
                      <YAxis type="category" dataKey="vendedor" width={65} tick={{ fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(val) => fmt(Number(val))} />} />
                      <Bar dataKey="faturamentoMes" radius={[0, 4, 4, 0]}>
                        {ranking.map((entry) => {
                          const perf = performances.find(p => p.vendedor === entry.vendedor);
                          return <Cell key={entry.vendedor} fill={perf?.tier.color ?? STATUS_COLORS[entry.statusCor].fill} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Evolução Mensal da Equipe</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={Object.fromEntries(teamVendors.map((v, i) => [v, { label: v, color: `hsl(${i * 72}, 70%, 50%)` }]))}
                    className="h-[250px] w-full"
                  >
                    <LineChart data={evolutionData} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => fmtShort(v)} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(val) => fmt(Number(val))} />} />
                      <Legend />
                      {teamVendors.map((v, i) => (
                        <Line key={v} type="monotone" dataKey={v} stroke={`hsl(${i * 72}, 70%, 50%)`} strokeWidth={2} dot={{ r: 3 }} />
                      ))}
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Produtividade + Comissão */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-warning" /> Painel de Metas
                </CardTitle>
                <CardDescription>
                  {diasUteis.passados} dias úteis passados • {diasUteis.restantes} restantes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {ranking.map((v) => {
                    const perf = performances.find(p => p.vendedor === v.vendedor);
                    const tierFill = calcProgressiveTierFill(v.faturamentoMes, v.metaImpulso, v.metaPerformance, v.metaAceleracao, v.metaExcelencia);
                    const projAboveGas = v.projecaoMes >= v.metaPerformance;
                    const projAboveMeta = v.projecaoMes >= v.metaPerformance;
                    return (
                      <div key={v.vendedor} className="p-3 rounded-lg border border-border bg-card space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground">{v.vendedor}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0" style={{ color: perf?.tier.color, borderColor: (perf?.tier.color ?? "#888") + "40" }}>
                            {tierFill.nivelAtual}
                          </Badge>
                        </div>
                        {/* Mini progressive bars */}
                        <div className="space-y-1">
                          <TierBar label="Meta Média" fill={tierFill.impulso} color="#eab308" />
                          <TierBar label="Meta Combustível" fill={tierFill.performance} color="#f97316" />
                          <TierBar label="Meta 0,5%" fill={tierFill.aceleracao} color="#22c55e" />
                          <TierBar label="Meta 1%" fill={tierFill.excelencia} color="#3b82f6" />
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex justify-between">
                            <span>Média diária</span>
                            <span className="font-semibold text-foreground">{fmt(v.mediaDiaria)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Projeção</span>
                            <span className={`font-semibold ${projAboveMeta ? "text-success" : "text-destructive"}`}>{fmtShort(v.projecaoMes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>% Meta</span>
                            <span className="font-semibold text-foreground">{v.percentualAtingido.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ── TierBar component ──
function TierBar({ label, fill, color }: { label: string; fill: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(fill, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground">{label}</span>
        <span className="text-[9px] font-medium" style={{ color }}>{fill.toFixed(0)}%</span>
      </div>
    </div>
  );
}
function SummaryKpi({ icon: Icon, label, value, subtitle, positive }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle?: string;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide truncate">{label}</span>
        </div>
        <span className={`text-lg font-bold ${
          positive === true ? "text-success" : positive === false ? "text-destructive" : "text-foreground"
        }`}>
          {value}
        </span>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground leading-tight">{subtitle}</span>
        )}
      </CardContent>
    </Card>
  );
}

// ── Meta Config Dialog ──
// Module-level guard: only one MetaConfigDialog open at a time across the app.
let META_CONFIG_DIALOG_OPEN = false;

type VendorValueMap = VendorDraftMap;
type GlobalValues = GlobalDraftValues;

function MetaConfigDialog({ config, vendorMetas, metasLoading, yearMonth }: { config: MetaConfig; vendorMetas: (VendorMetaOverride & { id: string })[]; metasLoading?: boolean; yearMonth: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"global" | "vendor">("vendor");
  const updateMeta = useUpdateMetaConfig();
  const upsertVendorMeta = useUpsertVendorMeta();
  const teamVendorsDynamic = useTeamVendorNames();
  const vendorScope = useVendorScope();
  const teamVendorsRaw = vendorScope.opcoesVendedor(
    teamVendorsDynamic.length > 0 ? teamVendorsDynamic : TEAM_VENDEDORES,
  );
  // Nomes exibidos: normalizados (curtos), sem duplicar o mesmo vendedor.
  const teamVendors = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of teamVendorsRaw) {
      const short = shortVendedorName(raw);
      if (!seen.has(short)) { seen.add(short); out.push(short); }
    }
    return out;
  }, [teamVendorsRaw]);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);

  // Metas salvas indexadas pelo nome curto (o banco pode ter o nome longo,
  // ex.: "Vinicius Gomes Menez - Ipatinga (Representante)").
  const metasByShort = useMemo(() => {
    const map = new Map<string, VendorMetaOverride & { id: string }>();
    const score = (x: VendorMetaOverride) =>
      (x.meta_gasolina ?? 0) + (x.meta_verde ?? 0) + (x.meta_aceleracao ?? 0) + (x.meta_azul ?? 0);
    for (const vm of vendorMetas) {
      const short = shortVendedorName(vm.vendedor);
      const prev = map.get(short);
      if (!prev || score(vm) > score(prev)) map.set(short, vm);
    }
    return map;
  }, [vendorMetas]);

  const buildBaselineGlobal = useCallback((): GlobalValues => ({
    pctGasolina: String(config.pct_gasolina),
    pctVerde: String(config.pct_verde),
    pctRoxa: String(config.pct_roxa),
    pctAzul: String(config.pct_azul),
    fixoGasolina: config.valor_fixo_gasolina ? String(config.valor_fixo_gasolina) : "",
    fixoVerde: config.valor_fixo_verde ? String(config.valor_fixo_verde) : "",
    fixoAzul: config.valor_fixo_azul ? String(config.valor_fixo_azul) : "",
  }), [config]);

  const buildBaselineVendor = useCallback((): VendorValueMap => {
    const vals: VendorValueMap = {};
    const fmt = (n: number | null | undefined) =>
      n != null && Number(n) > 0
        ? Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "";
    for (const v of teamVendors) {
      const existing = metasByShort.get(v);
      vals[v] = {
        gasolina: fmt(existing?.meta_gasolina),
        verde: fmt(existing?.meta_verde),
        aceleracao: fmt((existing as any)?.meta_aceleracao),
        azul: fmt(existing?.meta_azul),
      };
    }
    return vals;
  }, [teamVendors, metasByShort]);


  const { user } = useAuth();
  const userId = user?.id ?? "anon";

  const [globalValues, setGlobalValues] = useState<GlobalValues>(buildBaselineGlobal);
  const [vendorValues, setVendorValues] = useState<VendorValueMap>({});
  const [baseline, setBaseline] = useState<{ global: GlobalValues; vendor: VendorValueMap }>({
    global: buildBaselineGlobal(),
    vendor: {},
  });
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  // Só vira true quando o usuário digita algo — abrir/carregar nunca cria rascunho.
  const interactedRef = useRef(false);
  // O rascunho só é lido depois que os valores reais do banco carregaram.
  const draftCheckedRef = useRef(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "draft" | "saved">("idle");
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [review, setReview] = useState<DraftReview | null>(null);
  const dataReady = open && !metasLoading;

  const setPct = (k: keyof GlobalValues, v: string) => {
    interactedRef.current = true;
    setGlobalValues(p => ({ ...p, [k]: v }));
  };

  // 1) Valores reais do banco primeiro. Se chegarem com a janela já aberta,
  //    atualiza a base e mantém apenas o que o usuário de fato digitou.
  useEffect(() => {
    if (!dataReady) return;
    const fresh = buildBaselineVendor();
    const oldBase = baselineRef.current.vendor;
    if (JSON.stringify(oldBase) === JSON.stringify(fresh)) return;
    setVendorValues(prev => {
      const next = rebaseValues(oldBase, prev, fresh);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
    setBaseline(b => ({ ...b, vendor: fresh }));
  }, [dataReady, buildBaselineVendor]);

  // 2) Só depois, aplica o rascunho do usuário/mês (somente campos alterados).
  useEffect(() => {
    if (!dataReady || draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    const freshVendor = buildBaselineVendor();
    const freshGlobal = buildBaselineGlobal();
    const loaded = loadMetaDraft(userId, yearMonth, freshVendor, freshGlobal);
    if (loaded.kind === "apply") {
      const applied = applyChanges(freshVendor, freshGlobal, loaded.changes);
      setVendorValues(applied.vendor);
      setGlobalValues(applied.global);
      setRestoredAt(loaded.savedAt);
      setSaveStatus("draft");
    } else if (loaded.kind === "review") {
      setReview(loaded.review);
    }
  }, [dataReady, buildBaselineVendor, buildBaselineGlobal, userId, yearMonth]);

  const currentChanges = useMemo(
    () => diffChanges(baseline.vendor, vendorValues, baseline.global, globalValues),
    [baseline, vendorValues, globalValues],
  );
  const pendingCount = countChanges(currentChanges);
  const hasChanges = pendingCount > 0;

  // Salvamento automático: grava apenas os campos alterados, e só após o usuário digitar.
  useEffect(() => {
    if (!dataReady || !draftCheckedRef.current || !interactedRef.current) return;
    if (!hasChanges) {
      clearMetaDraft(userId, yearMonth);
      setSaveStatus(s => (s === "saved" ? s : "idle"));
      return;
    }
    setSaveStatus("pending");
    const written = writeMetaDraft(userId, yearMonth, currentChanges);
    if (!written) return; // armazenamento indisponível: mantém "Alterações não salvas"
    const t = window.setTimeout(() => setSaveStatus("draft"), 450);
    return () => window.clearTimeout(t);
  }, [dataReady, hasChanges, currentChanges, yearMonth, userId]);

  // Track global open flag
  useEffect(() => {
    if (open) META_CONFIG_DIALOG_OPEN = true;
    return () => { if (open) META_CONFIG_DIALOG_OPEN = false; };
  }, [open]);

  const openDialog = () => {
    if (META_CONFIG_DIALOG_OPEN && !open) {
      // Already open somewhere else — just bring focus, don't stack.
      toast.info("A janela de Configuração de Metas já está aberta.");
      return;
    }
    // Abre sempre com os valores do banco; o rascunho é aplicado depois do carregamento.
    const freshGlobal = buildBaselineGlobal();
    const freshVendor = buildBaselineVendor();
    setBaseline({ global: freshGlobal, vendor: freshVendor });
    setGlobalValues(freshGlobal);
    setVendorValues(freshVendor);
    interactedRef.current = false;
    draftCheckedRef.current = false;
    setRestoredAt(null);
    setReview(null);
    setSaveStatus("idle");
    setOpen(true);
  };

  const applyReview = (changes: DraftChanges) => {
    const applied = applyChanges(baseline.vendor, baseline.global, changes);
    interactedRef.current = true; // passa a ser um rascunho normal
    setVendorValues(applied.vendor);
    setGlobalValues(applied.global);
    clearQuarantineDraft(userId, yearMonth);
    setReview(null);
    toast.info(`${countChanges(changes)} alteração(ões) aplicada(s). Confira e clique em "Salvar Metas" para gravar.`);
  };

  const removeReview = () => {
    clearQuarantineDraft(userId, yearMonth);
    setReview(null);
    toast.info("Rascunho removido. Os valores salvos no banco foram mantidos.");
  };

  /** Após um salvamento definitivo: apaga o rascunho ou o regrava só com o que ainda falta salvar. */
  const settleDraftAfterSave = (
    nextBaseline: { global: GlobalValues; vendor: VendorValueMap },
    currentGlobal: GlobalValues,
    currentVendor: VendorValueMap,
  ) => {
    writeMetaDraft(
      userId,
      yearMonth,
      diffChanges(nextBaseline.vendor, currentVendor, nextBaseline.global, currentGlobal),
    );
  };

  const discardChanges = () => {
    clearMetaDraft(userId, yearMonth);
    interactedRef.current = false;
    setGlobalValues(baseline.global);
    setVendorValues(baseline.vendor);
    setRestoredAt(null);
    setSaveStatus("idle");
    setConfirmCloseOpen(false);
    setOpen(false);
    toast.info("Alterações descartadas. Valores salvos restaurados.");
  };

  const requestClose = () => {
    if (hasChanges) {
      setConfirmCloseOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSaveGlobal = () => {
    if (JSON.stringify(globalValues) === JSON.stringify(baseline.global)) {
      toast.info("Nenhuma alteração nas configurações globais.");
      return;
    }
    updateMeta.mutate({
      pct_gasolina: Number(globalValues.pctGasolina),
      pct_verde: Number(globalValues.pctVerde),
      pct_roxa: Number(globalValues.pctRoxa),
      pct_azul: Number(globalValues.pctAzul),
      valor_fixo_gasolina: globalValues.fixoGasolina ? Number(globalValues.fixoGasolina) : null,
      valor_fixo_verde: globalValues.fixoVerde ? Number(globalValues.fixoVerde) : null,
      valor_fixo_azul: globalValues.fixoAzul ? Number(globalValues.fixoAzul) : null,
    }, {
      onSuccess: () => {
        toast.success("Configurações globais atualizadas!");
        const nextBaseline = { global: globalValues, vendor: baseline.vendor };
        setBaseline(nextBaseline);
        // Preserva edições ainda não salvas da aba Por Vendedor.
        settleDraftAfterSave(nextBaseline, globalValues, vendorValues);
        setSaveStatus("saved");
        setOpen(false);
      },
      onError: () => {
        setSaveStatus("draft");
        toast.error("Erro ao salvar configurações. Seus valores foram mantidos no rascunho.");
      },
    });
  };

  const parseBrNumber = (s: string): number | null => {
    if (!s) return null;
    const trimmed = String(s).trim();
    if (!trimmed) return null;
    const hasComma = trimmed.includes(",");
    const hasDot = trimmed.includes(".");
    let cleaned: string;
    if (hasComma && hasDot) cleaned = trimmed.replace(/\./g, "").replace(",", ".");
    else if (hasComma) cleaned = trimmed.replace(",", ".");
    else cleaned = trimmed;
    cleaned = cleaned.replace(/[^\d.\-]/g, "");
    const n = Number(cleaned);
    return isNaN(n) || n <= 0 ? null : n;
  };

  const handleSaveVendor = async () => {
    if (metasLoading) {
      toast.error("Aguarde o carregamento das metas salvas antes de gravar.");
      return;
    }
    // Grava somente os vendedores que tiveram alguma meta alterada.
    const alterados = changedVendors(baseline.vendor, vendorValues);
    if (alterados.length === 0) {
      toast.info("Nenhuma meta alterada — nada foi gravado.");
      return;
    }
    // Nunca apaga uma meta existente por um campo deixado vazio.
    const vazios = findClearedFields(baseline.vendor, vendorValues);
    if (vazios.length > 0) {
      const lista = vazios.map(c => `${c.vendedor} (${VENDOR_FIELD_LABEL[c.field]})`).join(", ");
      toast.error(`Campo vazio em: ${lista}. Preencha o valor ou digite 0 para remover a meta de propósito.`);
      return;
    }
    // Valores digitados que não são números válidos não são enviados.
    const invalidos: string[] = [];
    for (const v of alterados) {
      for (const f of VENDOR_FIELDS) {
        const raw = (vendorValues[v]?.[f] ?? "").trim();
        if (raw && !/^0+([.,]0*)?$/.test(raw) && parseBrNumber(raw) == null) invalidos.push(`${v} (${VENDOR_FIELD_LABEL[f]})`);
      }
    }
    if (invalidos.length > 0) {
      toast.error(`Valor inválido em: ${invalidos.join(", ")}.`);
      return;
    }
    try {
      const payload = alterados.map(v => {
        const vals = vendorValues[v];
        // Reaproveita o nome já gravado no banco (evita registros duplicados
        // para o mesmo vendedor/competência quando o cadastro usa nome longo).
        const dbName = metasByShort.get(v)?.vendedor ?? v;
        return {
          short: v,
          vendedor: dbName,
          year_month: yearMonth,
          meta_gasolina: parseBrNumber(vals?.gasolina ?? ""),
          meta_verde: parseBrNumber(vals?.verde ?? ""),
          meta_aceleracao: parseBrNumber(vals?.aceleracao ?? ""),
          meta_azul: parseBrNumber(vals?.azul ?? ""),
        };
      });
      await Promise.all(payload.map(({ short, ...p }) => upsertVendorMeta.mutateAsync(p)));
      const reformatted: VendorValueMap = { ...vendorValues };
      const fmt = (n: number | null) => (n != null && n > 0 ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
      for (const p of payload) {
        reformatted[p.short] = {
          gasolina: fmt(p.meta_gasolina),
          verde: fmt(p.meta_verde),
          aceleracao: fmt(p.meta_aceleracao),
          azul: fmt(p.meta_azul),
        };
      }
      const nextBaseline = { global: baseline.global, vendor: { ...baseline.vendor, ...Object.fromEntries(payload.map(p => [p.short, reformatted[p.short]])) } };
      setVendorValues(reformatted);
      setBaseline(nextBaseline);
      // Só elimina o rascunho após confirmação do banco; preserva edições da aba Global.
      settleDraftAfterSave(nextBaseline, globalValues, reformatted);
      setSaveStatus("saved");
      toast.success("Metas salvas com sucesso!");
      setOpen(false);
    } catch (err) {
      console.error("[MetaConfigDialog] save error:", err);
      // Mantém todos os valores digitados e o rascunho intactos.
      setSaveStatus("draft");
      toast.error("Erro ao salvar metas. Seus valores foram mantidos no rascunho — tente novamente.");
    }
  };

  const updateVendorField = (vendedor: string, field: "gasolina" | "verde" | "aceleracao" | "azul", value: string) => {
    interactedRef.current = true;
    setVendorValues(prev => ({
      ...prev,
      [vendedor]: { ...(prev[vendedor] ?? { gasolina: "", verde: "", aceleracao: "", azul: "" }), [field]: value },
    }));
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => {
      if (o) openDialog();
      else requestClose();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-1" /> Configurar Metas</Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        onEscapeKeyDown={(e) => { if (hasChanges) { e.preventDefault(); setConfirmCloseOpen(true); } }}
        onPointerDownOutside={(e) => { if (hasChanges) { e.preventDefault(); setConfirmCloseOpen(true); } }}
        onInteractOutside={(e) => { if (hasChanges) { e.preventDefault(); setConfirmCloseOpen(true); } }}
      >
        <DialogHeader>
          <DialogTitle>Configuração de Metas</DialogTitle>
        </DialogHeader>

        {review && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground" role="alert">
            <p className="font-semibold text-warning">
              Rascunho não aplicado automaticamente
            </p>
            <p>
              {review.reason === "legacy"
                ? "Foi encontrado um rascunho antigo, sem registro dos valores originais."
                : `O rascunho repete o valor ${review.repeatedValue} em vários campos de vendedores diferentes.`}
              {" "}Os valores exibidos abaixo são os <strong>salvos no banco</strong>. Nada foi alterado.
            </p>
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                Ver {countChanges(review.changes)} alteração(ões) do rascunho
                {review.savedAt ? ` (${new Date(review.savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : ""}
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto space-y-0.5 pl-3">
                {Object.entries(review.changes.vendor).flatMap(([v, fields]) =>
                  VENDOR_FIELDS.filter((f) => fields[f]).map((f) => (
                    <li key={`${v}-${f}`}>
                      {v} · {VENDOR_FIELD_LABEL[f]}: salvo <strong>{baseline.vendor[v]?.[f] || "vazio"}</strong> → rascunho <strong>{fields[f]!.value || "vazio"}</strong>
                    </li>
                  )),
                )}
                {Object.entries(review.changes.global).map(([k, ch]) => (
                  <li key={k}>Global · {k}: salvo <strong>{(baseline.global as Record<string, string>)[k] || "vazio"}</strong> → rascunho <strong>{ch?.value || "vazio"}</strong></li>
                ))}
              </ul>
            </details>
            <div className="flex flex-wrap gap-2 pt-1">
              {review.repeatedValue && countChanges(review.individualChanges) > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyReview(review.individualChanges)}>
                  Aplicar só as {countChanges(review.individualChanges)} alteração(ões) individuais
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyReview(review.changes)}>
                Aplicar rascunho mesmo assim
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={removeReview}>
                Remover rascunho
              </Button>
            </div>
          </div>
        )}

        {saveStatus !== "idle" && (
          <div
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
              saveStatus === "pending"
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-success/40 bg-success/10 text-success"
            }`}
            aria-live="polite"
          >
            {saveStatus === "pending" ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Alterações não salvas</>
            ) : saveStatus === "draft" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Rascunho salvo automaticamente
                {pendingCount > 0 && <span className="text-muted-foreground">· {pendingCount} campo(s) alterado(s)</span>}
                {restoredAt && (
                  <span className="text-muted-foreground">
                    · restaurado de {new Date(restoredAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </>
            ) : (
              <><CheckCircle2 className="h-3.5 w-3.5" /> Metas salvas com sucesso</>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Button variant={tab === "vendor" ? "default" : "outline"} size="sm" onClick={() => setTab("vendor")}>
            <Users className="h-4 w-4 mr-1" /> Por Vendedor
          </Button>
          <Button variant={tab === "global" ? "default" : "outline"} size="sm" onClick={() => setTab("global")}>
            <Settings className="h-4 w-4 mr-1" /> Global (%)
          </Button>
        </div>

        {tab === "vendor" ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Defina o valor fixo de cada meta por vendedor para <strong>{yearMonth}</strong>. Valores fixos sempre têm prioridade.
              </p>
              <Button size="sm" variant="outline" onClick={() => {
                setVendorDialogOpen(true);
              }}>
                <Users className="h-4 w-4 mr-1" /> Cadastrar novo vendedor
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-5 gap-0 bg-muted p-2 text-xs font-semibold">
                <span>Vendedor</span>
                <span className="text-warning">Meta Média (R$)</span>
                <span className="text-orange-500">Meta Combustível (R$)</span>
                <span className="text-success">Meta 0,5% (R$)</span>
                <span className="text-info">Meta 1% (R$)</span>
              </div>
              {metasLoading ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Carregando metas de {yearMonth}...
                </div>
              ) : teamVendors.map(v => (
                <div key={v} className="grid grid-cols-5 gap-2 p-2 border-t items-center">
                  <span className="font-medium text-sm text-foreground">{v}</span>
                  <Input value={vendorValues[v]?.gasolina ?? ""} onChange={(e) => updateVendorField(v, "gasolina", e.target.value)} placeholder="0,00" className="h-8 text-sm" />
                  <Input value={vendorValues[v]?.verde ?? ""} onChange={(e) => updateVendorField(v, "verde", e.target.value)} placeholder="0,00" className="h-8 text-sm" />
                  <Input value={vendorValues[v]?.aceleracao ?? ""} onChange={(e) => updateVendorField(v, "aceleracao", e.target.value)} placeholder="0,00" className="h-8 text-sm" />
                  <Input value={vendorValues[v]?.azul ?? ""} onChange={(e) => updateVendorField(v, "azul", e.target.value)} placeholder="0,00" className="h-8 text-sm" />
                </div>
              ))}

            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={requestClose}>Cancelar</Button>
              <Button onClick={handleSaveVendor} disabled={upsertVendorMeta.isPending || metasLoading}>Salvar Metas</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Configure a porcentagem padrão sobre a média dos últimos 3 meses.
            </p>
            <div className="space-y-2 p-3 rounded-lg border border-yellow-200 bg-yellow-50/30">
              <Label className="flex items-center gap-1 font-semibold text-yellow-700">
                <Fuel className="h-3.5 w-3.5" /> Meta Média <span className="font-normal text-xs text-muted-foreground">(comissão mantida)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">% sobre a média</Label>
                  <Input type="number" value={globalValues.pctGasolina} onChange={(e) => setPct("pctGasolina", e.target.value)} placeholder="Ex: 5" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Valor fixo global (R$)</Label>
                  <Input type="number" value={globalValues.fixoGasolina} onChange={(e) => setPct("fixoGasolina", e.target.value)} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="space-y-2 p-3 rounded-lg border border-orange-200 bg-orange-50/30">
              <Label className="flex items-center gap-1 font-semibold text-orange-700">
                <Fuel className="h-3.5 w-3.5" /> Meta Combustível <span className="font-normal text-xs text-muted-foreground">(combustível)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">% sobre meta média</Label>
                  <Input type="number" value={globalValues.pctVerde} onChange={(e) => setPct("pctVerde", e.target.value)} placeholder="Ex: 10" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Valor fixo global (R$)</Label>
                  <Input type="number" value={globalValues.fixoVerde} onChange={(e) => setPct("fixoVerde", e.target.value)} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="space-y-2 p-3 rounded-lg border border-green-200 bg-green-50/30">
              <Label className="flex items-center gap-1 font-semibold text-green-700">
                <Leaf className="h-3.5 w-3.5" /> Meta 0,5% <span className="font-normal text-xs text-muted-foreground">(+0,5% comissão)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">% sobre meta média</Label>
                  <Input type="number" value={globalValues.pctRoxa} onChange={(e) => setPct("pctRoxa", e.target.value)} placeholder="Ex: 10" />
                </div>
              </div>
            </div>
            <div className="space-y-2 p-3 rounded-lg border border-blue-200 bg-blue-50/30">
              <Label className="flex items-center gap-1 font-semibold text-blue-700">
                <Diamond className="h-3.5 w-3.5" /> Meta 1% <span className="font-normal text-xs text-muted-foreground">(+1% comissão)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">% sobre meta média</Label>
                  <Input type="number" value={globalValues.pctAzul} onChange={(e) => setPct("pctAzul", e.target.value)} placeholder="Ex: 20" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Valor fixo global (R$)</Label>
                  <Input type="number" value={globalValues.fixoAzul} onChange={(e) => setPct("fixoAzul", e.target.value)} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={requestClose}>Cancelar</Button>
              <Button onClick={handleSaveGlobal} disabled={updateMeta.isPending}>Salvar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Alterações ainda não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Os valores digitados ainda não foram gravados definitivamente. O que deseja fazer?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={discardChanges}>
            Descartar alterações
          </Button>
          <AlertDialogAction onClick={() => { setConfirmCloseOpen(false); setOpen(false); }}>
            Sair e manter rascunho
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <VendorFormDialog
      open={vendorDialogOpen}
      onOpenChange={(nextOpen) => {
        setVendorDialogOpen(nextOpen);
        if (!nextOpen) {
          window.setTimeout(() => {
            document.body.style.pointerEvents = "";
          }, 0);
        }
      }}
      onSaved={async (_id, name) => {
        try {
          await upsertVendorMeta.mutateAsync({
            vendedor: name,
            year_month: yearMonth,
            meta_gasolina: null,
            meta_verde: null,
            meta_aceleracao: null,
            meta_azul: null,
          });
        } catch {}
      }}
    />
    </>
  );
}
