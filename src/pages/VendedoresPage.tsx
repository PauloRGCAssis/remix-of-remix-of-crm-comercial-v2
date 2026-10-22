import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterPopover } from "@/components/FilterPopover";
import { DateRangeFilterGroup } from "@/components/DateRangeFilterGroup";
import { useSalesData, filterByDateRange, shortVendedorName, getUniqueVendedores, type SaleRow } from "@/hooks/useSalesData";
import { calculateVariation, formatPeriodLabel, hasCompleteDateRange, hasPartialDateRange } from "@/lib/periodComparison";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorsManagementTab } from "@/components/vendedores/VendorsManagementTab";
import { UsuariosAcessoTab } from "@/components/vendedores/UsuariosAcessoTab";
import { ClassificacaoClientesSettings } from "@/components/vendedores/ClassificacaoClientesSettings";
import { usePersistentState } from "@/hooks/usePersistentState";

type ChartMetric = "kg" | "faturamento";

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const TEAM_VENDOR_NAMES = new Set(["Ti Delso", "Raiane", "Ednei", "Henrique", "João Paulo", "Juliano"]);
const TEAM_VENDOR_LABEL = "Ti Delso, Raiane, Ednei, Henrique, João Paulo e Juliano";

interface SellerRow {
  id: string;
  nome: string;
  clientesAtivos: number;
  clientesSemAlerta: number;
  clientesNovos: number;
  clientesPerdidos: number;
  volumeVendido: number;
  valorVendido: number;
  ticketMedio: number;
}

function getClientVendedorMap(sales: SaleRow[]): Map<string, { vendedor: string; lastPurchase: Date; firstPurchase: Date }> {
  const map = new Map<string, { vendedor: string; lastPurchase: Date; firstPurchase: Date }>();

  sales.forEach((sale) => {
    const vendedor = shortVendedorName(sale.vendedor);
    const saleDate = new Date(sale.data);
    const existing = map.get(sale.cliente);

    if (!existing) {
      map.set(sale.cliente, { vendedor, lastPurchase: saleDate, firstPurchase: saleDate });
      return;
    }

    if (saleDate > existing.lastPurchase) existing.lastPurchase = saleDate;
    if (saleDate < existing.firstPurchase) existing.firstPurchase = saleDate;
  });

  return map;
}

function buildSellerRows(allSales: SaleRow[], periodoInicio: string, periodoFim: string): SellerRow[] {
  if (allSales.length === 0) return [];

  const endDate = new Date(`${periodoFim}T23:59:59`);
  const startDate = new Date(`${periodoInicio}T00:00:00`);
  const salesInPeriod = filterByDateRange(allSales, periodoInicio, periodoFim);
  const allClientMap = getClientVendedorMap(allSales);

  const vendedorTotals = new Map<string, { volume: number; revenue: number }>();
  salesInPeriod.forEach((sale) => {
    const vendedor = shortVendedorName(sale.vendedor);
    const existing = vendedorTotals.get(vendedor) ?? { volume: 0, revenue: 0 };
    existing.volume += Number(sale.quantidade);
    existing.revenue += Number(sale.preco_total);
    vendedorTotals.set(vendedor, existing);
  });

  const sellerMap = new Map<string, {
    clientesAtivos: Set<string>;
    clientes2MSemCompra: Set<string>;
    clientesNovos: Set<string>;
    clientesPerdidos: Set<string>;
    volumeTotal: number;
    faturamentoTotal: number;
  }>();

  vendedorTotals.forEach(({ volume, revenue }, vendedor) => {
    sellerMap.set(vendedor, {
      clientesAtivos: new Set(),
      clientes2MSemCompra: new Set(),
      clientesNovos: new Set(),
      clientesPerdidos: new Set(),
      volumeTotal: volume,
      faturamentoTotal: revenue,
    });
  });

  allClientMap.forEach(({ vendedor, lastPurchase, firstPurchase }, cliente) => {
    if (!sellerMap.has(vendedor)) {
      sellerMap.set(vendedor, {
        clientesAtivos: new Set(),
        clientes2MSemCompra: new Set(),
        clientesNovos: new Set(),
        clientesPerdidos: new Set(),
        volumeTotal: 0,
        faturamentoTotal: 0,
      });
    }

    const seller = sellerMap.get(vendedor)!;
    const daysSinceLastPurchase = Math.floor((endDate.getTime() - lastPurchase.getTime()) / DAY_IN_MS);

    if (daysSinceLastPurchase <= 30) seller.clientesAtivos.add(cliente);
    if (daysSinceLastPurchase >= 31 && daysSinceLastPurchase < 90) seller.clientes2MSemCompra.add(cliente);
    if (daysSinceLastPurchase >= 90) seller.clientesPerdidos.add(cliente);
    if (firstPurchase >= startDate && firstPurchase <= endDate) seller.clientesNovos.add(cliente);
  });

  return Array.from(sellerMap.entries())
    .map(([nome, data]) => ({
      id: nome,
      nome,
      clientesAtivos: data.clientesAtivos.size,
      clientesSemAlerta: data.clientes2MSemCompra.size,
      clientesNovos: data.clientesNovos.size,
      clientesPerdidos: data.clientesPerdidos.size,
      volumeVendido: data.volumeTotal,
      valorVendido: data.faturamentoTotal,
      ticketMedio: data.clientesAtivos.size > 0 ? data.faturamentoTotal / data.clientesAtivos.size : 0,
    }))
    .filter((seller) => seller.volumeVendido > 0);
}

