import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Users, UserPlus, Repeat, Sparkles } from "lucide-react";
import type { SaleRow } from "@/hooks/useSalesData";
import { shortVendedorName, getVendedoresWith2026Sales, cleanProductName } from "@/hooks/useSalesData";
import { clientKey, classifyClientsForPeriod } from "@/lib/clientClassification";
import { useAppSetting, REATIVACAO_DIAS_KEY, REATIVACAO_DIAS_DEFAULT } from "@/hooks/useAppSetting";

type PeriodPreset = "7d" | "15d" | "30d" | "thismonth" | "custom";

interface Props {
  sales: SaleRow[];
  variant: "clientes" | "vendedores";
}

interface CompraDetalhe {
  data: Date;
  produtos: { nome: string; quantidade: number; valor: number }[];
  valor: number;
  vendedor: string;
}

interface ClienteNovoRow {
  chave: string;
  cliente: string;
  vendedorResponsavel: string;
  dataEntrada: Date;
  primeiraCompraPeriodo: Date;
  produtosPrimeira: string;
  quantidadePrimeira: number;
  valorPrimeira: number;
  valorTotalPeriodo: number;
  qtdRecompras: number;
  compras: CompraDetalhe[];
}

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function computePeriod(preset: PeriodPreset, customStart: string, customEnd: string) {
  const today = new Date();
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  if (preset === "custom") {
    return { inicio: customStart, fim: customEnd };
  }
  if (preset === "thismonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { inicio: toISO(start), fim: toISO(today) };
  }
  const end = new Date(today);
  const start = new Date(today);
  if (preset === "7d") start.setDate(start.getDate() - 6);
  else if (preset === "15d") start.setDate(start.getDate() - 14);
  else if (preset === "30d") start.setDate(start.getDate() - 29);
  return { inicio: toISO(start), fim: toISO(end) };
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
}

