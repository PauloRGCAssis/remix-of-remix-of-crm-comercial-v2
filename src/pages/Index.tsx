import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { KpiCard } from "@/components/KpiCard";
import { DateRangeFilterGroup } from "@/components/DateRangeFilterGroup";
import {
  Users,
  UserPlus,
  UserMinus,
  UserX,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingDown,
  Building2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useSalesData, shortVendedorName, cleanProductName, isExcludedProduct, filterByDateRange, getUniqueVendedores } from "@/hooks/useSalesData";
import { calcFaturamento, calcPedidos, calcTicketMedio, calcVolume } from "@/lib/salesAggregation";
import { formatPeriodLabel, calculateVariation } from "@/lib/periodComparison";

// ------------ Helpers ------------

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function firstOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}
function previousMonthSameRange(start: string, end: string): { start: string; end: string } {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const ps = new Date(s.getFullYear(), s.getMonth() - 1, s.getDate());
  const pe = new Date(e.getFullYear(), e.getMonth() - 1, e.getDate());
  return { start: ps.toISOString().slice(0, 10), end: pe.toISOString().slice(0, 10) };
}
function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNumber(v: number) {
  return v.toLocaleString("pt-BR");
}
function monthLabel(date: Date): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[date.getMonth()]}/${(date.getFullYear() % 100).toString().padStart(2, "0")}`;
}



// ------------ Context strip used in every card/chart ------------

interface ContextProps {
  scope: string;
  period: string;
  comparison?: string;
  extra?: string;
}
function ContextStrip({ scope, period, comparison, extra }: ContextProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
      <Badge variant="secondary" className="font-normal">
        <Building2 className="h-3 w-3 mr-1" />
        {scope}
      </Badge>
      <Badge variant="outline" className="font-normal">Período: {period}</Badge>
      {comparison && (
        <Badge variant="outline" className="font-normal">Comparativo: {comparison}</Badge>
      )}
      {extra && <span className="ml-1">{extra}</span>}
    </div>
  );
}

// ------------ Dashboard ------------

export default function Dashboard() {
  // Global filters
  const [start, setStart] = useState<string>(firstOfMonthISO());
  const [end, setEnd] = useState<string>(todayISO());
  const initialComp = previousMonthSameRange(firstOfMonthISO(), todayISO());
  const [compStart, setCompStart] = useState<string>(initialComp.start);
  const [compEnd, setCompEnd] = useState<string>(initialComp.end);
  const [vendedor, setVendedor] = useState<string>("Todos");

  const { data: sales = [], isLoading } = useSalesData();
  const vendedores = useMemo(() => ["Todos", ...getUniqueVendedores(sales)], [sales]);

  const scopeLabel = vendedor === "Todos" ? "Empresa" : `Vendedor: ${vendedor}`;
  const periodLabel = formatPeriodLabel(start, end);
  const compLabel = formatPeriodLabel(compStart, compEnd);

  // Filtered datasets
  const baseFiltered = useMemo(() => {
    let rows = sales;
    if (vendedor !== "Todos") {
      rows = rows.filter((s) => shortVendedorName(s.vendedor) === vendedor);
    }
    return rows;
  }, [sales, vendedor]);

  const periodSales = useMemo(
    () => (start && end ? filterByDateRange(baseFiltered, start, end) : []),
    [baseFiltered, start, end],
  );
  const compSales = useMemo(
    () => (compStart && compEnd ? filterByDateRange(baseFiltered, compStart, compEnd) : []),
    [baseFiltered, compStart, compEnd],
  );

  // KPIs current period
  const faturamento = calcFaturamento(periodSales);
  const pedidos = calcPedidos(periodSales);
  const ticketMedio = calcTicketMedio(faturamento, pedidos);
  const volume = calcVolume(periodSales);

  // KPIs comparison
  const compFaturamento = calcFaturamento(compSales);
  const compPedidos = calcPedidos(compSales);
  const compTicket = calcTicketMedio(compFaturamento, compPedidos);

  const trendFaturamento = calculateVariation(faturamento, compFaturamento);
  const trendTicket = calculateVariation(ticketMedio, compTicket);

  // Client lifecycle (referenced to end date or today)
  const referenceDate = end ? new Date(end + "T23:59:59") : new Date();

  const lifecycle = useMemo(() => {
    // map cliente -> {first, last}
    const map = new Map<string, { first: Date; last: Date }>();
    for (const s of baseFiltered) {
      const d = new Date(s.data);
      const e = map.get(s.cliente);
      if (!e) map.set(s.cliente, { first: d, last: d });
      else {
        if (d < e.first) e.first = d;
        if (d > e.last) e.last = d;
      }
    }
    const startD = start ? new Date(start + "T00:00:00") : null;
    const endD = end ? new Date(end + "T23:59:59") : null;

    let ativos = 0;
    let novos = 0;
    let inativos = 0;
    let perdidos = 0;
    map.forEach(({ first, last }) => {
      // Ativos: pelo menos 1 pedido no período
      if (startD && endD && last >= startD && first <= endD) {
        // checa se há ao menos um pedido dentro do range — heurística: last >= startD && first <= endD pode incluir clientes sem nada no range exato, então recheck:
      }
      // Refinamento: contar somente quem tem pedido no range
      const days = Math.floor((referenceDate.getTime() - last.getTime()) / 86400000);
      if (days > 200) perdidos++;
      else if (days > 90) inativos++;
    });

    // Recompute ativos/novos do periodSales
    const ativosSet = new Set(periodSales.map((s) => s.cliente));
    ativos = ativosSet.size;
    let novosCount = 0;
    ativosSet.forEach((cli) => {
      const f = map.get(cli)?.first;
      if (f && startD && endD && f >= startD && f <= endD) {
        // first purchase ever (in baseFiltered) is inside the period → novo
        novosCount++;
      }
    });
    novos = novosCount;

    return { ativos, novos, inativos, perdidos };
  }, [baseFiltered, periodSales, start, end, referenceDate]);

  // Monthly volume chart (last 12 months) — respects vendor filter
  const monthlyChart = useMemo(() => {
    const map = new Map<string, { kg: number; date: Date }>();
    for (const s of baseFiltered) {
      const d = new Date(s.data);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const entry = map.get(key);
      const kg = Number(s.quantidade) || 0;
      if (!entry) map.set(key, { kg, date: new Date(d.getFullYear(), d.getMonth(), 1) });
      else entry.kg += kg;
    }
    return [...map.values()]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-12)
      .map((e) => ({ mes: monthLabel(e.date), kg: Math.round(e.kg) }));
  }, [baseFiltered]);

  // Status pie
  const statusPie = [
    { name: "Ativos", value: lifecycle.ativos, color: "hsl(142, 60%, 40%)" },
    { name: "Novos", value: lifecycle.novos, color: "hsl(210, 70%, 50%)" },
    { name: "Inativos", value: lifecycle.inativos, color: "hsl(38, 92%, 50%)" },
    { name: "Perdidos", value: lifecycle.perdidos, color: "hsl(0, 72%, 51%)" },
  ];

  // Alerts: clientes com queda de faturamento entre comparativo e período atual
  const alerts = useMemo(() => {
    if (!start || !end || !compStart || !compEnd) return [];
    const curMap = new Map<string, { fat: number; vendedor: string }>();
    const compMap = new Map<string, { fat: number; vendedor: string }>();
    for (const s of periodSales) {
      const e = curMap.get(s.cliente);
      const fat = Number(s.preco_total) || 0;
      if (!e) curMap.set(s.cliente, { fat, vendedor: shortVendedorName(s.vendedor) });
      else e.fat += fat;
    }
    for (const s of compSales) {
      const e = compMap.get(s.cliente);
      const fat = Number(s.preco_total) || 0;
      if (!e) compMap.set(s.cliente, { fat, vendedor: shortVendedorName(s.vendedor) });
      else e.fat += fat;
    }
    const items: Array<{
      cliente: string;
      vendedor: string;
      fatAtual: number;
      fatComp: number;
      variacao: number;
      zerado: boolean;
    }> = [];
    compMap.forEach((c, cliente) => {
      if (c.fat <= 0) return;
      const cur = curMap.get(cliente)?.fat ?? 0;
      const variacao = ((cur - c.fat) / c.fat) * 100;
      if (variacao <= -30) {
        items.push({
          cliente,
          vendedor: curMap.get(cliente)?.vendedor || c.vendedor,
          fatAtual: cur,
          fatComp: c.fat,
          variacao,
          zerado: cur === 0,
        });
      }
    });
    return items.sort((a, b) => a.variacao - b.variacao).slice(0, 8);
  }, [periodSales, compSales, start, end, compStart, compEnd]);

  // Top produtos (volume) no período atual
  const topProducts = useMemo(() => {
    const map = new Map<string, { volume: number; faturamento: number }>();
    for (const s of periodSales) {
      const nome = cleanProductName(s.descricao);
      if (isExcludedProduct(nome)) continue;
      const e = map.get(nome);
      const qt = Number(s.quantidade) || 0;
      const ft = Number(s.preco_total) || 0;
      if (!e) map.set(nome, { volume: qt, faturamento: ft });
      else {
        e.volume += qt;
        e.faturamento += ft;
      }
    }
    return [...map.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
  }, [periodSales]);

  const maxTopVolume = topProducts[0]?.volume ?? 1;

  // ------------ Render ------------

  return (
    <AppLayout>
      <TooltipProvider>
        <div className="space-y-6">
          {/* Header + Global Filters */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground font-heading">
                Dashboard Executivo
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Visão consolidada — {scopeLabel} · Período {periodLabel || "—"}{" "}
                {compLabel && <>· Comparativo {compLabel}</>}
              </p>
            </div>

            <Card className="shadow-card">
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <DateRangeFilterGroup
                  label="Período principal"
                  start={start}
                  end={end}
                  onStartChange={setStart}
                  onEndChange={setEnd}
                />
                <DateRangeFilterGroup
                  label="Período comparativo"
                  start={compStart}
                  end={compEnd}
                  onStartChange={setCompStart}
                  onEndChange={setCompEnd}
                  optional
                  onClear={() => {
                    setCompStart("");
                    setCompEnd("");
                  }}
                />
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" /> Vendedor
                  </label>
                  <Select value={vendedor} onValueChange={setVendedor}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v === "Todos" ? "Todos (Empresa)" : v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Aplica-se a todos os indicadores, gráficos e alertas desta página.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {isLoading && (
            <Card className="p-6 text-sm text-muted-foreground">Carregando dados de vendas…</Card>
          )}

          {/* KPI cards — Clientes */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Clientes ({scopeLabel})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <KpiCard
                title={`Clientes Ativos (${scopeLabel})`}
                value={fmtNumber(lifecycle.ativos)}
                icon={Users}
                variant="success"
                subtitle={`Compraram entre ${periodLabel || "—"}`}
              />
              <KpiCard
                title={`Clientes Novos (${scopeLabel})`}
                value={fmtNumber(lifecycle.novos)}
                icon={UserPlus}
                variant="info"
                subtitle={`Primeiro pedido no período (${periodLabel || "—"})`}
              />
              <KpiCard
                title={`Clientes em Risco (${scopeLabel})`}
                value={fmtNumber(lifecycle.inativos)}
                icon={UserMinus}
                variant="warning"
                subtitle={`Sem compra há 91-200 dias · ref ${end ? new Date(end + "T00:00:00").toLocaleDateString("pt-BR") : "—"}`}
              />
              <KpiCard
                title={`Clientes Inativos (${scopeLabel})`}
                value={fmtNumber(lifecycle.perdidos)}
                icon={UserX}
                variant="danger"
                subtitle={`Sem compra há +200 dias · ref ${end ? new Date(end + "T00:00:00").toLocaleDateString("pt-BR") : "—"}`}
              />
            </div>
          </section>

          {/* KPI cards — Financeiro */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Financeiro ({scopeLabel})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <KpiCard
                title={`Faturamento (${scopeLabel})`}
                value={fmtCurrency(faturamento)}
                icon={DollarSign}
                trend={trendFaturamento !== null ? Math.round(trendFaturamento) : undefined}
                subtitle={`Período: ${periodLabel || "—"}${compLabel ? ` · vs ${compLabel}` : ""}`}
              />
              <KpiCard
                title={`Pedidos (${scopeLabel})`}
                value={fmtNumber(pedidos)}
                icon={ShoppingCart}
                subtitle={`Pedidos únicos no período (${periodLabel || "—"})`}
              />
              <KpiCard
                title={`Ticket Médio (${scopeLabel})`}
                value={fmtCurrency(ticketMedio)}
                icon={Target}
                trend={trendTicket !== null ? Math.round(trendTicket) : undefined}
                subtitle={`Faturamento ÷ pedidos · ${periodLabel || "—"}`}
              />
              <KpiCard
                title={`Volume (${scopeLabel})`}
                value={`${fmtNumber(Math.round(volume))} kg`}
                icon={TrendingDown}
                subtitle={`Soma de quantidade · ${periodLabel || "—"}`}
              />
            </div>
          </section>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  Volume de Vendas Mensal (kg) — {scopeLabel}
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Soma da quantidade vendida (kg) por mês considerando todo o histórico do
                      vendedor selecionado, ignorando o período principal.
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <ContextStrip
                  scope={scopeLabel}
                  period="Últimos 12 meses do histórico"
                  extra="· métrica: kg vendidos"
                />
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {monthlyChart.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Dados insuficientes para exibir este gráfico com segurança.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <RTooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          formatter={(value: number) => [`${value.toLocaleString("pt-BR")} kg`, "Volume"]}
                        />
                        <Bar dataKey="kg" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading">
                  Clientes por Status — {scopeLabel}
                </CardTitle>
                <ContextStrip
                  scope={scopeLabel}
                  period={periodLabel || "—"}
                  extra="· base: histórico vinculado ao filtro atual"
                />
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPie}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {statusPie.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <RTooltip formatter={(value: number) => [value, "Clientes"]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts + Top products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Alertas — Clientes em Risco ({scopeLabel})
                </CardTitle>
                <ContextStrip
                  scope={scopeLabel}
                  period={periodLabel || "—"}
                  comparison={compLabel || undefined}
                  extra="· critério: queda ≥ 30% no faturamento"
                />
              </CardHeader>
              <CardContent>
                {!compStart || !compEnd ? (
                  <div className="text-sm text-muted-foreground p-4">
                    Defina um período comparativo para identificar quedas com segurança.
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4">
                    Nenhuma queda relevante identificada no período selecionado.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {alerts.map((a) => (
                      <div
                        key={a.cliente}
                        className="p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground break-words">
                              {a.cliente}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Vendedor: <strong className="text-foreground">{a.vendedor || "—"}</strong>
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {a.zerado
                                ? "Zerou as compras no período atual"
                                : `Queda de ${Math.abs(Math.round(a.variacao))}% no faturamento`}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {compLabel}: {fmtCurrency(a.fatComp)} → {periodLabel}: {fmtCurrency(a.fatAtual)}
                            </p>
                          </div>
                          <Badge variant={a.zerado ? "destructive" : "secondary"} className="shrink-0">
                            {a.zerado ? "Zerou" : `${Math.round(a.variacao)}%`}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-heading">
                  Top Produtos por Volume — {scopeLabel}
                </CardTitle>
                <ContextStrip
                  scope={scopeLabel}
                  period={periodLabel || "—"}
                  extra="· métrica: kg vendidos"
                />
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4">
                    Dados insuficientes para exibir este ranking com segurança.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topProducts.map((p, i) => (
                      <div key={p.nome} className="flex items-start gap-3">
                        <span className="text-lg font-bold text-primary/60 w-6 text-right shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm font-medium break-words leading-tight cursor-help">
                                {p.nome}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">{p.nome}</p>
                              <p className="text-xs mt-1">
                                Volume: {fmtNumber(Math.round(p.volume))} kg ·{" "}
                                {fmtCurrency(p.faturamento)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {scopeLabel} · {periodLabel}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <div className="w-full bg-muted rounded-full h-1.5 mt-1.5">
                            <div
                              className="gradient-brand h-1.5 rounded-full transition-all duration-700"
                              style={{ width: `${(p.volume / maxTopVolume) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">
                            {fmtNumber(Math.round(p.volume))} kg
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {fmtCurrency(p.faturamento)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
}