export default function VendedoresPage() {
  const { data: allSales, isLoading } = useSalesData();
  const [periodoInicio, setPeriodoInicio] = usePersistentState("vendedores:periodoInicio", "2026-02-01");
  const [periodoFim, setPeriodoFim] = usePersistentState("vendedores:periodoFim", "2026-02-28");
  const [periodoComparativoInicio, setPeriodoComparativoInicio] = usePersistentState("vendedores:periodoComparativoInicio", "");
  const [periodoComparativoFim, setPeriodoComparativoFim] = usePersistentState("vendedores:periodoComparativoFim", "");
  const [chartMetric, setChartMetric] = usePersistentState<ChartMetric>("vendedores:chartMetric", "kg");
  const [selectedVendedores, setSelectedVendedores] = usePersistentState<string[]>("vendedores:selectedVendedores", []);
  const [activeTab, setActiveTab] = usePersistentState("vendedores:activeTab", "desempenho");

  const vendedores = useMemo(() => (allSales ? getUniqueVendedores(allSales) : []), [allSales]);
  const hasComparison = hasCompleteDateRange(periodoComparativoInicio, periodoComparativoFim);
  const hasPartialComparison = hasPartialDateRange(periodoComparativoInicio, periodoComparativoFim);

  const sellersData = useMemo(() => (allSales ? buildSellerRows(allSales, periodoInicio, periodoFim) : []), [allSales, periodoFim, periodoInicio]);
  const comparisonData = useMemo(
    () => (allSales && hasComparison ? buildSellerRows(allSales, periodoComparativoInicio, periodoComparativoFim) : []),
    [allSales, hasComparison, periodoComparativoFim, periodoComparativoInicio],
  );

  const filteredSellers = useMemo(() => {
    const allowed = new Set(vendedores);
    const currentMap = new Map(sellersData.map((seller) => [seller.nome, seller]));
    const comparisonMap = new Map(comparisonData.map((seller) => [seller.nome, seller]));
    const sellerNames = hasComparison
      ? Array.from(new Set([...currentMap.keys(), ...comparisonMap.keys()]))
      : Array.from(currentMap.keys());

    return sellerNames
      .filter((name) => allowed.has(name))
      .map((name) => {
        const current = currentMap.get(name) ?? {
          id: name,
          nome: name,
          clientesAtivos: 0,
          clientesSemAlerta: 0,
          clientesNovos: 0,
          clientesPerdidos: 0,
          volumeVendido: 0,
          valorVendido: 0,
          ticketMedio: 0,
        };
        const comparison = comparisonMap.get(name) ?? {
          id: name,
          nome: name,
          clientesAtivos: 0,
          clientesSemAlerta: 0,
          clientesNovos: 0,
          clientesPerdidos: 0,
          volumeVendido: 0,
          valorVendido: 0,
          ticketMedio: 0,
        };

        return {
          ...current,
          volumeComparativo: comparison.volumeVendido,
          valorComparativo: comparison.valorVendido,
          variacaoVolume: hasComparison ? calculateVariation(current.volumeVendido, comparison.volumeVendido) : null,
          variacaoFaturamento: hasComparison ? calculateVariation(current.valorVendido, comparison.valorVendido) : null,
        };
      })
      .filter((seller) => selectedVendedores.length === 0 || selectedVendedores.includes(seller.nome))
      .filter((seller) => (hasComparison ? seller.volumeVendido > 0 || seller.volumeComparativo > 0 : seller.volumeVendido > 0))
      .sort((a, b) => b.volumeVendido - a.volumeVendido);
  }, [comparisonData, hasComparison, selectedVendedores, sellersData, vendedores]);

  const chartData = useMemo(
    () => filteredSellers.map((seller) => ({
      nome: seller.nome,
      volumeAtual: seller.volumeVendido,
      volumeComparativo: seller.volumeComparativo,
      valorAtual: seller.valorVendido / 1000,
      valorComparativo: seller.valorComparativo / 1000,
    })),
    [filteredSellers],
  );

  const chartHeight = Math.max(300, chartData.length * (hasComparison ? 52 : 40));

  const summary = useMemo(() => {
    return filteredSellers
      .filter((seller) => TEAM_VENDOR_NAMES.has(seller.nome))
      .reduce(
        (acc, seller) => {
          acc.volumeAtual += seller.volumeVendido;
          acc.volumeComparativo += seller.volumeComparativo;
          acc.faturamentoAtual += seller.valorVendido;
          acc.faturamentoComparativo += seller.valorComparativo;
          return acc;
        },
        { volumeAtual: 0, volumeComparativo: 0, faturamentoAtual: 0, faturamentoComparativo: 0 },
      );
  }, [filteredSellers]);

  const volumeVariation = hasComparison ? calculateVariation(summary.volumeAtual, summary.volumeComparativo) : null;
  const revenueVariation = hasComparison ? calculateVariation(summary.faturamentoAtual, summary.faturamentoComparativo) : null;

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
        <div className="py-20 text-center">
          <h2 className="mb-2 font-heading text-xl font-bold">Nenhum dado de vendas encontrado</h2>
          <p className="text-muted-foreground">Importe uma planilha na aba "Importar" para visualizar os dados.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">Vendedores</h1>
          <p className="mt-1 text-sm text-muted-foreground">Análise de desempenho e gestão de vendedores</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
            <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
            <TabsTrigger value="usuarios">Usuários e acesso</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="configuracoes" className="mt-4">
            <ClassificacaoClientesSettings />
          </TabsContent>

          <TabsContent value="usuarios" className="mt-4">
            <UsuariosAcessoTab />
          </TabsContent>

          <TabsContent value="cadastro" className="mt-4">
            <VendorsManagementTab />
          </TabsContent>


          <TabsContent value="desempenho" className="space-y-6 mt-4">

        <Card className="shadow-card">
          <CardContent className="space-y-4 p-4">
            <DateRangeFilterGroup
              label="Período principal"
              start={periodoInicio}
              end={periodoFim}
              onStartChange={setPeriodoInicio}
              onEndChange={setPeriodoFim}
            />

            <DateRangeFilterGroup
              label="Período comparativo"
              start={periodoComparativoInicio}
              end={periodoComparativoFim}
              onStartChange={setPeriodoComparativoInicio}
              onEndChange={setPeriodoComparativoFim}
              optional
              helperText="Se ficar em branco, a tela mostra somente o período principal."
              onClear={() => {
                setPeriodoComparativoInicio("");
                setPeriodoComparativoFim("");
              }}
            />

            {hasPartialComparison && (
              <p className="text-xs text-warning">Preencha as duas datas do comparativo para habilitar a comparação.</p>
            )}

            <div className="flex flex-wrap gap-3">
              <FilterPopover label="Vendedor" options={vendedores} selected={selectedVendedores} onApply={setSelectedVendedores} />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Volume da equipe</p>
              <p className="mt-2 text-3xl font-bold text-foreground">{summary.volumeAtual.toLocaleString("pt-BR")} kg</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatPeriodLabel(periodoInicio, periodoFim)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Considera: {TEAM_VENDOR_LABEL}</p>
              {hasComparison && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Comp.: {summary.volumeComparativo.toLocaleString("pt-BR")} kg • {formatPeriodLabel(periodoComparativoInicio, periodoComparativoFim)}
                </p>
              )}
              {volumeVariation !== null && (
                <p className={cn("mt-2 inline-flex items-center gap-1 text-sm font-semibold", volumeVariation >= 0 ? "text-success" : "text-destructive")}>
                  {volumeVariation >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {volumeVariation >= 0 ? "+" : ""}
                  {volumeVariation.toFixed(1)}% vs comparativo
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Faturamento da equipe</p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                R$ {summary.faturamentoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatPeriodLabel(periodoInicio, periodoFim)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Considera: {TEAM_VENDOR_LABEL}</p>
              {hasComparison && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Comp.: R$ {summary.faturamentoComparativo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} • {formatPeriodLabel(periodoComparativoInicio, periodoComparativoFim)}
                </p>
              )}
              {revenueVariation !== null && (
                <p className={cn("mt-2 inline-flex items-center gap-1 text-sm font-semibold", revenueVariation >= 0 ? "text-success" : "text-destructive")}>
                  {revenueVariation >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {revenueVariation >= 0 ? "+" : ""}
                  {revenueVariation.toFixed(1)}% vs comparativo
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-heading">
                  {chartMetric === "kg" ? "Volume Vendido por Vendedor (kg)" : "Faturamento por Vendedor (R$)"}
                </CardTitle>
                {hasComparison && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Principal: {formatPeriodLabel(periodoInicio, periodoFim)} • Comparativo: {formatPeriodLabel(periodoComparativoInicio, periodoComparativoFim)}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant={chartMetric === "kg" ? "default" : "outline"} size="sm" className="h-7 px-3 text-xs" onClick={() => setChartMetric("kg")}>Volume (kg)</Button>
                <Button variant={chartMetric === "faturamento" ? "default" : "outline"} size="sm" className="h-7 px-3 text-xs" onClick={() => setChartMetric("faturamento")}>Faturamento (R$)</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 12 }} width={110} stroke="hsl(var(--muted-foreground))" />
                  {hasComparison && <Legend wrapperStyle={{ fontSize: "12px" }} />}
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      chartMetric === "kg"
                        ? `${value.toLocaleString("pt-BR")} kg`
                        : `R$ ${(value * 1000).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`,
                      name,
                    ]}
                  />
                  <Bar dataKey={chartMetric === "kg" ? "volumeAtual" : "valorAtual"} name="Período principal" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  {hasComparison && (
                    <Bar dataKey={chartMetric === "kg" ? "volumeComparativo" : "valorComparativo"} name="Período comparativo" fill="hsl(var(--info))" radius={[0, 4, 4, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-card">
          <CardHeader>
            <CardTitle className="text-base font-heading">Resumo por Vendedor</CardTitle>
            {hasComparison && (
              <p className="text-xs text-muted-foreground">
                As contagens de clientes usam o período principal; as colunas comparativas mostram volume e faturamento do período comparativo.
              </p>
            )}
          </CardHeader>
          <div className="overflow-auto max-h-[70vh] relative">
            <Table className={cn(hasComparison ? "min-w-[1500px]" : "min-w-[1120px]")}>
              <TableHeader>
                <TableRow className="bg-background">
                  <TableHead className="sticky top-0 left-0 z-30 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Vendedor</TableHead>
                  <TableHead className="text-right sticky top-0 z-20 bg-background">Clientes Ativos</TableHead>
                  <TableHead className="text-right sticky top-0 z-20 bg-background">2M sem compra</TableHead>
                  <TableHead className="text-right sticky top-0 z-20 bg-background">Clientes Novos</TableHead>
                  <TableHead className="text-right sticky top-0 z-20 bg-background">Clientes Perdidos</TableHead>
                  <TableHead className="text-right sticky top-0 z-20 bg-background">Volume atual (kg)</TableHead>
                  {hasComparison && <TableHead className="text-right sticky top-0 z-20 bg-background">Volume comp. (kg)</TableHead>}
                  {hasComparison && <TableHead className="text-right sticky top-0 z-20 bg-background">Var. volume</TableHead>}
                  <TableHead className="text-right sticky top-0 z-20 bg-background">Faturamento atual</TableHead>
                  {hasComparison && <TableHead className="text-right sticky top-0 z-20 bg-background">Fat. comp.</TableHead>}
                  {hasComparison && <TableHead className="text-right sticky top-0 z-20 bg-background">Var. fat.</TableHead>}
                  <TableHead className="text-right sticky top-0 z-20 bg-background">Ticket Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={hasComparison ? 12 : 8} className="py-8 text-center text-muted-foreground">
                      Nenhum vendedor com vendas neste período
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSellers.map((seller) => (
                    <TableRow key={seller.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium sticky left-0 z-10 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">{seller.nome}</TableCell>
                      <TableCell className="text-right">{seller.clientesAtivos}</TableCell>
                      <TableCell className="text-right text-warning font-semibold">{seller.clientesSemAlerta}</TableCell>
                      <TableCell className="text-right text-info font-semibold">{seller.clientesNovos}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{seller.clientesPerdidos}</TableCell>
                      <TableCell className="text-right">{seller.volumeVendido.toLocaleString("pt-BR")}</TableCell>
                      {hasComparison && <TableCell className="text-right">{seller.volumeComparativo.toLocaleString("pt-BR")}</TableCell>}
                      {hasComparison && (
                        <TableCell className="text-right">
                          {seller.variacaoVolume !== null ? (
                            <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", seller.variacaoVolume >= 0 ? "text-success" : "text-destructive")}>
                              {seller.variacaoVolume >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                              {seller.variacaoVolume >= 0 ? "+" : ""}
                              {seller.variacaoVolume.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right">R$ {seller.valorVendido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      {hasComparison && (
                        <TableCell className="text-right">R$ {seller.valorComparativo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      )}
                      {hasComparison && (
                        <TableCell className="text-right">
                          {seller.variacaoFaturamento !== null ? (
                            <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", seller.variacaoFaturamento >= 0 ? "text-success" : "text-destructive")}>
                              {seller.variacaoFaturamento >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                              {seller.variacaoFaturamento >= 0 ? "+" : ""}
                              {seller.variacaoFaturamento.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium">R$ {seller.ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
