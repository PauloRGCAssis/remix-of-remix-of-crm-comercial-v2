import React, { useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, AlertTriangle, X, Loader2 } from "lucide-react";
import { ClientAlertPopover } from "@/components/estudo-vendas/ClientAlertPopover";
import { ClienteRelatorioPdfButtons } from "@/components/estudo-vendas/ClienteRelatorioPdfButtons";
import { cn } from "@/lib/utils";
import { FilterPopover } from "@/components/FilterPopover";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { useSalesData, shortVendedorName, cleanProductName, getMonthKey, getUniqueVendedores, type SaleRow } from "@/hooks/useSalesData";
import { DuplicatesBanner } from "@/components/clientes/DuplicatesBanner";
import { usePersistentState } from "@/hooks/usePersistentState";
import { getMetricsForPeriod } from "@/lib/estudoVendasPeriodo";


function formatFaturamento(value: number): string {
  const rounded = Math.round(value);
  if (rounded >= 1000000) {
    return `R$ ${(rounded / 1000).toLocaleString('pt-BR')} mil`;
  }
  if (rounded >= 1000) {
    return `R$ ${rounded.toLocaleString('pt-BR')}`;
  }
  return `R$ ${rounded.toLocaleString('pt-BR')}`;
}

interface MonthProductData {
  qty: number;
  fat: number;
  pctQty: number | null;
}

interface ClientStudy {
  clientName: string;
  vendedor: string;
  products: {
    productName: string;
    months: Record<string, MonthProductData>;
  }[];
}

function buildStudyData(sales: SaleRow[], months: string[]): ClientStudy[] {
  // Group by client -> product -> month
  const clientMap = new Map<string, Map<string, Map<string, { qty: number; fat: number }>>>();

  sales.forEach(s => {
    const client = s.cliente;
    const product = cleanProductName(s.descricao);
    const month = getMonthKey(s.data);

    if (!clientMap.has(client)) clientMap.set(client, new Map());
    const productMap = clientMap.get(client)!;
    if (!productMap.has(product)) productMap.set(product, new Map());
    const monthMap = productMap.get(product)!;
    if (!monthMap.has(month)) monthMap.set(month, { qty: 0, fat: 0 });
    const data = monthMap.get(month)!;
    data.qty += Number(s.quantidade);
    data.fat += Number(s.preco_total);
  });

  // Build vendedor map (most recent)
  const vendedorMap = new Map<string, string>();
  sales.forEach(s => {
    vendedorMap.set(s.cliente, shortVendedorName(s.vendedor));
  });

  const result: ClientStudy[] = [];
  clientMap.forEach((productMap, clientName) => {
    const products: ClientStudy['products'] = [];
    productMap.forEach((monthMap, productName) => {
      const monthData: Record<string, MonthProductData> = {};
      months.forEach((m, i) => {
        const data = monthMap.get(m);
        const qty = data?.qty ?? 0;
        const fat = data?.fat ?? 0;
        // Previous month for variation
        let pctQty: number | null = null;
        if (i > 0) {
          const prevMonth = months[i - 1];
          const prevData = monthMap.get(prevMonth);
          const prevQty = prevData?.qty ?? 0;
          if (prevQty > 0 && qty > 0) pctQty = ((qty - prevQty) / prevQty) * 100;
          else if (prevQty > 0 && qty === 0) pctQty = -100;
          else if (prevQty === 0 && qty > 0) pctQty = 100;
        }
        monthData[m] = { qty, fat, pctQty };
      });
      products.push({ productName, months: monthData });
    });
    result.push({
      clientName,
      vendedor: vendedorMap.get(clientName) || "",
      products: products.sort((a, b) => a.productName.localeCompare(b.productName)),
    });
  });

  return result.sort((a, b) => a.clientName.localeCompare(b.clientName));
}

function getDefaultMonthRange(monthCount: number): [number, number] {
  return [Math.max(0, monthCount - 6), Math.max(0, monthCount - 1)];
}

