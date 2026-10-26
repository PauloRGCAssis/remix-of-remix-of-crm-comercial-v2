import { PodeCriar } from "@/components/PodeCriar";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, Eye, MapPin, User, Loader2, Download, X } from "lucide-react";
import { FilterPopover } from "@/components/FilterPopover";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { savePdfDoc, preopenPdfTab } from "@/lib/pdfDownload";
import { useClientProfiles, useDeleteClientProfile } from "@/hooks/useClientProfiles";
import { ClientProfileDialog } from "@/components/cadastro/ClientProfileDialog";
import { ClientProfileViewer } from "@/components/cadastro/ClientProfileViewer";
import { useSalesData, getUniqueVendedores, shortVendedorName } from "@/hooks/useSalesData";
import { documentoLabel, formatDocumento } from "@/lib/documentoCliente";
import { buildClientProfilesPdf, slugifyClientName } from "@/lib/clientProfilePdf";
import type { ClientProfile } from "@/types/clientProfile";
import { EscopoUsuarioBar } from "@/components/EscopoUsuarioBar";

function normalize(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

type SortKey =
  | "recentes"
  | "antigos"
  | "az"
  | "za"
  | "cidade"
  | "regiao"
  | "vendedor";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "antigos", label: "Mais antigos" },
  { value: "az", label: "Ordem alfabética A-Z" },
  { value: "za", label: "Ordem alfabética Z-A" },
  { value: "cidade", label: "Cidade" },
  { value: "regiao", label: "Região" },
  { value: "vendedor", label: "Vendedor" },
];

function displayName(p: ClientProfile) {
  return (p.nome_fantasia && p.nome_fantasia.trim()) || p.nome;
}

