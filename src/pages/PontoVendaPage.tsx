import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { FilterPopover } from "@/components/FilterPopover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,

  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { savePdfDoc, preopenPdfTab, openPdfDoc } from "@/lib/pdfDownload";
import { useAuth } from "@/contexts/AuthContext";
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
import { useClientProfiles, usePatchClientProfile } from "@/hooks/useClientProfiles";
import { useSalesData, filterByDateRange, getUniqueVendedores, shortVendedorName } from "@/hooks/useSalesData";

import { ClientProfileDialog } from "@/components/cadastro/ClientProfileDialog";
import { PontoVendaDetalhe } from "@/components/pdv/PontoVendaDetalhe";
import { ImportarPlanilhaDialog } from "@/components/pdv/ImportarPlanilhaDialog";
import { NovoPontoVendaDialog } from "@/components/pdv/NovoPontoVendaDialog";

import {
  buildPdvSalesIndex,
  diasSemComprar,
  findPossibleDuplicates,
  formatCurrency,
  formatDate,
  formatKg,
  formatPhone,
  fullAddress,
  nameKey,
  normalizePhone,
  pdvVinculo,
  profilePhone,
  profileWhatsapp,
  resolvePdvStats,
  shortAddress,
  TIPOS_PONTO_VENDA,


  type PdvStats,
  type PdvVinculo,
} from "@/lib/pontoVenda";
import type { ClientProfile } from "@/types/clientProfile";
import { EscopoUsuarioBar } from "@/components/EscopoUsuarioBar";

type SortKey =
  | "nome_asc" | "nome_desc"
  | "fat_desc" | "fat_asc"
  | "qtd_desc" | "qtd_asc"
  | "pedido_recente"
  | "dias_desc"
  | "cidade_bairro";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "nome_asc", label: "Nome (A-Z)" },
  { value: "nome_desc", label: "Nome (Z-A)" },
  { value: "fat_desc", label: "Maior faturamento" },
  { value: "fat_asc", label: "Menor faturamento" },
  { value: "qtd_desc", label: "Maior quantidade" },
  { value: "qtd_asc", label: "Menor quantidade" },
  { value: "pedido_recente", label: "Pedido mais recente" },
  { value: "dias_desc", label: "Mais dias sem comprar" },
  { value: "cidade_bairro", label: "Cidade e bairro" },
];

const PAGE_SIZE = 25;

interface Linha {
  profile: ClientProfile;
  stats: PdvStats;
  statsGlobal: PdvStats;
  dias: number | null;
  vinculo: PdvVinculo;
}


