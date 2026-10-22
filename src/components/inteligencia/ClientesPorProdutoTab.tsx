import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowUpDown,
  Download,
  Users,
  DollarSign,
  Package,
  Receipt,
  Percent,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  FlaskConical,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { DateRangeFilterGroup } from "@/components/DateRangeFilterGroup";
import { KpiCard } from "@/components/KpiCard";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import {
  SaleRow,
  getProdutosComerciaisValidos,
  getVendedoresWith2026Sales,
  extractProductCode,
  isCommercialProductDescription,
  productKey,
} from "@/hooks/useSalesData";
import {
  useClientesPorProduto,
  type ClienteAgregado,
  type ClientesPorProdutoFilters,
  type AnalysisMode,
} from "@/hooks/useClientesPorProduto";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart,
} from "recharts";
import { ClientePorProdutoDetalheDialog } from "./ClientePorProdutoDetalheDialog";
import { normalizeClientName } from "@/lib/clientNameNormalization";

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const R$2 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

interface Props {
  sales: SaleRow[] | undefined;
  inicio: string;
  fim: string;
}

type SortKey =
  | "cliente"
  | "cidade"
  | "vendedor"
  | "produto"
  | "quantidade"
  | "faturamento"
  | "precoMedio"
  | "numPedidos"
  | "ultimaCompra"
  | "participacaoNoCliente"
  | "participacaoNoProduto";

const PAGE_SIZE = 25;

function depColor(pct: number): "success" | "warning" | "danger" {
  if (pct > 50) return "danger";
  if (pct > 20) return "warning";
  return "success";
}

function depBadge(pct: number) {
  if (pct > 50) return <Badge className="bg-red-500 text-white">{pct.toFixed(1)}%</Badge>;
  if (pct > 20) return <Badge className="bg-amber-500 text-white">{pct.toFixed(1)}%</Badge>;
  return <Badge className="bg-emerald-600 text-white">{pct.toFixed(1)}%</Badge>;
}