export function NovosClientesAnalysis({ sales, variant }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>("30d");
  const initialCustom = useMemo(() => computePeriod("30d", "", ""), []);
  const [customStart, setCustomStart] = useState<string>(initialCustom.inicio);
  const [customEnd, setCustomEnd] = useState<string>(initialCustom.fim);
  const [vendedor, setVendedor] = useState<string>("__ALL__");
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>("__ALL__");
  const { value: reativacaoDias } = useAppSetting<number>(
    REATIVACAO_DIAS_KEY,
    REATIVACAO_DIAS_DEFAULT,
  );

  const { inicio, fim } = useMemo(
    () => computePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const vendedoresList = useMemo(() => getVendedoresWith2026Sales(sales), [sales]);

  const rows: ClienteNovoRow[] = useMemo(() => {
    if (!sales?.length || !inicio || !fim) return [];
    const startPeriod = parseISO(inicio);
    const endPeriod = parseISO(fim);
    endPeriod.setUTCHours(23, 59, 59, 999);

    // Filtro de vendedor para o UNIVERSO ELEGÍVEL (apenas quem foi vendido por ele no período)
    const vendorFilter = vendedor;

    // Universo elegível: vendas do período (aplicando filtro de vendedor)
    const noPeriodoFiltradas = sales.filter((s) => {
      const d = new Date(s.data);
      if (d < startPeriod || d > endPeriod) return false;
      if (vendorFilter !== "__ALL__" && shortVendedorName(s.vendedor) !== vendorFilter)
        return false;
      return true;
    });

    // ✅ FONTE ÚNICA: usa a mesma classificação do quadro-resumo/DeepVendedorAnalysis
    const { novos } = classifyClientsForPeriod({
      todasAsVendas: sales,
      vendasNoPeriodoAtualFiltradas: noPeriodoFiltradas,
      inicio,
      fim,
      reativacaoDiasSemCompra: reativacaoDias,
    });

    // Detalhes de compras por cliente (a partir do período filtrado)
    const noPeriodoPorChave = new Map<string, SaleRow[]>();
    for (const s of noPeriodoFiltradas) {
      const k = clientKey(s.cliente);
      if (!k) continue;
      const arr = noPeriodoPorChave.get(k) ?? [];
      arr.push(s);
      noPeriodoPorChave.set(k, arr);
    }

    const result: ClienteNovoRow[] = [];
    for (const novo of novos) {
      const list = (noPeriodoPorChave.get(novo.chave) ?? []).sort(
        (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
      );
      if (list.length === 0) continue;

      const pedidoMap = new Map<number, SaleRow[]>();
      for (const s of list) {
        const arr = pedidoMap.get(s.codigo_venda) ?? [];
        arr.push(s);
        pedidoMap.set(s.codigo_venda, arr);
      }
      const compras: CompraDetalhe[] = [...pedidoMap.values()]
        .map((items) => {
          const first = items[0];
          const produtos = items.map((it) => ({
            nome: cleanProductName(it.descricao),
            quantidade: Number(it.quantidade),
            valor: Number(it.preco_total),
          }));
          return {
            data: new Date(first.data),
            valor: items.reduce((s, it) => s + Number(it.preco_total), 0),
            vendedor: shortVendedorName(first.vendedor),
            produtos,
          };
        })
        .sort((a, b) => a.data.getTime() - b.data.getTime());

      const primeiraCompra = compras[0];
      const primeiraNoPeriodo = new Date(list[0].data);

      result.push({
        chave: novo.chave,
        cliente: novo.cliente,
        vendedorResponsavel: primeiraCompra.vendedor,
        dataEntrada: primeiraNoPeriodo,
        primeiraCompraPeriodo: primeiraNoPeriodo,
        produtosPrimeira: primeiraCompra.produtos.map((p) => p.nome).join(", "),
        quantidadePrimeira: primeiraCompra.produtos.reduce((s, p) => s + p.quantidade, 0),
        valorPrimeira: primeiraCompra.valor,
        valorTotalPeriodo: compras.reduce((s, c) => s + c.valor, 0),
        qtdRecompras: compras.length - 1,
        compras,
      });
    }

    result.sort((a, b) => b.valorTotalPeriodo - a.valorTotalPeriodo);
    return result;
  }, [sales, inicio, fim, vendedor, reativacaoDias]);


  const totalClientes = rows.length;
  const totalRecompraram = rows.filter((r) => r.qtdRecompras > 0).length;
  const totalValor = rows.reduce((s, r) => s + r.valorTotalPeriodo, 0);

  // Vendedores group para variante 'vendedores'
  const porVendedor = useMemo(() => {
    const map = new Map<string, ClienteNovoRow[]>();
    for (const r of rows) {
      const arr = map.get(r.vendedorResponsavel) ?? [];
      arr.push(r);
      map.set(r.vendedorResponsavel, arr);
    }
    return [...map.entries()]
      .map(([nome, clientes]) => ({
        nome,
        clientes,
        totalClientes: clientes.length,
        totalRecompraram: clientes.filter((c) => c.qtdRecompras > 0).length,
        totalValor: clientes.reduce((s, c) => s + c.valorTotalPeriodo, 0),
      }))
      .sort((a, b) => b.totalClientes - a.totalClientes);
  }, [rows]);

  const vendedorAtivo =
    variant === "vendedores" && vendedorSelecionado !== "__ALL__"
      ? porVendedor.find((v) => v.nome === vendedorSelecionado)
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Clientes Novos
          <Badge variant="outline" className="text-[10px]">
            {variant === "clientes" ? "por cliente" : "por vendedor"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cliente novo = <b>primeira compra na história completa da base</b>.
          Se já comprou antes em qualquer época, é reativado (≥ {reativacaoDias} dias sem comprar) ou recorrente.
        </p>

      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3 border rounded-md p-3 bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Última semana</SelectItem>
                <SelectItem value="15d">Últimos 15 dias</SelectItem>
                <SelectItem value="30d">Último mês</SelectItem>
                <SelectItem value="thismonth">Este mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 w-40 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 w-40 text-xs"
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Vendedor</Label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">Todos</SelectItem>
                {vendedoresList.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-[11px] text-muted-foreground ml-auto">
            {fmtDate(parseISO(inicio))} → {fmtDate(parseISO(fim))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              <UserPlus className="h-3 w-3" /> Novos clientes
            </div>
            <div className="text-lg font-bold mt-1">{totalClientes}</div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              <Repeat className="h-3 w-3" /> Recompraram
            </div>
            <div className="text-lg font-bold mt-1">
              {totalRecompraram}
              <span className="text-xs text-muted-foreground font-normal ml-1">
                {totalClientes > 0
                  ? `(${Math.round((totalRecompraram / totalClientes) * 100)}%)`
                  : ""}
              </span>
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-background">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Faturamento novos
            </div>
            <div className="text-lg font-bold mt-1">{R$(totalValor)}</div>
          </div>
        </div>

        {/* CONTEÚDO — variante Clientes */}
        {variant === "clientes" && (
          <ClientesTable rows={rows} />
        )}

        {/* CONTEÚDO — variante Vendedores */}
        {variant === "vendedores" && (
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Detalhar vendedor</Label>
                <Select value={vendedorSelecionado} onValueChange={setVendedorSelecionado}>
                  <SelectTrigger className="h-8 w-[220px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Todos (resumo)</SelectItem>
                    {porVendedor.filter((v) => typeof v.nome === "string" && v.nome.trim() !== "").map((v) => (
                      <SelectItem key={v.nome} value={v.nome}>
                        {v.nome} ({v.totalClientes})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {vendedorAtivo ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <b>{vendedorAtivo.nome}</b> teve{" "}
                  <b>{vendedorAtivo.totalClientes}</b> clientes novos no período —{" "}
                  {vendedorAtivo.totalRecompraram} recompraram —{" "}
                  {R$(vendedorAtivo.totalValor)} em faturamento.
                </div>
                <ClientesTable rows={vendedorAtivo.clientes} />
              </div>
            ) : (
              <div className="overflow-auto max-h-[55vh] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Vendedor</TableHead>
                      <TableHead className="text-xs text-right">Clientes novos</TableHead>
                      <TableHead className="text-xs text-right">Recompraram</TableHead>
                      <TableHead className="text-xs text-right">Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porVendedor.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">
                          Nenhum cliente novo neste período.
                        </TableCell>
                      </TableRow>
                    )}
                    {porVendedor.map((v) => (
                      <TableRow
                        key={v.nome}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setVendedorSelecionado(v.nome)}
                      >
                        <TableCell className="text-xs font-medium">{v.nome}</TableCell>
                        <TableCell className="text-xs text-right">{v.totalClientes}</TableCell>
                        <TableCell className="text-xs text-right">{v.totalRecompraram}</TableCell>
                        <TableCell className="text-xs text-right">{R$(v.totalValor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientesTable({ rows }: { rows: ClienteNovoRow[] }) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpenMap((m) => ({ ...m, [k]: !m[k] }));

  return (
    <div className="overflow-auto max-h-[60vh] border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-6"></TableHead>
            <TableHead className="text-xs">Cliente</TableHead>
            <TableHead className="text-xs">Vendedor</TableHead>
            <TableHead className="text-xs">Entrada</TableHead>
            <TableHead className="text-xs">1ª compra</TableHead>
            <TableHead className="text-xs">Produtos (1ª)</TableHead>
            <TableHead className="text-xs text-right">Qtd (1ª)</TableHead>
            <TableHead className="text-xs text-right">Valor 1ª</TableHead>
            <TableHead className="text-xs text-right">Total período</TableHead>
            <TableHead className="text-xs text-center">Recompra?</TableHead>
            <TableHead className="text-xs text-right">Nº recompras</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-6 text-xs">
                Nenhum cliente novo neste período.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const open = !!openMap[r.chave];
            return (
              <Collapsible key={r.chave} asChild open={open} onOpenChange={() => toggle(r.chave)}>
                <>
                  <TableRow className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="p-1">
                      <CollapsibleTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-6 w-6">
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{r.cliente}</TableCell>
                    <TableCell className="text-xs">{r.vendedorResponsavel}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.dataEntrada)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.primeiraCompraPeriodo)}</TableCell>
                    <TableCell
                      className="text-xs max-w-[240px] truncate"
                      title={r.produtosPrimeira}
                    >
                      {r.produtosPrimeira}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {r.quantidadePrimeira.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs text-right">{R$(r.valorPrimeira)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">
                      {R$(r.valorTotalPeriodo)}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      {r.qtdRecompras > 0 ? (
                        <Badge className="text-[10px] bg-green-600">SIM</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          NÃO
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right">{r.qtdRecompras}</TableCell>
                  </TableRow>
                  <CollapsibleContent asChild>
                    <TableRow>
                      <TableCell colSpan={11} className="bg-muted/30 p-3">
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold">
                            Histórico de compras no período — total acumulado:{" "}
                            {R$(r.valorTotalPeriodo)}
                          </div>
                          <div className="overflow-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px]">Data</TableHead>
                                  <TableHead className="text-[10px]">Produtos</TableHead>
                                  <TableHead className="text-[10px] text-right">Valor</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {r.compras.map((c, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-[11px] whitespace-nowrap">
                                      {fmtDate(c.data)}
                                      {i === 0 ? (
                                        <Badge className="ml-2 text-[9px]" variant="outline">
                                          1ª
                                        </Badge>
                                      ) : (
                                        <Badge className="ml-2 text-[9px] bg-green-600">
                                          Recompra {i}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-[11px]">
                                      {c.produtos
                                        .map(
                                          (p) =>
                                            `${p.nome} (${p.quantidade.toLocaleString("pt-BR")})`,
                                        )
                                        .join(", ")}
                                    </TableCell>
                                    <TableCell className="text-[11px] text-right">
                                      {R$(c.valor)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
