import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { Brain, Package, Users, ShoppingCart, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Calendar, Activity, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { SaleRow, cleanProductName, shortVendedorName } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { buildClientConsolidation } from "@/lib/clientConsolidation";
import { formatProductDisplay } from "@/lib/productDisplay";
import { rankVariation } from "@/lib/variationRanking";

/**
 * Normalização base de nome de cliente para análise:
 * - Remove sufixos/códigos entre parênteses no FINAL do nome (ex.: "(GR)", "(IM)").
 * - Aplica normalizeClientName (alias map global do projeto).
 * Esta função é usada como fallback. A consolidação inteligente (data-driven)
 * é aplicada via `consolidateCliente` no componente, que agrupa variantes
 * como "Distribuidor X - Ana/Edan" e "Distribuidor X - Ana/Edan (GR)" sob
 * o mesmo nome consolidado quando múltiplas variantes do mesmo "stem" coexistem.
 */
function normalizeClienteForAnalysis(raw: string): string {
  if (!raw) return "(sem cliente)";
  let s = String(raw).trim();
  while (true) {
    const next = s.replace(/\s*\([^()]{0,12}\)\s*$/u, "").trim();
    if (next === s) break;
    s = next;
  }
  return normalizeClientName(s) || s || "(sem cliente)";
}

type Consolidator = (raw: string) => string;
const defaultConsolidator: Consolidator = normalizeClienteForAnalysis;

const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R$0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const num2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const kg = (v: number) => `${num(v)} kg`;
const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

function calcVar(a: number, c: number): number | null {
  if (c <= 0) return a > 0 ? 100 : null;
  return ((a - c) / c) * 100;
}

function VarBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (Math.abs(value) < 1) return <span className="text-muted-foreground text-xs inline-flex items-center gap-0.5"><Minus className="h-3 w-3" />{pct(value)}</span>;
  if (value > 0) return <span className="text-green-600 text-xs inline-flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" />{pct(value)}</span>;
  return <span className="text-red-500 text-xs inline-flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" />{pct(value)}</span>;
}