export function ClientesPorProdutoTab({ sales, inicio, fim }: Props) {
  // Filtros próprios (persistidos)
  const [produtos, setProdutos] = usePersistentState<string[]>("ic:cpp:produtos", []);
  const [vendedores, setVendedores] = usePersistentState<string[]>("ic:cpp:vendedores", []);
  const [modo, setModo] = usePersistentState<AnalysisMode>("ic:cpp:modo", "any");
  const [usarPeriodoLocal, setUsarPeriodoLocal] = usePersistentState<boolean>("ic:cpp:periodoLocal", false);
  const [localInicio, setLocalInicio] = usePersistentState<string>("ic:cpp:localInicio", inicio);
  const [localFim, setLocalFim] = usePersistentState<string>("ic:cpp:localFim", fim);

  const periodoInicio = usarPeriodoLocal ? localInicio : inicio;
  const periodoFim = usarPeriodoLocal ? localFim : fim;

  const { data: profiles } = useClientProfiles();

  // Opções de produtos com código (para busca por nome OU código)
  const produtosOptions = useMemo(() => {
    if (!sales) return [] as string[];
    // Mapeia productKey -> código mais frequente
    const codeCount = new Map<string, Map<string, number>>();
    for (const s of sales) {
      if (!isCommercialProductDescription(s.descricao)) continue;
      const pk = productKey(s.descricao);
      const code = extractProductCode(String(s.descricao ?? ""));
      let m = codeCount.get(pk);
      if (!m) { m = new Map(); codeCount.set(pk, m); }
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    const result: string[] = [];
    for (const pk of getProdutosComerciaisValidos(sales)) {
      const m = codeCount.get(pk);
      let primary = "";
      let best = -1;
      if (m) for (const [code, n] of m.entries()) if (n > best) { best = n; primary = code; }
      result.push(primary ? `${primary} · ${pk}` : pk);
    }
    return result.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales]);

  // Converte rótulos selecionados ("101 · Pão de Queijo...") para chaves canônicas
  const produtosCanonicos = useMemo(
    () => produtos.map((label) => label.replace(/^\s*\d+\s*·\s*/, "").trim()).filter(Boolean),
    [produtos],
  );

  const vendedoresOptions = useMemo(
    () => (sales ? getVendedoresWith2026Sales(sales) : []),
    [sales],
  );

  const filters: ClientesPorProdutoFilters = useMemo(
    () => ({
      inicio: periodoInicio,
      fim: periodoFim,
      produtos: produtosCanonicos,
      vendedores,
      modo,
    }),
    [periodoInicio, periodoFim, produtosCanonicos.join("|"), vendedores.join("|"), modo],
  );

  const data = useClientesPorProduto(sales, profiles, filters);

  // Tabela
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("faturamento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const linhasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = data.linhas;
    if (q) {
      arr = arr.filter(
        (l) =>
          l.cliente.toLowerCase().includes(q) ||
          l.cidade.toLowerCase().includes(q) ||
          l.vendedor.toLowerCase().includes(q) ||
          l.produto.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR") * dir;
    });
  }, [data.linhas, search, sortKey, sortDir]);

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / PAGE_SIZE));
  const pagina = Math.min(page, totalPaginas - 1);
  const linhasPagina = linhasFiltradas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };

  // Detalhe
  const [detalhe, setDetalhe] = useState<ClienteAgregado | null>(null);
  const detalheProfile = useMemo(() => {
    if (!detalhe || !profiles) return undefined;
    const key = detalhe.clienteKey;
    return profiles.find((p) => normalizeClientName(String(p.nome ?? "")) === key);
  }, [detalhe, profiles]);

  // Simulação
  const [simOpen, setSimOpen] = useState(false);

  // Export
  const exportExcel = () => {
    const linhas = linhasFiltradas.map((l) => ({
      Cliente: l.cliente,
      "Código Cliente": l.codigoCliente,
      Cidade: l.cidade,
      Vendedor: l.vendedor,
      Produto: l.produto,
      "Código Produto": l.codigoProduto,
      Quantidade: l.quantidade,
      Faturamento: l.faturamento,
      "Preço médio": l.precoMedio,
      Pedidos: l.numPedidos,
      "Última compra": l.ultimaCompra,
      "Frequência (dias)": l.frequenciaDias ?? "",
      "% no faturamento do cliente": l.participacaoNoCliente,
      "% no faturamento do produto": l.participacaoNoProduto,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Clientes por Produto");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.vendedoresImpactados.map((v) => ({
          Vendedor: v.vendedor,
          "Clientes afetados": v.clientes,
          Faturamento: v.faturamento,
          Quantidade: v.quantidade,
          "Participação %": v.participacao,
        })),
      ),
      "Vendedores impactados",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Indicador: "Clientes impactados", Valor: data.impacto.clientesImpactados },
        { Indicador: "Dependência > 50%", Valor: data.impacto.dependenciaAlta },
        { Indicador: "Dependência < 5%", Valor: data.impacto.dependenciaBaixa },
        { Indicador: "Faturamento em risco", Valor: data.impacto.faturamentoEmRisco },
        { Indicador: "Quantidade em risco", Valor: data.impacto.quantidadeEmRisco },
      ]),
      "Impacto",
    );
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `clientes_por_produto_${today}.xlsx`);
  };

  const hasFilters = produtosCanonicos.length > 0;
  const COLORS = ["hsl(32, 90%, 50%)", "hsl(142, 60%, 40%)", "hsl(210, 70%, 50%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)", "hsl(38, 92%, 50%)"];

  return (
    <div className="space-y-4">
      {/* ============ FILTROS ============ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Produtos (busca por nome ou código)</Label>
              <SearchableCombobox
                options={produtosOptions}
                value={produtos}
                onValueChange={setProdutos}
                placeholder="Selecione um ou mais produtos"
                searchPlaceholder="Buscar por nome ou código…"
                allLabel="Todos os produtos"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {produtos.length === 0
                  ? "Selecione ao menos um produto para iniciar a análise."
                  : `${produtos.length} produto${produtos.length > 1 ? "s" : ""} selecionado${produtos.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <div>
              <Label className="text-xs">Vendedores</Label>
              <SearchableCombobox
                options={vendedoresOptions}
                value={vendedores}
                onValueChange={setVendedores}
                placeholder="Todos os vendedores"
                allLabel="Todos"
              />
            </div>
            <div>
              <Label className="text-xs">Tipo da análise</Label>
              <Tabs value={modo} onValueChange={(v) => setModo(v as AnalysisMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="any" className="flex-1 text-xs">Qualquer um</TabsTrigger>
                  <TabsTrigger value="all" className="flex-1 text-xs">Todos os produtos</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={usarPeriodoLocal}
                onChange={(e) => setUsarPeriodoLocal(e.target.checked)}
              />
              Usar período independente do filtro global
            </label>
            {usarPeriodoLocal && (
              <DateRangeFilterGroup
                label="Período"
                start={localInicio}
                end={localFim}
                onStartChange={setLocalInicio}
                onEndChange={setLocalFim}
              />
            )}
            {!usarPeriodoLocal && (
              <p className="text-xs text-muted-foreground">
                Usando período global: <span className="font-medium">{inicio} → {fim}</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {!hasFilters ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Selecione ao menos um produto acima para gerar a análise de clientes.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ============ RESUMO EXECUTIVO ============ */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard title="Clientes compradores" value={num(data.resumo.clientesCompradores)} icon={Users} />
            <KpiCard title="Faturamento" value={R$(data.resumo.faturamento)} icon={DollarSign} variant="success" />
            <KpiCard title="Quantidade vendida" value={num(data.resumo.quantidade)} icon={Package} />
            <KpiCard title="Ticket médio" value={R$(data.resumo.ticketMedio)} icon={Receipt} />
            <KpiCard
              title="Participação no fat. total"
              value={`${data.resumo.participacaoNoTotal.toFixed(1)}%`}
              subtitle={`de ${R$(data.resumo.faturamentoTotalEmpresa)}`}
              icon={Percent}
              variant="info"
            />
          </div>

          {/* ============ TABELA ============ */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm">Clientes que compraram os produtos selecionados</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    placeholder="Buscar cliente, cidade, vendedor…"
                    className="h-8 pl-7 w-64 text-xs"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={exportExcel}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Exportar Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { k: "cliente", label: "Cliente" },
                        { k: "cidade", label: "Cidade" },
                        { k: "vendedor", label: "Vendedor" },
                        { k: "produto", label: "Produto" },
                        { k: "quantidade", label: "Qtd", right: true },
                        { k: "faturamento", label: "Faturamento", right: true },
                        { k: "precoMedio", label: "Preço médio", right: true },
                        { k: "numPedidos", label: "Pedidos", right: true },
                        { k: "ultimaCompra", label: "Última", right: true },
                        { k: "participacaoNoCliente", label: "% no cliente", right: true },
                        { k: "participacaoNoProduto", label: "% no produto", right: true },
                      ].map((c) => (
                        <TableHead
                          key={c.k}
                          className={`text-xs sticky top-0 bg-background cursor-pointer select-none ${c.right ? "text-right" : ""}`}
                          onClick={() => setSort(c.k as SortKey)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          </span>
                        </TableHead>
                      ))}
                      <TableHead className="text-xs sticky top-0 bg-background text-right">Dependência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasPagina.map((l, i) => {
                      const cli = data.clientes.find((c) => c.clienteKey === l.clienteKey);
                      return (
                        <TableRow
                          key={`${l.clienteKey}-${l.produto}-${i}`}
                          className="cursor-pointer"
                          onClick={() => cli && setDetalhe(cli)}
                        >
                          <TableCell className="text-xs font-medium whitespace-normal break-words">{l.cliente}</TableCell>
                          <TableCell className="text-xs whitespace-normal">{l.cidade || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-normal">{l.vendedor || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-normal break-words">{l.produto}</TableCell>
                          <TableCell className="text-xs text-right">{num(l.quantidade)}</TableCell>
                          <TableCell className="text-xs text-right font-semibold whitespace-nowrap">{R$(l.faturamento)}</TableCell>
                          <TableCell className="text-xs text-right whitespace-nowrap">{R$2(l.precoMedio)}</TableCell>
                          <TableCell className="text-xs text-right">{l.numPedidos}</TableCell>
                          <TableCell className="text-xs text-right whitespace-nowrap">{l.ultimaCompra || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{l.participacaoNoCliente.toFixed(1)}%</TableCell>
                          <TableCell className="text-xs text-right">{l.participacaoNoProduto.toFixed(1)}%</TableCell>
                          <TableCell className="text-xs text-right">{cli ? depBadge(cli.dependencia) : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                    {linhasPagina.length === 0 && (
                      <TableRow><TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-6">Nenhum cliente encontrado.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between p-3 border-t text-xs">
                <span className="text-muted-foreground">
                  {linhasFiltradas.length} registros · Página {pagina + 1} de {totalPaginas}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPage(pagina - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" disabled={pagina >= totalPaginas - 1} onClick={() => setPage(pagina + 1)}>Próxima</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ============ IMPACTO COMERCIAL ============ */}
          <Card className="border-amber-300/50">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Impacto Comercial
              </CardTitle>
              <Button size="sm" onClick={() => setSimOpen(true)}>
                <FlaskConical className="h-3.5 w-3.5 mr-1" /> Simular retirada
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard title="Clientes impactados" value={num(data.impacto.clientesImpactados)} icon={Users} />
                <KpiCard title="Dependência > 50%" value={num(data.impacto.dependenciaAlta)} icon={TrendingUp} variant="danger" />
                <KpiCard title="Dependência < 5%" value={num(data.impacto.dependenciaBaixa)} icon={TrendingDown} variant="success" />
                <KpiCard title="Faturamento em risco" value={R$(data.impacto.faturamentoEmRisco)} icon={DollarSign} variant="warning" />
                <KpiCard title="Quantidade em risco" value={num(data.impacto.quantidadeEmRisco)} icon={Package} variant="warning" />
              </div>
            </CardContent>
          </Card>

          {/* ============ VENDEDORES IMPACTADOS ============ */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking de vendedores impactados</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Vendedor</TableHead>
                    <TableHead className="text-xs text-right">Clientes</TableHead>
                    <TableHead className="text-xs text-right">Faturamento</TableHead>
                    <TableHead className="text-xs text-right">Quantidade</TableHead>
                    <TableHead className="text-xs text-right">Participação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.vendedoresImpactados.map((v) => (
                    <TableRow key={v.vendedor}>
                      <TableCell className="text-xs">{v.vendedor}</TableCell>
                      <TableCell className="text-xs text-right">{v.clientes}</TableCell>
                      <TableCell className="text-xs text-right font-semibold whitespace-nowrap">{R$(v.faturamento)}</TableCell>
                      <TableCell className="text-xs text-right">{num(v.quantidade)}</TableCell>
                      <TableCell className="text-xs text-right">{v.participacao.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ============ PRODUTOS RELACIONADOS ============ */}
          {data.produtosRelacionados.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Produtos comprados em conjunto</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  Itens mais frequentes na cesta dos clientes que compraram os produtos selecionados — úteis como possíveis substitutos.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Produto</TableHead>
                      <TableHead className="text-xs text-right">Clientes em comum</TableHead>
                      <TableHead className="text-xs text-right">Faturamento</TableHead>
                      <TableHead className="text-xs text-right">Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.produtosRelacionados.map((p) => (
                      <TableRow key={p.produto}>
                        <TableCell className="text-xs whitespace-normal break-words">{p.produto}</TableCell>
                        <TableCell className="text-xs text-right">{p.clientesEmComum}</TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap">{R$(p.faturamento)}</TableCell>
                        <TableCell className="text-xs text-right">{num(p.quantidade)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ============ GRÁFICOS ============ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top clientes por faturamento</CardTitle></CardHeader>
              <CardContent>
                <div style={{ height: Math.max(260, Math.min(data.clientes.length, 15) * 26) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.clientes.slice(0, 15).map((c) => ({ nome: c.cliente, fat: c.faturamentoFiltrado }))}
                      layout="vertical"
                      margin={{ left: 10, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="nome" type="category" width={160} tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + "…" : v} />
                      <Tooltip formatter={(v: number) => R$2(v)} />
                      <Bar dataKey="fat" fill="hsl(32, 90%, 50%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Faturamento por vendedor</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.fatPorVendedor}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="vendedor" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => R$2(v)} />
                      <Bar dataKey="faturamento" fill="hsl(210, 70%, 50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Clientes por faixa de dependência</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.distribuicaoDependencia} dataKey="clientes" nameKey="faixa" outerRadius={110} innerRadius={50} label={(d: any) => `${d.faixa}: ${d.clientes}`}>
                        {data.distribuicaoDependencia.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pareto de clientes compradores</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.pareto}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="cliente" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={80} tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 14) + "…" : v} />
                      <YAxis yAxisId="left" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number, name: string) => name === "acumuladoPct" ? `${v.toFixed(1)}%` : R$2(v)} />
                      <Bar yAxisId="left" dataKey="faturamento" fill="hsl(32, 90%, 50%)" />
                      <Line yAxisId="right" type="monotone" dataKey="acumuladoPct" stroke="hsl(0, 72%, 51%)" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ClientePorProdutoDetalheDialog
        cliente={detalhe}
        profile={detalheProfile}
        open={!!detalhe}
        onOpenChange={(o) => !o && setDetalhe(null)}
      />

      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Simulação: retirada dos produtos selecionados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Análise executiva considerando os filtros atuais ({produtosCanonicos.length} produto
              {produtosCanonicos.length > 1 ? "s" : ""}).
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KpiCard title="Faturamento envolvido" value={R$(data.resumo.faturamento)} icon={DollarSign} variant="success" />
              <KpiCard title="Clientes impactados" value={num(data.impacto.clientesImpactados)} icon={Users} />
              <KpiCard title="Dependência > 50%" value={num(data.impacto.dependenciaAlta)} icon={AlertTriangle} variant="danger" />
              <KpiCard title="Faturamento em risco" value={R$(data.impacto.faturamentoEmRisco)} icon={TrendingDown} variant="warning" />
              <KpiCard title="Quantidade em risco" value={num(data.impacto.quantidadeEmRisco)} icon={Package} variant="warning" />
              <KpiCard title="Participação no fat. total" value={`${data.resumo.participacaoNoTotal.toFixed(1)}%`} icon={Percent} variant="info" />
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-1">Clientes mais dependentes</h4>
              <ul className="text-xs space-y-1">
                {data.clientes.filter((c) => c.dependencia > 50).slice(0, 8).map((c) => (
                  <li key={c.clienteKey} className="flex justify-between border-b py-1">
                    <span className="break-words mr-2">{c.cliente}</span>
                    <span className="whitespace-nowrap">{R$(c.faturamentoFiltrado)} · {c.dependencia.toFixed(1)}%</span>
                  </li>
                ))}
                {data.clientes.filter((c) => c.dependencia > 50).length === 0 && (
                  <li className="text-muted-foreground">Nenhum cliente com dependência alta — risco reduzido.</li>
                )}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-1">Vendedores mais impactados</h4>
              <ul className="text-xs space-y-1">
                {data.vendedoresImpactados.slice(0, 5).map((v) => (
                  <li key={v.vendedor} className="flex justify-between border-b py-1">
                    <span>{v.vendedor}</span>
                    <span>{v.clientes} clientes · {R$(v.faturamento)} ({v.participacao.toFixed(1)}%)</span>
                  </li>
                ))}
              </ul>
            </div>

            {data.produtosRelacionados.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Possíveis produtos substitutos</h4>
                <ul className="text-xs space-y-1">
                  {data.produtosRelacionados.slice(0, 6).map((p) => (
                    <li key={p.produto} className="flex justify-between border-b py-1">
                      <span className="break-words mr-2">{p.produto}</span>
                      <span className="whitespace-nowrap">{p.clientesEmComum} clientes · {R$(p.faturamento)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-muted/50 rounded p-3 text-xs">
              <strong>Resumo automático: </strong>
              {data.impacto.dependenciaAlta > 0
                ? `Atenção: ${data.impacto.dependenciaAlta} cliente${data.impacto.dependenciaAlta > 1 ? "s têm" : " tem"} mais de 50% do faturamento atrelado a esses produtos. Recomenda-se negociação prévia ou substituição planejada.`
                : "Risco controlado: nenhum cliente apresenta dependência crítica."}
              {" "}
              {data.resumo.participacaoNoTotal > 10
                ? `Os produtos representam ${data.resumo.participacaoNoTotal.toFixed(1)}% do faturamento total da empresa — impacto material no resultado.`
                : `Participação de ${data.resumo.participacaoNoTotal.toFixed(1)}% no faturamento total — impacto financeiro limitado.`}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
