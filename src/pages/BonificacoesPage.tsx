import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { useSalesData } from "@/hooks/useSalesData";
import { DateRangeFilterGroup } from "@/components/DateRangeFilterGroup";
import { MultiSelectFiltro } from "@/components/inteligencia/MultiSelectFiltro";
import {
  useBonificacaoCadastro,
  useBonificacaoCategorias,
  useBonificacaoMutations,
  useBonificacaoRows,
  useBonificacaoVinculos,

} from "@/hooks/useBonificacoes";
import { STATUS_META, isBonificacaoPreco, normKey, ultimosMeses } from "@/lib/bonificacaoLogic";
import { montarLinhasClientes, type LinhaClienteBonificacao } from "@/lib/bonificacaoCruzamento";
import { BonificacaoFormDialog } from "@/components/bonificacoes/BonificacaoFormDialog";
import { ConferenciaBonificacaoDialog } from "@/components/bonificacoes/ConferenciaBonificacaoDialog";
import { ImportarBonificacoesDialog } from "@/components/bonificacoes/ImportarBonificacoesDialog";
import { NegociacaoClienteDialog } from "@/components/bonificacoes/NegociacaoClienteDialog";
import { PedidosClienteDialog } from "@/components/bonificacoes/PedidosClienteDialog";
import {
  DetalheBonificacaoDialog,
  type DetalheBonificacao,
  type DetalheTipo,
} from "@/components/bonificacoes/DetalheBonificacaoDialog";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kgFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const MESES_HISTORICO = 6;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataBR = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