function MiniKpi({ title, atual, comp, variation, icon: Icon }: { title: string; atual: string; comp?: string; variation?: number | null; icon: any }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-lg font-bold leading-tight">{atual}</p>
        {comp !== undefined && (
          <div className="mt-1 flex items-center gap-2">
            <p className="text-[10px] text-muted-foreground">vs {comp}</p>
            {variation !== undefined && <VarBadge value={variation ?? null} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ClienteAgg {
  cliente: string;
  qty: number;
  fat: number;
  pedidos: Set<number>;
}

function aggregateByCliente(rows: SaleRow[], consolidate: Consolidator = defaultConsolidator): Map<string, ClienteAgg> {
  const m = new Map<string, ClienteAgg>();
  for (const r of rows) {
    const k = consolidate(r.cliente);
    if (!k) continue;
    let e = m.get(k);
    if (!e) { e = { cliente: k, qty: 0, fat: 0, pedidos: new Set() }; m.set(k, e); }
    e.qty += Number(r.quantidade);
    e.fat += Number(r.preco_total);
    e.pedidos.add(r.codigo_venda);
  }
  return m;
}

function totals(rows: SaleRow[], consolidate: Consolidator = defaultConsolidator) {
  let fat = 0, qty = 0;
  const pedidos = new Set<number>();
  const clientes = new Set<string>();
  for (const r of rows) {
    fat += Number(r.preco_total);
    qty += Number(r.quantidade);
    pedidos.add(r.codigo_venda);
    const k = consolidate(r.cliente);
    if (k) clientes.add(k);
  }
  return { fat, qty, pedidos: pedidos.size, clientes: clientes.size };
}

function periodMetrics(rows: SaleRow[], consolidate: Consolidator = defaultConsolidator) {
  const byClientDates = new Map<string, Set<string>>();
  const base = totals(rows, consolidate);
  for (const r of rows) {
    const k = consolidate(r.cliente);
    if (!k) continue;
    const dates = byClientDates.get(k) ?? new Set<string>();
    dates.add(String(r.data).slice(0, 10));
    byClientDates.set(k, dates);
  }
  let intervalSum = 0;
  let intervalCount = 0;
  for (const dates of byClientDates.values()) {
    const arr = [...dates].sort();
    if (arr.length < 2) continue;
    let days = 0;
    for (let i = 1; i < arr.length; i++) {
      days += (new Date(`${arr[i]}T00:00:00`).getTime() - new Date(`${arr[i - 1]}T00:00:00`).getTime()) / 86400000;
    }
    intervalSum += days / (arr.length - 1);
    intervalCount += 1;
  }
  return {
    ...base,
    ticket: base.pedidos > 0 ? base.fat / base.pedidos : 0,
    kgPorPedido: base.pedidos > 0 ? base.qty / base.pedidos : 0,
    itensPorPedido: base.pedidos > 0 ? rows.length / base.pedidos : 0,
    precoKg: base.qty > 0 ? base.fat / base.qty : 0,
    frequencia: base.clientes > 0 ? base.pedidos / base.clientes : 0,
    intervalo: intervalCount > 0 ? intervalSum / intervalCount : 0,
  };
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${m}/${y.slice(2)}`;
}

function formatShortDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

interface Props {
  sales: SaleRow[];
  inicio: string;
  fim: string;
  compInicio: string;
  compFim: string;
  vendedoresFilter: string[];
  continuousMode?: boolean;
}

export function DeepProductAnalysis({ sales, inicio, fim, compInicio, compFim, vendedoresFilter, continuousMode = false }: Props) {
  // Apply vendor filter (no product filter — escolha é interna)
  const baseSales = useMemo(() => {
    if (vendedoresFilter.length === 0) return sales;
    return sales.filter(s =>
      vendedoresFilter.includes(s.vendedor) || vendedoresFilter.includes(shortVendedorName(s.vendedor))
    );
  }, [sales, vendedoresFilter]);

  const allProducts = useMemo(() => {
    const set = new Set<string>();
    for (const s of baseSales) {
      const p = cleanProductName(s.descricao);
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [baseSales]);

  const [selected, setSelected] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showConsolidationAudit, setShowConsolidationAudit] = useState(false);

  // Consolidação inteligente de clientes (data-driven, somente para análise estratégica)
  const consolidation = useMemo(() => {
    const names = new Set<string>();
    for (const s of baseSales) names.add(s.cliente ?? "");
    return buildClientConsolidation(names);
  }, [baseSales]);

  const consolidateCliente: Consolidator = useMemo(() => {
    const m = consolidation.map;
    return (raw: string) => m.get(raw) ?? normalizeClienteForAnalysis(raw);
  }, [consolidation]);

  const hasUserComp = Boolean(compInicio && compFim);

  // If no comparativo set, use last 6 months as auto reference window for trend
  const autoTrendStart = useMemo(() => {
    if (!fim) return "";
    const f = new Date(fim + "T00:00:00");
    const start = new Date(f.getFullYear(), f.getMonth() - 5, 1);
    return start.toISOString().slice(0, 10);
  }, [fim]);

  // Comp range used for "anterior" KPIs:
  //  - if user set compInicio/Fim, use them
  //  - else: same length window immediately before "inicio"
  const autoCompRange = useMemo(() => {
    if (!inicio || !fim) return { start: "", end: "" };
    const ini = new Date(inicio + "T00:00:00");
    const fi = new Date(fim + "T00:00:00");
    const days = Math.max(1, Math.round((fi.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const compEnd = new Date(ini.getTime() - 24 * 60 * 60 * 1000);
    const compStart = new Date(compEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    return { start: compStart.toISOString().slice(0, 10), end: compEnd.toISOString().slice(0, 10) };
  }, [inicio, fim]);

  const compStart = hasUserComp ? compInicio : autoCompRange.start;
  const compEnd = hasUserComp ? compFim : autoCompRange.end;

  const splitRanges = useMemo(() => {
    if (!inicio || !fim) return null;
    const start = new Date(`${inicio}T00:00:00`);
    const end = new Date(`${fim}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const firstDays = Math.floor(totalDays / 2);
    const firstEnd = addDays(start, firstDays - 1);
    const secondStart = addDays(firstEnd, 1);
    return {
      firstStart: dateKey(start),
      firstEnd: dateKey(firstEnd),
      secondStart: dateKey(secondStart),
      secondEnd: dateKey(end),
      firstLabel: `${formatShortDate(dateKey(start))} → ${formatShortDate(dateKey(firstEnd))}`,
      secondLabel: `${formatShortDate(dateKey(secondStart))} → ${formatShortDate(dateKey(end))}`,
    };
  }, [inicio, fim]);

  // Filtered rows — STRICT: vendedor (já em baseSales) + produto exato (cleanProductName) + período.
  // Quando nenhum produto está selecionado, consideramos TODOS os produtos válidos.
  const productRows = useMemo(() => {
    if (selected.length === 0) return baseSales;
    const set = new Set(selected);
    return baseSales.filter(s => set.has(cleanProductName(s.descricao)));
  }, [baseSales, selected]);

  // Filtro de período por string YYYY-MM-DD (espelha a planilha; sem fuso/UTC).
  const filterRange = (rows: SaleRow[], start: string, end: string) => {
    if (!start || !end) return [];
    return rows.filter(s => {
      const d = String(s.data).slice(0, 10);
      return d >= start && d <= end;
    });
  };

  const atualRows = useMemo(() => filterRange(productRows, inicio, fim), [productRows, inicio, fim]);
  const compRows = useMemo(() => filterRange(productRows, compStart, compEnd), [productRows, compStart, compEnd]);
  const beforeRows = useMemo(() => splitRanges ? filterRange(productRows, splitRanges.firstStart, splitRanges.firstEnd) : [], [productRows, splitRanges]);
  const afterRows = useMemo(() => splitRanges ? filterRange(productRows, splitRanges.secondStart, splitRanges.secondEnd) : [], [productRows, splitRanges]);

  // KPIs
  const tA = useMemo(() => totals(atualRows, consolidateCliente), [atualRows, consolidateCliente]);
  const tC = useMemo(() => totals(compRows, consolidateCliente), [compRows, consolidateCliente]);
  const beforeMetrics = useMemo(() => periodMetrics(beforeRows, consolidateCliente), [beforeRows, consolidateCliente]);
  const afterMetrics = useMemo(() => periodMetrics(afterRows, consolidateCliente), [afterRows, consolidateCliente]);

  const ticketA = tA.pedidos > 0 ? tA.fat / tA.pedidos : 0;
  const ticketC = tC.pedidos > 0 ? tC.fat / tC.pedidos : 0;
  const qtyPorPedidoA = tA.pedidos > 0 ? tA.qty / tA.pedidos : 0;
  const qtyPorPedidoC = tC.pedidos > 0 ? tC.qty / tC.pedidos : 0;
  const qtyPorClienteA = tA.clientes > 0 ? tA.qty / tA.clientes : 0;
  const qtyPorClienteC = tC.clientes > 0 ? tC.qty / tC.clientes : 0;

  // Aggregated by client
  const clienteA = useMemo(() => aggregateByCliente(atualRows, consolidateCliente), [atualRows, consolidateCliente]);
  const clienteC = useMemo(() => aggregateByCliente(compRows, consolidateCliente), [compRows, consolidateCliente]);

  const topClientesAtual = useMemo(() => [...clienteA.values()].sort((a, b) => b.fat - a.fat).slice(0, 15), [clienteA]);
  const topClientesComp = useMemo(() => [...clienteC.values()].sort((a, b) => b.fat - a.fat).slice(0, 15), [clienteC]);

  const allClienteKeys = useMemo(() => {
    const s = new Set<string>();
    clienteA.forEach((_, k) => s.add(k));
    clienteC.forEach((_, k) => s.add(k));
    return [...s];
  }, [clienteA, clienteC]);

  const reduziram = useMemo(() => {
    const rows = allClienteKeys.map(k => {
      const a = clienteA.get(k);
      const c = clienteC.get(k);
      const qA = a?.qty ?? 0; const qC = c?.qty ?? 0;
      const fA = a?.fat ?? 0; const fC = c?.fat ?? 0;
      const diffQ = qA - qC; const diffF = fA - fC;
      const pctQ = qC > 0 ? (diffQ / qC) * 100 : null;
      return { cliente: k, qA, qC, fA, fC, diffQ, diffF, pctQ };
    }).filter(r => r.qA > 0 && r.qC > 0 && r.diffQ < 0);
    return rankVariation(rows, "drop", { variationKey: "diffF", percentKey: "pctQ", label: "deepProdutoClientesReduziramCompra", limit: 15 });
  }, [allClienteKeys, clienteA, clienteC]);

  const deixaramComprar = useMemo(() => {
    return allClienteKeys
      .filter(k => clienteC.has(k) && !clienteA.has(k))
      .map(k => {
        const c = clienteC.get(k)!;
        return { cliente: k, qty: c.qty, fat: c.fat, pedidos: c.pedidos.size };
      })
      .sort((a, b) => b.fat - a.fat)
      .slice(0, 20);
  }, [allClienteKeys, clienteA, clienteC]);

  const novosNoProduto = useMemo(() => {
    return allClienteKeys
      .filter(k => clienteA.has(k) && !clienteC.has(k))
      .map(k => {
        const a = clienteA.get(k)!;
        return { cliente: k, qty: a.qty, fat: a.fat, pedidos: a.pedidos.size };
      })
      .sort((a, b) => b.fat - a.fat)
      .slice(0, 20);
  }, [allClienteKeys, clienteA, clienteC]);

  const estaveis = useMemo(() => {
    return allClienteKeys.map(k => {
      const a = clienteA.get(k); const c = clienteC.get(k);
      if (!a || !c) return null;
      const qA = a.qty; const qC = c.qty;
      if (qC <= 0) return null;
      const variacao = ((qA - qC) / qC) * 100;
      if (Math.abs(variacao) > 15) return null;
      return { cliente: k, qA, qC, fA: a.fat, fC: c.fat, variacao };
    }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => b.fA - a.fA).slice(0, 15);
  }, [allClienteKeys, clienteA, clienteC]);

  // Alerts
  const alertas = useMemo(() => {
    const out: { tipo: string; severidade: "alta" | "media" | "baixa"; mensagem: string }[] = [];
    if (atualRows.length === 0 && compRows.length === 0) return out;

    // Top5 sai do top5
    const top5C = topClientesComp.slice(0, 5).map(c => c.cliente);
    const top5A = new Set(topClientesAtual.slice(0, 5).map(c => c.cliente));
    for (const c of top5C) {
      if (!top5A.has(c)) {
        out.push({ tipo: "top5_perdido", severidade: "alta", mensagem: `${c} estava no Top 5 do produto no período anterior e saiu do Top 5 no período atual.` });
      }
    }
    // Reduções relevantes
    for (const r of reduziram.slice(0, 5)) {
      if (Math.abs(r.diffF) > 500) {
        out.push({ tipo: "cliente_reduziu", severidade: r.fC > 5000 ? "alta" : "media", mensagem: `${r.cliente} reduziu a compra em ${R$0(Math.abs(r.diffF))} / ${num(Math.abs(r.diffQ))} kg.` });
      }
    }
    // Deixou de comprar
    for (const r of deixaramComprar.slice(0, 5)) {
      out.push({ tipo: "cliente_perdido", severidade: r.fat > 5000 ? "alta" : "media", mensagem: `${r.cliente} não comprou este produto no período atual (havia comprado ${R$0(r.fat)}).` });
    }
    // Concentração de crescimento em 1 cliente
    const diffFat = tA.fat - tC.fat;
    if (diffFat > 0 && novosNoProduto.length > 0) {
      const topNovo = novosNoProduto[0];
      if (topNovo.fat / Math.max(diffFat, 1) > 0.7) {
        out.push({ tipo: "concentracao", severidade: "media", mensagem: `O crescimento do produto foi concentrado em apenas 1 cliente: ${topNovo.cliente} (${R$0(topNovo.fat)}).` });
      }
    }
    if (diffFat < 0) {
      const somaTop3Reduziram = reduziram.slice(0, 3).reduce((s, r) => s + Math.abs(r.diffF), 0)
        + deixaramComprar.slice(0, 3).reduce((s, r) => s + r.fat, 0);
      if (somaTop3Reduziram / Math.max(Math.abs(diffFat), 1) > 0.6) {
        out.push({ tipo: "queda_concentrada", severidade: "alta", mensagem: `A queda do produto foi explicada principalmente por redução / saída dos maiores compradores.` });
      }
    }
    return out;
  }, [selected, atualRows, compRows, topClientesAtual, topClientesComp, reduziram, deixaramComprar, novosNoProduto, tA.fat, tC.fat]);

  // Last 6 months evolution (always)
  const monthly6 = useMemo(() => {
    if (productRows.length === 0 || !fim) return [];
    const sixStart = new Date(autoTrendStart + "T00:00:00");
    const fiEnd = new Date(fim + "T23:59:59");
    const rowsRange = productRows.filter(r => {
      const d = new Date(r.data);
      return d >= sixStart && d <= fiEnd;
    });
    // Build month buckets in order
    const buckets: { ym: string; fat: number; qty: number; pedidos: Set<number>; clientes: Set<string> }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixStart.getFullYear(), sixStart.getMonth() + i, 1);
      buckets.push({ ym: ymKey(d), fat: 0, qty: 0, pedidos: new Set(), clientes: new Set() });
    }
    const idx = new Map(buckets.map((b, i) => [b.ym, i]));
    for (const r of rowsRange) {
      const ym = ymKey(new Date(r.data));
      const i = idx.get(ym);
      if (i === undefined) continue;
      const b = buckets[i];
      b.fat += Number(r.preco_total);
      b.qty += Number(r.quantidade);
      b.pedidos.add(r.codigo_venda);
      b.clientes.add(consolidateCliente(r.cliente));
    }
    return buckets.map(b => ({
      mes: ymLabel(b.ym),
      ymRaw: b.ym,
      fat: b.fat,
      qty: b.qty,
      pedidos: b.pedidos.size,
      clientes: b.clientes.size,
      qtyPorPedido: b.pedidos.size > 0 ? b.qty / b.pedidos.size : 0,
    }));
  }, [productRows, autoTrendStart, fim, selected, consolidateCliente]);

  // Trend
  const trend = useMemo(() => {
    if (monthly6.length < 3) return null;
    const fats = monthly6.map(m => m.fat);
    const first3 = fats.slice(0, 3).reduce((s, x) => s + x, 0) / 3;
    const last3 = fats.slice(-3).reduce((s, x) => s + x, 0) / 3;
    const variacao = first3 > 0 ? ((last3 - first3) / first3) * 100 : 0;
    let label: "Crescente" | "Estável" | "Decrescente" = "Estável";
    if (variacao > 10) label = "Crescente";
    else if (variacao < -10) label = "Decrescente";
    const melhor = monthly6.reduce((b, c) => c.fat > b.fat ? c : b, monthly6[0]);
    const pior = monthly6.reduce((b, c) => c.fat < b.fat ? c : b, monthly6[0]);
    const semVenda = monthly6.filter(m => m.fat === 0).map(m => m.mes);
    return { label, variacao, melhor, pior, semVenda };
  }, [monthly6]);

  // Weekly evolution within current period
  const weekly = useMemo(() => {
    if (atualRows.length === 0) return [];
    const map = new Map<string, { fat: number; qty: number; pedidos: Set<number> }>();
    for (const r of atualRows) {
      const d = new Date(r.data);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const k = monday.toISOString().slice(0, 10);
      let e = map.get(k);
      if (!e) { e = { fat: 0, qty: 0, pedidos: new Set() }; map.set(k, e); }
      e.fat += Number(r.preco_total);
      e.qty += Number(r.quantidade);
      e.pedidos.add(r.codigo_venda);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ semana: k.slice(5), fat: v.fat, qty: v.qty, pedidos: v.pedidos.size }));
  }, [atualRows]);

  // Daily evolution + dias sem venda
  const daily = useMemo(() => {
    if (!inicio || !fim) return { rows: [] as { dia: string; fat: number; qty: number }[], semVenda: [] as string[] };
    const start = new Date(inicio + "T00:00:00");
    const end = new Date(fim + "T00:00:00");
    const map = new Map<string, { fat: number; qty: number }>();
    for (const r of atualRows) {
      const k = new Date(r.data).toISOString().slice(0, 10);
      let e = map.get(k); if (!e) { e = { fat: 0, qty: 0 }; map.set(k, e); }
      e.fat += Number(r.preco_total); e.qty += Number(r.quantidade);
    }
    const rows: { dia: string; fat: number; qty: number }[] = [];
    const semVenda: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      const e = map.get(k);
      const dia = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (e) rows.push({ dia, fat: e.fat, qty: e.qty });
      else { rows.push({ dia, fat: 0, qty: 0 }); semVenda.push(k); }
    }
    return { rows, semVenda };
  }, [atualRows, inicio, fim]);

  // Diagnostic text
  const diagnostico = useMemo(() => {
    if (productRows.length === 0) return "";
    const nomeProduto = selected.length === 0
      ? `TODOS os produtos (${allProducts.length})`
      : selected.length === 1 ? formatProductDisplay(selected[0]) : `${selected.length} produtos selecionados`;
    if (tA.fat === 0 && tC.fat === 0) return `Sem vendas para ${nomeProduto} nos períodos analisados.`;

    const varFat = calcVar(tA.fat, tC.fat);
    const varQty = calcVar(tA.qty, tC.qty);
    const varPedidos = calcVar(tA.pedidos, tC.pedidos);
    const varClientes = calcVar(tA.clientes, tC.clientes);

    const partes: string[] = [];
    if (varFat !== null) {
      const dir = varFat >= 0 ? "cresceu" : "teve queda de";
      partes.push(`O produto ${nomeProduto} ${dir} ${Math.abs(varFat).toFixed(1)}% no faturamento (${R$0(tC.fat)} → ${R$0(tA.fat)}).`);
    } else {
      partes.push(`O produto ${nomeProduto} faturou ${R$0(tA.fat)} no período (sem comparativo).`);
    }

    if (varFat !== null && varFat < 0) {
      const causas: string[] = [];
      if (reduziram.length > 0) {
        const top3 = reduziram.slice(0, 3).map(r => r.cliente).join(", ");
        const somaTop3 = reduziram.slice(0, 3).reduce((s, r) => s + Math.abs(r.diffF), 0);
        causas.push(`a redução de compra dos clientes ${top3}, que juntos representam ${R$0(somaTop3)} de queda`);
      }
      if (deixaramComprar.length > 0) {
        causas.push(`${deixaramComprar.length} cliente(s) deixaram de comprar o produto (perda de ${R$0(deixaramComprar.reduce((s, r) => s + r.fat, 0))})`);
      }
      if (varClientes !== null && varClientes < -5) {
        causas.push(`o número de clientes compradores caiu de ${tC.clientes} para ${tA.clientes}`);
      }
      if (varQty !== null && varPedidos !== null && qtyPorPedidoA < qtyPorPedidoC) {
        causas.push(`a quantidade média por pedido reduziu de ${num2(qtyPorPedidoC)} kg para ${num2(qtyPorPedidoA)} kg`);
      }
      if (causas.length > 0) {
        partes.push(`A principal causa foi ${causas.join("; ")}.`);
      }
    } else if (varFat !== null && varFat > 0) {
      const causas: string[] = [];
      if (novosNoProduto.length > 0) {
        causas.push(`a entrada de ${novosNoProduto.length} novo(s) cliente(s) (${R$0(novosNoProduto.reduce((s, r) => s + r.fat, 0))})`);
      }
      if (varClientes !== null && varClientes > 5) {
        causas.push(`a base de clientes do produto subiu de ${tC.clientes} para ${tA.clientes}`);
      }
      if (qtyPorClienteA > qtyPorClienteC) {
        causas.push(`a quantidade média por cliente subiu de ${num2(qtyPorClienteC)} kg para ${num2(qtyPorClienteA)} kg`);
      }
      if (causas.length > 0) partes.push(`O crescimento veio de ${causas.join("; ")}.`);
    }

    if (trend) {
      partes.push(`Tendência dos últimos 6 meses: ${trend.label.toLowerCase()} (${pct(trend.variacao)}). Melhor mês: ${trend.melhor.mes} (${R$0(trend.melhor.fat)}). Pior mês: ${trend.pior.mes} (${R$0(trend.pior.fat)}).`);
      if (trend.semVenda.length > 0) partes.push(`Meses sem venda: ${trend.semVenda.join(", ")}.`);
    }
    return partes.join(" ");
  }, [selected, tA, tC, reduziram, deixaramComprar, novosNoProduto, trend, qtyPorPedidoA, qtyPorPedidoC, qtyPorClienteA, qtyPorClienteC]);

  // ============ CONTINUOUS MODE COMPUTATIONS ============
  const monthlyAll = useMemo(() => {
    if (!continuousMode || !inicio || !fim || selected.length === 0) return [];
    const start = new Date(inicio + "T00:00:00");
    const end = new Date(fim + "T00:00:00");
    const buckets: { ym: string; fat: number; qty: number; pedidos: Set<number>; clientes: Set<string> }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      buckets.push({ ym: ymKey(cur), fat: 0, qty: 0, pedidos: new Set(), clientes: new Set() });
      cur.setMonth(cur.getMonth() + 1);
    }
    const idx = new Map(buckets.map((b, i) => [b.ym, i]));
    for (const r of atualRows) {
      const ym = ymKey(new Date(r.data));
      const i = idx.get(ym);
      if (i === undefined) continue;
      const b = buckets[i];
      b.fat += Number(r.preco_total);
      b.qty += Number(r.quantidade);
      b.pedidos.add(r.codigo_venda);
      b.clientes.add(consolidateCliente(r.cliente));
    }
    return buckets.map(b => ({
      mes: ymLabel(b.ym), ymRaw: b.ym, fat: b.fat, qty: b.qty,
      pedidos: b.pedidos.size, clientes: b.clientes.size,
    }));
  }, [continuousMode, inicio, fim, selected, atualRows, consolidateCliente]);

  const trendAll = useMemo(() => {
    if (monthlyAll.length < 2) return null;
    const fats = monthlyAll.map(m => m.fat);
    const half = Math.max(1, Math.floor(monthlyAll.length / 2));
    const avgIni = fats.slice(0, half).reduce((s, x) => s + x, 0) / half;
    const avgFim = fats.slice(-half).reduce((s, x) => s + x, 0) / half;
    const variacao = avgIni > 0 ? ((avgFim - avgIni) / avgIni) * 100 : 0;
    let label: "Crescente" | "Estável" | "Decrescente" = "Estável";
    if (variacao > 10) label = "Crescente";
    else if (variacao < -10) label = "Decrescente";
    const melhor = monthlyAll.reduce((b, c) => c.fat > b.fat ? c : b, monthlyAll[0]);
    const pior = monthlyAll.reduce((b, c) => c.fat < b.fat ? c : b, monthlyAll[0]);
    const semVenda = monthlyAll.filter(m => m.fat === 0).map(m => m.mes);
    // Detect drop start: first month after which a sustained decline begins
    let inicioQueda: string | null = null;
    let recuperacao: string | null = null;
    for (let i = 1; i < monthlyAll.length; i++) {
      if (monthlyAll[i].fat < monthlyAll[i - 1].fat * 0.85 && inicioQueda === null) {
        inicioQueda = monthlyAll[i].mes;
      }
      if (inicioQueda && monthlyAll[i].fat > monthlyAll[i - 1].fat * 1.15) {
        recuperacao = monthlyAll[i].mes;
      }
    }
    // Determine continuous vs pontual: count of consecutive declines in last half
    const declineCount = monthlyAll.slice(1).filter((m, i) => m.fat < monthlyAll[i].fat).length;
    const continua = declineCount >= Math.max(2, Math.floor(monthlyAll.length / 2));
    return { label, variacao, melhor, pior, semVenda, inicioQueda, recuperacao, continua, avgIni, avgFim };
  }, [monthlyAll]);

  // Per-client analysis (continuous mode) — classifica cada cliente em UMA categoria.
  const continuousClientAnalysis = useMemo(() => {
    if (!continuousMode || monthlyAll.length === 0 || atualRows.length === 0) {
      return {
        topClientes: [] as { cliente: string; fat: number; qty: number; pedidos: number; pctFat: number; pctQty: number }[],
        reduziram: [] as { cliente: string; fIni: number; fFim: number; qIni: number; qFim: number; diff: number; pct: number | null }[],
        aumentaram: [] as { cliente: string; fIni: number; fFim: number; qIni: number; qFim: number; diff: number; pct: number | null }[],
        deixaram: [] as { cliente: string; ultimoMes: string; fat: number; qty: number; pedidos: number }[],
        novos: [] as { cliente: string; primeiroMes: string; fat: number; qty: number; pedidos: number }[],
        recuperados: [] as { cliente: string; fat: number; qty: number; pedidos: number }[],
        totalQty: 0,
      };
    }
    if (!splitRanges) return {
      topClientes: [] as { cliente: string; fat: number; qty: number; pedidos: number; pctFat: number; pctQty: number }[],
      reduziram: [] as { cliente: string; fIni: number; fFim: number; qIni: number; qFim: number; diff: number; pct: number | null }[],
      aumentaram: [] as { cliente: string; fIni: number; fFim: number; qIni: number; qFim: number; diff: number; pct: number | null }[],
      deixaram: [] as { cliente: string; ultimoMes: string; fat: number; qty: number; pedidos: number }[],
      novos: [] as { cliente: string; primeiroMes: string; fat: number; qty: number; pedidos: number }[],
      recuperados: [] as { cliente: string; fat: number; qty: number; pedidos: number }[],
      totalQty: 0,
    };

    interface CliAcc {
      cliente: string;
      fat: number; qty: number;
      fIni: number; fFim: number; qIni: number; qFim: number;
      pedidos: Set<number>;
      monthsBought: Set<string>;
      firstMonth: string; lastMonth: string;
    }
    const byClient = new Map<string, CliAcc>();
    let totalQty = 0;
    for (const r of atualRows) {
      const key = consolidateCliente(r.cliente);
      if (!key) continue;
      const dKey = String(r.data).slice(0, 10);
      const ym = ymKey(new Date(r.data));
      const fat = Number(r.preco_total);
      const qty = Number(r.quantidade);
      totalQty += qty;
      let e = byClient.get(key);
      if (!e) {
        e = { cliente: key, fat: 0, qty: 0, fIni: 0, fFim: 0, qIni: 0, qFim: 0, pedidos: new Set(), monthsBought: new Set(), firstMonth: ym, lastMonth: ym };
        byClient.set(key, e);
      }
      e.fat += fat; e.qty += qty;
      e.pedidos.add(r.codigo_venda);
      e.monthsBought.add(ym);
      if (ym < e.firstMonth) e.firstMonth = ym;
      if (ym > e.lastMonth) e.lastMonth = ym;
      if (dKey >= splitRanges.firstStart && dKey <= splitRanges.firstEnd) { e.fIni += fat; e.qIni += qty; }
      if (dKey >= splitRanges.secondStart && dKey <= splitRanges.secondEnd) { e.fFim += fat; e.qFim += qty; }
    }

    const totalFat = tA.fat;
    const topClientes = [...byClient.values()]
      .map(e => ({
        cliente: e.cliente, fat: e.fat, qty: e.qty, pedidos: e.pedidos.size,
        pctFat: totalFat > 0 ? (e.fat / totalFat) * 100 : 0,
        pctQty: totalQty > 0 ? (e.qty / totalQty) * 100 : 0,
      }))
      .sort((a, b) => b.fat - a.fat).slice(0, 20);

    // Classificação MUTUAMENTE EXCLUSIVA
    const novos: { cliente: string; primeiroMes: string; fat: number; qty: number; pedidos: number }[] = [];
    const deixaram: { cliente: string; ultimoMes: string; fat: number; qty: number; pedidos: number }[] = [];
    const reduziram: { cliente: string; fIni: number; fFim: number; qIni: number; qFim: number; diff: number; pct: number | null }[] = [];
    const aumentaram: { cliente: string; fIni: number; fFim: number; qIni: number; qFim: number; diff: number; pct: number | null }[] = [];
    const recuperados: { cliente: string; fat: number; qty: number; pedidos: number }[] = [];

    for (const e of byClient.values()) {
      const compIni = e.fIni > 0;
      const compFim = e.fFim > 0;
      if (!compIni && compFim) {
        novos.push({ cliente: e.cliente, primeiroMes: ymLabel(e.firstMonth), fat: e.fat, qty: e.qty, pedidos: e.pedidos.size });
        continue;
      }
      if (compIni && !compFim) {
        deixaram.push({ cliente: e.cliente, ultimoMes: ymLabel(e.lastMonth), fat: e.fat, qty: e.qty, pedidos: e.pedidos.size });
        continue;
      }
      if (compIni && compFim) {
        const diff = e.fFim - e.fIni;
        const pct = e.fIni > 0 ? (diff / e.fIni) * 100 : null;
        // Regra crítica: impacto financeiro negativo SEMPRE entra em "reduziram".
        // Frequência, intervalo sem compra ou status de recuperação não podem excluir o cliente da retração.
        if (diff < -0.01) {
          reduziram.push({ cliente: e.cliente, fIni: e.fIni, fFim: e.fFim, qIni: e.qIni, qFim: e.qFim, diff, pct });
        } else if (diff > 0.01) {
          const firstHalfBuys = [...e.monthsBought].filter(m => m >= ymKey(new Date(`${splitRanges.firstStart}T00:00:00`)) && m <= ymKey(new Date(`${splitRanges.firstEnd}T00:00:00`))).sort();
          const lastHalfBuys = [...e.monthsBought].filter(m => m >= ymKey(new Date(`${splitRanges.secondStart}T00:00:00`)) && m <= ymKey(new Date(`${splitRanges.secondEnd}T00:00:00`))).sort();
          const lastIni = firstHalfBuys[firstHalfBuys.length - 1];
          const firstFim = lastHalfBuys[0];
          const months = monthlyAll.map(m => m.ymRaw);
          const isRecuperado = months.indexOf(firstFim) - months.indexOf(lastIni) > 1;
          if (isRecuperado) recuperados.push({ cliente: e.cliente, fat: e.fat, qty: e.qty, pedidos: e.pedidos.size });
          aumentaram.push({ cliente: e.cliente, fIni: e.fIni, fFim: e.fFim, qIni: e.qIni, qFim: e.qFim, diff, pct });
        }
        // Caso "estável" não é mostrado em quadro próprio aqui.
      }
    }

    deixaram.sort((a, b) => b.fat - a.fat);
    novos.sort((a, b) => b.fat - a.fat);
    const reduziramRanked = rankVariation(reduziram, "drop", { variationKey: "diff", percentKey: "pct", label: "deepProdutoClientesReduziram" });
    const aumentaramRanked = rankVariation(aumentaram, "growth", { variationKey: "diff", percentKey: "pct", label: "deepProdutoClientesAumentaram" });
    recuperados.sort((a, b) => b.fat - a.fat);

    return {
      topClientes,
      reduziram: reduziramRanked.slice(0, 200),
      aumentaram: aumentaramRanked.slice(0, 200),
      deixaram: deixaram.slice(0, 30),
      novos: novos.slice(0, 30),
      recuperados: recuperados.slice(0, 20),
      totalQty,
    };
  }, [continuousMode, monthlyAll, atualRows, tA.fat, splitRanges, consolidateCliente]);

  const rawFinancialImpacts = useMemo(() => {
    if (!continuousMode || !splitRanges || atualRows.length === 0) return [];
    const map = new Map<string, {
      cliente: string;
      nomesOriginais: Set<string>;
      antes: number;
      depois: number;
      qAntes: number;
      qDepois: number;
      pedidosAntes: Set<number>;
      pedidosDepois: Set<number>;
    }>();
    for (const r of atualRows) {
      const cliente = consolidateCliente(r.cliente) || "(sem cliente)";
      const dia = String(r.data).slice(0, 10);
      let e = map.get(cliente);
      if (!e) {
        e = { cliente, nomesOriginais: new Set(), antes: 0, depois: 0, qAntes: 0, qDepois: 0, pedidosAntes: new Set(), pedidosDepois: new Set() };
        map.set(cliente, e);
      }
      e.nomesOriginais.add(String(r.cliente || "(sem cliente)"));
      const fat = Number(r.preco_total ?? 0);
      const qty = Number(r.quantidade ?? 0);
      if (dia >= splitRanges.firstStart && dia <= splitRanges.firstEnd) {
        e.antes += fat;
        e.qAntes += qty;
        e.pedidosAntes.add(r.codigo_venda);
      }
      if (dia >= splitRanges.secondStart && dia <= splitRanges.secondEnd) {
        e.depois += fat;
        e.qDepois += qty;
        e.pedidosDepois.add(r.codigo_venda);
      }
    }
    return [...map.values()]
      .map((e) => ({
        cliente: e.cliente,
        nomesOriginais: [...e.nomesOriginais].sort((a, b) => a.localeCompare(b, "pt-BR")),
        antes: e.antes,
        depois: e.depois,
        impacto: e.depois - e.antes,
        qAntes: e.qAntes,
        qDepois: e.qDepois,
        pedidosAntes: e.pedidosAntes.size,
        pedidosDepois: e.pedidosDepois.size,
        pct: e.antes > 0 ? ((e.depois - e.antes) / e.antes) * 100 : null,
      }));
  }, [continuousMode, splitRanges, atualRows, consolidateCliente]);

  const continuousLabel = useMemo(() => "período analisado", []);

  const continuousDiagnostic = useMemo(() => {
    if (!continuousMode || !trendAll || selected.length === 0) return "";
    const nome = selected.length === 1 ? formatProductDisplay(selected[0]) : `${selected.length} produtos`;
    const partes: string[] = [];
    partes.push(`No ${continuousLabel}, ${nome} apresenta tendência ${trendAll.label.toLowerCase()} (${pct(trendAll.variacao)} entre 1ª e 2ª metade da janela).`);

    const cca = continuousClientAnalysis;
    const totalFat = tA.fat;

    // Quanto da queda/crescimento veio dos maiores clientes
    const reduzGrandes = cca.reduziram.slice(0, 3).reduce((s, r) => s + Math.abs(r.diff), 0);
    const perdaPerdidos = cca.deixaram.slice(0, 5).reduce((s, r) => s + r.fat, 0);
    const ganhoNovos = cca.novos.slice(0, 5).reduce((s, r) => s + r.fat, 0);
    const ganhoAumentos = cca.aumentaram.slice(0, 3).reduce((s, r) => s + r.diff, 0);

    if (trendAll.label === "Decrescente") {
      if (trendAll.inicioQueda) partes.push(`A queda começou em ${trendAll.inicioQueda}.`);
      partes.push(trendAll.continua ? "A queda é contínua ao longo dos meses, indicando problema estrutural." : "A queda é pontual, com variações entre meses.");
      if (trendAll.recuperacao) partes.push(`Houve recuperação em ${trendAll.recuperacao}.`);

      const causas: string[] = [];
      if (cca.reduziram.length > 0) {
        const top3 = cca.reduziram.slice(0, 3).map(r => r.cliente).join(", ");
        causas.push(`os principais clientes reduziram compras (${top3} — queda combinada de ${R$0(reduzGrandes)})`);
      }
      if (cca.deixaram.length > 0) {
        causas.push(`${cca.deixaram.length} cliente(s) deixaram de comprar (perda de ${R$0(perdaPerdidos)})`);
      }
      if (causas.length) partes.push(`Causas principais: ${causas.join("; ")}.`);

      // Concentração da queda
      const totalQuedaEstim = reduzGrandes + perdaPerdidos;
      if (totalQuedaEstim > 0) {
        const pctGrandes = (reduzGrandes / totalQuedaEstim) * 100;
        if (pctGrandes >= 60) partes.push(`A queda está concentrada nos maiores compradores.`);
        else if (pctGrandes <= 30 && cca.deixaram.length >= 3) partes.push(`A queda veio principalmente de muitos clientes pequenos / perda de base.`);
      }

      if (ganhoNovos > 0) partes.push(`Novos clientes compensaram parcialmente a queda (+${R$0(ganhoNovos)}).`);
    } else if (trendAll.label === "Crescente") {
      const causas: string[] = [];
      if (cca.novos.length > 0) causas.push(`entrada de ${cca.novos.length} novo(s) cliente(s) (+${R$0(ganhoNovos)})`);
      if (cca.aumentaram.length > 0) {
        const top3 = cca.aumentaram.slice(0, 3).map(r => r.cliente).join(", ");
        causas.push(`aumento de compra dos clientes ${top3} (+${R$0(ganhoAumentos)})`);
      }
      if (cca.recuperados.length > 0) causas.push(`${cca.recuperados.length} cliente(s) recuperado(s)`);
      if (causas.length) partes.push(`O crescimento veio de: ${causas.join("; ")}.`);
    }

    if (trendAll.semVenda.length > 0) partes.push(`Meses sem venda: ${trendAll.semVenda.join(", ")}.`);

    // Concentração / dependência
    if (cca.topClientes.length > 0) {
      const top1 = cca.topClientes[0];
      if (top1.pctFat > 30) partes.push(`Forte dependência de ${top1.cliente} (${top1.pctFat.toFixed(0)}% do faturamento do produto).`);
      const top5pct = cca.topClientes.slice(0, 5).reduce((s, c) => s + c.pctFat, 0);
      if (top5pct > 70) partes.push(`Os 5 maiores clientes representam ${top5pct.toFixed(0)}% da venda do produto — vendas mascaradas por poucos clientes grandes.`);
    }

    // Pedidos / quantidade média
    const totalPedidos = tA.pedidos;
    if (totalPedidos > 0) {
      const mediaQtyPedido = tA.qty / totalPedidos;
      partes.push(`Média de ${num2(mediaQtyPedido)} kg por pedido em ${num(totalPedidos)} pedido(s) e ${num(tA.clientes)} cliente(s).`);
    }

    return partes.join(" ");
  }, [continuousMode, trendAll, selected, continuousLabel, continuousClientAnalysis, tA]);

  // Alertas inteligentes (modo contínuo)
  const continuousAlertas = useMemo(() => {
    if (!continuousMode) return [] as { severidade: "alta" | "media" | "baixa"; mensagem: string }[];
    const out: { severidade: "alta" | "media" | "baixa"; mensagem: string }[] = [];
    const cca = continuousClientAnalysis;
    // Top5 que saíram do ranking: comparar 1ª vs 2ª metade
    const fatBy1 = new Map<string, number>();
    const fatBy2 = new Map<string, number>();
    if (!splitRanges) return out;
    for (const r of atualRows) {
      const k = consolidateCliente(r.cliente);
      const d = String(r.data).slice(0, 10);
      const v = Number(r.preco_total);
      if (d >= splitRanges.firstStart && d <= splitRanges.firstEnd) fatBy1.set(k, (fatBy1.get(k) ?? 0) + v);
      if (d >= splitRanges.secondStart && d <= splitRanges.secondEnd) fatBy2.set(k, (fatBy2.get(k) ?? 0) + v);
    }
    const top5_1 = [...fatBy1.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const top5_2 = new Set([...fatBy2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k));
    for (const c of top5_1) {
      if (!top5_2.has(c)) out.push({ severidade: "alta", mensagem: `${c} estava entre os Top 5 compradores e saiu do ranking na 2ª metade do período.` });
    }
    // Variação de participação grande
    const totalFat1 = [...fatBy1.values()].reduce((s, v) => s + v, 0);
    const totalFat2 = [...fatBy2.values()].reduce((s, v) => s + v, 0);
    for (const [k, v1] of fatBy1) {
      const p1 = totalFat1 > 0 ? (v1 / totalFat1) * 100 : 0;
      const v2 = fatBy2.get(k) ?? 0;
      const p2 = totalFat2 > 0 ? (v2 / totalFat2) * 100 : 0;
      if (p1 >= 15 && p2 < p1 / 2) {
        out.push({ severidade: "alta", mensagem: `${k} representava ${p1.toFixed(0)}% das vendas do produto na 1ª metade e caiu para ${p2.toFixed(0)}% na 2ª metade.` });
      }
    }
    if (cca.reduziram.length >= 3) {
      const soma = cca.reduziram.slice(0, 3).reduce((s, r) => ({ f: s.f + Math.abs(r.diff), q: s.q + Math.abs(r.qFim - r.qIni) }), { f: 0, q: 0 });
      out.push({ severidade: "alta", mensagem: `Os 3 maiores clientes em queda reduziram juntos ${R$0(soma.f)} / ${num(soma.q)} kg.` });
    }
    for (const c of cca.deixaram.slice(0, 5)) {
      out.push({ severidade: c.fat > 5000 ? "alta" : "media", mensagem: `${c.cliente} não comprou mais após ${c.ultimoMes} (havia comprado ${R$0(c.fat)}).` });
    }
    if (cca.topClientes.length > 0) {
      const top5pct = cca.topClientes.slice(0, 5).reduce((s, c) => s + c.pctFat, 0);
      if (top5pct > 70) out.push({ severidade: "media", mensagem: `O produto depende muito de poucos clientes: Top 5 representam ${top5pct.toFixed(0)}% das vendas.` });
    }
    return out.slice(0, 12);
  }, [continuousMode, continuousClientAnalysis, atualRows, splitRanges, consolidateCliente]);

  // ============ ANÁLISE EXECUTIVA (modo contínuo) ============
  // Base de clientes / frequência / concentração / classificação da causa
  const executiveSummary = useMemo(() => {
    if (!continuousMode || monthlyAll.length === 0 || atualRows.length === 0) return null;

    if (!splitRanges) return null;

    interface Acc {
      pedidos1: Set<number>; pedidos2: Set<number>;
      datas1: Set<string>; datas2: Set<string>;
      qty1: number; qty2: number; fat1: number; fat2: number;
    }
    const map = new Map<string, Acc>();
    let fat1 = 0, fat2 = 0, qty1 = 0, qty2 = 0;
    const pedidos1 = new Set<number>(), pedidos2 = new Set<number>();

    for (const r of atualRows) {
      const k = consolidateCliente(r.cliente);
      if (!k) continue;
      const dia = String(r.data).slice(0, 10);
      let e = map.get(k);
      if (!e) {
        e = { pedidos1: new Set(), pedidos2: new Set(), datas1: new Set(), datas2: new Set(), qty1: 0, qty2: 0, fat1: 0, fat2: 0 };
        map.set(k, e);
      }
      const f = Number(r.preco_total), q = Number(r.quantidade);
      if (dia >= splitRanges.firstStart && dia <= splitRanges.firstEnd) {
        e.pedidos1.add(r.codigo_venda); e.datas1.add(dia);
        e.qty1 += q; e.fat1 += f;
        pedidos1.add(r.codigo_venda); fat1 += f; qty1 += q;
      }
      if (dia >= splitRanges.secondStart && dia <= splitRanges.secondEnd) {
        e.pedidos2.add(r.codigo_venda); e.datas2.add(dia);
        e.qty2 += q; e.fat2 += f;
        pedidos2.add(r.codigo_venda); fat2 += f; qty2 += q;
      }
    }

    let clientes1 = 0, clientes2 = 0, retidos = 0, perdidos = 0, novos = 0;
    let pedidosPorCli1 = 0, pedidosPorCli2 = 0;
    let intervalSum1 = 0, intervalSum2 = 0, intervalCount1 = 0, intervalCount2 = 0;

    const calcInterval = (datas: Set<string>) => {
      if (datas.size < 2) return null;
      const arr = [...datas].sort();
      let totalDays = 0;
      for (let i = 1; i < arr.length; i++) {
        const a = new Date(arr[i - 1] + "T00:00:00").getTime();
        const b = new Date(arr[i] + "T00:00:00").getTime();
        totalDays += (b - a) / 86400000;
      }
      return totalDays / (arr.length - 1);
    };

    for (const e of map.values()) {
      const in1 = e.fat1 > 0, in2 = e.fat2 > 0;
      if (in1) clientes1++;
      if (in2) clientes2++;
      if (in1 && in2) retidos++;
      if (in1 && !in2) perdidos++;
      if (!in1 && in2) novos++;
      if (in1) {
        pedidosPorCli1 += e.pedidos1.size;
        const itv = calcInterval(e.datas1); if (itv !== null) { intervalSum1 += itv; intervalCount1++; }
      }
      if (in2) {
        pedidosPorCli2 += e.pedidos2.size;
        const itv = calcInterval(e.datas2); if (itv !== null) { intervalSum2 += itv; intervalCount2++; }
      }
    }
    pedidosPorCli1 = clientes1 > 0 ? pedidosPorCli1 / clientes1 : 0;
    pedidosPorCli2 = clientes2 > 0 ? pedidosPorCli2 / clientes2 : 0;
    const intervaloMedio1 = intervalCount1 > 0 ? intervalSum1 / intervalCount1 : 0;
    const intervaloMedio2 = intervalCount2 > 0 ? intervalSum2 / intervalCount2 : 0;

    const ticket1 = pedidos1.size > 0 ? fat1 / pedidos1.size : 0;
    const ticket2 = pedidos2.size > 0 ? fat2 / pedidos2.size : 0;
    const qtyPedido1 = pedidos1.size > 0 ? qty1 / pedidos1.size : 0;
    const qtyPedido2 = pedidos2.size > 0 ? qty2 / pedidos2.size : 0;

    const top = continuousClientAnalysis.topClientes;
    const top5pct = top.slice(0, 5).reduce((s, c) => s + c.pctFat, 0);
    const top10pct = top.slice(0, 10).reduce((s, c) => s + c.pctFat, 0);

    const varFat = calcVar(fat2, fat1);
    const varClientes = calcVar(clientes2, clientes1);
    const varPedidosCli = calcVar(pedidosPorCli2, pedidosPorCli1);
    const varTicket = calcVar(ticket2, ticket1);
    const varQtyPedido = calcVar(qtyPedido2, qtyPedido1);

    // Classificação da causa principal (apenas se houver queda)
    let causa: { codigo: "A" | "B" | "C" | "D" | "E" | "estavel" | "crescimento"; titulo: string; descricao: string } | null = null;
    if (varFat !== null && varFat < -5) {
      // Queda nos grandes clientes (Cenário A): top3 redução >= 50% da queda total
      const quedaTotal = fat1 - fat2;
      const top3Reduz = continuousClientAnalysis.reduziram.slice(0, 3).reduce((s, r) => s + Math.abs(r.diff), 0);
      const perdaPerd = continuousClientAnalysis.deixaram.slice(0, 3).reduce((s, r) => s + r.fat, 0);
      const grandeImpacto = (top3Reduz + perdaPerd) / Math.max(quedaTotal, 1);

      if (grandeImpacto >= 0.5) {
        causa = { codigo: "A", titulo: "Cenário A — Queda nos grandes clientes", descricao: `A retração está concentrada nos principais compradores (Top 3 reduções somam ${R$0(top3Reduz + perdaPerd)} de uma queda total de ${R$0(quedaTotal)}).` };
      } else if (varClientes !== null && varClientes <= -20) {
        causa = { codigo: "B", titulo: "Cenário B — Perda da base pulverizada", descricao: `A base de clientes caiu de ${clientes1} para ${clientes2} (${pct(varClientes)}). A queda veio principalmente da redução do número de clientes ativos no produto.` };
      } else if (varPedidosCli !== null && varPedidosCli <= -15) {
        causa = { codigo: "C", titulo: "Cenário C — Queda de frequência", descricao: `Os clientes continuam comprando, mas fazem menos pedidos: média caiu de ${num2(pedidosPorCli1)} para ${num2(pedidosPorCli2)} pedidos/cliente (${pct(varPedidosCli)}). Intervalo médio entre compras: ${num2(intervaloMedio1)}d → ${num2(intervaloMedio2)}d.` };
      } else if ((varTicket !== null && varTicket <= -15) || (varQtyPedido !== null && varQtyPedido <= -15)) {
        causa = { codigo: "D", titulo: "Cenário D — Queda de ticket / volume por pedido", descricao: `Mesmos clientes, mesma frequência, porém comprando menos volume. Ticket médio: ${R$0(ticket1)} → ${R$0(ticket2)} (${pct(varTicket)}). Qtd/pedido: ${num2(qtyPedido1)} → ${num2(qtyPedido2)} kg.` };
      } else {
        causa = { codigo: "B", titulo: "Cenário misto", descricao: `A queda combina perda de clientes (${perdidos}), redução de frequência e/ou redução de volume sem um fator dominante isolado.` };
      }
    } else if (varFat !== null && varFat > 5) {
      causa = { codigo: "crescimento", titulo: "Crescimento", descricao: `Faturamento subiu ${pct(varFat)} entre 1ª e 2ª metade. ${novos} novo(s) cliente(s), ${retidos} cliente(s) retidos.` };
    } else {
      causa = { codigo: "estavel", titulo: "Período estável", descricao: `Variação de faturamento dentro de ±5% entre 1ª e 2ª metade.` };
    }

    // Cenário E (concentração) é sinalizador adicional, não substitui o principal
    const concentracaoExcessiva = top5pct >= 70;

    return {
      fat1, fat2, qty1, qty2, varFat,
      precoKg1: qty1 > 0 ? fat1 / qty1 : 0,
      precoKg2: qty2 > 0 ? fat2 / qty2 : 0,
      varPrecoKg: calcVar(qty2 > 0 ? fat2 / qty2 : 0, qty1 > 0 ? fat1 / qty1 : 0),
      clientes1, clientes2, retidos, perdidos, novos, varClientes,
      pedidos1: pedidos1.size, pedidos2: pedidos2.size,
      pedidosPorCli1, pedidosPorCli2, varPedidosCli,
      intervaloMedio1, intervaloMedio2,
      ticket1, ticket2, varTicket,
      qtyPedido1, qtyPedido2, varQtyPedido,
      top5pct, top10pct, concentracaoExcessiva,
      causa,
    };
  }, [continuousMode, monthlyAll, atualRows, continuousClientAnalysis, splitRanges, consolidateCliente]);

  const mediaPorMes = monthlyAll.length > 0 ? tA.fat / monthlyAll.length : 0;

  // ============ DIAGNÓSTICO NARRATIVO (modo contínuo) ============
  // "Conta a história" do produto: causa principal, responsáveis, evidências.
  const narrativeDiagnostic = useMemo(() => {
    if (!continuousMode || !executiveSummary || selected.length === 0 || atualRows.length === 0) return null;
    const es = executiveSummary;
    const cca = continuousClientAnalysis;
    const nomeProduto = selected.length === 1 ? formatProductDisplay(selected[0]) : `${selected.length} produtos selecionados`;

    // Construir lista bruta de "responsáveis pela queda".
    // Regra crítica: ordenação EXCLUSIVA por maior impacto financeiro negativo em R$.
    // Sem filtro por frequência, canal, distribuidor, ticket ou quantidade de pedidos.
    const responsaveis = rankVariation(rawFinancialImpacts, "drop", { variationKey: "impacto", percentKey: "pct", label: "deepProdutoResponsaveisQueda" })
      .map(r => ({
        cliente: r.cliente,
        antes: r.antes,
        depois: r.depois,
        diffNeg: Math.abs(r.impacto),
        tipo: r.depois <= 0 ? "saiu" as const : "reduziu" as const,
        nomesOriginais: r.nomesOriginais,
        pedidosAntes: r.pedidosAntes,
        pedidosDepois: r.pedidosDepois,
      }));

    const ganhadores = rankVariation(rawFinancialImpacts, "growth", { variationKey: "impacto", percentKey: "pct", label: "deepProdutoResponsaveisCrescimento" })
      .map(r => ({
        cliente: r.cliente,
        antes: r.antes,
        depois: r.depois,
        diffPos: r.impacto,
        tipo: r.antes <= 0 ? "novo" as const : "aumentou" as const,
      }));

    const responsaveisSet = new Set(responsaveis.map(r => r.cliente));
    const clientesIgnorados = rawFinancialImpacts
      .filter(r => r.impacto < -0.01 && !responsaveisSet.has(r.cliente))
      .map(r => ({ cliente: r.cliente, motivo: "Impacto financeiro negativo não entrou na lista principal; verificar classificação." }));

    const quedaTotal = Math.max(0, es.fat1 - es.fat2);
    const retracaoBruta = responsaveis.reduce((s, r) => s + r.diffNeg, 0);
    const ganhoTotal = Math.max(0, es.fat2 - es.fat1);
    const variouCai = es.varFat !== null && es.varFat < -5;
    const variouSubiu = es.varFat !== null && es.varFat > 5;

    const top10Resp = responsaveis.slice(0, 10);
    const soma10 = top10Resp.reduce((s, r) => s + r.diffNeg, 0);
    const top3Resp = responsaveis.slice(0, 3);
    const soma3 = top3Resp.reduce((s, r) => s + r.diffNeg, 0);
    const pctTop3 = retracaoBruta > 0 ? (soma3 / retracaoBruta) * 100 : 0;
    const pctTop10 = retracaoBruta > 0 ? (soma10 / retracaoBruta) * 100 : 0;
    const pctBase = Math.max(0, 100 - pctTop10);
    const ganhoCompensa = ganhadores.reduce((s, g) => s + g.diffPos, 0);
    const varPedidos = calcVar(afterMetrics.pedidos, beforeMetrics.pedidos);
    const varClientes = calcVar(afterMetrics.clientes, beforeMetrics.clientes);
    const varTicket = calcVar(afterMetrics.ticket, beforeMetrics.ticket);
    const varKgPedido = calcVar(afterMetrics.kgPorPedido, beforeMetrics.kgPorPedido);
    const varPrecoKg = calcVar(afterMetrics.precoKg, beforeMetrics.precoKg);
    const varFrequencia = calcVar(afterMetrics.frequencia, beforeMetrics.frequencia);
    const varIntervalo = calcVar(afterMetrics.intervalo, beforeMetrics.intervalo);
    const varItensPedido = calcVar(afterMetrics.itensPorPedido, beforeMetrics.itensPorPedido);
    const quedaConcentrada = pctTop10 >= 55 || pctTop3 >= 35;
    const quedaPulverizada = pctTop10 < 45 && responsaveis.length >= 8;
    const quedaFrequencia = (varFrequencia ?? 0) <= -10 || (varPedidos ?? 0) <= -10 || ((varIntervalo ?? 0) >= 15 && beforeMetrics.intervalo > 0);
    const quedaVolume = (varKgPedido ?? 0) <= -10 || (varTicket ?? 0) <= -10 || (varItensPedido ?? 0) <= -10;
    const quedaPreco = (varPrecoKg ?? 0) <= -5;
    const perdaClientes = (varClientes ?? 0) <= -10;

    // ===== HEADLINE =====
    let headline = "";
    let causaCodigo: "A" | "B" | "C" | "D" | "E" | "estavel" | "crescimento" = es.causa?.codigo ?? "estavel";

    if (variouCai) {
      if (quedaConcentrada) {
        causaCodigo = "A";
        headline = `Queda concentrada em contas estratégicas: ${top10Resp.length ? top10Resp[0].cliente : "os maiores compradores"} lidera a retração.`;
      } else if (quedaPulverizada && perdaClientes) {
        causaCodigo = "B";
        headline = `Queda pulverizada: muitos clientes menores reduziram ou saíram do produto.`;
      } else if (quedaFrequencia) {
        causaCodigo = "C";
        headline = `${nomeProduto} perdeu frequência: a base compra menos vezes na 2ª metade da janela.`;
      } else if (quedaVolume) {
        causaCodigo = "D";
        headline = `${nomeProduto} caiu porque os pedidos ficaram menores em ticket, kg ou mix por pedido.`;
      } else if (quedaPreco) {
        causaCodigo = "E";
        headline = `${nomeProduto} caiu principalmente por redução do preço médio por kg.`;
      } else {
        headline = `A queda de ${nomeProduto} é MISTA — combina perda de clientes, frequência e volume.`;
      }
    } else if (variouSubiu) {
      if (ganhadores.length > 0 && ganhadores[0].diffPos / Math.max(ganhoTotal, 1) > 0.4) {
        headline = `O crescimento de ${nomeProduto} está CONCENTRADO em ${ganhadores[0].cliente}.`;
      } else if (cca.novos.length >= 3) {
        headline = `${nomeProduto} cresceu pela ENTRADA DE NOVOS CLIENTES (${cca.novos.length} novos).`;
      } else {
        headline = `${nomeProduto} cresceu de forma DISTRIBUÍDA pela base de clientes.`;
      }
    } else {
      headline = `${nomeProduto} apresenta período ESTÁVEL — variação dentro de ±5%.`;
    }

    // ===== SUBHEADLINE financeira =====
    const subheadline = es.varFat !== null
      ? `No período analisado, o faturamento ${es.fat2 >= es.fat1 ? "subiu" : "caiu"} de ${R$0(es.fat1)} para ${R$0(es.fat2)} — variação de ${pct(es.varFat)} (${es.fat2 >= es.fat1 ? "+" : ""}${R$0(es.fat2 - es.fat1)}). A retração bruta foi ${R$0(retracaoBruta)} e novos/aumentos compensaram ${R$0(ganhoCompensa)}.`
      : `Faturamento total no período: ${R$0(tA.fat)}.`;

    const mudou = [
      { metrica: "Faturamento", antes: R$(beforeMetrics.fat), depois: R$(afterMetrics.fat), variacao: calcVar(afterMetrics.fat, beforeMetrics.fat) },
      { metrica: "Nº de pedidos contendo o item", antes: num(beforeMetrics.pedidos), depois: num(afterMetrics.pedidos), variacao: varPedidos },
      { metrica: "Clientes compradores", antes: num(beforeMetrics.clientes), depois: num(afterMetrics.clientes), variacao: varClientes },
      { metrica: "Ticket médio por pedido", antes: R$(beforeMetrics.ticket), depois: R$(afterMetrics.ticket), variacao: varTicket },
      { metrica: "Kg médio por pedido", antes: `${num2(beforeMetrics.kgPorPedido)} kg`, depois: `${num2(afterMetrics.kgPorPedido)} kg`, variacao: varKgPedido },
      { metrica: "Preço médio por kg", antes: R$(beforeMetrics.precoKg), depois: R$(afterMetrics.precoKg), variacao: varPrecoKg },
      { metrica: "Frequência média de compra", antes: `${num2(beforeMetrics.frequencia)} pedidos/cliente`, depois: `${num2(afterMetrics.frequencia)} pedidos/cliente`, variacao: varFrequencia },
      { metrica: "Intervalo médio entre compras", antes: beforeMetrics.intervalo ? `${num2(beforeMetrics.intervalo)} dias` : "—", depois: afterMetrics.intervalo ? `${num2(afterMetrics.intervalo)} dias` : "—", variacao: varIntervalo },
    ];

    // ===== EVIDÊNCIAS =====
    const evidencias: { titulo: string; texto: string; destaque?: boolean }[] = [];

    if (variouCai) {
      // 1. Concentração da queda
      if (top3Resp.length > 0 && quedaTotal > 0) {
        const lista = top3Resp.map(r => `${r.cliente} (${R$0(r.antes)} → ${R$0(r.depois)}, -${R$0(r.diffNeg)})`).join("; ");
        evidencias.push({
          titulo: "Onde está a queda",
          texto: `Os 3 maiores responsáveis pela queda são: ${lista}. Juntos representam ${pctTop3.toFixed(0)}% de toda a retração do produto.`,
          destaque: pctTop3 >= 50,
        });
      }
      // 2. Top 10 vs base pulverizada
      if (top10Resp.length > 0 && retracaoBruta > 0) {
        evidencias.push({
          titulo: "Top 10 vs base",
          texto: pctTop10 >= 70
            ? `Top 10 respondem por ${pctTop10.toFixed(0)}% da retração bruta — a perda está nos clientes grandes, não na base.`
            : `Top 10 respondem por ${pctTop10.toFixed(0)}% da retração bruta; o restante (${pctBase.toFixed(0)}%) veio da base pulverizada.`,
          destaque: pctTop10 >= 55,
        });
      }
      // 3. Base de clientes
      if (es.varClientes !== null) {
        const direcao = es.clientes2 < es.clientes1 ? "encolheu" : es.clientes2 > es.clientes1 ? "cresceu" : "manteve";
        evidencias.push({
          titulo: "Base de clientes",
          texto: `A base de compradores ${direcao} de ${es.clientes1} para ${es.clientes2} (${pct(es.varClientes)}). ${es.perdidos} cliente(s) deixaram de comprar e ${es.novos} novo(s) entraram. Retenção: ${es.clientes1 > 0 ? ((es.retidos / es.clientes1) * 100).toFixed(0) : 0}%.`,
          destaque: es.varClientes <= -20,
        });
      }
      // 4. Frequência
      if (es.varPedidosCli !== null && Math.abs(es.varPedidosCli) >= 10) {
        const dir = es.varPedidosCli < 0 ? "caiu" : "subiu";
        evidencias.push({
          titulo: "Frequência de compra",
          texto: `Pedidos por cliente ${dir} de ${num2(es.pedidosPorCli1)} para ${num2(es.pedidosPorCli2)} (${pct(es.varPedidosCli)}). Intervalo médio entre compras: ${num2(es.intervaloMedio1)} dias → ${num2(es.intervaloMedio2)} dias.`,
          destaque: es.varPedidosCli <= -15,
        });
      }
      // 5. Ticket / volume
      if ((es.varTicket !== null && Math.abs(es.varTicket) >= 10) || (es.varQtyPedido !== null && Math.abs(es.varQtyPedido) >= 10)) {
        evidencias.push({
          titulo: "Ticket e volume por pedido",
          texto: `Ticket médio: ${R$0(es.ticket1)} → ${R$0(es.ticket2)} (${pct(es.varTicket)}). Quantidade média por pedido: ${num2(es.qtyPedido1)} kg → ${num2(es.qtyPedido2)} kg (${pct(es.varQtyPedido)}).`,
          destaque: (es.varTicket ?? 0) <= -15 || (es.varQtyPedido ?? 0) <= -15,
        });
      }
      // 6. Compensação
      if (ganhoCompensa > 0 && quedaTotal > 0) {
        const pctComp = (ganhoCompensa / quedaTotal) * 100;
        evidencias.push({
          titulo: "Tentativas de compensação",
          texto: `${ganhadores.length} cliente(s) aumentaram ou entraram, somando +${R$0(ganhoCompensa)} — compensaram ${pctComp.toFixed(0)}% da queda. ${pctComp < 50 ? "Insuficiente para reverter o cenário." : "Compensação significativa, mas ainda não suficiente."}`,
        });
      }
      if (quedaPreco) {
        evidencias.push({
          titulo: "Preço médio",
          texto: `Preço médio por kg caiu de ${R$(beforeMetrics.precoKg)} para ${R$(afterMetrics.precoKg)} (${pct(varPrecoKg)}), reduzindo faturamento mesmo quando existe volume vendido.`,
          destaque: true,
        });
      }
    } else if (variouSubiu) {
      const top3Ganh = ganhadores.slice(0, 3);
      const soma3G = top3Ganh.reduce((s, g) => s + g.diffPos, 0);
      const pctTop3G = ganhoTotal > 0 ? (soma3G / ganhoTotal) * 100 : 0;
      if (top3Ganh.length > 0) {
        const lista = top3Ganh.map(g => `${g.cliente} (${g.tipo === "novo" ? "novo, +" + R$0(g.depois) : R$0(g.antes) + " → " + R$0(g.depois) + ", +" + R$0(g.diffPos)})`).join("; ");
        evidencias.push({
          titulo: "Onde está o crescimento",
          texto: `Os 3 maiores responsáveis pelo crescimento: ${lista}. Juntos representam ${pctTop3G.toFixed(0)}% do ganho total.`,
          destaque: pctTop3G >= 50,
        });
      }
      if (cca.novos.length > 0) {
        const fatNovos = cca.novos.reduce((s, n) => s + n.fat, 0);
        evidencias.push({
          titulo: "Novos clientes",
          texto: `${cca.novos.length} cliente(s) novo(s) começaram a comprar, somando ${R$0(fatNovos)}.`,
        });
      }
      if (es.varPedidosCli !== null && es.varPedidosCli > 10) {
        evidencias.push({
          titulo: "Mais pedidos por cliente",
          texto: `Pedidos por cliente subiram de ${num2(es.pedidosPorCli1)} para ${num2(es.pedidosPorCli2)} (${pct(es.varPedidosCli)}).`,
        });
      }
    }

    // 7. Concentração de risco (sempre)
    if (es.top5pct >= 70) {
      evidencias.push({
        titulo: "⚠ Risco de concentração",
        texto: `Os 5 maiores clientes representam ${es.top5pct.toFixed(0)}% das vendas do produto. Forte dependência — qualquer perda nesses clientes derruba o produto.`,
        destaque: true,
      });
    }

    // ===== CONCLUSÃO =====
    let conclusao = "";
    if (variouCai) {
      if (causaCodigo === "A") {
        conclusao = `Ação recomendada: priorizar visita / negociação com ${top3Resp.map(r => r.cliente).slice(0, 3).join(", ")} para entender o motivo da retração e tentar recuperar volume.`;
      } else if (causaCodigo === "B") {
        conclusao = `Ação recomendada: a perda é pulverizada — investigar se o produto perdeu competitividade (preço, qualidade, disponibilidade) ou se houve mudança no mix da base.`;
      } else if (causaCodigo === "C") {
        conclusao = `Ação recomendada: trabalhar a recompra e lembrança — campanha de reativação para os clientes que reduziram a frequência.`;
      } else if (causaCodigo === "D") {
        conclusao = `Ação recomendada: revisar política comercial (descontos por volume, embalagens, mix) — clientes estão pedindo o produto, mas em menor quantidade.`;
      } else if (causaCodigo === "E") {
        conclusao = `Ação recomendada: auditar preço médio, descontos e mix vendido por cliente; recuperar margem antes de buscar apenas mais volume.`;
      } else {
        conclusao = `Ação recomendada: atacar em duas frentes — recuperar grandes clientes em queda e reativar base perdida.`;
      }
    } else if (variouSubiu) {
      conclusao = `Ação recomendada: replicar o que está funcionando com os clientes em alta para outros perfis similares.`;
    } else {
      conclusao = `Período estável — manter atendimento e monitorar para detectar mudanças no início.`;
    }

    return {
      headline,
      subheadline,
      causaCodigo,
      evidencias,
      mudou,
      topResponsaveis: top10Resp.map(r => ({
        ...r,
        pctDaQueda: retracaoBruta > 0 ? (r.diffNeg / retracaoBruta) * 100 : 0,
      })),
      topGanhadores: ganhadores.slice(0, 10).map(g => ({
        ...g,
        pctDoGanho: ganhoTotal > 0 ? (g.diffPos / ganhoTotal) * 100 : 0,
      })),
      topImpactosBrutos: rankVariation(rawFinancialImpacts, "drop", { variationKey: "impacto", percentKey: "pct", label: "deepProdutoTopImpactosBrutos" }).slice(0, 30),
      clientesIgnorados,
      quedaTotal,
      retracaoBruta,
      top10Share: pctTop10,
      baseShare: pctBase,
      compensacaoTotal: ganhoCompensa,
      ganhoTotal,
      conclusao,
      isQueda: variouCai,
      isCrescimento: variouSubiu,
    };
  }, [continuousMode, executiveSummary, continuousClientAnalysis, selected, atualRows, tA.fat, beforeMetrics, afterMetrics, rawFinancialImpacts]);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> Análise Profunda por Produto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selector */}
        <div className="space-y-2">
          <Label className="text-xs">Selecione 1 ou mais produtos (vazio = TODOS os produtos)</Label>
          <SearchableCombobox
            options={allProducts}
            value={selected}
            onValueChange={setSelected}
            placeholder={`Todos os produtos (${allProducts.length})`}
            searchPlaceholder="Buscar produto..."
            allLabel={`Todos os produtos (${allProducts.length})`}
            applyMode={false}
          />
          {selected.length === 0 && allProducts.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Analisando <strong>TODOS</strong> os {allProducts.length} produtos consolidados.
            </p>
          )}
          {!continuousMode && !hasUserComp && (
            <p className="text-[11px] text-muted-foreground">
              Sem período comparativo definido — usando janela equivalente anterior ({compStart} → {compEnd}) e tendência dos últimos 6 meses.
            </p>
          )}
          {continuousMode && (
            <p className="text-[11px] text-muted-foreground">
              Modo contínuo ativo — análise por evolução da janela ({formatShortDate(inicio)} → {formatShortDate(fim)}).
            </p>
          )}
        </div>

        {productRows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Sem dados de produto para os filtros atuais.
          </div>
        ) : (
          <>
            {/* Debug toggle */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Período atual: <strong>{inicio || "—"} → {fim || "—"}</strong> · Comparativo: <strong>{compStart || "—"} → {compEnd || "—"}</strong>
                {vendedoresFilter.length > 0 && <> · Vendedor(es): <strong>{vendedoresFilter.join(", ")}</strong></>}
              </p>
              <button
                type="button"
                onClick={() => setShowDebug(v => !v)}
                className="text-[11px] underline text-muted-foreground hover:text-foreground"
              >
                {showDebug ? "Ocultar debug" : "Mostrar debug"}
              </button>
            </div>

            {showDebug && (
              <div className="rounded border border-dashed border-primary/40 bg-primary/5 p-3 text-[11px] space-y-2 font-mono">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-bold text-xs">ATUAL ({inicio} → {fim})</p>
                    <p>Total faturamento: <strong>{R$(tA.fat)}</strong></p>
                    <p>Linhas usadas: <strong>{atualRows.length}</strong></p>
                    <p>Pedidos únicos: <strong>{tA.pedidos}</strong></p>
                    <p className="mt-1">Códigos de venda:</p>
                    <p className="break-all">{[...new Set(atualRows.map(r => r.codigo_venda))].sort((a, b) => a - b).join(", ") || "—"}</p>
                  </div>
                  <div>
                    <p className="font-bold text-xs">COMPARATIVO ({compStart} → {compEnd})</p>
                    <p>Total faturamento: <strong>{R$(tC.fat)}</strong></p>
                    <p>Linhas usadas: <strong>{compRows.length}</strong></p>
                    <p>Pedidos únicos: <strong>{tC.pedidos}</strong></p>
                    <p className="mt-1">Códigos de venda:</p>
                    <p className="break-all">{[...new Set(compRows.map(r => r.codigo_venda))].sort((a, b) => a - b).join(", ") || "—"}</p>
                  </div>
                </div>
                <details>
                  <summary className="cursor-pointer">Ver linhas detalhadas (atual)</summary>
                  <div className="max-h-48 overflow-auto mt-1">
                    {atualRows.map((r, i) => (
                      <div key={i}>{String(r.data).slice(0, 10)} · #{r.codigo_venda} · {r.vendedor} · {r.descricao} · {num(Number(r.quantidade))} · {R$(Number(r.preco_total))} · {r.cliente}</div>
                    ))}
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer">Ver linhas detalhadas (comparativo)</summary>
                  <div className="max-h-48 overflow-auto mt-1">
                    {compRows.map((r, i) => (
                      <div key={i}>{String(r.data).slice(0, 10)} · #{r.codigo_venda} · {r.vendedor} · {r.descricao} · {num(Number(r.quantidade))} · {R$(Number(r.preco_total))} · {r.cliente}</div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* KPIs */}
            {continuousMode ? (
              <div className="space-y-4">
                {/* KPIs contínuos */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  <MiniKpi title="Faturamento total" atual={R$(tA.fat)} icon={DollarSign} />
                  <MiniKpi title="Quantidade total" atual={kg(tA.qty)} icon={Package} />
                  <MiniKpi title="Pedidos" atual={num(tA.pedidos)} icon={ShoppingCart} />
                  <MiniKpi title="Clientes" atual={num(tA.clientes)} icon={Users} />
                  <MiniKpi title="Média / mês" atual={R$(mediaPorMes)} icon={Calendar} />
                  <MiniKpi title="Média / pedido" atual={R$(ticketA)} icon={DollarSign} />
                  <MiniKpi title="Média / cliente" atual={R$(tA.clientes > 0 ? tA.fat / tA.clientes : 0)} icon={Users} />
                  {trendAll && (
                    <Card>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">Tendência</span>
                          {trendAll.label === "Crescente" ? <TrendingUp className="h-3.5 w-3.5 text-green-600" /> : trendAll.label === "Decrescente" ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                        <p className={`text-lg font-bold leading-tight ${trendAll.label === "Crescente" ? "text-green-600" : trendAll.label === "Decrescente" ? "text-red-500" : ""}`}>{trendAll.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{pct(trendAll.variacao)} (1ª vs 2ª metade)</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* DIAGNÓSTICO COMERCIAL — Narrativo automático */}
                {narrativeDiagnostic && (
                  <Card className={`border-2 ${
                    narrativeDiagnostic.isQueda ? "border-red-500/60 bg-red-500/5" :
                    narrativeDiagnostic.isCrescimento ? "border-green-500/60 bg-green-500/5" :
                    "border-primary/40 bg-primary/5"
                  }`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-full ${
                          narrativeDiagnostic.isQueda ? "bg-red-500/15" :
                          narrativeDiagnostic.isCrescimento ? "bg-green-500/15" :
                          "bg-primary/15"
                        }`}>
                          <Brain className={`h-5 w-5 ${
                            narrativeDiagnostic.isQueda ? "text-red-600" :
                            narrativeDiagnostic.isCrescimento ? "text-green-600" :
                            "text-primary"
                          }`} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Diagnóstico Comercial</p>
                          <CardTitle className="text-base">Por que o produto {narrativeDiagnostic.isQueda ? "caiu" : narrativeDiagnostic.isCrescimento ? "cresceu" : "está estável"}?</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* HEADLINE */}
                      <div>
                        <p className={`text-lg font-bold leading-tight ${
                          narrativeDiagnostic.isQueda ? "text-red-700" :
                          narrativeDiagnostic.isCrescimento ? "text-green-700" :
                          "text-foreground"
                        }`}>
                          {narrativeDiagnostic.headline}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">{narrativeDiagnostic.subheadline}</p>
                      </div>

                      {/* O QUE MUDOU */}
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">O que mudou — 1ª metade vs 2ª metade</p>
                        <div className="sheet-table rounded border overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/60">
                              <tr>
                                <th className="text-left p-2 font-semibold">Métrica</th>
                                <th className="text-right p-2 font-semibold">Antes</th>
                                <th className="text-right p-2 font-semibold">Depois</th>
                                <th className="text-right p-2 font-semibold">Variação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {narrativeDiagnostic.mudou.map((m) => (
                                <tr key={m.metrica} className="border-t">
                                  <td className="p-2 font-medium">{m.metrica}</td>
                                  <td className="p-2 text-right">{m.antes}</td>
                                  <td className="p-2 text-right">{m.depois}</td>
                                  <td className="p-2 text-right"><VarBadge value={m.variacao} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {splitRanges && (
                          <p className="text-[10px] text-muted-foreground mt-1">Antes: {splitRanges.firstLabel} · Depois: {splitRanges.secondLabel}</p>
                        )}
                      </div>

                      {/* EVIDÊNCIAS */}
                      {narrativeDiagnostic.evidencias.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Evidências</p>
                          {narrativeDiagnostic.evidencias.map((ev, i) => (
                            <div key={i} className={`p-3 rounded border-l-4 ${
                              ev.destaque
                                ? (narrativeDiagnostic.isQueda ? "border-l-red-500 bg-red-500/10" : "border-l-green-500 bg-green-500/10")
                                : "border-l-muted-foreground/40 bg-muted/40"
                            }`}>
                              <p className="text-xs font-bold mb-1">{ev.titulo}</p>
                              {ev.titulo === "Top 10 vs base" && narrativeDiagnostic.topResponsaveis.length > 0 ? (
                                <TooltipProvider delayDuration={150}>
                                  <UiTooltip>
                                    <TooltipTrigger asChild>
                                      <p className="text-sm leading-snug underline decoration-dotted underline-offset-2 cursor-help">{ev.texto}</p>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[360px] p-0" side="bottom">
                                      <div className="p-2">
                                        <p className="text-xs font-semibold mb-1">Clientes que compõem o Top 10 da retração</p>
                                        <table className="w-full text-[11px]">
                                          <tbody>
                                            {narrativeDiagnostic.topResponsaveis.map((r) => (
                                              <tr key={r.cliente} className="border-t border-border/40">
                                                <td className="py-1 pr-2 max-w-[220px] truncate">{r.cliente}</td>
                                                <td className="py-1 text-right font-medium">−{R$0(r.diffNeg)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </TooltipContent>
                                  </UiTooltip>
                                </TooltipProvider>
                              ) : (
                                <p className="text-sm leading-snug">{ev.texto}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* TOP RESPONSÁVEIS pela queda */}
                      {narrativeDiagnostic.isQueda && narrativeDiagnostic.topResponsaveis.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                            PRINCIPAIS RESPONSÁVEIS PELA QUEDA — {R$0(narrativeDiagnostic.retracaoBruta)} de retração bruta
                          </p>
                          <div className="rounded border border-red-500/20 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-red-500/10">
                                <tr>
                                  <th className="text-left p-2 font-semibold">#</th>
                                  <th className="text-left p-2 font-semibold">Cliente</th>
                                  <th className="text-right p-2 font-semibold">Antes</th>
                                  <th className="text-right p-2 font-semibold">Depois</th>
                                  <th className="text-right p-2 font-semibold">Impacto</th>
                                  <th className="text-right p-2 font-semibold">% da queda</th>
                                </tr>
                              </thead>
                              <tbody>
                                {narrativeDiagnostic.topResponsaveis.map((r, i) => (
                                  <tr key={i} className="border-t border-red-500/10">
                                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                                    <td className="p-2 font-medium">
                                      {r.cliente}
                                      {r.tipo === "saiu" && <Badge variant="outline" className="ml-1 text-[9px] py-0 h-4 border-red-500/40 text-red-600">SAIU</Badge>}
                                    </td>
                                    <td className="p-2 text-right">{R$0(r.antes)}</td>
                                    <td className="p-2 text-right">{R$0(r.depois)}</td>
                                    <td className="p-2 text-right text-red-600 font-semibold">−{R$0(r.diffNeg)}</td>
                                    <td className="p-2 text-right">
                                      <span className={`font-bold ${r.pctDaQueda >= 20 ? "text-red-700" : "text-red-500"}`}>
                                        {r.pctDaQueda.toFixed(1)}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* DEBUG OBRIGATÓRIO — auditoria sem filtro de IA */}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <Card className="border-dashed">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Top impactos financeiros brutos</CardTitle>
                            <p className="text-[11px] text-muted-foreground">Soma direta por cliente consolidado, ordenada apenas pelo maior impacto financeiro negativo em R$.</p>
                          </CardHeader>
                          <CardContent className="p-0">
                            <div className="overflow-auto max-h-[320px]">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                                    <TableHead className="text-xs text-right sticky top-0 bg-background">Antes</TableHead>
                                    <TableHead className="text-xs text-right sticky top-0 bg-background">Depois</TableHead>
                                    <TableHead className="text-xs text-right sticky top-0 bg-background">Impacto</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {narrativeDiagnostic.topImpactosBrutos.map((r) => (
                                    <TableRow key={r.cliente}>
                                      <TableCell className="text-xs font-medium max-w-[240px] truncate" title={r.nomesOriginais.join(" | ")}>{r.cliente}</TableCell>
                                      <TableCell className="text-xs text-right">{R$(r.antes)}</TableCell>
                                      <TableCell className="text-xs text-right">{R$(r.depois)}</TableCell>
                                      <TableCell className={`text-xs text-right font-semibold ${r.impacto < 0 ? "text-red-500" : r.impacto > 0 ? "text-green-600" : "text-muted-foreground"}`}>{R$(r.impacto)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-dashed">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Clientes ignorados pela análise</CardTitle>
                            <p className="text-[11px] text-muted-foreground">Audita clientes com impacto negativo que não apareceram na lista principal.</p>
                          </CardHeader>
                          <CardContent className="p-0">
                            <div className="overflow-auto max-h-[320px]">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                                    <TableHead className="text-xs sticky top-0 bg-background">Motivo da exclusão</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {narrativeDiagnostic.clientesIgnorados.length === 0 ? (
                                    <TableRow><TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-4">Nenhum cliente com impacto financeiro negativo foi excluído da lista principal.</TableCell></TableRow>
                                  ) : narrativeDiagnostic.clientesIgnorados.map((r) => (
                                    <TableRow key={r.cliente}>
                                      <TableCell className="text-xs font-medium">{r.cliente}</TableCell>
                                      <TableCell className="text-xs">{r.motivo}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* TOP GANHADORES (crescimento) */}
                      {narrativeDiagnostic.isCrescimento && narrativeDiagnostic.topGanhadores.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                            Top responsáveis pelo crescimento — +{R$0(narrativeDiagnostic.ganhoTotal)} de ganho total
                          </p>
                          <div className="rounded border border-green-500/20 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-green-500/10">
                                <tr>
                                  <th className="text-left p-2 font-semibold">#</th>
                                  <th className="text-left p-2 font-semibold">Cliente</th>
                                  <th className="text-right p-2 font-semibold">Antes</th>
                                  <th className="text-right p-2 font-semibold">Depois</th>
                                  <th className="text-right p-2 font-semibold">Impacto</th>
                                  <th className="text-right p-2 font-semibold">% do ganho</th>
                                </tr>
                              </thead>
                              <tbody>
                                {narrativeDiagnostic.topGanhadores.map((g, i) => (
                                  <tr key={i} className="border-t border-green-500/10">
                                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                                    <td className="p-2 font-medium">
                                      {g.cliente}
                                      {g.tipo === "novo" && <Badge variant="outline" className="ml-1 text-[9px] py-0 h-4 border-green-500/40 text-green-600">NOVO</Badge>}
                                    </td>
                                    <td className="p-2 text-right">{R$0(g.antes)}</td>
                                    <td className="p-2 text-right">{R$0(g.depois)}</td>
                                    <td className="p-2 text-right text-green-600 font-semibold">+{R$0(g.diffPos)}</td>
                                    <td className="p-2 text-right">
                                      <span className={`font-bold ${g.pctDoGanho >= 20 ? "text-green-700" : "text-green-600"}`}>
                                        {g.pctDoGanho.toFixed(1)}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* CONCLUSÃO */}
                      <div className={`p-3 rounded border ${
                        narrativeDiagnostic.isQueda ? "border-red-500/30 bg-red-500/10" :
                        narrativeDiagnostic.isCrescimento ? "border-green-500/30 bg-green-500/10" :
                        "border-primary/30 bg-primary/10"
                      }`}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Conclusão / Próxima ação</p>
                        <p className="text-sm font-medium">{narrativeDiagnostic.conclusao}</p>
                      </div>

                      <details className="rounded border border-dashed bg-background/70 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Ver cálculos da análise</summary>
                        <div className="mt-3 space-y-3 text-[11px]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded bg-muted/40 p-2">
                              <p className="font-semibold mb-1">Fórmulas usadas</p>
                              <p>Faturamento = soma direta de Preço Venda Total (R$) das linhas do produto.</p>
                              <p>Impacto por cliente = faturamento depois − faturamento antes.</p>
                              <p>% da retração = impacto negativo do cliente ÷ retração bruta dos clientes que caíram.</p>
                              <p>Pedidos = contagem distinta de Código Venda, sem remover linhas de SKUs repetidos no faturamento.</p>
                            </div>
                            <div className="rounded bg-muted/40 p-2">
                              <p className="font-semibold mb-1">Resumo auditável</p>
                              <p>Linhas antes: <strong>{beforeRows.length}</strong> · linhas depois: <strong>{afterRows.length}</strong></p>
                              <p>Soma da retração bruta: <strong>{R$(narrativeDiagnostic.retracaoBruta)}</strong></p>
                              <p>Compensação por novos/aumentos: <strong>{R$(narrativeDiagnostic.compensacaoTotal)}</strong></p>
                              <p>Top 10 vs base: <strong>{narrativeDiagnostic.top10Share.toFixed(1)}%</strong> / <strong>{narrativeDiagnostic.baseShare.toFixed(1)}%</strong></p>
                            </div>
                          </div>
                          <div className="sheet-table rounded border overflow-auto max-h-60">
                            <table className="w-full">
                              <thead className="bg-muted/60 sticky top-0"><tr><th className="text-left p-2">Cliente considerado</th><th className="text-right p-2">Antes</th><th className="text-right p-2">Depois</th><th className="text-right p-2">Impacto</th></tr></thead>
                              <tbody>
                                {narrativeDiagnostic.topResponsaveis.map((r) => (
                                  <tr key={r.cliente} className="border-t"><td className="p-2">{r.cliente}</td><td className="p-2 text-right">{R$(r.antes)}</td><td className="p-2 text-right">{R$(r.depois)}</td><td className="p-2 text-right text-red-600">−{R$(r.diffNeg)}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                )}

                {/* Diagnóstico inteligente — texto resumido (mantido como leitura rápida) */}
                {continuousDiagnostic && (
                  <Alert className="border-primary/30 bg-primary/5">
                    <Brain className="h-4 w-4" />
                    <AlertDescription className="text-sm">{continuousDiagnostic}</AlertDescription>
                  </Alert>
                )}

                {/* Resumo Executivo + Base + Frequência + Concentração */}
                {executiveSummary && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Resumo executivo */}
                    <Card className={`border-l-4 ${
                      executiveSummary.causa?.codigo === "crescimento" ? "border-l-green-500" :
                      executiveSummary.causa?.codigo === "estavel" ? "border-l-muted-foreground" :
                      "border-l-red-500"
                    }`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Brain className="h-4 w-4" /> Resumo Executivo — Causa Principal
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm font-bold">{executiveSummary.causa?.titulo}</p>
                        <p className="text-xs text-muted-foreground leading-snug">{executiveSummary.causa?.descricao}</p>
                        {executiveSummary.concentracaoExcessiva && (
                          <p className="text-[11px] text-yellow-700 bg-yellow-500/10 p-1.5 rounded">
                            ⚠ Cenário E — Concentração excessiva: Top 5 representam {executiveSummary.top5pct.toFixed(0)}% das vendas.
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">1ª metade</span>
                            <p className="font-semibold">{R$0(executiveSummary.fat1)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">2ª metade</span>
                            <p className="font-semibold">{R$0(executiveSummary.fat2)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Variação</span>
                            <p><VarBadge value={executiveSummary.varFat} /></p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Δ absoluto</span>
                            <p className={executiveSummary.fat2 - executiveSummary.fat1 >= 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                              {R$0(executiveSummary.fat2 - executiveSummary.fat1)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Base de Clientes */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Users className="h-4 w-4" /> Base de Clientes (1ª vs 2ª metade)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">Antes</p>
                            <p className="text-base font-bold">{num(executiveSummary.clientes1)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">Agora</p>
                            <p className="text-base font-bold">{num(executiveSummary.clientes2)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">Variação</p>
                            <p className="text-base font-bold"><VarBadge value={executiveSummary.varClientes} /></p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t">
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">Retidos</p>
                            <p className="text-sm font-semibold text-green-600">{num(executiveSummary.retidos)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">Perdidos</p>
                            <p className="text-sm font-semibold text-red-500">{num(executiveSummary.perdidos)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">Novos</p>
                            <p className="text-sm font-semibold text-blue-600">{num(executiveSummary.novos)}</p>
                          </div>
                        </div>
                        {executiveSummary.clientes1 > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Retenção: {((executiveSummary.retidos / executiveSummary.clientes1) * 100).toFixed(0)}% · Churn: {((executiveSummary.perdidos / executiveSummary.clientes1) * 100).toFixed(0)}%
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Frequência */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4" /> Frequência de Compra
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground text-[10px] uppercase">
                              <th className="text-left font-medium pb-1">Métrica</th>
                              <th className="text-right font-medium pb-1">1ª metade</th>
                              <th className="text-right font-medium pb-1">2ª metade</th>
                              <th className="text-right font-medium pb-1">Var.</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t">
                              <td className="py-1">Pedidos / cliente</td>
                              <td className="text-right py-1">{num2(executiveSummary.pedidosPorCli1)}</td>
                              <td className="text-right py-1">{num2(executiveSummary.pedidosPorCli2)}</td>
                              <td className="text-right py-1"><VarBadge value={executiveSummary.varPedidosCli} /></td>
                            </tr>
                            <tr className="border-t">
                              <td className="py-1">Intervalo médio (dias)</td>
                              <td className="text-right py-1">{num2(executiveSummary.intervaloMedio1)}</td>
                              <td className="text-right py-1">{num2(executiveSummary.intervaloMedio2)}</td>
                              <td className="text-right py-1"><VarBadge value={calcVar(executiveSummary.intervaloMedio2, executiveSummary.intervaloMedio1)} /></td>
                            </tr>
                            <tr className="border-t">
                              <td className="py-1">Ticket médio</td>
                              <td className="text-right py-1">{R$0(executiveSummary.ticket1)}</td>
                              <td className="text-right py-1">{R$0(executiveSummary.ticket2)}</td>
                              <td className="text-right py-1"><VarBadge value={executiveSummary.varTicket} /></td>
                            </tr>
                            <tr className="border-t">
                              <td className="py-1">Qtd / pedido (kg)</td>
                              <td className="text-right py-1">{num2(executiveSummary.qtyPedido1)}</td>
                              <td className="text-right py-1">{num2(executiveSummary.qtyPedido2)}</td>
                              <td className="text-right py-1"><VarBadge value={executiveSummary.varQtyPedido} /></td>
                            </tr>
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>

                    {/* Concentração */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className={`h-4 w-4 ${executiveSummary.concentracaoExcessiva ? "text-yellow-600" : "text-muted-foreground"}`} /> Concentração da Carteira
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">% Top 5</p>
                            <p className={`text-base font-bold ${executiveSummary.top5pct >= 70 ? "text-yellow-600" : executiveSummary.top5pct >= 50 ? "text-orange-500" : ""}`}>{executiveSummary.top5pct.toFixed(1)}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] uppercase">% Top 10</p>
                            <p className="text-base font-bold">{executiveSummary.top10pct.toFixed(1)}%</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Risco de concentração: {executiveSummary.top5pct >= 70 ? "ALTO — produto depende de poucos compradores" : executiveSummary.top5pct >= 50 ? "MÉDIO" : "BAIXO — base bem distribuída"}.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Gráfico evolução mensal */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Evolução mês a mês
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyAll} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="left" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number, name) => name === "Faturamento" ? R$(v) : num(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line yAxisId="left" type="monotone" dataKey="fat" name="Faturamento" stroke="hsl(32, 90%, 50%)" strokeWidth={2} />
                          <Line yAxisId="right" type="monotone" dataKey="pedidos" name="Pedidos" stroke="hsl(210, 70%, 50%)" strokeWidth={2} />
                          <Line yAxisId="right" type="monotone" dataKey="clientes" name="Clientes" stroke="hsl(142, 60%, 40%)" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-auto mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Mês</TableHead>
                            <TableHead className="text-xs text-right">Faturamento</TableHead>
                            <TableHead className="text-xs text-right">Quantidade</TableHead>
                            <TableHead className="text-xs text-right">Pedidos</TableHead>
                            <TableHead className="text-xs text-right">Clientes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monthlyAll.map(m => (
                            <TableRow key={m.ymRaw}>
                              <TableCell className="text-xs font-medium">{m.mes}</TableCell>
                              <TableCell className="text-xs text-right">{R$(m.fat)}</TableCell>
                              <TableCell className="text-xs text-right">{kg(m.qty)}</TableCell>
                              <TableCell className="text-xs text-right">{num(m.pedidos)}</TableCell>
                              <TableCell className="text-xs text-right">{num(m.clientes)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Alertas inteligentes */}
                {continuousAlertas.length > 0 && (
                  <div className="space-y-2">
                    {continuousAlertas.map((a, i) => (
                      <div key={i} className={`flex items-start gap-2 p-2.5 rounded border-l-4 text-xs ${a.severidade === "alta" ? "border-l-red-500 bg-red-500/5" : a.severidade === "media" ? "border-l-yellow-500 bg-yellow-500/5" : "border-l-blue-500 bg-blue-500/5"}`}>
                        <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${a.severidade === "alta" ? "text-red-500" : a.severidade === "media" ? "text-yellow-600" : "text-blue-500"}`} />
                        <span>{a.mensagem}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tabelas de clientes (modo contínuo) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Top clientes no período</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[360px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background">Faturamento</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background" title="Quanto este cliente representa do faturamento total do produto no período.">Participação no produto (Fat. %)</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background" title="Quanto este cliente representa da quantidade total vendida do produto no período.">Participação no produto (Qtd %)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {continuousClientAnalysis.topClientes.length === 0 && (
                              <TableRow><TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-4">Sem vendas.</TableCell></TableRow>
                            )}
                            {continuousClientAnalysis.topClientes.map(r => (
                              <TableRow key={r.cliente}>
                                <TableCell className="text-xs font-medium max-w-[260px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                                <TableCell className="text-xs text-right">{kg(r.qty)}</TableCell>
                                <TableCell className="text-xs text-right">{R$(r.fat)}</TableCell>
                                <TableCell className="text-xs text-right">{r.pctFat.toFixed(1)}%</TableCell>
                                <TableCell className="text-xs text-right">{r.pctQty.toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Reduziram compra (1ª vs 2ª metade)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[360px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background">1ª metade</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background">2ª metade</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 bg-background">Var.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {continuousClientAnalysis.reduziram.length === 0 && (
                              <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-4">Nenhuma redução relevante.</TableCell></TableRow>
                            )}
                            {continuousClientAnalysis.reduziram.map(r => (
                              <TableRow key={r.cliente}>
                                <TableCell className="text-xs font-medium max-w-[220px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                                <TableCell className="text-xs text-right">{R$(r.fIni)}</TableCell>
                                <TableCell className="text-xs text-right">{R$(r.fFim)}</TableCell>
                                <TableCell className="text-xs text-right text-red-500">{pct(r.pct)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <SimpleClientesTable title="Clientes que deixaram de comprar" rows={continuousClientAnalysis.deixaram.map(r => ({ cliente: `${r.cliente} (último: ${r.ultimoMes})`, qty: r.qty, fat: r.fat, pedidos: r.pedidos }))} accent="red" />
                  <SimpleClientesTable title="Clientes novos no produto" rows={continuousClientAnalysis.novos.map(r => ({ cliente: `${r.cliente} (desde ${r.primeiroMes})`, qty: r.qty, fat: r.fat, pedidos: r.pedidos }))} accent="green" />
                </div>
              </div>
            ) : (
              <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              <MiniKpi title="Faturamento" atual={R$(tA.fat)} comp={R$(tC.fat)} variation={calcVar(tA.fat, tC.fat)} icon={DollarSign} />
              <MiniKpi title="Quantidade" atual={kg(tA.qty)} comp={kg(tC.qty)} variation={calcVar(tA.qty, tC.qty)} icon={Package} />
              <MiniKpi title="Pedidos" atual={num(tA.pedidos)} comp={num(tC.pedidos)} variation={calcVar(tA.pedidos, tC.pedidos)} icon={ShoppingCart} />
              <MiniKpi title="Clientes" atual={num(tA.clientes)} comp={num(tC.clientes)} variation={calcVar(tA.clientes, tC.clientes)} icon={Users} />
              <MiniKpi title="Ticket Médio" atual={R$(ticketA)} comp={R$(ticketC)} variation={calcVar(ticketA, ticketC)} icon={DollarSign} />
              <MiniKpi title="Qtd / Pedido" atual={`${num2(qtyPorPedidoA)} kg`} comp={`${num2(qtyPorPedidoC)} kg`} variation={calcVar(qtyPorPedidoA, qtyPorPedidoC)} icon={Activity} />
              <MiniKpi title="Qtd / Cliente" atual={`${num2(qtyPorClienteA)} kg`} comp={`${num2(qtyPorClienteC)} kg`} variation={calcVar(qtyPorClienteA, qtyPorClienteC)} icon={Activity} />
              {trend && (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Tendência 6m</span>
                      {trend.label === "Crescente" ? <TrendingUp className="h-3.5 w-3.5 text-green-600" /> : trend.label === "Decrescente" ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <p className={`text-lg font-bold leading-tight ${trend.label === "Crescente" ? "text-green-600" : trend.label === "Decrescente" ? "text-red-500" : ""}`}>{trend.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{pct(trend.variacao)} (3m vs 3m)</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Diagnostic */}
            {diagnostico && (
              <Alert className="border-primary/30 bg-primary/5">
                <Brain className="h-4 w-4" />
                <AlertDescription className="text-sm">{diagnostico}</AlertDescription>
              </Alert>
            )}

            {/* Alerts */}
            {alertas.length > 0 && (
              <div className="space-y-2">
                {alertas.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2.5 rounded border-l-4 text-xs ${a.severidade === "alta" ? "border-l-red-500 bg-red-500/5" : a.severidade === "media" ? "border-l-yellow-500 bg-yellow-500/5" : "border-l-blue-500 bg-blue-500/5"}`}>
                    <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${a.severidade === "alta" ? "text-red-500" : a.severidade === "media" ? "text-yellow-600" : "text-blue-500"}`} />
                    <span>{a.mensagem}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="clientes" className="space-y-3">
              <TabsList className="h-auto flex-wrap gap-1">
                <TabsTrigger value="clientes" className="text-xs">Clientes</TabsTrigger>
                <TabsTrigger value="evolucao" className="text-xs">Evolução 6 meses</TabsTrigger>
                <TabsTrigger value="semanal" className="text-xs">Semanal/Diária</TabsTrigger>
              </TabsList>

              <TabsContent value="clientes" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ClientesTable title="Top clientes — Período atual" rows={topClientesAtual} totalFat={tA.fat} />
                  <ClientesTable title="Top clientes — Período comparativo" rows={topClientesComp} totalFat={tC.fat} />
                </div>
                <ReduziramTable rows={reduziram} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <SimpleClientesTable title="Clientes que deixaram de comprar" rows={deixaramComprar} accent="red" />
                  <SimpleClientesTable title="Clientes novos no produto" rows={novosNoProduto} accent="green" />
                </div>
                <EstaveisTable rows={estaveis} />
              </TabsContent>

              <TabsContent value="evolucao" className="space-y-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Últimos 6 meses</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthly6} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="left" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number, name) => name === "Faturamento" ? R$(v) : num(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line yAxisId="left" type="monotone" dataKey="fat" name="Faturamento" stroke="hsl(32, 90%, 50%)" strokeWidth={2} />
                          <Line yAxisId="right" type="monotone" dataKey="pedidos" name="Pedidos" stroke="hsl(210, 70%, 50%)" strokeWidth={2} />
                          <Line yAxisId="right" type="monotone" dataKey="clientes" name="Clientes" stroke="hsl(142, 60%, 40%)" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-auto mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Mês</TableHead>
                            <TableHead className="text-xs text-right">Faturamento</TableHead>
                            <TableHead className="text-xs text-right">Quantidade</TableHead>
                            <TableHead className="text-xs text-right">Pedidos</TableHead>
                            <TableHead className="text-xs text-right">Clientes</TableHead>
                            <TableHead className="text-xs text-right">Qtd/Pedido</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monthly6.map(m => (
                            <TableRow key={m.ymRaw}>
                              <TableCell className="text-xs font-medium">{m.mes}</TableCell>
                              <TableCell className="text-xs text-right">{R$(m.fat)}</TableCell>
                              <TableCell className="text-xs text-right">{kg(m.qty)}</TableCell>
                              <TableCell className="text-xs text-right">{num(m.pedidos)}</TableCell>
                              <TableCell className="text-xs text-right">{num(m.clientes)}</TableCell>
                              <TableCell className="text-xs text-right">{num2(m.qtyPorPedido)} kg</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="semanal" className="space-y-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução Semanal (período atual)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weekly}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => R$(v)} />
                          <Bar dataKey="fat" name="Faturamento" fill="hsl(32, 90%, 50%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Evolução Diária (período atual)</span>
                      {daily.semVenda.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{daily.semVenda.length} dia(s) sem venda</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={daily.rows}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dia" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => R$(v)} />
                          <Line type="monotone" dataKey="fat" name="Faturamento" stroke="hsl(32, 90%, 50%)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
              </>
            )}
          </>
        )}

        {/* Auditoria de consolidação de clientes */}
        {consolidation.groups.length > 0 && (
          <div className="mt-6 border-t border-border/40 pt-4">
            <button
              type="button"
              onClick={() => setShowConsolidationAudit(v => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              {showConsolidationAudit ? "▼" : "▶"} Clientes consolidados automaticamente ({consolidation.groups.length} grupos · {consolidation.groups.reduce((s, g) => s + g.variants.length, 0)} nomes agrupados)
            </button>
            {showConsolidationAudit && (
              <div className="mt-3 space-y-3">
                <Alert>
                  <AlertDescription className="text-xs">
                    A análise estratégica agrupa automaticamente variações do mesmo cliente (ex.: tags <code>(GR)</code>, <code>(IM)</code>, sufixos como “- Ana/Edan”) para evitar fragmentação de faturamento. O dado bruto da planilha não é alterado — esta consolidação vale apenas para os rankings e diagnósticos abaixo.
                  </AlertDescription>
                </Alert>
                <div className="overflow-auto max-h-[360px] border border-border/40 rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sticky top-0 bg-background">Cliente consolidado</TableHead>
                        <TableHead className="text-xs sticky top-0 bg-background">Nomes originais agrupados</TableHead>
                        <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd variantes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidation.groups.map(g => (
                        <TableRow key={g.consolidated}>
                          <TableCell className="text-xs font-semibold align-top max-w-[260px]">{g.consolidated}</TableCell>
                          <TableCell className="text-xs align-top">
                            <ul className="list-disc pl-4 space-y-0.5">
                              {g.variants.map(v => (
                                <li key={v} className={v === g.consolidated ? "text-muted-foreground" : ""}>{v}</li>
                              ))}
                            </ul>
                          </TableCell>
                          <TableCell className="text-xs text-right align-top tabular-nums">{g.variants.length}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientesTable({ title, rows, totalFat }: { title: string; rows: ClienteAgg[]; totalFat: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Faturamento</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Pedidos</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">% Prod.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-4">Sem vendas neste período.</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.cliente}>
                  <TableCell className="text-xs font-medium max-w-[220px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                  <TableCell className="text-xs text-right">{num(r.qty)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{R$(r.fat)}</TableCell>
                  <TableCell className="text-xs text-right">{r.pedidos.size}</TableCell>
                  <TableCell className="text-xs text-right">{totalFat > 0 ? `${((r.fat / totalFat) * 100).toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReduziramTable({ rows }: { rows: { cliente: string; qA: number; qC: number; fA: number; fC: number; diffQ: number; diffF: number; pctQ: number | null }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" /> Clientes que mais reduziram a compra</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd anterior</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd atual</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Δ Qtd</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Δ Faturamento</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">% queda qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-xs text-center text-muted-foreground py-4">Nenhum cliente reduziu a compra.</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.cliente}>
                  <TableCell className="text-xs font-medium max-w-[220px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                  <TableCell className="text-xs text-right">{num(r.qC)}</TableCell>
                  <TableCell className="text-xs text-right">{num(r.qA)}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{num(r.diffQ)}</TableCell>
                  <TableCell className="text-xs text-right text-red-500">{R$(r.diffF)}</TableCell>
                  <TableCell className="text-xs text-right">{r.pctQ !== null ? `${r.pctQ.toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleClientesTable({ title, rows, accent }: { title: string; rows: { cliente: string; qty: number; fat: number; pedidos: number }[]; accent: "red" | "green" }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">{accent === "red" ? <TrendingDown className="h-4 w-4 text-red-500" /> : <TrendingUp className="h-4 w-4 text-green-600" />}{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Faturamento</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Pedidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-4">Nenhum cliente nesta categoria.</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.cliente}>
                  <TableCell className="text-xs font-medium max-w-[220px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                  <TableCell className="text-xs text-right">{num(r.qty)}</TableCell>
                  <TableCell className={`text-xs text-right font-semibold ${accent === "red" ? "text-red-500" : "text-green-600"}`}>{R$(r.fat)}</TableCell>
                  <TableCell className="text-xs text-right">{r.pedidos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function EstaveisTable({ rows }: { rows: { cliente: string; qA: number; qC: number; fA: number; fC: number; variacao: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Minus className="h-4 w-4 text-muted-foreground" /> Clientes recorrentes estáveis (variação de qtd ±15%)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sticky top-0 bg-background">Cliente</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd anterior</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Qtd atual</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Faturamento atual</TableHead>
                <TableHead className="text-xs text-right sticky top-0 bg-background">Variação qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-4">Nenhum cliente estável encontrado.</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.cliente}>
                  <TableCell className="text-xs font-medium max-w-[220px] truncate" title={r.cliente}>{r.cliente}</TableCell>
                  <TableCell className="text-xs text-right">{num(r.qC)}</TableCell>
                  <TableCell className="text-xs text-right">{num(r.qA)}</TableCell>
                  <TableCell className="text-xs text-right font-semibold">{R$(r.fA)}</TableCell>
                  <TableCell className="text-xs text-right"><VarBadge value={r.variacao} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
