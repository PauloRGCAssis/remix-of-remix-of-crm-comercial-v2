import { useState, useMemo, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/AppLayout";
import { useSalesData, shortVendedorName, getUniqueVendedores, getVendedoresWith2026Sales, getProdutosComerciaisValidos, normalizeSelectedProduto } from "@/hooks/useSalesData";
import { useInteligenciaData, InteligenciaFilters } from "@/hooks/useInteligenciaData";
import { CurvaAbcTab } from "@/components/inteligencia/CurvaAbcTab";
import { LeituraEstrategicaTab } from "@/components/inteligencia/LeituraEstrategicaTab";
import { DateRangeFilterGroup } from "@/components/DateRangeFilterGroup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, ShoppingCart,
  BarChart3, Target, Brain, Activity, Package, DollarSign,
  ChevronDown, AlertCircle, ClipboardCheck, Lightbulb, Minus,
  ArrowUpRight, ArrowDownRight, Download, Search,
} from "lucide-react";
import { ClientesNovosDialog, type ClienteNovoLinha } from "@/components/ClientesNovosDialog";
import { ClientesDetalhesDialog } from "@/components/inteligencia/ClientesDetalhesDialog";
import { DuplicatesBanner } from "@/components/clientes/DuplicatesBanner";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { DeepProductAnalysis } from "@/components/inteligencia/DeepProductAnalysis";
import { DeepClientAnalysis } from "@/components/inteligencia/DeepClientAnalysis";
import { DeepVendedorAnalysis } from "@/components/inteligencia/DeepVendedorAnalysis";
import { NovosClientesAnalysis } from "@/components/inteligencia/NovosClientesAnalysis";
import { ClientesPorProdutoTab } from "@/components/inteligencia/ClientesPorProdutoTab";
import { CentralAnaliseTab } from "@/components/inteligencia/CentralAnaliseTab";

import { SearchableCombobox } from "@/components/SearchableCombobox";
import { usePersistentState } from "@/hooks/usePersistentState";
import { MetaClienteTab } from "@/components/inteligencia/MetaClienteTab";
import { usePermissions } from "@/hooks/usePermissions";
import { subAbas } from "@/lib/modulesCatalog";
import { useAppSetting, REATIVACAO_DIAS_KEY, REATIVACAO_DIAS_DEFAULT } from "@/hooks/useAppSetting";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis,
} from "recharts";

const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null) => v !== null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const kg = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg`;
const fmtShort = (d: string) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(2)}`;
};

const COLORS = [
  "hsl(32, 90%, 50%)", "hsl(142, 60%, 40%)", "hsl(210, 70%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)", "hsl(38, 92%, 50%)",
  "hsl(170, 60%, 40%)", "hsl(320, 60%, 50%)", "hsl(60, 70%, 45%)", "hsl(200, 50%, 60%)",
];

function VariationIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (Math.abs(value) < 1) return <span className="text-muted-foreground text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" /> {pct(value)}</span>;
  if (value > 0) return <span className="text-green-600 text-xs flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> {pct(value)}</span>;
  return <span className="text-red-500 text-xs flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" /> {pct(value)}</span>;
}