type SortOption =
  | "nome-asc" | "nome-desc"
  | "fat-desc" | "fat-asc"
  | "qtd-desc" | "qtd-asc"
  | "cresc-desc" | "queda-desc"
  | "criticos" | "alertas";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "nome-asc", label: "Nome do cliente — A → Z" },
  { value: "nome-desc", label: "Nome do cliente — Z → A" },
  { value: "fat-desc", label: "Maior faturamento → menor" },
  { value: "fat-asc", label: "Menor faturamento → maior" },
  { value: "qtd-desc", label: "Maior volume (kg) → menor" },
  { value: "qtd-asc", label: "Menor volume (kg) → maior" },
  { value: "cresc-desc", label: "Maior crescimento % → menor" },
  { value: "queda-desc", label: "Maior queda % → menor" },
  { value: "criticos", label: "Queda Crítica primeiro" },
  { value: "alertas", label: "Mais alertas primeiro" },
];

// Métricas de ordenação vêm da fonte única de período (src/lib/estudoVendasPeriodo.ts).



export default function EstudoVendasPage() {
  const { data: allSales, isLoading } = useSalesData();
  const [selectedClientes, setSelectedClientes] = usePersistentState<string[]>("estudo-vendas:selectedClientes", []);
  const [selectedVendedores, setSelectedVendedores] = usePersistentState<string[]>("estudo-vendas:selectedVendedores", []);
  const [sortBy, setSortBy] = usePersistentState<SortOption>("estudo-vendas:sortBy", "nome-asc");


  // Compute all available months from data
  const allMonths = useMemo(() => {
    if (!allSales) return [];
    const monthSet = new Set<string>();
    allSales.forEach(s => monthSet.add(getMonthKey(s.data)));
    // Sort chronologically
    const monthOrder = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return [...monthSet].sort((a, b) => {
      const [ma, ya] = a.split('/');
      const [mb, yb] = b.split('/');
      if (ya !== yb) return Number(ya) - Number(yb);
      return monthOrder.indexOf(ma) - monthOrder.indexOf(mb);
    });
  }, [allSales]);

  const [monthRange, setMonthRange] = usePersistentState<[number, number]>("estudo-vendas:monthRange", () => getDefaultMonthRange(allMonths.length));
  const [pendingMonthRange, setPendingMonthRange] = usePersistentState<[number, number]>("estudo-vendas:pendingMonthRange", () => getDefaultMonthRange(allMonths.length));
  // O período só pode ser calculado depois que os meses reais chegam. Sem isso,
  // o intervalo ficava travado em [0,0] (primeiro mês do histórico) e a tela
  // exibia "—" mesmo existindo vendas.
  const [rangeInitialized, setRangeInitialized] = usePersistentState<boolean>("estudo-vendas:rangeInitialized", false);

  useEffect(() => {
    if (allMonths.length === 0) return;

    if (!rangeInitialized) {
      const padrao = getDefaultMonthRange(allMonths.length);
      setMonthRange(padrao);
      setPendingMonthRange(padrao);
      setRangeInitialized(true);
      return;
    }

    const normalizeRange = (range: [number, number]): [number, number] => {
      const maxIndex = allMonths.length - 1;
      const start = Math.min(Math.max(range[0], 0), maxIndex);
      const end = Math.min(Math.max(range[1], start), maxIndex);
      return [start, end];
    };

    setMonthRange(prev => normalizeRange(prev));
    setPendingMonthRange(prev => normalizeRange(prev));
  }, [allMonths.length, rangeInitialized]);


  const handleApplyMonthRange = () => {
    const nextStart = Math.min(pendingMonthRange[0], pendingMonthRange[1]);
    const nextEnd = Math.max(pendingMonthRange[0], pendingMonthRange[1]);
    setMonthRange([nextStart, nextEnd]);
    setPendingMonthRange([nextStart, nextEnd]);
  };

  const allClientes = useMemo(() => {
    if (!allSales) return [];
    return [...new Set(allSales.map(s => s.cliente))].sort();
  }, [allSales]);

  const allVendedores = useMemo(() => {
    if (!allSales) return [];
    return getUniqueVendedores(allSales);
  }, [allSales]);

  const visibleMonths = useMemo(() => {
    return allMonths.slice(monthRange[0], monthRange[1] + 1);
  }, [allMonths, monthRange]);

  const studyData = useMemo(() => {
    if (!allSales) return [];
    return buildStudyData(allSales, allMonths);
  }, [allSales, allMonths]);

  const filteredClients = useMemo(() => {
    let data = studyData;
    if (selectedVendedores.length > 0) {
      data = data.filter(c => selectedVendedores.includes(c.vendedor));
    }
    if (selectedClientes.length > 0) {
      data = data.filter(c => selectedClientes.includes(c.clientName));
    }
    return data;
  }, [studyData, selectedClientes, selectedVendedores]);

  const hasPendingMonthChanges = pendingMonthRange[0] !== monthRange[0] || pendingMonthRange[1] !== monthRange[1];

  const sortedClients = useMemo(() => {
    const withMetrics = filteredClients.map(client => {
      const metrics = getMetricsForPeriod(client, visibleMonths);
      return { client, metrics, status: metrics.status };
    });


    const byName = (a: typeof withMetrics[number], b: typeof withMetrics[number]) =>
      a.client.clientName.localeCompare(b.client.clientName, "pt-BR");

    const sorted = [...withMetrics];
    switch (sortBy) {
      case "nome-desc":
        sorted.sort((a, b) => -byName(a, b));
        break;
      case "fat-desc":
        sorted.sort((a, b) => (b.metrics.fat - a.metrics.fat) || byName(a, b));
        break;
      case "fat-asc":
        sorted.sort((a, b) => {
          const az = a.metrics.fat <= 0, bz = b.metrics.fat <= 0;
          if (az !== bz) return az ? 1 : -1;
          return (a.metrics.fat - b.metrics.fat) || byName(a, b);
        });
        break;
      case "qtd-desc":
        sorted.sort((a, b) => (b.metrics.qty - a.metrics.qty) || byName(a, b));
        break;
      case "qtd-asc":
        sorted.sort((a, b) => {
          const az = a.metrics.qty <= 0, bz = b.metrics.qty <= 0;
          if (az !== bz) return az ? 1 : -1;
          return (a.metrics.qty - b.metrics.qty) || byName(a, b);
        });
        break;
      case "cresc-desc":
        sorted.sort((a, b) => {
          const av = a.metrics.pctFat ?? Number.NEGATIVE_INFINITY;
          const bv = b.metrics.pctFat ?? Number.NEGATIVE_INFINITY;
          return (bv - av) || byName(a, b);
        });
        break;
      case "queda-desc":
        sorted.sort((a, b) => {
          const av = a.metrics.pctFat ?? Number.POSITIVE_INFINITY;
          const bv = b.metrics.pctFat ?? Number.POSITIVE_INFINITY;
          return (av - bv) || byName(a, b);
        });
        break;
      case "criticos": {
        const rank = { critical: 0, warning: 1, neutral: 2, positive: 3 } as Record<string, number>;
        sorted.sort((a, b) => (rank[a.status] - rank[b.status]) || byName(a, b));
        break;
      }
      case "alertas":
        sorted.sort((a, b) => (b.metrics.alertCount - a.metrics.alertCount) || byName(a, b));
        break;
      default:
        sorted.sort(byName);
    }
    return sorted;
  }, [filteredClients, visibleMonths, sortBy]);

  const lastVisibleMonth = visibleMonths[visibleMonths.length - 1];
  const periodoLabel = visibleMonths.length === 0
    ? "—"
    : visibleMonths.length === 1
      ? visibleMonths[0]
      : `${visibleMonths[0]} → ${lastVisibleMonth}`;



  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando dados...</span>
        </div>
      </AppLayout>
    );
  }

  if (!allSales || allSales.length === 0) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <h2 className="text-xl font-bold font-heading mb-2">Nenhum dado de vendas encontrado</h2>
          <p className="text-muted-foreground">Importe uma planilha na aba "Importar" para visualizar os dados.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading">Estudo de Vendas</h1>
          <p className="text-sm text-muted-foreground mt-1">Análise detalhada mês a mês por cliente e produto — Qtd, Faturamento e Variação</p>
        </div>
        <DuplicatesBanner />

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row items-end gap-3 flex-wrap">
              <div>
                <Label className="text-xs text-muted-foreground">Buscar Cliente</Label>
                <SearchableCombobox
                  options={allClientes}
                  value={selectedClientes}
                  onValueChange={setSelectedClientes}
                  placeholder="Todos"
                  searchPlaceholder="Digite para buscar cliente..."
                  emptyMessage="Cliente não encontrado."
                  allLabel="Todos"
                  applyMode
                  widthClass="w-[320px]"
                />
              </div>
              <FilterPopover label="Vendedor" options={allVendedores} selected={selectedVendedores} onApply={setSelectedVendedores} />
              <div className="flex gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">De (mês)</Label>
                  <select className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm" value={pendingMonthRange[0]} onChange={e => setPendingMonthRange([Number(e.target.value), pendingMonthRange[1]])}>
                    {allMonths.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Até (mês)</Label>
                  <select className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm" value={pendingMonthRange[1]} onChange={e => setPendingMonthRange([pendingMonthRange[0], Number(e.target.value)])}>
                    {allMonths.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </div>
              </div>
              <Button size="sm" className="text-xs" variant={hasPendingMonthChanges ? "default" : "outline"} onClick={handleApplyMonthRange}>Aplicar</Button>
              <div>
                <Label className="text-xs text-muted-foreground">Ordenar por</Label>
                <select
                  className="flex h-10 w-[230px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                const resetRange = getDefaultMonthRange(allMonths.length);
                setSelectedClientes([]);
                setSelectedVendedores([]);
                setSortBy("nome-asc");
                setMonthRange(resetRange);
                setPendingMonthRange(resetRange);
              }}>
                <X className="h-3 w-3 mr-1" /> Limpar Tudo
              </Button>
            </div>
          </CardContent>
        </Card>

        {sortedClients.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center text-muted-foreground">Nenhum cliente encontrado com os filtros selecionados</CardContent>
          </Card>
        ) : (
          sortedClients.map(({ client, metrics, status: alertStatus }) => {
            return (

              <Card key={client.clientName} className={cn(
                "shadow-card overflow-hidden",
                alertStatus === 'critical' && "border-destructive/50",
                alertStatus === 'warning' && "border-warning/50",
                alertStatus === 'positive' && "border-success/50",
              )}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-base font-heading">{client.clientName}</CardTitle>
                    <Badge variant="outline" className="text-xs">{client.vendedor}</Badge>
                    <Badge variant="secondary" className="text-xs">
                      Faturamento {periodoLabel}: {formatFaturamento(metrics.fat)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      Volume {periodoLabel}: {Math.round(metrics.qty).toLocaleString('pt-BR')} kg
                    </Badge>
                    {lastVisibleMonth && visibleMonths.length > 1 && (
                      <Badge variant="outline" className="text-xs">
                        {lastVisibleMonth}: {formatFaturamento(metrics.fatUltimoMes)}
                      </Badge>
                    )}
                    {(sortBy === 'cresc-desc' || sortBy === 'queda-desc') && (
                      <Badge variant="secondary" className="text-xs">
                        Variação do período: {metrics.pctFat === null ? '—' : `${metrics.pctFat > 0 ? '+' : ''}${metrics.pctFat.toFixed(0)}%`}
                      </Badge>
                    )}
                    {metrics.alertCount > 0 && (
                      <Badge variant="secondary" className="text-xs">{metrics.alertCount} alerta(s) no período</Badge>
                    )}


                    {alertStatus === 'critical' && <Badge className="bg-destructive/10 text-destructive text-xs gap-1"><AlertTriangle className="h-3 w-3" /> Queda Crítica</Badge>}
                    {alertStatus === 'warning' && <Badge className="bg-warning/10 text-warning text-xs gap-1"><TrendingDown className="h-3 w-3" /> Em Queda</Badge>}
                    {alertStatus === 'positive' && <Badge className="bg-success/10 text-success text-xs gap-1"><TrendingUp className="h-3 w-3" /> Crescimento</Badge>}
                    <ClientAlertPopover
                      products={client.products}
                      visibleMonths={visibleMonths}
                      allSalesForClient={allSales?.filter(s => s.cliente === client.clientName).map(s => ({ descricao: cleanProductName(s.descricao), data: s.data }))}
                    />
                    <ClienteRelatorioPdfButtons
                      input={{
                        clientName: client.clientName,
                        vendedor: client.vendedor,
                        visibleMonths,
                        products: client.products,
                        status: alertStatus,
                        alertCount: metrics.alertCount,
                      }}
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[70vh] relative">
                    <table className="w-full text-xs" style={{ minWidth: `${300 + visibleMonths.length * 220}px` }}>
                      <thead className="sticky top-0 z-20">
                        <tr className="border-b bg-background">
                          <th rowSpan={2} className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 z-30 bg-background min-w-[200px] border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Produto</th>
                          {visibleMonths.map(m => (
                            <th key={m} colSpan={3} className="text-center py-1.5 px-1 font-semibold text-foreground border-l border-border/50">{m}</th>
                          ))}
                        </tr>
                        <tr className="border-b bg-background sticky top-[calc(1.5rem+1px)] z-20">
                          {visibleMonths.map(m => (
                            <React.Fragment key={`sub-${m}`}>
                              <th className="text-center py-1 px-1 font-medium text-muted-foreground text-[10px] border-l border-border/50 min-w-[65px]">Qtd (kg)</th>
                              <th className="text-center py-1 px-1 font-medium text-muted-foreground text-[10px] min-w-[70px]">Fat (R$)</th>
                              <th className="text-center py-1 px-1 font-medium text-muted-foreground text-[10px] min-w-[55px]">Var %</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {client.products.map(product => (
                          <tr key={product.productName} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-2 px-3 font-medium sticky left-0 z-10 bg-background min-w-[200px] text-xs border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">{product.productName}</td>
                            {visibleMonths.map(m => {
                              const data = product.months[m];
                              const qty = data?.qty ?? 0;
                              const fat = data?.fat ?? 0;
                              const pct = data?.pctQty;
                              return (
                                <React.Fragment key={m}>
                                  <td className="text-center py-2 px-1 border-l border-border/50">
                                    <span className="font-medium">{qty > 0 ? qty.toLocaleString('pt-BR') : '—'}</span>
                                  </td>
                                  <td className="text-center py-2 px-1">
                                    <span className="font-medium text-muted-foreground">{qty > 0 ? formatFaturamento(fat) : '—'}</span>
                                  </td>
                                  <td className="text-center py-2 px-1">
                                    {pct !== null && pct !== undefined ? (
                                      <span className={cn("text-[10px] font-semibold",
                                        pct > 0 && "text-success", pct < 0 && pct > -30 && "text-warning",
                                        pct <= -30 && "text-destructive", pct === 0 && "text-muted-foreground",
                                      )}>{pct > 0 ? '+' : ''}{pct.toFixed(0)}%</span>
                                    ) : <span className="text-muted-foreground/50">—</span>}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="bg-muted/20 font-semibold">
                          <td className="py-2 px-3 sticky left-0 z-10 bg-background text-xs border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Total Cliente</td>
                          {visibleMonths.map((m, mIdx) => {
                            const totalQty = client.products.reduce((sum, p) => sum + (p.months[m]?.qty ?? 0), 0);
                            const totalFat = client.products.reduce((sum, p) => sum + (p.months[m]?.fat ?? 0), 0);
                            let pct: number | null = null;
                            if (mIdx > 0) {
                              const prevM = visibleMonths[mIdx - 1];
                              const prevQty = client.products.reduce((sum, p) => sum + (p.months[prevM]?.qty ?? 0), 0);
                              if (prevQty > 0) pct = ((totalQty - prevQty) / prevQty) * 100;
                            }
                            return (
                              <React.Fragment key={m}>
                                <td className="text-center py-2 px-1 border-l border-border/50"><span className="font-bold text-xs">{totalQty > 0 ? totalQty.toLocaleString('pt-BR') : '—'}</span></td>
                                <td className="text-center py-2 px-1"><span className="font-bold text-xs text-muted-foreground">{totalQty > 0 ? formatFaturamento(totalFat) : '—'}</span></td>
                                <td className="text-center py-2 px-1">
                                  {pct !== null ? (
                                    <span className={cn("text-[10px] font-semibold", pct > 0 && "text-success", pct < 0 && "text-destructive", pct === 0 && "text-muted-foreground")}>
                                      {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                                    </span>
                                  ) : <span className="text-muted-foreground/50">—</span>}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