export default function CadastroClientesPage() {
  const { data: profiles = [], isLoading } = useClientProfiles();
  const { data: sales = [] } = useSalesData();
  const deleteMut = useDeleteClientProfile();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [vendedorFilter, setVendedorFilter] = useState<string[]>([]);
  const [cidadeFilter, setCidadeFilter] = useState<string[]>([]);
  const [regiaoFilter, setRegiaoFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("recentes");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientProfile | null>(null);
  const [viewer, setViewer] = useState<ClientProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientProfile | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const vendedores = useMemo(() => getUniqueVendedores(sales), [sales]);
  const cidades = useMemo(
    () => [...new Set(profiles.map((p) => p.cidade).filter(Boolean) as string[])].sort(),
    [profiles],
  );
  const regioes = useMemo(
    () => [...new Set(profiles.map((p) => p.regiao).filter(Boolean) as string[])].sort(),
    [profiles],
  );

  const filtered = useMemo(() => {
    const s = normalize(search);
    const out = profiles.filter((p) => {
      if (s) {
        const haystack = normalize(`${p.nome} ${p.nome_fantasia ?? ""} ${p.cnpj ?? ""}`);
        const searchDigits = search.replace(/\D/g, "");
        const docDigits = (p.cnpj ?? "").replace(/\D/g, "");
        const docMatch = searchDigits.length >= 3 && docDigits.includes(searchDigits);
        if (!haystack.includes(s) && !docMatch) return false;
      }
      if (vendedorFilter.length && !vendedorFilter.includes(shortVendedorName(p.vendedor ?? ""))) return false;
      if (cidadeFilter.length && !cidadeFilter.includes(p.cidade ?? "")) return false;
      if (regiaoFilter.length && !regiaoFilter.includes(p.regiao ?? "")) return false;
      if (dateStart || dateEnd) {
        const created = (p.created_at ?? "").slice(0, 10);
        if (!created) return false;
        if (dateStart && created < dateStart) return false;
        if (dateEnd && created > dateEnd) return false;
      }
      return true;
    });

    const byString = (a?: string, b?: string) =>
      (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base" });

    const sorted = [...out];
    switch (sortKey) {
      case "recentes":
        sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        break;
      case "antigos":
        sorted.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        break;
      case "az":
        sorted.sort((a, b) => byString(displayName(a), displayName(b)));
        break;
      case "za":
        sorted.sort((a, b) => byString(displayName(b), displayName(a)));
        break;
      case "cidade":
        sorted.sort((a, b) => byString(a.cidade, b.cidade) || byString(displayName(a), displayName(b)));
        break;
      case "regiao":
        sorted.sort((a, b) => byString(a.regiao, b.regiao) || byString(displayName(a), displayName(b)));
        break;
      case "vendedor":
        sorted.sort((a, b) => byString(a.vendedor, b.vendedor) || byString(displayName(a), displayName(b)));
        break;
    }
    return sorted;
  }, [profiles, search, vendedorFilter, cidadeFilter, regiaoFilter, sortKey, dateStart, dateEnd]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedCount = filteredIds.filter((id) => selectedSet.has(id)).length;
  const allVisibleSelected =
    filteredIds.length > 0 && visibleSelectedCount === filteredIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleNew = () => { setEditing(null); setDialogOpen(true); };
  const handleEditFromViewer = () => {
    if (!viewer) return;
    setEditing(viewer);
    setViewer(null);
    setDialogOpen(true);
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
      toast({ title: "Ficha excluída" });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e?.message, variant: "destructive" });
    }
  };

  const selectedProfiles = useMemo(
    () => profiles.filter((p) => selectedSet.has(p.id)),
    [profiles, selectedSet],
  );

  const exportSelectedPdf = () => {
    if (selectedProfiles.length === 0) {
      toast({
        title: "Nenhum cadastro selecionado",
        description: "Selecione ao menos um cadastro para gerar o PDF.",
        variant: "destructive",
      });
      return;
    }
    const doc = buildClientProfilesPdf(selectedProfiles);
    const name =
      selectedProfiles.length === 1
        ? `cadastro-${slugifyClientName(displayName(selectedProfiles[0]))}.pdf`
        : `cadastros-${selectedProfiles.length}-clientes.pdf`;
    savePdfDoc(doc, name, {
      preopened: preopenPdfTab(),
      onError: (message) => toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" }),
    });
  };

  const exportSelectedCsv = () => {
    if (selectedProfiles.length === 0) {
      toast({
        title: "Nenhum cadastro selecionado",
        description: "Selecione ao menos um cadastro para exportar.",
        variant: "destructive",
      });
      return;
    }
    const headers = [
      "Nome", "Nome fantasia", "Tipo documento", "Documento", "Vendedor", "Ramo",
      "Cidade", "Região", "Bairro", "Endereço", "Contatos", "Produtos",
    ];
    const rows = selectedProfiles.map((p) => [
      p.nome, p.nome_fantasia ?? "",
      documentoLabel(p.tipo_documento, p.cnpj),
      formatDocumento(p.cnpj, p.tipo_documento),
      p.vendedor ?? "", p.ramo_atividade ?? "",
      p.cidade ?? "", p.regiao ?? "", p.bairro ?? "",
      [p.rua, p.numero].filter(Boolean).join(", "),
      String(p.contatos.length), String(p.produtos_negociados.length),
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cadastros-${selectedProfiles.length}-clientes.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkDelete = async () => {
    if (selectedProfiles.length === 0) return;
    try {
      await Promise.all(selectedProfiles.map((p) => deleteMut.mutateAsync(p.id)));
      toast({ title: `${selectedProfiles.length} ficha(s) excluída(s)` });
      setSelectedIds([]);
      setBulkDeleteOpen(false);
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold md:text-3xl">Cadastro de Clientes</h1>
            <EscopoUsuarioBar className="mt-3" />
            <p className="mt-1 text-sm text-muted-foreground">
              Fichas completas de cadastro com endereço, contatos e produtos negociados.
            </p>
          </div>
          <PodeCriar modulo={'cadastro_clientes'}><Button onClick={handleNew}>
            <Plus className="h-4 w-4 mr-1" /> Nova ficha
          </Button></PodeCriar>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, fantasia, CNPJ ou CPF..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <FilterPopover label="Vendedor" options={vendedores} selected={vendedorFilter} onApply={setVendedorFilter} />
              <FilterPopover label="Cidade" options={cidades} selected={cidadeFilter} onApply={setCidadeFilter} />
              <FilterPopover label="Região" options={regioes} selected={regiaoFilter} onApply={setRegiaoFilter} />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Cadastro de</span>
                <Input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="h-9 w-[150px]"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="h-9 w-[150px]"
                />
                {(dateStart || dateEnd) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2"
                    onClick={() => { setDateStart(""); setDateEnd(""); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Ordenar por</span>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {filtered.length} de {profiles.length} cliente(s)
              </span>
            </div>
          </CardContent>
        </Card>

        {selectedIds.length > 0 && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex flex-wrap items-center gap-2 py-3">
              <Badge variant="secondary" className="text-xs">
                {selectedIds.length} selecionado(s)
              </Badge>
              <Button size="sm" variant="outline" onClick={exportSelectedPdf}>
                <Download className="h-3 w-3 mr-1" /> Baixar PDF dos selecionados
              </Button>
              <Button size="sm" variant="outline" onClick={exportSelectedCsv}>
                <Download className="h-3 w-3 mr-1" /> Exportar CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                <X className="h-3 w-3 mr-1" /> Limpar seleção
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma ficha cadastrada com os filtros atuais.</p>
                <Button variant="outline" className="mt-3" onClick={handleNew}>
                  <Plus className="h-3 w-3 mr-1" /> Criar primeira ficha
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead>Data do cadastro</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Ramo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Cidade / Região</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const checked = selectedSet.has(p.id);
                      return (
                        <TableRow
                          key={p.id}
                          data-state={checked ? "selected" : undefined}
                          className="cursor-pointer"
                          onClick={() => setViewer(p)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleOne(p.id)}
                              aria-label={`Selecionar ${displayName(p)}`}
                            />
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {p.created_at
                              ? new Date(p.created_at).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{displayName(p)}</div>
                          </TableCell>
                          <TableCell className="text-sm">{p.ramo_atividade ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {p.vendedor ? (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3" /> {p.vendedor}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {p.cidade ?? "—"}
                            </div>
                            {p.regiao && (
                              <Badge variant="outline" className="ml-1 text-[10px]">{p.regiao}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); setViewer(p); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ClientProfileDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        initial={editing}
      />

      <ClientProfileViewer
        open={!!viewer}
        onOpenChange={(o) => { if (!o) setViewer(null); }}
        profile={viewer}
        onEdit={handleEditFromViewer}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ficha?</AlertDialogTitle>
            <AlertDialogDescription>
              A ficha de <strong>{deleteTarget ? displayName(deleteTarget) : ""}</strong> será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedProfiles.length} ficha(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é permanente e removerá todos os cadastros selecionados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