function KpiBoxComparativo({ title, atualValue, compValue, variation, diff, icon: Icon }: {
  title: string; atualValue: string; compValue?: string; variation?: number | null; diff?: string; icon: any;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-xl font-bold">{atualValue}</p>
        {compValue && (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[11px] text-muted-foreground">Comparado: {compValue}</p>
            {diff && <p className="text-[11px] text-muted-foreground">Diferença: {diff}</p>}
            {variation !== undefined && <VariationIndicator value={variation ?? null} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-base font-bold mt-8 mb-3">
      <Icon className="h-5 w-5 text-primary" />
      {children}
    </h3>
  );
}

function calcVar(atual: number, comp: number): number | null {
  return comp > 0 ? ((atual - comp) / comp) * 100 : null;
}

function MixProdutosCard({ mixProdutos, fatTotal }: { mixProdutos: { nome: string; fat: number; pct: number }[]; fatTotal: number }) {
  const [view, setView] = useState<"pie" | "bar">("pie");
  const sorted = [...mixProdutos].sort((a, b) => b.fat - a.fat);
  const top = sorted.slice(0, 10);
  const restoFat = sorted.slice(10).reduce((s, x) => s + x.fat, 0);
  const data = restoFat > 0
    ? [...top, { nome: `Outros (${sorted.length - 10})`, fat: restoFat, pct: fatTotal > 0 ? (restoFat / fatTotal) * 100 : 0 }]
    : top;

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-background border rounded-md shadow-lg p-2.5 text-xs max-w-[280px]">
        <p className="font-semibold mb-1 break-words">{d.nome}</p>
        <p className="text-muted-foreground">Faturamento: <span className="font-medium text-foreground">{R$(d.fat)}</span></p>
        <p className="text-muted-foreground">Participação: <span className="font-medium text-foreground">{d.pct.toFixed(1)}%</span></p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Mix de Produtos (Participação no Faturamento)</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant={view === "pie" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setView("pie")}>Pizza</Button>
          <Button size="sm" variant={view === "bar" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setView("bar")}>Barras</Button>
        </div>
      </CardHeader>
      <CardContent>
        {view === "pie" ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4 items-center">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="fat"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    innerRadius={50}
                    paddingAngle={1}
                    label={({ pct: p }) => p >= 4 ? `${p.toFixed(0)}%` : ""}
                    labelLine={false}
                  >
                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={renderTooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 max-h-[320px] overflow-auto pr-1">
              {data.map((d, i) => (
                <div key={d.nome} className="flex items-start gap-2 text-xs">
                  <span className="w-3 h-3 mt-0.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate" title={d.nome}>{d.nome}</p>
                    <p className="text-[10px] text-muted-foreground">{R$(d.fat)} · {d.pct.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ height: Math.max(280, data.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={180}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.length > 26 ? v.slice(0, 26) + "…" : v}
                />
                <Tooltip content={renderTooltip} />
                <Bar dataKey="fat" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InteligenciaComercialPage() {
  // Cada sub-aba exige a própria permissão (inteligencia.<aba>); a IA também.
  const { podeUsarIA, can } = usePermissions();
  const abasPermitidas = useMemo(
    () => new Set(subAbas("inteligencia").filter((s) => can(s.key, "acessar")).map((s) => s.aba)),
    [can],
  );
  const podeAba = (aba: string) => abasPermitidas.has(aba);
  const { data: sales, isLoading } = useSalesData();

  const today = new Date();
  const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = today.toISOString().split("T")[0];

  const [filters, setFilters] = usePersistentState<InteligenciaFilters>("inteligencia:filters", {
    inicio: firstDay,
    fim: todayStr,
    compInicio: "",
    compFim: "",
    vendedores: [],
    cliente: "",
    clientes: [],
    produto: "",
    produtos: [],
  });

  // Migração: filtros salvos com `produto` único e/ou no formato legado
  // "NNN - Nome" → produtos[] normalizado.
  useEffect(() => {
    const list = (filters.produtos && filters.produtos.length > 0)
      ? filters.produtos
      : (filters.produto ? [filters.produto] : []);
    const normalized = Array.from(new Set(list.map(normalizeSelectedProduto).filter(Boolean)));
    const currentSerialized = JSON.stringify(filters.produtos ?? []);
    const nextSerialized = JSON.stringify(normalized);
    if (currentSerialized !== nextSerialized || filters.produto) {
      setFilters((f) => ({ ...f, produto: "", produtos: normalized }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [novosOpen, setNovosOpen] = useState(false);
  const [openFatorNovos, setOpenFatorNovos] = useState(false);
  const [openFatorPerdidos, setOpenFatorPerdidos] = useState(false);
  const [debugProdutos, setDebugProdutos] = useState(false);
  const [analysisMode, setAnalysisMode] = usePersistentState<"compare" | "continuous">("inteligencia:analysisMode", "compare");
  const [continuousPeriod, setContinuousPeriod] = usePersistentState<"3m" | "6m" | "12m" | "ytd">("inteligencia:continuousPeriod", "6m");
  const [abaSalva, setActiveTab] = usePersistentState("inteligencia:activeTab", "resumo");
  // Aba salva sem permissão cai na primeira aba permitida (o conteúdo só monta na aba ativa).
  const activeTab = abasPermitidas.has(abaSalva)
    ? abaSalva
    : (subAbas("inteligencia").find((s) => abasPermitidas.has(s.aba))?.aba ?? "");

  // Última data REAL disponível na base (usada como âncora do modo contínuo).
  const lastSalesDate = useMemo(() => {
    if (!sales || sales.length === 0) return null;
    let max = -Infinity;
    for (const s of sales) {
      const t = new Date(s.data).getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
    return Number.isFinite(max) ? new Date(max) : null;
  }, [sales]);

  // Calcula o intervalo do modo contínuo a partir da última data REAL da base.
  const computeContinuousRange = (mode: typeof continuousPeriod, anchor: Date | null) => {
    const ref = anchor ?? new Date();
    const end = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
    let start = "";
    if (mode === "ytd") {
      start = `${ref.getFullYear()}-01-01`;
    } else if (mode === "3m" || mode === "6m" || mode === "12m") {
      const months = mode === "3m" ? 3 : mode === "6m" ? 6 : 12;
      // janela "últimos N meses" terminando exatamente na última data da base.
      const d = new Date(ref);
      d.setMonth(d.getMonth() - months);
      d.setDate(d.getDate() + 1);
      start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return { start, end };
  };

  const applyContinuous = (mode: typeof continuousPeriod) => {
    const { start, end } = computeContinuousRange(mode, lastSalesDate);
    setFilters(f => ({ ...f, inicio: start, fim: end, compInicio: "", compFim: "" }));
  };

  // Quando a última data da base mudar (ex.: nova importação) e o modo contínuo
  // estiver ativo, recalcula automaticamente o intervalo analisado.
  useEffect(() => {
    if (analysisMode !== "continuous" || !lastSalesDate) return;
    const { start, end } = computeContinuousRange(continuousPeriod, lastSalesDate);
    setFilters(f => (f.inicio === start && f.fim === end ? f : { ...f, inicio: start, fim: end, compInicio: "", compFim: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSalesDate?.getTime(), analysisMode, continuousPeriod]);

  const continuousRangeLabel = useMemo(() => {
    if (analysisMode !== "continuous") return "";
    if (!filters.inicio || !filters.fim) return "";
    return `${fmtShort(filters.inicio)} → ${fmtShort(filters.fim)}`;
  }, [analysisMode, filters.inicio, filters.fim]);

  const vendedores = useMemo(() => sales ? getVendedoresWith2026Sales(sales) : [], [sales]);
  const produtos = useMemo(() => getProdutosComerciaisValidos(sales), [sales]);
  const clientesOptions = useMemo(() => {
    if (!sales) return [] as string[];
    const set = new Set<string>();
    for (const s of sales) {
      const nome = String(s.cliente ?? "").trim();
      if (nome) set.add(nome);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales]);

  const { value: reativacaoDias } = useAppSetting<number>(REATIVACAO_DIAS_KEY, REATIVACAO_DIAS_DEFAULT);
  const effectiveFilters = useMemo<InteligenciaFilters>(
    () => ({ ...filters, analysisMode, reativacaoDiasSemCompra: reativacaoDias }),
    [filters, analysisMode, reativacaoDias],
  );
  const data = useInteligenciaData(sales, effectiveFilters);
  const exportAudit = useQuery({
    queryKey: ["raw-export-audit", filters, data?.fatAtual, data?.linhasUsadasNoCalculo?.length],
    enabled: Boolean(data),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      if (!data) return null;
      const expected = Math.round(data.fatAtual * 100) / 100;
      const rawVendorNames = filters.vendedores.length === 1
        ? [...new Set((sales ?? [])
          .filter((row) => filters.vendedores.includes(row.vendedor) || filters.vendedores.includes(shortVendedorName(row.vendedor)))
          .map((row) => row.vendedor))]
        : [];
      let query = (supabase as any)
        .from("sales_raw_rows")
        .select("preco_venda_total")
        .eq("active", true)
        .gte("data", `${filters.inicio}T00:00:00.000Z`)
        .lte("data", `${filters.fim}T23:59:59.999Z`);
      if (rawVendorNames.length === 1) query = query.eq("vendedor", rawVendorNames[0]);
      if (rawVendorNames.length > 1) query = query.in("vendedor", rawVendorNames);
      const clientesList = (filters.clientes && filters.clientes.length > 0)
        ? filters.clientes
        : (filters.cliente ? [filters.cliente] : []);
      if (clientesList.length === 1) query = query.eq("cliente", clientesList[0]);
      if (clientesList.length > 1) query = query.in("cliente", clientesList);
      const { data: rows, error } = await query;
      if (error) throw error;
      const exportedTotal = ((rows ?? []) as Array<{ preco_venda_total: number }>).reduce((sum, row) => sum + Number(row.preco_venda_total ?? 0), 0);
      return { exportedTotal: Math.round(exportedTotal * 100) / 100, expected };
    },
  });
  const mirrorMismatch = Boolean(exportAudit.data && Math.abs(exportAudit.data.exportedTotal - exportAudit.data.expected) > 0.001);

  const exportCalculationRows = () => {
    if (!data?.linhasUsadasNoCalculo?.length) return;
    const rows = data.linhasUsadasNoCalculo.map((row) => ({
      "Linha original Excel": row.original_row_number ?? "",
      "Código Venda": row.codigo_venda,
      "Data": new Date(row.data).toLocaleString("pt-BR"),
      "Quantidade": row.quantidade,
      "Descrição": row.descricao,
      "CNPJ/CPF": row.cnpj_cpf ?? "",
      "Cliente": row.cliente,
      "Vendedor": row.vendedor,
      "Preço Venda (R$)": row.preco_unitario,
      "Preço Venda Total (R$)": row.preco_total,
      "Arquivo importado": row.nome_arquivo_importado ?? "",
      "Data importação": row.data_importacao ? new Date(row.data_importacao).toLocaleString("pt-BR") : "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Linhas usadas");
    XLSX.writeFile(workbook, `linhas-usadas-calculo-${filters.inicio}-${filters.fim}.xlsx`);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  const periodLabel = filters.inicio && filters.fim ? `${fmtShort(filters.inicio)} → ${fmtShort(filters.fim)}` : "Período";
  const compLabel = filters.compInicio && filters.compFim ? `${fmtShort(filters.compInicio)} → ${fmtShort(filters.compFim)}` : "Comparação";

  return (
    <AppLayout>
      <div className="ranking-readable p-4 md:p-6 space-y-6 max-w-[1400px]">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold font-heading">Inteligência Comercial</h1>
        </div>
        <DuplicatesBanner />


        {/* FILTERS */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DateRangeFilterGroup
                label="Período Analisado"
                start={filters.inicio}
                end={filters.fim}
                onStartChange={v => setFilters(f => ({ ...f, inicio: v }))}
                onEndChange={v => setFilters(f => ({ ...f, fim: v }))}
              />
              {analysisMode === "compare" ? (
                <DateRangeFilterGroup
                  label="Comparar com"
                  start={filters.compInicio}
                  end={filters.compFim}
                  onStartChange={v => setFilters(f => ({ ...f, compInicio: v }))}
                  onEndChange={v => setFilters(f => ({ ...f, compFim: v }))}
                  optional
                  onClear={() => setFilters(f => ({ ...f, compInicio: "", compFim: "" }))}
                  helperText="Deixe vazio para não comparar"
                />
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Período contínuo</Label>
                  <Select value={continuousPeriod} onValueChange={(v: any) => { setContinuousPeriod(v); applyContinuous(v); }}>
                    <SelectTrigger className="h-9 w-full md:w-72"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3m">Últimos 3 meses</SelectItem>
                      <SelectItem value="6m">Últimos 6 meses</SelectItem>
                      <SelectItem value="12m">Último ano (12 meses)</SelectItem>
                      <SelectItem value="ytd">Ano atual (YTD)</SelectItem>
                    </SelectContent>
                  </Select>
                  {continuousRangeLabel && (
                    <TooltipProvider delayDuration={150}>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-help">
                            <Info className="h-3 w-3" />
                            <span>Dados considerados: {continuousRangeLabel}</span>
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-xs">
                          Período real calculado com base na última data disponível na base de vendas.
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  )}
                  <p className="text-[11px] text-muted-foreground">Comparativo desativado — análise por evolução do período.</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Modo de Análise</Label>
                <Select value={analysisMode} onValueChange={(v: any) => {
                  setAnalysisMode(v);
                  if (v === "continuous") applyContinuous(continuousPeriod);
                }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compare">Comparar períodos</SelectItem>
                    <SelectItem value="continuous">Analisar período contínuo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vendedor</Label>
                <Select value={filters.vendedores[0] ?? "todos"} onValueChange={v => setFilters(f => ({ ...f, vendedores: v === "todos" ? [] : [v] }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {vendedores.filter(v => v && v.trim() !== "").map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1" title={vendedores.join(", ")}>
                  {vendedores.length} vendedores na base: {vendedores.slice(0, 6).join(", ")}{vendedores.length > 6 ? "…" : ""}
                </p>
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <SearchableCombobox
                  options={clientesOptions}
                  value={filters.clientes ?? []}
                  onValueChange={(value) => setFilters(f => ({ ...f, clientes: value, cliente: "" }))}
                  placeholder="Selecionar cliente(s)..."
                  searchPlaceholder="Buscar cliente..."
                  emptyMessage="Nenhum cliente encontrado."
                  allLabel="Todos"
                  applyMode={false}
                  selectionMode="multiple"
                  closeOnSelect={false}
                  className="min-h-9"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(filters.clientes?.length ?? 0) === 0
                    ? `${clientesOptions.length} clientes na base`
                    : `${filters.clientes!.length} selecionado${filters.clientes!.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <div>
                <Label className="text-xs">Produto</Label>
                <SearchableCombobox
                  options={produtos}
                  value={filters.produtos ?? []}
                  onValueChange={(value) => setFilters(f => ({ ...f, produto: "", produtos: value }))}
                  placeholder="Todos os produtos"
                  searchPlaceholder="Buscar produto..."
                  emptyMessage="Nenhum produto encontrado."
                  allLabel="Todos"
                  applyMode={false}
                  selectionMode="multiple"
                  className="min-h-9"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(filters.produtos?.length ?? 0) === 0
                    ? `${produtos.length} produtos na linha Ti Delso`
                    : `${filters.produtos!.length} selecionado${filters.produtos!.length > 1 ? "s" : ""} (lógica OR)`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {(!filters.inicio || !filters.fim) ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Selecione o Período Analisado (data inicial e final) para iniciar a análise. O bloco "Comparar com" é opcional.</CardContent></Card>
        ) : !data ? (
          <Card><CardContent className="p-8 space-y-3">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          </CardContent></Card>
        ) : !activeTab ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Você não possui permissão para nenhuma aba da Inteligência Comercial.</CardContent></Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1">
              {podeAba("resumo") && <TabsTrigger value="resumo">Resumo</TabsTrigger>}
              {podeAba("analise") && (
                <TabsTrigger value="analise">
                  <Lightbulb className="h-3.5 w-3.5 mr-1" />
                  Análise Inteligente
                </TabsTrigger>
              )}
              {podeAba("clientes") && <TabsTrigger value="clientes">Clientes</TabsTrigger>}
              {podeAba("produtos") && <TabsTrigger value="produtos">Produtos</TabsTrigger>}
              {podeAba("vendedores") && <TabsTrigger value="vendedores">Vendedores</TabsTrigger>}
              {podeAba("alertas") && (
                <TabsTrigger value="alertas">
                  Alertas
                  {data.alertas.length > 0 && (
                    <Badge variant="destructive" className="ml-1 text-[10px] px-1.5">{data.alertas.length}</Badge>
                  )}
                </TabsTrigger>
              )}
              {podeAba("previsao") && <TabsTrigger value="previsao">Previsão</TabsTrigger>}
              {podeAba("curva-abc") && <TabsTrigger value="curva-abc">Curva ABC</TabsTrigger>}
              {podeAba("leitura") && (
                <TabsTrigger value="leitura">
                  <Lightbulb className="h-3.5 w-3.5 mr-1" />
                  Leitura Estratégica (Metas)
                </TabsTrigger>
              )}
              {podeAba("graficos") && <TabsTrigger value="graficos">Gráficos</TabsTrigger>}
              {podeAba("meta-cliente") && <TabsTrigger value="meta-cliente">Meta Cliente</TabsTrigger>}
              {podeUsarIA && (
                <TabsTrigger value="central-analise">
                  <Brain className="h-3.5 w-3.5 mr-1" />
                  Central de Análise
                </TabsTrigger>
              )}
            </TabsList>


            {data.hasComp && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
                    <span className="font-semibold text-foreground">Comparando:</span>
                    <span className="font-mono text-xs text-muted-foreground sm:text-sm">{periodLabel}</span>
                    <span className="text-xs font-semibold uppercase text-primary">vs</span>
                    <span className="font-mono text-xs text-muted-foreground sm:text-sm">{compLabel}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.comparisonAudit.hasComparisonFailure && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Falha ao carregar dados do período comparativo.</AlertDescription>
              </Alert>
            )}
            {data.comparisonAudit.isComparisonEmpty && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Sem dados no período comparativo selecionado.</AlertDescription>
              </Alert>
            )}

            {/* ==================== RESUMO EXECUTIVO ==================== */}
            {podeAba("resumo") && (
            <TabsContent value="resumo" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiBoxComparativo title="Faturamento" atualValue={R$(data.fatAtual)}
                  compValue={data.hasComp ? R$(data.fatComp) : undefined}
                  diff={data.hasComp ? R$(data.fatAtual - data.fatComp) : undefined}
                  variation={calcVar(data.fatAtual, data.fatComp)} icon={DollarSign} />
                <KpiBoxComparativo title="Pedidos" atualValue={num(data.decomposition.pedidosAtual)}
                  compValue={data.hasComp ? num(data.decomposition.pedidosComp) : undefined}
                  diff={data.hasComp ? num(data.decomposition.pedidosAtual - data.decomposition.pedidosComp) : undefined}
                  variation={calcVar(data.decomposition.pedidosAtual, data.decomposition.pedidosComp)} icon={ShoppingCart} />
                <KpiBoxComparativo title="Clientes Ativos" atualValue={num(data.decomposition.clientesAtivosAtual)}
                  compValue={data.hasComp ? num(data.decomposition.clientesAtivosComp) : undefined}
                  diff={data.hasComp ? num(data.decomposition.clientesAtivosAtual - data.decomposition.clientesAtivosComp) : undefined}
                  variation={calcVar(data.decomposition.clientesAtivosAtual, data.decomposition.clientesAtivosComp)} icon={Users} />
                <KpiBoxComparativo title="Volume" atualValue={kg(data.decomposition.volumeAtual)}
                  compValue={data.hasComp ? kg(data.decomposition.volumeComp) : undefined}
                  diff={data.hasComp ? kg(data.decomposition.volumeAtual - data.decomposition.volumeComp) : undefined}
                  variation={calcVar(data.decomposition.volumeAtual, data.decomposition.volumeComp)} icon={Package} />
                <KpiBoxComparativo title="Ticket Médio" atualValue={R$(data.decomposition.ticketMedioAtual)}
                  compValue={data.hasComp ? R$(data.decomposition.ticketMedioComp) : undefined}
                  diff={data.hasComp ? R$(data.decomposition.ticketMedioAtual - data.decomposition.ticketMedioComp) : undefined}
                  variation={calcVar(data.decomposition.ticketMedioAtual, data.decomposition.ticketMedioComp)} icon={Target} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <KpiBoxComparativo title="Preço Médio / kg" atualValue={R$(data.decomposition.precoMedioKgAtual)}
                  compValue={data.hasComp ? R$(data.decomposition.precoMedioKgComp) : undefined}
                  diff={data.hasComp ? R$(data.decomposition.precoMedioKgAtual - data.decomposition.precoMedioKgComp) : undefined}
                  variation={calcVar(data.decomposition.precoMedioKgAtual, data.decomposition.precoMedioKgComp)} icon={BarChart3} />
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase">Movimentação de Clientes</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                      <button
                        type="button"
                        onClick={() => setNovosOpen(true)}
                        title={`Primeira compra na história (≥ ${data.reativacaoDiasSemCompra} dias configura reativação)`}
                        className="rounded hover:bg-success/10 transition cursor-pointer"
                      >
                        <p className="text-lg font-bold text-green-600 underline-offset-2 hover:underline">{data.clientesNovos.length}</p>
                        <p className="text-[10px] text-muted-foreground">Novos</p>
                      </button>
                      <div title={`Já compraram antes e ficaram ≥ ${data.reativacaoDiasSemCompra} dias sem comprar`}><p className="text-lg font-bold text-blue-600">{data.clientesReativados.length}</p><p className="text-[10px] text-muted-foreground">Reativados</p></div>
                      <div title={`Já compraram antes e voltaram em < ${data.reativacaoDiasSemCompra} dias`}><p className="text-lg font-bold text-slate-600">{data.clientesRecorrentes.length}</p><p className="text-[10px] text-muted-foreground">Recorrentes</p></div>
                      <div title="Compraram no período comparado mas não no atual"><p className="text-lg font-bold text-red-500">{data.clientesPerdidos.length}</p><p className="text-[10px] text-muted-foreground">Perdidos</p></div>
                      <div title="Sem compras há mais de 30 dias"><p className="text-lg font-bold text-amber-600">{data.clientesInativos.length}</p><p className="text-[10px] text-muted-foreground">Inativos</p></div>
                      <div><p className="text-lg font-bold">{data.decomposition.clientesAtivosAtual}</p><p className="text-[10px] text-muted-foreground">Ativos</p></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {data.diagnostico && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <Brain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold mb-1">Diagnóstico Automático</p>
                        <p className="text-sm text-muted-foreground">{data.diagnostico}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick forecast */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Previsão do Mês</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><p className="text-xs text-muted-foreground">Acumulado</p><p className="font-bold">{R$(data.fatAtual)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Média Diária</p><p className="font-bold">{R$(data.mediaDiariaGeral)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Dias Restantes</p><p className="font-bold">{data.diasRestantes}</p></div>
                    <div><p className="text-xs text-muted-foreground">Projeção</p><p className="font-bold text-primary">{R$(data.projecaoMes)}</p></div>
                  </div>
                </CardContent>
              </Card>

              {/* AUDIT MODE */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Comparar com relatório importado
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="mt-2 border-dashed">
                    <CardContent className="p-4 space-y-4">
                      <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <ClipboardCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-semibold">Dashboard espelhando linhas importadas</p>
                              <p className="text-[11px] text-muted-foreground mt-1">Faturamento = soma direta de Preço Venda Total (R$) na tabela bruta, respeitando somente os filtros visíveis.</p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={exportCalculationRows} disabled={!data.linhasUsadasNoCalculo.length}>
                            <Download className="h-3.5 w-3.5" /> Exportar linhas usadas no cálculo
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[11px]">
                          <div><p className="text-muted-foreground">Total de linhas da planilha</p><p className="font-bold">{data.rawMirrorAudit.totalLinhasPlanilha.toLocaleString("pt-BR")}</p></div>
                          <div><p className="text-muted-foreground">Total de linhas importadas</p><p className="font-bold">{data.rawMirrorAudit.totalLinhasImportadas.toLocaleString("pt-BR")}</p></div>
                          <div><p className="text-muted-foreground">Linhas consideradas no filtro</p><p className="font-bold">{data.rawMirrorAudit.linhasUsadasNoCalculo.toLocaleString("pt-BR")}</p></div>
                          <div><p className="text-muted-foreground">Soma bruta Preço Venda Total</p><p className="font-bold">{R$(data.rawMirrorAudit.somaPrecoVendaTotal)}</p></div>
                          <div><p className="text-muted-foreground">Soma bruta Quantidade</p><p className="font-bold">{kg(data.rawMirrorAudit.somaQuantidade)}</p></div>
                        </div>
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-900">Comparação com SIGE (debug)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-amber-900">
                            <div><p className="opacity-70">Linhas no período (bruto)</p><p className="font-bold text-sm">{data.rawMirrorAudit.linhasBrutoPeriodo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Linhas ignoradas</p><p className="font-bold text-sm">{data.rawMirrorAudit.linhasIgnoradasNoCalculo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Pedidos únicos</p><p className="font-bold text-sm">{data.rawMirrorAudit.pedidosUnicos.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Clientes únicos</p><p className="font-bold text-sm">{data.rawMirrorAudit.clientesUnicos.toLocaleString("pt-BR")}</p></div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[10px] text-amber-900/90 border-t border-amber-200 pt-2">
                            <div><p className="opacity-70">Vendedor vazio</p><p className="font-bold">{data.rawMirrorAudit.linhasComVendedorVazioPeriodo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Produto vazio</p><p className="font-bold">{data.rawMirrorAudit.linhasComProdutoVazioPeriodo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Cliente vazio</p><p className="font-bold">{data.rawMirrorAudit.linhasComClienteVazioPeriodo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Valor nulo</p><p className="font-bold">{data.rawMirrorAudit.linhasComValorNuloPeriodo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Cód. venda repetidos</p><p className="font-bold">{data.rawMirrorAudit.codigosVendaRepetidosPeriodo.toLocaleString("pt-BR")}</p></div>
                            <div><p className="opacity-70">Duplicatas exatas</p><p className="font-bold">{data.rawMirrorAudit.duplicatasExatasPeriodo.toLocaleString("pt-BR")}</p></div>
                          </div>
                          <p className="text-[10px] text-amber-900/80">
                            Faturamento = SUM("Preço Venda Total (R$)") das linhas no período, respeitando os filtros visíveis. Não há deduplicação por Código Venda; quando há auditoria de duplicata, a chave é Código Venda + Produto + Cliente + Quantidade + Valor.
                          </p>
                          {data.rawMirrorAudit.linhasIgnoradas.length > 0 && (
                            <div className="sheet-table overflow-auto max-h-64 border border-amber-200 rounded bg-white">
                              <table className="w-full text-[11px]">
                                <thead className="bg-amber-100 sticky top-0">
                                  <tr>
                                    <th className="text-left px-2 py-1">Código</th>
                                    <th className="text-left px-2 py-1">Data</th>
                                    <th className="text-left px-2 py-1">Cliente</th>
                                    <th className="text-left px-2 py-1">Vendedor</th>
                                    <th className="text-right px-2 py-1">Qtd.</th>
                                    <th className="text-right px-2 py-1">Valor</th>
                                    <th className="text-left px-2 py-1">Motivo ignorado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.rawMirrorAudit.linhasIgnoradas.slice(0, 200).map((row, i) => (
                                    <tr key={`${row.codigoVenda}-${row.originalRowNumber ?? i}`}>
                                      <td className="px-2 py-1">{row.codigoVenda}</td>
                                      <td className="px-2 py-1 whitespace-nowrap">{new Date(row.data).toLocaleDateString("pt-BR")}</td>
                                      <td className="px-2 py-1 min-w-48">{row.cliente}</td>
                                      <td className="px-2 py-1 min-w-36">{row.vendedor || "(sem vendedor)"}</td>
                                      <td className="px-2 py-1 text-right">{num(row.quantidade)}</td>
                                      <td className="px-2 py-1 text-right">{R$(row.precoTotal)}</td>
                                      <td className="px-2 py-1 min-w-52">{row.motivo}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {data.rawMirrorAudit.vendorBreakdownPeriodo.length > 0 && (
                            <div className="sheet-table overflow-auto max-h-64 border border-amber-200 rounded bg-white">
                              <table className="w-full text-[11px]">
                                <thead className="bg-amber-100 sticky top-0">
                                  <tr>
                                    <th className="text-left px-2 py-1">Vendedor (planilha)</th>
                                    <th className="text-left px-2 py-1">Curto</th>
                                    <th className="text-right px-2 py-1">Linhas</th>
                                    <th className="text-right px-2 py-1">Faturamento</th>
                                    <th className="text-center px-2 py-1">Filtro</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.rawMirrorAudit.vendorBreakdownPeriodo.map((v) => (
                                    <tr key={v.vendedorRaw} className={v.incluidoNoFiltro ? "" : "opacity-50 line-through"}>
                                      <td className="px-2 py-1">{v.vendedorRaw || "(sem vendedor)"}</td>
                                      <td className="px-2 py-1">{v.vendedorCurto}</td>
                                      <td className="px-2 py-1 text-right">{v.linhas.toLocaleString("pt-BR")}</td>
                                      <td className="px-2 py-1 text-right">{R$(v.faturamento)}</td>
                                      <td className="px-2 py-1 text-center">{v.incluidoNoFiltro ? "✓" : "—"}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-amber-50 font-bold">
                                    <td className="px-2 py-1" colSpan={2}>Total bruto no período</td>
                                    <td className="px-2 py-1 text-right">{data.rawMirrorAudit.linhasBrutoPeriodo.toLocaleString("pt-BR")}</td>
                                    <td className="px-2 py-1 text-right">{R$(data.rawMirrorAudit.somaBrutoPeriodo)}</td>
                                    <td />
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Arquivo: {data.rawMirrorAudit.arquivoMaisRecente ?? "—"} · Importação: {data.rawMirrorAudit.importacaoMaisRecente ? new Date(data.rawMirrorAudit.importacaoMaisRecente).toLocaleString("pt-BR") : "—"}
                        </div>
                      </div>
                      {mirrorMismatch && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>O dashboard não está espelhando a planilha.</AlertDescription>
                        </Alert>
                      )}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período Atual ({periodLabel})</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
                        <div><p className="text-muted-foreground">Linhas filtradas</p><p className="font-bold text-lg">{data.auditAtual.linhasFiltradas.toLocaleString("pt-BR")}</p></div>
                        <div><p className="text-muted-foreground">Pedidos únicos</p><p className="font-bold text-lg">{data.auditAtual.pedidosUnicos.toLocaleString("pt-BR")}</p></div>
                        <div><p className="text-muted-foreground">Clientes ativos</p><p className="font-bold text-lg">{data.auditAtual.clientesUnicos.toLocaleString("pt-BR")}</p></div>
                        <div><p className="text-muted-foreground">Faturamento</p><p className="font-bold text-lg">{R$(data.auditAtual.faturamentoTotal)}</p></div>
                        <div><p className="text-muted-foreground">Volume</p><p className="font-bold text-lg">{kg(data.auditAtual.volumeTotal)}</p></div>
                        <div><p className="text-muted-foreground">Ticket médio</p><p className="font-bold text-lg">{R$(data.auditAtual.ticketMedio)}</p></div>
                        <div><p className="text-muted-foreground">Preço médio / kg</p><p className="font-bold text-lg">{R$(data.auditAtual.precoMedioKg)}</p></div>
                      </div>

                      {data.auditComp && (
                        <>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4">Período Comparativo ({compLabel})</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
                            <div><p className="text-muted-foreground">Linhas filtradas</p><p className="font-bold text-lg">{data.auditComp.linhasFiltradas.toLocaleString("pt-BR")}</p></div>
                            <div><p className="text-muted-foreground">Pedidos únicos</p><p className="font-bold text-lg">{data.auditComp.pedidosUnicos.toLocaleString("pt-BR")}</p></div>
                            <div><p className="text-muted-foreground">Clientes ativos</p><p className="font-bold text-lg">{data.auditComp.clientesUnicos.toLocaleString("pt-BR")}</p></div>
                            <div><p className="text-muted-foreground">Faturamento</p><p className="font-bold text-lg">{R$(data.auditComp.faturamentoTotal)}</p></div>
                            <div><p className="text-muted-foreground">Volume</p><p className="font-bold text-lg">{kg(data.auditComp.volumeTotal)}</p></div>
                            <div><p className="text-muted-foreground">Ticket médio</p><p className="font-bold text-lg">{R$(data.auditComp.ticketMedio)}</p></div>
                            <div><p className="text-muted-foreground">Preço médio / kg</p><p className="font-bold text-lg">{R$(data.auditComp.precoMedioKg)}</p></div>
                          </div>

                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4">Diferenças Calculadas</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
                            <div><p className="text-muted-foreground">Faturamento</p><p className="font-bold">{R$(data.auditAtual.faturamentoTotal - data.auditComp.faturamentoTotal)}</p><VariationIndicator value={calcVar(data.auditAtual.faturamentoTotal, data.auditComp.faturamentoTotal)} /></div>
                            <div><p className="text-muted-foreground">Pedidos</p><p className="font-bold">{data.auditAtual.pedidosUnicos - data.auditComp.pedidosUnicos}</p><VariationIndicator value={calcVar(data.auditAtual.pedidosUnicos, data.auditComp.pedidosUnicos)} /></div>
                            <div><p className="text-muted-foreground">Clientes</p><p className="font-bold">{data.auditAtual.clientesUnicos - data.auditComp.clientesUnicos}</p><VariationIndicator value={calcVar(data.auditAtual.clientesUnicos, data.auditComp.clientesUnicos)} /></div>
                            <div><p className="text-muted-foreground">Volume</p><p className="font-bold">{kg(data.auditAtual.volumeTotal - data.auditComp.volumeTotal)}</p><VariationIndicator value={calcVar(data.auditAtual.volumeTotal, data.auditComp.volumeTotal)} /></div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>
            )}

            {/* ==================== ANÁLISE INTELIGENTE ==================== */}
            {podeAba("analise") && (
            <TabsContent value="analise" className="space-y-4">
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <Brain className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-base font-bold mb-2">Resumo da Análise</p>
                      <p className="text-sm leading-relaxed">{data.analiseInteligente.resumo}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {data.analiseInteligente.fatores.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Fatores que explicam o resultado
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.analiseInteligente.fatores.map((f, i) => {
                      const isNovos = /clientes novos entraram na base/i.test(f);
                      const isPerdidos = /clientes deixaram de comprar/i.test(f);
                      if (isNovos || isPerdidos) {
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => isNovos ? setOpenFatorNovos(true) : setOpenFatorPerdidos(true)}
                            className={`w-full flex items-start gap-2 text-sm text-left rounded-md border px-2 py-1.5 transition hover:bg-muted/50 cursor-pointer ${isNovos ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
                          >
                            <span className="mt-0.5">📊</span>
                            <span className="flex-1 underline decoration-dotted">{f}</span>
                            <Search className="h-3.5 w-3.5 mt-0.5 opacity-60" />
                            <span className="text-[11px] text-muted-foreground mt-0.5 whitespace-nowrap">Ver detalhes</span>
                          </button>
                        );
                      }
                      return (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5">📊</span>
                          <span>{f}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {(() => {
                const normKey = (v: string) => normalizeClientName(v || "")
                  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase().replace(/[–—-]/g, " ")
                  .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
                const keyToDisplay = new Map<string, string>();
                for (const c of [...(data.clientesNovos ?? []), ...(data.clientesPerdidos ?? [])]) {
                  keyToDisplay.set(normKey(c), c);
                }
                const canonCliente = (raw: string) => keyToDisplay.get(normKey(raw)) ?? raw;
                const compInicio = analysisMode === "continuous" ? "" : filters.compInicio;
                const compFim = analysisMode === "continuous" ? "" : filters.compFim;
                return (
                  <>
                    <ClientesDetalhesDialog
                      open={openFatorNovos}
                      onOpenChange={setOpenFatorNovos}
                      tipo="novos"
                      clientes={data.clientesNovos ?? []}
                      baseSales={sales ?? []}
                      canonCliente={canonCliente}
                      inicio={filters.inicio}
                      fim={filters.fim}
                      cStart={compInicio}
                      cEnd={compFim}
                    />
                    <ClientesDetalhesDialog
                      open={openFatorPerdidos}
                      onOpenChange={setOpenFatorPerdidos}
                      tipo="perdidos"
                      clientes={data.clientesPerdidos ?? []}
                      baseSales={sales ?? []}
                      canonCliente={canonCliente}
                      inicio={filters.inicio}
                      fim={filters.fim}
                      cStart={compInicio}
                      cEnd={compFim}
                    />
                  </>
                );
              })()}


              {data.analiseInteligente.recomendacoes.length > 0 && (
                <Card className="border-green-200 bg-green-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-green-600" />
                      Recomendações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.analiseInteligente.recomendacoes.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5">💡</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* KPI decomposition table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Decomposição dos KPIs</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Métrica</TableHead>
                        <TableHead className="text-xs text-right">Atual</TableHead>
                        <TableHead className="text-xs text-right">Comparado</TableHead>
                        <TableHead className="text-xs text-right">Diferença</TableHead>
                        <TableHead className="text-xs text-right">Variação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { label: "Faturamento", a: data.fatAtual, c: data.fatComp, fmt: R$ },
                        { label: "Pedidos", a: data.decomposition.pedidosAtual, c: data.decomposition.pedidosComp, fmt: num },
                        { label: "Clientes Ativos", a: data.decomposition.clientesAtivosAtual, c: data.decomposition.clientesAtivosComp, fmt: num },
                        { label: "Volume (kg)", a: data.decomposition.volumeAtual, c: data.decomposition.volumeComp, fmt: (v: number) => kg(v) },
                        { label: "Ticket Médio", a: data.decomposition.ticketMedioAtual, c: data.decomposition.ticketMedioComp, fmt: R$ },
                        { label: "Preço Médio/kg", a: data.decomposition.precoMedioKgAtual, c: data.decomposition.precoMedioKgComp, fmt: R$ },
                      ].map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{row.label}</TableCell>
                          <TableCell className="text-xs text-right font-semibold">{row.fmt(row.a)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">{data.hasComp ? row.fmt(row.c) : "—"}</TableCell>
                          <TableCell className="text-xs text-right">{data.hasComp ? row.fmt(row.a - row.c) : "—"}</TableCell>
                          <TableCell className="text-xs text-right"><VariationIndicator value={data.hasComp ? calcVar(row.a, row.c) : null} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {/* ==================== CLIENTES ==================== */}
            {podeAba("clientes") && (
            <TabsContent value="clientes" className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600" /> Top 10 Crescimento
                      <Badge variant="outline" className="text-[10px]">{periodLabel}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="min-w-0">
                      <Table className="table-fixed" maxHeightClassName="max-h-[55vh]" containerClassName="overflow-x-hidden">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-[34%] whitespace-normal bg-background">Cliente</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Atual</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Anterior</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diff</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Var</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.clientesCresceram.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium whitespace-normal [overflow-wrap:anywhere] bg-background" title={c.nome}>{c.nome}</TableCell>
                              <TableCell className="text-xs text-right font-semibold">{R$(c.fatAtual)}</TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">{R$(c.fatComp)}</TableCell>
                              <TableCell className="text-xs text-right text-green-600">{R$(c.diff)}</TableCell>
                              <TableCell className="text-xs text-right"><VariationIndicator value={c.diffPct} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" /> Top 10 Quedas
                      <Badge variant="outline" className="text-[10px]">{periodLabel}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="min-w-0">
                      <Table className="table-fixed" maxHeightClassName="max-h-[55vh]" containerClassName="overflow-x-hidden">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-[34%] whitespace-normal bg-background">Cliente</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Atual</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Anterior</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diff</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Var</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.clientesCairam.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium whitespace-normal [overflow-wrap:anywhere] bg-background" title={c.nome}>{c.nome}</TableCell>
                              <TableCell className="text-xs text-right font-semibold">{R$(c.fatAtual)}</TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">{R$(c.fatComp)}</TableCell>
                              <TableCell className="text-xs text-right text-red-500">{R$(c.diff)}</TableCell>
                              <TableCell className="text-xs text-right"><VariationIndicator value={c.diffPct} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Análise Profunda por Cliente */}
              <DeepClientAnalysis
                sales={sales ?? []}
                inicio={filters.inicio}
                fim={filters.fim}
                compInicio={analysisMode === "continuous" ? "" : filters.compInicio}
                compFim={analysisMode === "continuous" ? "" : filters.compFim}
                vendedoresFilter={filters.vendedores}
              />

              {/* Clientes Novos (janela de 6 meses sem compras) */}
              <NovosClientesAnalysis sales={sales ?? []} variant="clientes" />
            </TabsContent>
            )}

            {/* ==================== PRODUTOS ==================== */}
            {podeAba("produtos") && (
            <TabsContent value="produtos" className="space-y-4">
              <Tabs defaultValue="analise-produtos" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="analise-produtos">Análise de Produtos</TabsTrigger>
                  <TabsTrigger value="clientes-por-produto">Clientes por Produto</TabsTrigger>
                </TabsList>
                <TabsContent value="analise-produtos" className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  Faturamento por produto = SOMA de "Preço Venda Total (R$)" das linhas filtradas (mesma fonte da aba Vendas).
                  {analysisMode === "continuous" && " · No modo contínuo, Atual = 2ª metade do período / Anterior = 1ª metade."}
                </p>
                <Button size="sm" variant={debugProdutos ? "default" : "outline"} onClick={() => setDebugProdutos(v => !v)}>
                  {debugProdutos ? "Ocultar" : "Mostrar"} debug
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600" /> Produtos em Crescimento ({data.produtosCresceram.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="min-w-0">
                      <Table className="table-fixed" maxHeightClassName="max-h-[55vh]" containerClassName="overflow-x-hidden">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-[28%] whitespace-normal bg-background">Produto</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Fat. Anterior</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Fat. Atual</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diff R$</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diff %</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Qtd Ant.</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Qtd Atual</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.produtosCresceram.map((p, i) => (
                            <Fragment key={i}>
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium whitespace-normal [overflow-wrap:anywhere] bg-background" title={p.nome}>{p.nome}</TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{R$(p.fatComp)}</TableCell>
                                <TableCell className="text-xs text-right font-semibold">{R$(p.fatAtual)}</TableCell>
                                <TableCell className="text-xs text-right text-green-600">{R$(p.diff)}</TableCell>
                                <TableCell className="text-xs text-right"><VariationIndicator value={p.diffPct} /></TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{Math.round(p.volComp).toLocaleString("pt-BR")}</TableCell>
                                <TableCell className="text-xs text-right">{Math.round(p.volAtual).toLocaleString("pt-BR")}</TableCell>
                              </TableRow>
                              {debugProdutos && (
                                <TableRow key={`d-${i}`} className="bg-muted/40">
                                  <TableCell colSpan={7} className="text-[10px] text-muted-foreground font-mono">
                                    Atual: {p.pedidosAtual} pedidos · IDs [{p.idsAtual.join(", ")}]<br />
                                    Anterior: {p.pedidosComp} pedidos · IDs [{p.idsComp.join(", ")}]
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" /> Produtos em Queda ({data.produtosCairam.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="min-w-0">
                      <Table className="table-fixed" maxHeightClassName="max-h-[55vh]" containerClassName="overflow-x-hidden">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-[28%] whitespace-normal bg-background">Produto</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Fat. Anterior</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Fat. Atual</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diff R$</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diff %</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Qtd Ant.</TableHead>
                            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Qtd Atual</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.produtosCairam.map((p, i) => (
                            <Fragment key={i}>
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium whitespace-normal [overflow-wrap:anywhere] bg-background" title={p.nome}>{p.nome}</TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{R$(p.fatComp)}</TableCell>
                                <TableCell className="text-xs text-right font-semibold">{R$(p.fatAtual)}</TableCell>
                                <TableCell className="text-xs text-right text-red-500">{R$(p.diff)}</TableCell>
                                <TableCell className="text-xs text-right"><VariationIndicator value={p.diffPct} /></TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{Math.round(p.volComp).toLocaleString("pt-BR")}</TableCell>
                                <TableCell className="text-xs text-right">{Math.round(p.volAtual).toLocaleString("pt-BR")}</TableCell>
                              </TableRow>
                              {debugProdutos && (
                                <TableRow key={`d-${i}`} className="bg-muted/40">
                                  <TableCell colSpan={7} className="text-[10px] text-muted-foreground font-mono">
                                    Atual: {p.pedidosAtual} pedidos · IDs [{p.idsAtual.join(", ")}]<br />
                                    Anterior: {p.pedidosComp} pedidos · IDs [{p.idsComp.join(", ")}]
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Mix de Produtos */}
              <MixProdutosCard mixProdutos={data.mixProdutos} fatTotal={data.fatAtual} />

              {/* Análise Profunda por Produto */}
              <DeepProductAnalysis
                sales={sales ?? []}
                inicio={filters.inicio}
                fim={filters.fim}
                compInicio={analysisMode === "continuous" ? "" : filters.compInicio}
                compFim={analysisMode === "continuous" ? "" : filters.compFim}
                vendedoresFilter={filters.vendedores}
                continuousMode={analysisMode === "continuous"}
              />
                </TabsContent>
                <TabsContent value="clientes-por-produto" className="space-y-4">
                  <ClientesPorProdutoTab sales={sales} inicio={filters.inicio} fim={filters.fim} />
                </TabsContent>
              </Tabs>
            </TabsContent>
            )}

            {/* ==================== VENDEDORES ==================== */}
            {podeAba("vendedores") && (
            <TabsContent value="vendedores" className="space-y-4">
              {data.hasComp && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" /> Vendedores em Crescimento ({data.vendedoresCresceram.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[45vh]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background min-w-[160px]">Vendedor</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Anterior</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Atual</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Variação R$</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Variação %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.vendedoresCresceram.map((v, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium min-w-[160px] sticky left-0 z-10 bg-background" title={v.nome}>{v.nome}</TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{R$(v.fatComp)}</TableCell>
                                <TableCell className="text-xs text-right font-semibold">{R$(v.fatAtual)}</TableCell>
                                <TableCell className="text-xs text-right text-green-600 font-semibold">{R$(v.diff)}</TableCell>
                                <TableCell className="text-xs text-right"><VariationIndicator value={v.diffPct} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" /> Vendedores em Queda ({data.vendedoresCairam.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[45vh]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background min-w-[160px]">Vendedor</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Anterior</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Atual</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Variação R$</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Variação %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.vendedoresCairam.map((v, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium min-w-[160px] sticky left-0 z-10 bg-background" title={v.nome}>{v.nome}</TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{R$(v.fatComp)}</TableCell>
                                <TableCell className="text-xs text-right font-semibold">{R$(v.fatAtual)}</TableCell>
                                <TableCell className="text-xs text-right text-red-500 font-semibold">{R$(v.diff)}</TableCell>
                                <TableCell className="text-xs text-right"><VariationIndicator value={v.diffPct} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Análise por Vendedor</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[55vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Vendedor</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Fat. Atual</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Fat. Anterior</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diferença</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Var %</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Pedidos</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Clientes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.vendedorResumos.map((v, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium sticky left-0 z-10 bg-background">{v.nome}</TableCell>
                            <TableCell className="text-xs text-right font-semibold">{R$(v.fatAtual)}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">{data.hasComp ? R$(v.fatComp) : "—"}</TableCell>
                            <TableCell className={`text-xs text-right ${v.diff >= 0 ? "text-green-600" : "text-red-500"}`}>{data.hasComp ? R$(v.diff) : "—"}</TableCell>
                            <TableCell className="text-xs text-right"><VariationIndicator value={data.hasComp ? v.diffPct : null} /></TableCell>
                            <TableCell className="text-xs text-right">{v.pedidos}</TableCell>
                            <TableCell className="text-xs text-right">{v.clientes}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Bar chart atual vs comp */}
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.vendedorResumos} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => R$(v)} />
                    <Bar dataKey="fatAtual" name="Atual" fill="hsl(32, 90%, 50%)" radius={[0, 4, 4, 0]} />
                    {data.hasComp && <Bar dataKey="fatComp" name="Comparativo" fill="hsl(210, 70%, 50%)" radius={[0, 4, 4, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Vendedores: cards (1 vendedor) ou ranking (2+ vendedores) */}
              {(() => {
                const ativos = data.vendedorResumos.filter(v => v.fatAtual > 0 || v.pedidos > 0);
                if (ativos.length === 0) return null;

                if (ativos.length === 1) {
                  const v = ativos[0];
                  const ticket = v.pedidos > 0 ? v.fatAtual / v.pedidos : 0;
                  const kpis = [
                    { label: "Faturamento", value: R$(v.fatAtual) },
                    { label: "Pedidos", value: v.pedidos.toLocaleString("pt-BR") },
                    { label: "Clientes ativos", value: v.clientes.toLocaleString("pt-BR") },
                    { label: "Ticket médio", value: R$(ticket) },
                  ];
                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Resumo do vendedor — {v.nome}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {kpis.map(k => (
                            <div key={k.label} className="rounded-lg border bg-muted/30 p-3">
                              <p className="text-[11px] text-muted-foreground">{k.label}</p>
                              <p className="text-base font-bold mt-1">{k.value}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                const ranking = [...ativos].sort((a, b) => b.fatAtual - a.fatAtual);
                const maxFat = ranking[0]?.fatAtual ?? 0;
                return (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Top Vendedores — Ranking por Faturamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {ranking.map((v, i) => {
                        const ticket = v.pedidos > 0 ? v.fatAtual / v.pedidos : 0;
                        const pct = maxFat > 0 ? (v.fatAtual / maxFat) * 100 : 0;
                        return (
                          <div key={v.nome} className="rounded-lg border p-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">{i + 1}º</span>
                                <span className="text-sm font-semibold truncate">{v.nome}</span>
                              </div>
                              <span className="text-sm font-bold text-primary shrink-0">{R$(v.fatAtual)}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex gap-4 text-[11px] text-muted-foreground">
                              <span>Pedidos: <b className="text-foreground">{v.pedidos.toLocaleString("pt-BR")}</b></span>
                              <span>Ticket médio: <b className="text-foreground">{R$(ticket)}</b></span>
                              <span>Clientes: <b className="text-foreground">{v.clientes.toLocaleString("pt-BR")}</b></span>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Análise Profunda por Vendedor */}
              <DeepVendedorAnalysis
                sales={sales ?? []}
                inicio={filters.inicio}
                fim={filters.fim}
                compInicio={analysisMode === "continuous" ? "" : filters.compInicio}
                compFim={analysisMode === "continuous" ? "" : filters.compFim}
                vendedoresFilter={filters.vendedores}
              />

              {/* Clientes Novos por vendedor */}
              <NovosClientesAnalysis sales={sales ?? []} variant="vendedores" />
            </TabsContent>
            )}

            {/* ==================== ALERTAS ==================== */}
            {podeAba("alertas") && (
            <TabsContent value="alertas" className="space-y-3">
              {data.alertas.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p>Nenhum alerta identificado no período.</p>
                    <p className="text-xs mt-1">Configure um período comparativo para gerar alertas de variação.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge variant="destructive">{data.alertas.filter(a => a.severidade === "alta").length} Alta</Badge>
                    <Badge variant="outline" className="border-yellow-400 text-yellow-700">{data.alertas.filter(a => a.severidade === "media").length} Média</Badge>
                    <Badge variant="outline" className="border-blue-400 text-blue-700">{data.alertas.filter(a => a.severidade === "baixa").length} Baixa</Badge>
                  </div>
                  {data.alertas.map((a, i) => {
                    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
                    return (
                      <Card key={i} className={`border-l-4 ${a.severidade === "alta" ? "border-l-red-500" : a.severidade === "media" ? "border-l-yellow-500" : "border-l-blue-400"}`}>
                        <CardContent className="p-3 flex items-start gap-3">
                          <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${a.severidade === "alta" ? "text-red-500" : a.severidade === "media" ? "text-yellow-600" : "text-blue-500"}`} />
                          <div className="flex-1 min-w-0">
                            <Badge variant="outline" className="text-[10px] mr-2">{a.tipo.replace(/_/g, " ")}</Badge>
                            <span className="text-sm">{a.mensagem}</span>
                            {a.debug && (
                              <div className="mt-1 text-[10px] text-muted-foreground font-mono leading-tight">
                                atual {fmt(a.debug.fatAtual ?? 0)} · anterior {fmt(a.debug.fatComp ?? 0)}
                                {typeof a.debug.pedidosAtual === "number" && <> · pedidos atual {a.debug.pedidosAtual}</>}
                                {typeof a.debug.pedidosComp === "number" && <> · pedidos anterior {a.debug.pedidosComp}</>}
                                {typeof a.debug.diff === "number" && <> · Δ {fmt(a.debug.diff)}</>}
                                {typeof a.debug.diffPct === "number" && <> · {a.debug.diffPct.toFixed(1)}%</>}
                                {a.debug.fonte && <> · fonte {a.debug.fonte}</>}
                                {a.debug.motivo && <> · {a.debug.motivo}</>}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Painel de validação — auditoria de cada alerta */}
                  {data.alertas.some(a => a.debug) && (
                    <Collapsible className="mt-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs">
                          <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                          Conferência por alerta ({data.alertas.filter(a => a.debug).length})
                          <ChevronDown className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <Card>
                          <CardContent className="p-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Cliente / Tipo</TableHead>
                                  <TableHead className="text-xs text-right">Atual</TableHead>
                                  <TableHead className="text-xs text-right">Anterior</TableHead>
                                  <TableHead className="text-xs text-right">Δ R$</TableHead>
                                  <TableHead className="text-xs text-right">Δ %</TableHead>
                                  <TableHead className="text-xs text-right">Pedidos</TableHead>
                                  <TableHead className="text-xs">Fonte</TableHead>
                                  <TableHead className="text-xs">Classificação</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {data.alertas.filter(a => a.debug).map((a, i) => {
                                  const d = a.debug!;
                                  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
                                  return (
                                    <TableRow key={i}>
                                      <TableCell className="text-xs">
                                        <div className="font-medium">{d.cliente ?? "—"}</div>
                                        <div className="text-muted-foreground">{a.tipo.replace(/_/g, " ")}</div>
                                      </TableCell>
                                      <TableCell className="text-xs text-right font-mono">{fmt(d.fatAtual ?? 0)}</TableCell>
                                      <TableCell className="text-xs text-right font-mono">{fmt(d.fatComp ?? 0)}</TableCell>
                                      <TableCell className="text-xs text-right font-mono">{typeof d.diff === "number" ? fmt(d.diff) : "—"}</TableCell>
                                      <TableCell className="text-xs text-right font-mono">{typeof d.diffPct === "number" ? `${d.diffPct.toFixed(1)}%` : "—"}</TableCell>
                                      <TableCell className="text-xs text-right font-mono">{d.pedidosAtual ?? 0} / {d.pedidosComp ?? 0}</TableCell>
                                      <TableCell className="text-xs font-mono">{d.fonte ?? "—"}</TableCell>
                                      <TableCell className="text-xs">{d.motivo ?? "—"}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </>
              )}
            </TabsContent>
            )}

            {/* ==================== PREVISÃO ==================== */}
            {podeAba("previsao") && (
            <TabsContent value="previsao" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Previsão de Faturamento do Mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-muted-foreground">Acumulado</p><p className="text-lg font-bold">{R$(data.fatAtual)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Média Diária</p><p className="text-lg font-bold">{R$(data.mediaDiariaGeral)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Dias Restantes</p><p className="text-lg font-bold">{data.diasRestantes}</p></div>
                    <div><p className="text-xs text-muted-foreground">Projeção</p><p className="text-lg font-bold text-primary">{R$(data.projecaoMes)}</p></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Previsão por Vendedor</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[50vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Vendedor</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Acumulado</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Média/Dia</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Projeção</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.previsaoVendedores.map((v, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium sticky left-0 z-10 bg-background">{v.nome}</TableCell>
                            <TableCell className="text-xs text-right">{R$(v.fatAcumulado)}</TableCell>
                            <TableCell className="text-xs text-right">{R$(v.mediaDiaria)}</TableCell>
                            <TableCell className="text-xs text-right font-semibold text-primary">{R$(v.projecao)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" /> Previsibilidade da Base de Clientes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">
                    Estimativa baseada na média mensal histórica (últimos 6 meses) de <span className="font-bold text-foreground">{data.clientePrevisoes.length}</span> clientes recorrentes
                    {filters.vendedores.length === 1 ? <> do vendedor <span className="font-bold text-foreground">{filters.vendedores[0]}</span></> : null}: <span className="font-bold text-foreground">{R$(data.previsaoCarteira)}</span>
                  </p>
                  {(() => {
                    const diffPct = data.previsaoCarteira > 0 ? ((data.projecaoMes - data.previsaoCarteira) / data.previsaoCarteira) * 100 : 0;
                    const isAbaixo = diffPct < -5;
                    const isAcima = diffPct > 5;
                    if (!isAbaixo && !isAcima) return (
                      <div className="flex items-center gap-2 p-2 rounded bg-muted text-xs border">
                        <AlertCircle className="h-4 w-4" />
                        Projeção ({R$(data.projecaoMes)}) está alinhada com a previsão da carteira ({pct(diffPct)}).
                      </div>
                    );
                    return (
                      <div className={`flex items-center gap-2 p-2 rounded text-xs border ${isAbaixo ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                        <AlertCircle className="h-4 w-4" />
                        Projeção ({R$(data.projecaoMes)}) está {Math.abs(diffPct).toFixed(0)}% {isAbaixo ? "abaixo" : "acima"} da previsão da carteira ({R$(data.previsaoCarteira)}).
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Clientes que compõem a previsão</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[50vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Cliente</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Média Mensal</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Meses c/ compra</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Janela</TableHead>
                          <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Última Compra</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.clientePrevisoes.slice(0, 50).map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium max-w-[200px] truncate sticky left-0 z-10 bg-background">{c.nome}</TableCell>
                            <TableCell className="text-xs text-right">{R$(c.mediaMensal)}</TableCell>
                            <TableCell className="text-xs text-right">{c.frequencia}/{c.mesesConsiderados}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">{c.mesesConsiderados} meses</TableCell>
                            <TableCell className="text-xs text-right">{c.ultimaCompra.toLocaleDateString("pt-BR")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Receita Recuperável */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Receita Recuperável
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Clientes inativos com até 90 dias sem comprar, ordenados pelo potencial mensal de retorno ao faturamento.
                    Receita potencial = média mensal dos últimos 6 meses ativos antes da inatividade.
                    Clientes com mais de 90 dias sem compra são excluídos por baixa probabilidade de recuperação imediata.
                  </p>
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Regra de negócio: Receita Recuperável só considera clientes acionáveis (até 90 dias).
                    const recuperaveis = data.clientesInativos.filter((c) => c.diasSemCompra <= 90);
                    const top = recuperaveis.slice(0, 100);
                    const totalRecuperavel = recuperaveis.reduce((s, c) => s + c.receitaRecuperavel, 0);
                    const top10Recuperavel = recuperaveis.slice(0, 10).reduce((s, c) => s + c.receitaRecuperavel, 0);
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                          <div className="p-2 rounded border border-emerald-200 bg-emerald-50">
                            <p className="text-lg font-bold text-emerald-700">{R$(totalRecuperavel)}</p>
                            <p className="text-[10px] text-muted-foreground">Potencial total /mês</p>
                          </div>
                          <div className="p-2 rounded border border-emerald-200 bg-emerald-50">
                            <p className="text-lg font-bold text-emerald-700">{R$(top10Recuperavel)}</p>
                            <p className="text-[10px] text-muted-foreground">Top 10 /mês</p>
                          </div>
                          <div className="p-2 rounded border border-amber-200 bg-amber-50">
                            <p className="text-lg font-bold text-amber-700">{recuperaveis.length}</p>
                            <p className="text-[10px] text-muted-foreground">Clientes a recuperar (≤90 dias)</p>
                          </div>
                        </div>
                        <div className="overflow-auto max-h-[40vh]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Cliente</TableHead>
                                <TableHead className="text-xs text-right">Última Compra</TableHead>
                                <TableHead className="text-xs text-right">Dias sem comprar</TableHead>
                                <TableHead className="text-xs text-right" title="Média mensal dos últimos 6 meses em que o cliente comprou, antes de ficar inativo.">Média mensal histórica</TableHead>
                                <TableHead className="text-xs text-right" title="Receita potencial mensal se o cliente for recuperado (igual à média mensal histórica).">Receita potencial /mês</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {top.map((c, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs font-medium" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }} title={c.nome}>{c.nome}</TableCell>
                                  <TableCell className="text-xs text-right">{c.ultimaCompra.toLocaleDateString("pt-BR")}</TableCell>
                                  <TableCell className="text-xs text-right">{c.diasSemCompra}</TableCell>
                                  <TableCell className="text-xs text-right text-muted-foreground" title={`${c.mesesAtivosConsiderados} ${c.mesesAtivosConsiderados === 1 ? "mês considerado" : "meses considerados"}`}>{R$(c.mediaMensalHistorica)}</TableCell>
                                  <TableCell className="text-xs text-right font-semibold text-emerald-700">{R$(c.receitaRecuperavel)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>


              {/* Debug por cliente */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Conferência por cliente (Debug — Atual vs Comparado)
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="mt-2 border-dashed">
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[60vh]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background">Cliente</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Atual</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Comparado</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Diferença</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Var %</TableHead>
                              <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Classificação</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.clientesDebug.slice(0, 200).map((c, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium max-w-[220px] truncate sticky left-0 z-10 bg-background" title={c.nome}>{c.nome}</TableCell>
                                <TableCell className="text-xs text-right">{R$(c.fatAtual)}</TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">{R$(c.fatComp)}</TableCell>
                                <TableCell className={`text-xs text-right ${c.diff >= 0 ? "text-green-600" : "text-red-500"}`}>{R$(c.diff)}</TableCell>
                                <TableCell className="text-xs text-right"><VariationIndicator value={c.diffPct} /></TableCell>
                                <TableCell className="text-xs text-right"><Badge variant="outline" className="text-[10px]">{c.classificacao}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>
            )}

            {/* ==================== CURVA ABC ==================== */}
            {podeAba("curva-abc") && (
            <TabsContent value="curva-abc">
              <CurvaAbcTab
                abcClientes={data.abcClientes}
                abcProdutos={data.abcProdutos}
                abcAlertas={data.abcAlertas}
                concentracaoTop10={data.concentracaoTop10}
                concentracaoTop20={data.concentracaoTop20}
                totalClientesAbc={data.totalClientesAbc}
                clientesA={data.clientesA}
                clientesB={data.clientesB}
                clientesC={data.clientesC}
                periodoLabel={data.abcPeriodoLabel}
                abcResumoClientes={data.abcResumoClientes}
                abcResumoProdutos={data.abcResumoProdutos}
              />
            </TabsContent>
            )}

            {podeAba("meta-cliente") && (
            <TabsContent value="meta-cliente">
              <MetaClienteTab vendedorFiltro={filters.vendedores.length === 1 ? filters.vendedores[0] : undefined} />
            </TabsContent>
            )}

            {/* ==================== LEITURA ESTRATÉGICA ==================== */}
            {podeAba("leitura") && (
            <TabsContent value="leitura">
              <LeituraEstrategicaTab
                abcClientes={data.abcClientes}
                abcResumoClientes={data.abcResumoClientes}
                concentracaoTop10={data.concentracaoTop10}
                concentracaoTop20={data.concentracaoTop20}
                totalClientesAbc={data.totalClientesAbc}
                clientesA={data.clientesA}
                clientesB={data.clientesB}
                clientesC={data.clientesC}
                periodoLabel={periodLabel}
                vendedorLabel={filters.vendedores[0]}
              />
            </TabsContent>
            )}

            {/* ==================== GRÁFICOS ==================== */}
            {podeAba("graficos") && (
            <TabsContent value="graficos" className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução Mensal de Faturamento</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => R$(v)} />
                        <Bar dataKey="faturamento" fill="hsl(32, 90%, 50%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução Mensal de Volume (kg)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.chartVolume}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => kg(v)} />
                        <Line type="monotone" dataKey="volume" stroke="hsl(142, 60%, 40%)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Faturamento por Vendedor</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.vendedorResumos} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => R$(v)} />
                        <Bar dataKey="fatAtual" fill="hsl(32, 90%, 50%)" radius={[0, 4, 4, 0]} />
                        {data.hasComp && <Bar dataKey="fatComp" name="Comparativo" fill="hsl(210, 70%, 50%)" radius={[0, 4, 4, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Produtos por Faturamento</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(data.hasComp ? data.prodMovimentos : data.mixProdutos).slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => R$(v)} />
                        <Bar dataKey={data.hasComp ? "fatAtual" : "fat"} name="Atual" fill="hsl(210, 70%, 50%)" radius={[0, 4, 4, 0]} />
                        {data.hasComp && <Bar dataKey="fatComp" name="Comparativo" fill="hsl(32, 90%, 50%)" radius={[0, 4, 4, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {podeUsarIA && (
            <TabsContent value="central-analise" className="space-y-4">
              <CentralAnaliseTab
                sales={sales ?? []}
                filtrosHeader={{
                  inicio: filters.inicio,
                  fim: filters.fim,
                  compInicio: analysisMode === "continuous" ? "" : filters.compInicio,
                  compFim: analysisMode === "continuous" ? "" : filters.compFim,
                  modoLabel: analysisMode === "continuous" ? "Evolução no período" : "Comparativo de períodos",
                  vendedores: filters.vendedores ?? [],
                  clientes: (filters.clientes?.length ? filters.clientes : filters.cliente ? [filters.cliente] : []),
                  produtos: (filters.produtos?.length ? filters.produtos : filters.produto ? [filters.produto] : []),
                }}
                onAplicarFiltrosHeader={(f) =>
                  setFilters((prev) => ({
                    ...prev,
                    inicio: f.inicio ?? prev.inicio,
                    fim: f.fim ?? prev.fim,
                    compInicio: f.compInicio ?? prev.compInicio,
                    compFim: f.compFim ?? prev.compFim,
                    vendedores: f.vendedores ?? prev.vendedores,
                    clientes: f.clientes ?? prev.clientes,
                    cliente: f.clientes?.length === 1 ? f.clientes[0] : "",
                    produtos: f.produtos ?? prev.produtos,
                    produto: f.produtos?.length === 1 ? f.produtos[0] : "",
                  }))
                }
              />

            </TabsContent>
            )}
          </Tabs>


        )}
      </div>
      <ClientesNovosDialog
        open={novosOpen}
        onOpenChange={setNovosOpen}
        titulo="Clientes Novos no Período"
        descricao="Apenas clientes cuja PRIMEIRA compra histórica em TODA a base ocorre dentro do período atual selecionado. Histórico avaliado globalmente (independente do filtro de vendedor/produto)."
        itens={(data?.clientesNovosDetalhe ?? []).map((c): ClienteNovoLinha => ({
          cliente: c.cliente,
          primeiraCompra: c.primeiraCompraGlobal,
          valorPrimeiraCompra: c.valorPrimeiraCompra,
          vendedorPrimeiraCompra: c.vendedorPrimeiraCompra,
          totalNoPeriodo: c.totalNoPeriodo,
          pedidosNoPeriodo: c.pedidosNoPeriodo,
          temHistoricoAnterior: c.temHistoricoAnterior,
        }))}
      />
    </AppLayout>
  );
}