export default function BonificacoesPage() {
  const { data: sales = [], isLoading: loadingSales } = useSalesData();
  const { data: cadastro = [], isLoading: loadingCadastro } = useBonificacaoCadastro();
  const { data: bonifRows = [], isLoading: loadingRows } = useBonificacaoRows();
  const { data: categoriasBase = [] } = useBonificacaoCategorias();
  const { excluirCliente, invalidate } = useBonificacaoMutations();
  const { data: vinculos } = useBonificacaoVinculos();


  const hoje = new Date();
  const [busca, setBusca] = useState("");
  const [vendedor, setVendedor] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [pctFiltro, setPctFiltro] = useState("todas");
  const [categoriasSel, setCategoriasSel] = useState<string[] | null>(null);
  const [inicio, setInicio] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [fim, setFim] = useState(iso(hoje));
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<LinhaClienteBonificacao | null>(null);
  const [conferencia, setConferencia] = useState<LinhaClienteBonificacao | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [excluir, setExcluir] = useState<LinhaClienteBonificacao | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheBonificacao | null>(null);
  const [pedidosDe, setPedidosDe] = useState<LinhaClienteBonificacao | null>(null);


  const periodoLabel = `${dataBR(inicio)} a ${dataBR(fim)}`;
  const mesReferencia = (fim || iso(hoje)).slice(0, 7);
  const janela = useMemo(() => ultimosMeses(mesReferencia, MESES_HISTORICO), [mesReferencia]);

  // Padrão: bonificação de PREÇO (finalidade principal desta tela).
  const categoriasPadrao = useMemo(
    () => categoriasBase.filter((c) => isBonificacaoPreco(c)),
    [categoriasBase],
  );
  const categorias = categoriasSel ?? categoriasPadrao;

  const linhas = useMemo(
    () =>
      montarLinhasClientes({
        cadastro,
        vendas: sales as any,
        bonificacoes: bonifRows,
        categorias,
        inicio,
        fim,
        janela,
        vinculos,
      }),
    [cadastro, sales, bonifRows, categorias, inicio, fim, janela, vinculos],

  );

  const vendedores = useMemo(
    () => [...new Set(linhas.map((l) => l.vendedor).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas],
  );

  const pctsDisponiveis = useMemo(
    () => [...new Set([10, 20, 30, ...linhas.map((l) => l.pct)])].filter((p) => p > 0).sort((a, b) => a - b),
    [linhas],
  );

  const filtradas = useMemo(() => {
    const termo = normKey(busca);
    return linhas.filter((l) => {
      if (vendedor !== "todos" && (l.vendedor ?? "") !== vendedor) return false;
      if (statusFiltro !== "todos" && l.status !== statusFiltro) return false;
      if (pctFiltro !== "todas" && Math.abs(l.pct - Number(pctFiltro)) > 0.01) return false;
      if (termo && !normKey(`${l.cliente} ${l.produtos.join(" ")} ${l.vendedor ?? ""}`).includes(termo)) return false;
      return true;
    });
  }, [linhas, vendedor, statusFiltro, pctFiltro, busca]);

  const kpis = useMemo(() => {
    const acc = { clientes: 0, comprado: 0, faturamento: 0, gerada: 0, entregue: 0, saldo: 0, divergentes: 0 };
    for (const l of filtradas) {
      acc.clientes += 1;
      acc.comprado += l.volumeComprado;
      acc.faturamento += l.faturamento;
      acc.gerada += l.bonificacaoGerada;
      acc.entregue += l.bonificacaoEntregue;
      acc.saldo += l.saldoAEntregar;
      if (l.status === "abaixo" || l.status === "acima" || l.status === "sem_bonificacao") acc.divergentes += 1;
    }
    return acc;
  }, [filtradas]);

  const loading = loadingSales || loadingCadastro || loadingRows;

  function abrirDetalhe(linha: LinhaClienteBonificacao, tipo: DetalheTipo) {
    setDetalhe({ tipo, linha, periodoLabel });
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await excluirCliente.mutateAsync(excluir.itens.map((i) => i.id));
      toast.success("Controle de bonificação removido.");
    } catch (e: any) {
      toast.error(`Não foi possível remover: ${e?.message ?? e}`);
    } finally {
      setExcluir(null);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold">Controle de Bonificações</h1>
            <p className="text-sm text-muted-foreground">
              Conta-corrente por cliente cruzando automaticamente as vendas já importadas com as bonificações
              entregues. A % de negociação é sempre sobre o volume comprado.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Importar bonificações
            </Button>
            <Button onClick={() => setNovoOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nova bonificação
            </Button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-7">
          <Kpi label="Clientes com bonificação" value={String(kpis.clientes)} />
          <Kpi label="Volume comprado" value={kgFmt(kpis.comprado)} />
          <Kpi label="Faturamento" value={brl(kpis.faturamento)} />
          <Kpi label="Bonificação gerada" value={kgFmt(kpis.gerada)} />
          <Kpi label="Bonificação entregue" value={kgFmt(kpis.entregue)} />
          <Kpi label="Saldo pendente" value={kgFmt(kpis.saldo)} destaque={kpis.saldo > 0.5} />
          <Kpi label="Divergências" value={String(kpis.divergentes)} destaque={kpis.divergentes > 0} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DateRangeFilterGroup
              label="Período"
              start={inicio}
              end={fim}
              onStartChange={setInicio}
              onEndChange={setFim}
              helperText="Vendas, faturamento e bonificações são buscados automaticamente na base para o intervalo selecionado."
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-9"
                    placeholder="Cliente, produto ou vendedor"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tipo de bonificação</Label>
                <MultiSelectFiltro
                  placeholderTodos="Todas as categorias"
                  opcoes={categoriasBase.map((c) => ({ value: c, label: c }))}
                  selecionados={categorias}
                  onChange={(v) => setCategoriasSel(v)}
                  buscaPlaceholder="Buscar categoria..."
                  maxNomes={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">% de negociação</Label>
                <Select value={pctFiltro} onValueChange={setPctFiltro}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as porcentagens</SelectItem>
                    {pctsDisponiveis.map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {p}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vendedor</Label>
                <Select value={vendedor} onValueChange={setVendedor}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    {Object.entries(STATUS_META).map(([k, meta]) => (
                      <SelectItem key={k} value={k}>
                        {meta.icon} {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Clientes ({filtradas.length}) · período {periodoLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando dados...
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="sticky left-0 z-20 bg-background min-w-[240px]">Cliente</TableHead>
                      <TableHead className="text-right">% Negociação</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Volume comprado</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Bonificação gerada</TableHead>
                      <TableHead className="text-right">Bonificação entregue</TableHead>
                      <TableHead className="text-right">Saldo a entregar</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((l) => (
                      <TableRow key={l.clienteKey}>
                        <TableCell className="sticky left-0 z-10 bg-background align-top">
                          <div className="font-medium">{l.cliente}</div>
                          {l.unidade && (
                            <div className="text-xs font-medium text-primary">Unidade: {l.unidade}</div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {l.vendedor ?? "—"} · {l.produtos.length} produto(s)
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
                            <AcaoLink onClick={() => setEditando(l)}>Editar</AcaoLink>
                            <span className="text-muted-foreground">·</span>
                            <AcaoLink onClick={() => setConferencia(l)}>Detalhes</AcaoLink>
                            <span className="text-muted-foreground">·</span>
                            <AcaoLink onClick={() => abrirDetalhe(l, "entregue")}>Entregas</AcaoLink>
                            <span className="text-muted-foreground">·</span>
                            <AcaoLink className="text-destructive" onClick={() => setExcluir(l)}>
                              Excluir
                            </AcaoLink>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <button
                            type="button"
                            onClick={() => setEditando(l)}
                            className="font-semibold underline decoration-dotted underline-offset-4 hover:text-primary"
                          >
                            {l.pct}%
                          </button>
                          <div className="text-[11px] text-muted-foreground">
                            {l.pctManual ? "definida" : l.pctSugerido != null ? "estimada" : "sem histórico"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <ValorLink onClick={() => setPedidosDe(l)}>
                            {l.qtdPedidos} {l.qtdPedidos === 1 ? "pedido" : "pedidos"}
                          </ValorLink>
                          {l.pedidos.some((p) => p.divergente) && (
                            <div className="text-[11px] text-warning">
                              ⚠ {l.pedidos.filter((p) => p.divergente).length} divergência(s)
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <ValorLink onClick={() => abrirDetalhe(l, "comprado")}>{kgFmt(l.volumeComprado)}</ValorLink>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <ValorLink onClick={() => abrirDetalhe(l, "faturamento")}>{brl(l.faturamento)}</ValorLink>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <ValorLink onClick={() => abrirDetalhe(l, "gerada")}>{kgFmt(l.bonificacaoGerada)}</ValorLink>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <ValorLink onClick={() => abrirDetalhe(l, "entregue")}>
                            {kgFmt(l.bonificacaoEntregue)}
                          </ValorLink>
                        </TableCell>
                        <TableCell
                          className={`text-right align-top ${l.saldoAEntregar > 0.05 ? "text-destructive" : "text-success"}`}
                        >
                          {kgFmt(l.saldoAEntregar)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className={STATUS_META[l.status].className}>
                            {STATUS_META[l.status].icon} {STATUS_META[l.status].label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtradas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          Nenhum cliente encontrado com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BonificacaoFormDialog open={novoOpen} onOpenChange={setNovoOpen} item={null} />
      <NegociacaoClienteDialog linha={editando} onOpenChange={(v) => !v && setEditando(null)} />
      <PedidosClienteDialog
        linha={pedidosDe}
        periodoLabel={periodoLabel}
        onOpenChange={(v) => !v && setPedidosDe(null)}
      />
      <ConferenciaBonificacaoDialog linha={conferencia} onOpenChange={(v) => !v && setConferencia(null)} />
      <DetalheBonificacaoDialog detalhe={detalhe} onOpenChange={(v) => !v && setDetalhe(null)} />
      <ImportarBonificacoesDialog open={importOpen} onOpenChange={setImportOpen} onImported={invalidate} />

      <AlertDialog open={!!excluir} onOpenChange={(v) => !v && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover controle de bonificação?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir?.cliente} · {excluir?.produtos.length} produto(s). O cliente sai do controle, mas o histórico de
              compras e bonificações enviadas é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function AcaoLink({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground ${className}`}
    >
      {children}
    </button>
  );
}

function ValorLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="underline decoration-dotted underline-offset-4 hover:text-primary">
      {children}
    </button>
  );
}

function Kpi({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-heading font-bold ${destaque ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