export default function PontoVendaPage() {
  const { data: profiles = [], isLoading } = useClientProfiles();
  // Fonte comercial ÚNICA: a mesma base de vendas usada por todo o CRM.
  // A aba Ponto de Venda é apenas uma visão filtrada dos clientes marcados como PDV.
  const { data: sales = [] } = useSalesData();


  const patch = usePatchClientProfile();
  const { toast } = useToast();
  const { user } = useAuth();
  const autor = user?.email ?? user?.id ?? "usuário do sistema";

  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [search, setSearch] = useState("");
  const [cidadeFilter, setCidadeFilter] = useState<string[]>([]);
  const [bairroFilter, setBairroFilter] = useState<string[]>([]);
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [vendedorFilter, setVendedorFilter] = useState<string[]>([]);
  const [produtoFilter, setProdutoFilter] = useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "inativo">("todos");
  const [compraFilter, setCompraFilter] = useState<"todos" | "com" | "sem">("todos");
  const [qtdMinima, setQtdMinima] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome_asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const [detalhe, setDetalhe] = useState<ClientProfile | null>(null);
  const [editing, setEditing] = useState<ClientProfile | null>(null);
  const [editingFicha, setEditingFicha] = useState<ClientProfile | null>(null);
  const [removendo, setRemovendo] = useState<Linha | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  const pontos = useMemo(() => profiles.filter((p) => p.is_ponto_venda), [profiles]);

  const periodSales = useMemo(
    () => (inicio && fim ? filterByDateRange(sales, inicio, fim) : sales),
    [sales, inicio, fim],
  );
  const indexPeriodo = useMemo(() => buildPdvSalesIndex(periodSales), [periodSales]);
  const indexGlobal = useMemo(() => buildPdvSalesIndex(sales), [sales]);

  const linhasBase = useMemo<Linha[]>(
    () =>
      pontos.map((profile) => {
        const stats = resolvePdvStats(indexPeriodo, profile);
        const statsGlobal = resolvePdvStats(indexGlobal, profile);
        const duplicados = findPossibleDuplicates(profiles, {
          id: profile.id,
          codigo_cliente: profile.codigo_cliente,
          cnpj: profile.cnpj,
          nome: profile.nome,
          nome_fantasia: profile.nome_fantasia,
          cidade: profile.cidade,
        }).length;
        return {
          profile,
          stats,
          statsGlobal,
          dias: diasSemComprar(statsGlobal.ultimoPedido),
          vinculo: pdvVinculo(profile, statsGlobal, duplicados),
        };
      }),
    [pontos, profiles, indexPeriodo, indexGlobal],
  );


  const cidades = useMemo(
    () => [...new Set(pontos.map((p) => p.cidade).filter(Boolean) as string[])].sort(),
    [pontos],
  );
  const bairros = useMemo(
    () => [...new Set(pontos.map((p) => p.bairro).filter(Boolean) as string[])].sort(),
    [pontos],
  );
  const estados = useMemo(
    () => [...new Set(pontos.map((p) => p.estado).filter(Boolean) as string[])].sort(),
    [pontos],
  );
  const vendedores = useMemo(() => getUniqueVendedores(sales), [sales]);
  const classificacoes = useMemo(() => {
    const set = new Set<string>(TIPOS_PONTO_VENDA as readonly string[]);
    for (const p of pontos) if (p.pdv_tipo) set.add(p.pdv_tipo);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [pontos]);
  const produtos = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhasBase) for (const p of l.stats.produtos) set.add(p.produto);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhasBase]);

  const filtradas = useMemo(() => {
    const s = nameKey(search);
    const digits = search.replace(/\D/g, "");
    const minQtd = Number(qtdMinima.replace(",", ".")) || 0;

    const out = linhasBase.filter(({ profile, stats }) => {
      if (s || digits.length >= 3) {
        const hay = nameKey(`${profile.nome} ${profile.nome_fantasia ?? ""}`);
        const docHit = digits.length >= 3 && String(profile.cnpj ?? "").replace(/\D/g, "").includes(digits);
        if (!(s && hay.includes(s)) && !docHit) return false;
      }
      if (cidadeFilter.length && !cidadeFilter.includes(profile.cidade ?? "")) return false;
      if (bairroFilter.length && !bairroFilter.includes(profile.bairro ?? "")) return false;
      if (estadoFilter.length && !estadoFilter.includes(profile.estado ?? "")) return false;
      if (tipoFilter.length && !tipoFilter.includes(profile.pdv_tipo ?? "")) return false;
      if (vendedorFilter.length) {
        const nomes = [profile.vendedor, stats.vendedor]
          .filter(Boolean)
          .map((v) => shortVendedorName(String(v)));
        if (!nomes.some((n) => vendedorFilter.includes(n))) return false;
      }
      if (produtoFilter.length) {
        if (!stats.produtos.some((p) => produtoFilter.includes(p.produto))) return false;
      }
      if (statusFilter === "ativo" && !profile.pdv_ativo) return false;
      if (statusFilter === "inativo" && profile.pdv_ativo) return false;
      if (compraFilter === "com" && stats.pedidos === 0) return false;
      if (compraFilter === "sem" && stats.pedidos > 0) return false;
      if (minQtd > 0 && stats.kg < minQtd) return false;
      return true;
    });

    const byStr = (a?: string, b?: string) => (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base" });
    const nome = (l: Linha) => l.profile.nome_fantasia?.trim() || l.profile.nome;

    const sorted = [...out];
    switch (sortKey) {
      case "nome_asc": sorted.sort((a, b) => byStr(nome(a), nome(b))); break;
      case "nome_desc": sorted.sort((a, b) => byStr(nome(b), nome(a))); break;
      case "fat_desc": sorted.sort((a, b) => b.stats.faturamento - a.stats.faturamento); break;
      case "fat_asc": sorted.sort((a, b) => a.stats.faturamento - b.stats.faturamento); break;
      case "qtd_desc": sorted.sort((a, b) => b.stats.kg - a.stats.kg); break;
      case "qtd_asc": sorted.sort((a, b) => a.stats.kg - b.stats.kg); break;
      case "pedido_recente":
        sorted.sort((a, b) => (b.statsGlobal.ultimoPedido ?? "").localeCompare(a.statsGlobal.ultimoPedido ?? ""));
        break;
      case "dias_desc":
        sorted.sort((a, b) => (b.dias ?? Number.MAX_SAFE_INTEGER) - (a.dias ?? Number.MAX_SAFE_INTEGER));
        break;
      case "cidade_bairro":
        sorted.sort((a, b) =>
          byStr(a.profile.cidade, b.profile.cidade) ||
          byStr(a.profile.bairro, b.profile.bairro) ||
          byStr(nome(a), nome(b)));
        break;
    }
    return sorted;
  }, [
    linhasBase, search, cidadeFilter, bairroFilter, estadoFilter, vendedorFilter, produtoFilter,
    tipoFilter, statusFilter, compraFilter, qtdMinima, sortKey,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtradas.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const kpis = useMemo(() => {
    const comCompra = filtradas.filter((l) => l.stats.pedidos > 0).length;
    const diasList = filtradas.map((l) => l.dias).filter((d): d is number => d !== null);
    return {
      total: filtradas.length,
      ativos: filtradas.filter((l) => l.profile.pdv_ativo).length,
      inativos: filtradas.filter((l) => !l.profile.pdv_ativo).length,
      comCompra,
      semCompra: filtradas.length - comCompra,
      faturamento: filtradas.reduce((s, l) => s + l.stats.faturamento, 0),
      kg: filtradas.reduce((s, l) => s + l.stats.kg, 0),
      mediaDias: diasList.length ? Math.round(diasList.reduce((s, d) => s + d, 0) / diasList.length) : 0,
    };
  }, [filtradas]);

  const limparFiltros = () => {
    setInicio(""); setFim(""); setSearch("");
    setCidadeFilter([]); setBairroFilter([]); setEstadoFilter([]);
    setVendedorFilter([]); setProdutoFilter([]); setTipoFilter([]);
    setStatusFilter("todos"); setCompraFilter("todos"); setQtdMinima("");
    setSortKey("nome_asc"); setPage(0);
  };

  const toggleStatus = async (l: Linha) => {
    try {
      await patch.mutateAsync({
        id: l.profile.id,
        patch: {
          pdv_ativo: !l.profile.pdv_ativo,
          pdv_atualizado_por: autor,
          pdv_atualizado_em: new Date().toISOString(),
        },
      });
      toast({ title: `Ponto de venda ${!l.profile.pdv_ativo ? "ativado" : "inativado"}` });
    } catch (e: any) {
      toast({ title: "Erro ao alterar status", description: e?.message, variant: "destructive" });
    }
  };

  const removerDaLista = async (l: Linha) => {
    try {
      await patch.mutateAsync({
        id: l.profile.id,
        patch: {
          is_ponto_venda: false,
          pdv_removido_por: autor,
          pdv_removido_em: new Date().toISOString(),
        },
      });
      toast({
        title: "Removido da lista de pontos de venda",
        description: "O cadastro, os pedidos e todo o histórico foram preservados e podem ser reativados depois.",
      });
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e?.message, variant: "destructive" });
    } finally {
      setRemovendo(null);
    }
  };

  const copiar = (texto: string, titulo: string) => {
    if (!texto || texto === "—") {
      toast({ title: "Nada para copiar", variant: "destructive" });
      return;
    }
    void navigator.clipboard.writeText(texto);
    toast({ title: titulo });
  };

  const exportRows = useMemo(
    () => (selected.length ? filtradas.filter((l) => selected.includes(l.profile.id)) : filtradas),
    [filtradas, selected],
  );

  const exportMatrix = () => {
    const headers = [
      "Cliente", "Razão social", "Classificação", "Endereço", "Cidade", "Bairro", "Estado",
      "Telefone", "WhatsApp", "Vendedor", "Status", "Última compra", "Dias sem comprar",
      "Pedidos", "Quantidade (kg)", "Faturamento", "Produtos comprados",
    ];
    const body = exportRows.map((l) => [
      l.profile.nome_fantasia?.trim() || "Nome fantasia não cadastrado",
      l.profile.nome,

      l.profile.pdv_tipo ?? "",
      fullAddress(l.profile),
      l.profile.cidade ?? "",
      l.profile.bairro ?? "",
      l.profile.estado ?? "",
      formatPhone(profilePhone(l.profile)),
      formatPhone(profileWhatsapp(l.profile)),
      l.profile.vendedor ?? l.stats.vendedor ?? "",
      l.profile.pdv_ativo ? "Ativo" : "Inativo",
      formatDate(l.statsGlobal.ultimoPedido),
      l.dias === null ? "Nunca comprou" : String(l.dias),
      String(l.stats.pedidos),
      l.stats.kg.toFixed(1),
      l.stats.faturamento.toFixed(2),
      l.stats.produtos.map((p) => p.produto).join(" | "),
    ]);
    return { headers, body };
  };

  const exportExcel = () => {
    const { headers, body } = exportMatrix();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pontos de Venda");
    XLSX.writeFile(wb, `pontos-de-venda-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const buildPdf = () => {
    const { headers, body } = exportMatrix();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Pontos de Venda - Pão de Queijo Ti Delso", 40, 40);
    doc.setFontSize(9);
    doc.text(
      `Período: ${inicio ? formatDate(inicio) : "todo o histórico"}${fim ? ` a ${formatDate(fim)}` : ""} · ${body.length} registro(s)`,
      40,
      56,
    );
    autoTable(doc, {
      startY: 70,
      head: [headers],
      body,
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [180, 130, 40] },
    });
    return doc;
  };

  const verPdf = () => {
    const preopened = window.open("", "_blank");
    openPdfDoc(buildPdf(), {
      preopened,
      onError: (message) => toast({ title: "Erro ao abrir PDF", description: message, variant: "destructive" }),
    });
  };
  const baixarPdf = () => {
    const preopened = preopenPdfTab();
    savePdfDoc(buildPdf(), `pontos-de-venda-${new Date().toISOString().slice(0, 10)}.pdf`, {
      preopened,
      onError: (message) => toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" }),
    });
  };

  const pageIds = pageRows.map((l) => l.profile.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold md:text-3xl">Ponto de Venda</h1>
            <EscopoUsuarioBar className="mt-3" />
            <p className="mt-1 text-sm text-muted-foreground">
              Dados cadastrais mantidos manualmente e dados comerciais vindos da mesma planilha de vendas importada no CRM.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setNovoOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Cadastrar novo ponto de venda
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Importar planilha
            </Button>
          </div>
        </div>


        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Total de PDVs" value={String(kpis.total)} />
          <Kpi label="Ativos" value={String(kpis.ativos)} />
          <Kpi label="Inativos" value={String(kpis.inativos)} />
          <Kpi label="Com compra" value={String(kpis.comCompra)} />
          <Kpi label="Sem compra" value={String(kpis.semCompra)} />
          <Kpi label="Faturamento" value={formatCurrency(kpis.faturamento)} />
          <Kpi label="Quantidade" value={formatKg(kpis.kg)} />
          <Kpi label="Média dias s/ comprar" value={`${kpis.mediaDias}`} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar cliente, fantasia ou CNPJ..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Período</span>
              <Input type="date" className="h-9 w-[145px]" value={inicio} onChange={(e) => { setInicio(e.target.value); setPage(0); }} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" className="h-9 w-[145px]" value={fim} onChange={(e) => { setFim(e.target.value); setPage(0); }} />
            </div>
            <FilterPopover label="Cidade" options={cidades} selected={cidadeFilter} onApply={setCidadeFilter} />
            <FilterPopover label="Bairro" options={bairros} selected={bairroFilter} onApply={setBairroFilter} />
            <FilterPopover label="Estado" options={estados} selected={estadoFilter} onApply={setEstadoFilter} />
            <FilterPopover label="Vendedor" options={vendedores} selected={vendedorFilter} onApply={setVendedorFilter} />
            <FilterPopover label="Produto" options={produtos} selected={produtoFilter} onApply={setProdutoFilter} />
            <FilterPopover label="Classificação" options={classificacoes} selected={tipoFilter} onApply={setTipoFilter} />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(0); }}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={compraFilter} onValueChange={(v) => { setCompraFilter(v as any); setPage(0); }}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Com e sem compra</SelectItem>
                <SelectItem value="com">Com compra no período</SelectItem>
                <SelectItem value="sem">Sem compra no período</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-9 w-[170px]"
              placeholder="Qtd mínima (kg)"
              value={qtdMinima}
              onChange={(e) => { setQtdMinima(e.target.value); setPage(0); }}
            />
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={exportExcel}>
                <Download className="mr-1 h-3 w-3" /> Excel
              </Button>
              <Button size="sm" variant="outline" onClick={verPdf}>
                <FileText className="mr-1 h-3 w-3" /> Visualizar PDF
              </Button>
              <Button size="sm" variant="outline" onClick={baixarPdf}>
                <Download className="mr-1 h-3 w-3" /> Baixar PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtradas.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Nenhum ponto de venda encontrado com os filtros atuais.
              </div>
            ) : (
              <>
                <div className="relative max-h-[70vh] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-30">
                      <TableRow className="[&>th]:bg-secondary">
                        <TableHead className="sticky left-0 z-40 w-10">
                          <Checkbox
                            checked={allPageSelected}
                            onCheckedChange={() =>
                              setSelected((prev) =>
                                allPageSelected
                                  ? prev.filter((id) => !pageIds.includes(id))
                                  : [...new Set([...prev, ...pageIds])],
                              )
                            }
                            aria-label="Selecionar página"
                          />
                        </TableHead>
                        <TableHead className="sticky left-10 z-40 w-[280px] min-w-[280px] border-r shadow-[2px_0_4px_-2px_hsl(var(--foreground)/0.15)]">
                          Cliente
                        </TableHead>
                        <TableHead className="w-[150px]">Cidade</TableHead>
                        <TableHead className="w-[160px]">Bairro</TableHead>
                        <TableHead className="w-[300px]">Endereço</TableHead>
                        <TableHead className="w-[160px]">Telefone</TableHead>
                        <TableHead className="w-[160px]">WhatsApp</TableHead>
                        <TableHead className="w-[150px]">Vendedor</TableHead>
                        <TableHead className="w-[90px] text-right">Pedidos</TableHead>
                        <TableHead className="w-[100px] text-right">Qtd (kg)</TableHead>
                        <TableHead className="w-[145px] text-right">Faturamento</TableHead>
                        <TableHead className="w-[145px]">Último pedido</TableHead>
                        <TableHead className="w-[100px] text-right">Dias s/ comprar</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {pageRows.map((l) => {
                        const p = l.profile;
                        const tel = profilePhone(p);
                        const zap = profileWhatsapp(p);
                        const ultimo = l.statsGlobal.orders[0];
                        return (
                          <TableRow key={p.id} className="group cursor-pointer" onClick={() => setDetalhe(p)}>
                            <TableCell
                              className="sticky left-0 z-20 w-10 bg-card group-hover:bg-muted/50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={selected.includes(p.id)}
                                onCheckedChange={() =>
                                  setSelected((prev) =>
                                    prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                                  )
                                }
                                aria-label={`Selecionar ${p.nome}`}
                              />
                            </TableCell>
                            <TableCell className="sticky left-10 z-20 w-[280px] min-w-[280px] max-w-[280px] border-r bg-card shadow-[2px_0_4px_-2px_hsl(var(--foreground)/0.15)] group-hover:bg-muted/50">
                              <button
                                type="button"
                                className={`block w-full truncate text-left text-sm font-medium hover:underline ${p.nome_fantasia?.trim() ? "" : "italic text-muted-foreground"}`}
                                onClick={(e) => { e.stopPropagation(); setDetalhe(p); }}
                                title={p.nome_fantasia?.trim() ? `${p.nome_fantasia} — Razão social: ${p.nome}` : `Razão social: ${p.nome}`}
                              >
                                {p.nome_fantasia?.trim() || "Nome fantasia não cadastrado"}
                              </button>

                              <div className="mt-0.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {p.pdv_tipo && (
                                  <Badge variant="outline" className="text-[10px]">{p.pdv_tipo}</Badge>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      aria-label="Editar ponto de venda"
                                      onClick={() => setEditingFicha(p)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar ponto de venda</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      aria-label="Remover ponto de venda"
                                      onClick={() => setRemovendo(l)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remover ponto de venda</TooltipContent>
                                </Tooltip>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Mais ações">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => setDetalhe(p)}>
                                      <Eye className="mr-2 h-3 w-3" /> Visualizar detalhes
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setEditing(p)}>
                                      <Pencil className="mr-2 h-3 w-3" /> Editar ficha completa
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => toggleStatus(l)}>
                                      {p.pdv_ativo ? "Marcar como inativo" : "Marcar como ativo"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={!zap}
                                      onClick={() => window.open(`https://wa.me/${normalizePhone(zap)}`, "_blank")}
                                    >
                                      <MessageCircle className="mr-2 h-3 w-3" /> Abrir WhatsApp
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => copiar(tel, "Telefone copiado")}>
                                      <Copy className="mr-2 h-3 w-3" /> Copiar telefone
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => copiar(fullAddress(p), "Endereço copiado")}>
                                      <Copy className="mr-2 h-3 w-3" /> Copiar endereço
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        window.open(
                                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(p))}`,
                                          "_blank",
                                        )
                                      }
                                    >
                                      <MapPin className="mr-2 h-3 w-3" /> Abrir no Google Maps
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs">{p.cidade || "—"}</TableCell>
                            <TableCell className="text-xs">{p.bairro || "—"}</TableCell>
                            <TableCell className="max-w-[240px] truncate text-xs">{shortAddress(p)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                              <ContatoCell
                                numero={tel}
                                onCopy={() => copiar(formatPhone(tel), "Telefone copiado")}
                              />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                              <ContatoCell
                                numero={zap}
                                whatsapp
                                onCopy={() => copiar(formatPhone(zap), "WhatsApp copiado")}
                              />
                            </TableCell>
                            <TableCell className="text-xs">{p.vendedor || l.stats.vendedor || "—"}</TableCell>
                            <TableCell className="text-right text-xs">{l.stats.pedidos}</TableCell>
                            <TableCell className="text-right text-xs">{formatKg(l.stats.kg)}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{formatCurrency(l.stats.faturamento)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
                              {ultimo ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="underline decoration-dotted" onClick={() => setDetalhe(p)}>
                                      {formatDate(ultimo.data)}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-medium">Pedido #{ultimo.codigoVenda} · {formatDate(ultimo.data)}</p>
                                    <p>{formatCurrency(ultimo.valor)} · {formatKg(ultimo.kg)} · {ultimo.vendedor}</p>
                                    <ul className="mt-1 space-y-0.5 text-[11px]">
                                      {ultimo.itens.slice(0, 8).map((i, idx) => (
                                        <li key={idx}>
                                          {i.produto} — {formatKg(i.quantidade)} — {formatCurrency(i.valor)}
                                        </li>
                                      ))}
                                    </ul>
                                    <p className="mt-1 text-[11px] underline">Clique para ver o pedido completo</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">Ainda sem pedido importado</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {l.dias === null ? (
                                <span className="text-muted-foreground">Ainda sem histórico</span>
                              ) : l.dias}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <Switch checked={p.pdv_ativo} onCheckedChange={() => toggleStatus(l)} />
                                <span className="text-xs">{p.pdv_ativo ? "Ativo" : "Inativo"}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                  <span className="text-xs text-muted-foreground">
                    {filtradas.length} ponto(s) de venda · página {currentPage + 1} de {totalPages}
                    {selected.length > 0 && ` · ${selected.length} selecionado(s)`}
                  </span>
                  <div className="flex items-center gap-2">
                    {selected.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Limpar seleção</Button>
                    )}
                    <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <PontoVendaDetalhe
        profile={detalhe}
        sales={sales}
        periodoInicio={inicio}
        periodoFim={fim}
        onOpenChange={(open) => { if (!open) setDetalhe(null); }}
      />

      <ClientProfileDialog
        open={!!editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        initial={editing}
      />

      <NovoPontoVendaDialog
        open={novoOpen || !!editingFicha}
        onOpenChange={(open) => { if (!open) { setNovoOpen(false); setEditingFicha(null); } }}
        profiles={profiles}
        editing={editingFicha}
        onVisualizar={(p) => setDetalhe(p)}
      />

      <ImportarPlanilhaDialog open={addOpen} onOpenChange={setAddOpen} profiles={profiles} />


      <AlertDialog open={!!removendo} onOpenChange={(open) => { if (!open) setRemovendo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              Tem certeza de que deseja remover este cliente da lista de pontos de venda?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removendo?.profile.nome} sairá apenas da lista de pontos de venda. O cadastro do cliente, os
              pedidos, o faturamento, os produtos, o histórico de vendas e os endereços continuam preservados e
              o cliente pode ser reativado depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (removendo) void removerDaLista(removendo); }}
            >
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
}

/** Telefone/WhatsApp formatado, com cópia rápida e atalho para a conversa. */
function ContatoCell({
  numero,
  whatsapp,
  onCopy,
}: {
  numero: string;
  whatsapp?: boolean;
  onCopy: () => void;
}) {
  if (!numero) return <span className="text-muted-foreground">Não cadastrado</span>;
  const digits = normalizePhone(numero);
  return (
    <div className="flex items-center gap-1">
      <span>{formatPhone(numero)}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCopy}>
            <Copy className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copiar número</TooltipContent>
      </Tooltip>
      {whatsapp && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-emerald-600 hover:text-emerald-600"
              onClick={() => window.open(`https://wa.me/${digits}`, "_blank")}
            >
              <MessageCircle className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Abrir conversa no WhatsApp</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-base font-bold font-heading">{value}</p>
      </CardContent>
    </Card>
  );
}
