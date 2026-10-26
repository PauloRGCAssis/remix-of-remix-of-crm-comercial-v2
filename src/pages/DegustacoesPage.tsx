import { PodeCriar } from "@/components/PodeCriar";
import {
  promotorasDaDegustacao,
  promotorasLabel,
  promotorasDetalhe,
  custoTotalPromotoras,
  isSemPromotora,
  LABEL_SEM_PROMOTORA,
} from "@/lib/degustacaoPromotoras";
const moneyBr = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Copy, FileDown, Eye, MoreVertical, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDegustacoes, Degustacao, DegustacaoStatus } from "@/hooks/useDegustacoes";
import { DegustacaoFormDialog } from "@/components/degustacoes/DegustacaoFormDialog";
import { DuplicarDegustacoesDialog } from "@/components/degustacoes/DuplicarDegustacoesDialog";
import { DuplicateActionDialog } from "@/components/degustacoes/DuplicateActionDialog";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { FileSpreadsheet } from "lucide-react";
import { formatHorarioRaw } from "@/lib/horarioRange";
import { toast } from "@/hooks/use-toast";
import { savePdfDoc, preopenPdfTab } from "@/lib/pdfDownload";
import {
  isSemMateriais, isSemEquipamentos, isSemProdutos,
  materiaisVisiveis, equipamentosVisiveis, produtosVisiveis,
  LABEL_SEM_MATERIAIS, LABEL_SEM_EQUIPAMENTOS, LABEL_SEM_PRODUTOS,
} from "@/lib/degustacaoFlags";
import { formatProductDisplay } from "@/lib/productDisplay";
import { useCadastroCentralSync } from "@/hooks/useCadastroCentralSync";
import { SincronizarCadastroDialog } from "@/components/clientes/SincronizarCadastroDialog";


const STATUS_META: Record<DegustacaoStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/15 dark:text-yellow-300" },
  realizada: { label: "Realizada", className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-500/15 dark:text-green-300" },
  cancelada: { label: "Cancelada", className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300" },
};

type OrdemDegustacao =
  | "alteracao_desc"
  | "alteracao_asc"
  | "data_desc"
  | "data_asc"
  | "cliente_asc"
  | "cliente_desc";

const ORDEM_OPCOES: { value: OrdemDegustacao; label: string }[] = [
  { value: "alteracao_desc", label: "Última alteração — mais recente" },
  { value: "alteracao_asc", label: "Última alteração — mais antiga" },
  { value: "data_desc", label: "Data da degustação — mais recente" },
  { value: "data_asc", label: "Data da degustação — mais antiga" },
  { value: "cliente_asc", label: "Cliente — A → Z" },
  { value: "cliente_desc", label: "Cliente — Z → A" },
];

const STATUS_FULL_LABEL: Record<DegustacaoStatus, string> = {
  pendente: "Pendente",
  realizada: "Realizada",
  cancelada: "Cancelada",
};


export default function DegustacoesPage() {
  const { list, create, update, remove, bulkInsert, bulkUpdateStatus } = useDegustacoes();
  const { sincronizar, dialogProps: syncDialogProps } = useCadastroCentralSync();

  const all = list.data ?? [];
  const previewReportRef = useRef<HTMLDivElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Degustacao | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupActionSources, setDupActionSources] = useState<Degustacao[]>([]);
  const [dupActionOpen, setDupActionOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Degustacao | null>(null);

  // filtros
  const [fDataInicio, setFDataInicio] = useState("");
  const [fDataFim, setFDataFim] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fBairro, setFBairro] = useState("");
  const [fPromotora, setFPromotora] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  // Ordenação — padrão: última alteração mais recente primeiro
  const [fOrdem, setFOrdem] = useState<OrdemDegustacao>("alteracao_desc");

  // seleção usada por ações em massa e relatórios
  const [selectedDegustacaoIds, setSelectedDegustacaoIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<DegustacaoStatus | "">("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    const alteradoEm = (d: Degustacao) => new Date(d.updated_at ?? d.created_at ?? 0).getTime();
    const ordenar = (rows: Degustacao[]) => {
      const list = [...rows];
      switch (fOrdem) {
        case "alteracao_asc":
          return list.sort((a, b) => alteradoEm(a) - alteradoEm(b));
        case "data_desc":
          return list.sort((a, b) => b.data.localeCompare(a.data));
        case "data_asc":
          return list.sort((a, b) => a.data.localeCompare(b.data));
        case "cliente_asc":
          return list.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
        case "cliente_desc":
          return list.sort((a, b) => b.cliente.localeCompare(a.cliente, "pt-BR"));
        case "alteracao_desc":
        default:
          return list.sort((a, b) => alteradoEm(b) - alteradoEm(a));
      }
    };
    return ordenar(all.filter((d) => {
      if (fDataInicio && d.data < fDataInicio) return false;
      if (fDataFim && d.data > fDataFim) return false;
      if (fCliente && !d.cliente.toLowerCase().includes(fCliente.toLowerCase())) return false;
      if (fBairro && !(d.bairro ?? "").toLowerCase().includes(fBairro.toLowerCase())) return false;
      if (fPromotora && !promotorasLabel(d).toLowerCase().includes(fPromotora.toLowerCase())) return false;
      if (fStatus !== "all" && d.status !== fStatus) return false;
      return true;
    }));
  }, [all, fDataInicio, fDataFim, fCliente, fBairro, fPromotora, fStatus, fOrdem]);

  // Clientes únicos extraídos das degustações existentes para alimentar o autocomplete
  const extraClientes = useMemo(() => {
    const map = new Map<string, { cliente: string; endereco?: string | null; bairro?: string | null; cidade?: string | null }>();
    for (const d of all) {
      const key = (d.cliente ?? "").trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { cliente: d.cliente, endereco: d.endereco, bairro: d.bairro, cidade: d.cidade });
      }
    }
    return Array.from(map.values());
  }, [all]);

  // Fonte única de verdade: IDs marcados que continuam visíveis na tela.
  // Qualquer ID que saia da lista visível (filtro, exclusão, recarga) é descartado.
  useEffect(() => {
    const visibleIds = new Set(filtered.map((d) => d.id));
    setSelectedDegustacaoIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filtered]);

  const visibleSelectedIds = useMemo(
    () => filtered.filter((d) => selectedDegustacaoIds.includes(d.id)).map((d) => d.id),
    [filtered, selectedDegustacaoIds],
  );
  const degustacoesSelecionadas = useMemo(() => {
    const selected = new Set(visibleSelectedIds);
    return filtered
      .filter((d) => selected.has(d.id))
      .sort((a, b) => (a.data === b.data ? a.cliente.localeCompare(b.cliente, "pt-BR") : a.data.localeCompare(b.data)));
  }, [filtered, visibleSelectedIds]);
  const allVisibleSelected = filtered.length > 0 && visibleSelectedIds.length === filtered.length;
  const someVisibleSelected = visibleSelectedIds.length > 0 && !allVisibleSelected;

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleIds = filtered.map((d) => d.id);
      setSelectedDegustacaoIds((current) => Array.from(new Set([...current, ...visibleIds])));
      return;
    }
    const visibleIdSet = new Set(filtered.map((d) => d.id));
    setSelectedDegustacaoIds((current) => current.filter((id) => !visibleIdSet.has(id)));
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedDegustacaoIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((selectedId) => selectedId !== id);
    });
  };
  const clearSelection = () => setSelectedDegustacaoIds([]);

  const handleBulkStatusChoose = (v: DegustacaoStatus) => {
    setBulkStatus(v);
    setBulkConfirmOpen(true);
  };

  const handleBulkConfirm = async () => {
    if (!bulkStatus) return;
    await bulkUpdateStatus.mutateAsync({ ids: visibleSelectedIds, status: bulkStatus });
    setBulkConfirmOpen(false);
    setBulkStatus("");
    clearSelection();
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (d: Degustacao) => {
    setEditing(d);
    setFormOpen(true);
  };

  const handleSubmit = async (input: any) => {
    let registroId: string | undefined = editing?.id;
    if (editing) await update.mutateAsync({ id: editing.id, patch: input });
    else {
      const criada: any = await create.mutateAsync(input);
      registroId = criada?.id;
    }
    // Cadastre uma vez, use em todo o CRM: joga os dados para o cadastro central.
    await sincronizar(
      {
        nome: input?.cliente ?? "",
        endereco: input?.endereco ?? null,
        bairro: input?.bairro ?? null,
        cidade: input?.cidade ?? null,
        contato: input?.contato_cliente ?? null,
      },
      { modulo: "Degustações", registroId: registroId ?? null },
    );
  };


  const handleDuplicateOne = (d: Degustacao) => {
    setDupActionSources([d]);
    setDupActionOpen(true);
  };

  const handleDuplicateBatchClick = () => {
    if (degustacoesSelecionadas.length > 0) {
      setDupActionSources(degustacoesSelecionadas);
      setDupActionOpen(true);
    } else {
      setDupOpen(true);
    }
  };

  const handleConfirmRealizada = async (d: Degustacao) => {
    await update.mutateAsync({ id: d.id, patch: { status: "realizada" } });
  };

  const warnNoSelection = () => {
    toast({
      title: "Selecione ao menos uma degustação para gerar o relatório.",
      variant: "destructive",
    });
  };

  const buildFileName = (rows: Degustacao[]) => {
    const fmt = (iso: string) => format(parseISO(iso), "dd-MM-yyyy", { locale: ptBR });
    const datasUnicas = Array.from(new Set(rows.map((d) => d.data))).sort();

    if (datasUnicas.length === 1) return `degustações-${fmt(datasUnicas[0])}.pdf`;
    if (datasUnicas.length > 1) return `degustações-${fmt(datasUnicas[0])}-a-${fmt(datasUnicas[datasUnicas.length - 1])}.pdf`;
    return `degustações-geral.pdf`;
  };

  /** Valida que o conjunto enviado ao PDF é exatamente o marcado na tela. */
  const validarSelecaoPdf = () => {
    if (degustacoesSelecionadas.length === 0) {
      warnNoSelection();
      return false;
    }
    const idsMarcados = [...visibleSelectedIds].sort().join("|");
    const idsEnviados = degustacoesSelecionadas.map((d) => d.id).sort().join("|");
    if (idsMarcados !== idsEnviados || visibleSelectedIds.length !== degustacoesSelecionadas.length) {
      console.error("[Degustacoes] divergência de seleção no PDF", {
        marcados: visibleSelectedIds.length,
        enviados: degustacoesSelecionadas.length,
        idsMarcados,
        idsEnviados,
      });
      toast({
        title: "Divergência na seleção",
        description: "A lista do PDF não corresponde às degustações marcadas. Refaça a seleção.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const exportPDF = async () => {
    if (!validarSelecaoPdf()) return;
    // iOS: a aba precisa ser aberta ainda no gesto do toque.
    const preopened = preopenPdfTab();
    setPreviewOpen(true);

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const element = previewReportRef.current;
    if (!element) {
      preopened?.close();
      toast({ title: "Não foi possível localizar a pré-visualização para exportar.", variant: "destructive" });
      return;
    }

    const headerEl = element.querySelector<HTMLElement>("[data-report-header]");
    const cardEls = Array.from(element.querySelectorAll<HTMLElement>("[data-report-card]"));

    const renderToImage = async (node: HTMLElement) => {
      const canvas = await html2canvas(node, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: element.scrollWidth,
      });
      return {
        data: canvas.toDataURL("image/png", 1),
        ratio: canvas.height / canvas.width,
      };
    };

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const gap = 3;

    let cursorY = margin;

    const addBlock = (img: { data: string; ratio: number }, allowSplit: boolean) => {
      const blockHeight = usableWidth * img.ratio;

      if (allowSplit && blockHeight > usableHeight) {
        // Block is taller than a page – split it across multiple pages.
        let remaining = blockHeight;
        let yOffset = cursorY;
        // First slice on current page
        let firstSlice = usableHeight - (cursorY - margin);
        if (firstSlice < usableHeight * 0.2) {
          pdf.addPage();
          cursorY = margin;
          yOffset = margin;
          firstSlice = usableHeight;
        }
        pdf.addImage(img.data, "PNG", margin, yOffset, usableWidth, blockHeight, undefined, "FAST");
        remaining -= firstSlice;
        while (remaining > 0) {
          pdf.addPage();
          const y = margin - (blockHeight - remaining);
          pdf.addImage(img.data, "PNG", margin, y, usableWidth, blockHeight, undefined, "FAST");
          remaining -= usableHeight;
        }
        cursorY = margin + (usableHeight - (remaining + usableHeight)); // reset to bottom of last slice
        cursorY = margin + ((blockHeight % usableHeight) || usableHeight) + gap;
        if (cursorY > pageHeight - margin) cursorY = margin;
        return;
      }

      if (cursorY + blockHeight > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
      }
      pdf.addImage(img.data, "PNG", margin, cursorY, usableWidth, blockHeight, undefined, "FAST");
      cursorY += blockHeight + gap;
    };

    if (headerEl) {
      const headerImg = await renderToImage(headerEl);
      addBlock(headerImg, false);
    }

    for (const cardEl of cardEls) {
      const cardImg = await renderToImage(cardEl);
      addBlock(cardImg, true);
    }

    savePdfDoc(pdf, buildFileName(degustacoesSelecionadas), {
      preopened,
      onError: (message) => toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" }),
    });
  };

  const exportExcel = () => {
    if (degustacoesSelecionadas.length === 0) {
      warnNoSelection();
      return;
    }
    const rows = degustacoesSelecionadas;

    const data = rows.map((d) => {
      const realizada = d.status === "realizada";
      const produtosTxt = realizada
        ? ""
        : isSemProdutos(d.produtos)
          ? LABEL_SEM_PRODUTOS
          : produtosVisiveis(d.produtos)
              .map((p) => `• ${formatProductDisplay(p.nome)} — ${p.quantidade} unid.`)
              .join("\n");
      const qtdProdutos = realizada
        ? ""
        : produtosVisiveis(d.produtos).reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
      const equipamentosTxt = realizada
        ? ""
        : isSemEquipamentos(d.equipamentos)
          ? LABEL_SEM_EQUIPAMENTOS
          : equipamentosVisiveis(d.equipamentos).map((e) => `• ${e}`).join("\n");
      const materiaisTxt = realizada
        ? ""
        : isSemMateriais(d.materiais)
          ? LABEL_SEM_MATERIAIS
          : materiaisVisiveis(d.materiais).map((m) => `• ${m}`).join("\n");

      return {
        Status: realizada ? "REALIZADA" : STATUS_META[d.status].label,
        Data: format(parseISO(d.data), "dd/MM/yyyy", { locale: ptBR }),
        Cliente: d.cliente,
        Promotoras: promotorasDetalhe(d),
        "Qtd. promotoras": promotorasDaDegustacao(d).length,
        "Custo promotoras": custoTotalPromotoras(d),
        "Horas do evento": Number(d.horas_evento ?? 4) || 4,
        Endereço: d.endereco ?? "",
        Bairro: d.bairro ?? "",
        Cidade: d.cidade ?? "",
        Produtos: produtosTxt,
        "Quantidade de produtos": qtdProdutos === "" ? "" : qtdProdutos,
        Equipamentos: equipamentosTxt,
        Materiais: materiaisTxt,
        Observações: d.observacoes ?? "",
      };
    });

    const headers = [
      "Status", "Data", "Cliente", "Promotoras", "Qtd. promotoras", "Custo promotoras", "Horas do evento", "Endereço", "Bairro", "Cidade",
      "Produtos", "Quantidade de produtos", "Equipamentos", "Materiais", "Observações",
    ];
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });

    // Larguras das colunas
    const widths = [16, 12, 32, 20, 36, 22, 18, 40, 12, 28, 28, 36];
    ws["!cols"] = widths.map((w) => ({ wch: w }));


    // Congelar cabeçalho + autofilter
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    (ws as any)["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: headers.length - 1 } }) };

    // Estilo cabeçalho (laranja/âmbar do sistema) e wrap text
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      const cell = ws[addr];
      if (cell) {
        cell.s = {
          fill: { patternType: "solid", fgColor: { rgb: "D9A238" } },
          font: { bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      }
    }
    for (let R = 1; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell) {
          cell.s = { ...(cell.s ?? {}), alignment: { wrapText: true, vertical: "top" } };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Degustações");
    const today = format(new Date(), "dd-MM-yyyy", { locale: ptBR });
    XLSX.writeFile(wb, `degustacoes_${today}.xlsx`);
  };


  const [previewOpen, setPreviewOpen] = useState(false);
  const visualizarPDF = () => {
    if (!validarSelecaoPdf()) return;
    setPreviewOpen(true);
  };

  const periodoLabel = (() => {
    if (fDataInicio && fDataFim)
      return `${format(parseISO(fDataInicio), "dd/MM/yyyy", { locale: ptBR })} a ${format(parseISO(fDataFim), "dd/MM/yyyy", { locale: ptBR })}`;
    if (fDataInicio) return `A partir de ${format(parseISO(fDataInicio), "dd/MM/yyyy", { locale: ptBR })}`;
    if (fDataFim) return `Até ${format(parseISO(fDataFim), "dd/MM/yyyy", { locale: ptBR })}`;
    return "Todas as datas";
  })();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold">Degustações</h1>
            <p className="text-sm text-muted-foreground">
              Gestão de degustações e promotoras nos clientes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDuplicateBatchClick}>
              <Copy className="h-4 w-4 mr-2" />
              {degustacoesSelecionadas.length > 0
                ? `Duplicar ${degustacoesSelecionadas.length} selecionada(s)`
                : "Duplicar degustações"}
            </Button>
            <Button variant="outline" onClick={visualizarPDF}>
              <Eye className="h-4 w-4 mr-2" /> Visualizar PDF
              {selectedDegustacaoIds.length > 0 ? ` — ${selectedDegustacaoIds.length} selecionada(s)` : ""}
            </Button>
            <Button variant="outline" onClick={exportPDF}>
              <FileDown className="h-4 w-4 mr-2" /> Exportar PDF
              {selectedDegustacaoIds.length > 0 ? ` — ${selectedDegustacaoIds.length} selecionada(s)` : ""}
            </Button>
            <Button variant="outline" onClick={exportExcel} className="border-amber-500/40 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
            <PodeCriar modulo={'degustacoes'}><Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Nova Degustação
            </Button></PodeCriar>
          </div>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Data inicial</Label>
              <Input type="date" value={fDataInicio} onChange={(e) => setFDataInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data final</Label>
              <Input type="date" value={fDataFim} onChange={(e) => setFDataFim(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Cliente</Label>
              <Input value={fCliente} onChange={(e) => setFCliente(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <Label className="text-xs">Bairro</Label>
              <Input value={fBairro} onChange={(e) => setFBairro(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <Label className="text-xs">Promotora</Label>
              <Input value={fPromotora} onChange={(e) => setFPromotora(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="realizada">Realizada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>

              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Ordenar por</Label>
              <Select value={fOrdem} onValueChange={(v) => setFOrdem(v as OrdemDegustacao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDEM_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {fDataInicio && fDataFim && fDataFim < fDataInicio && (
            <p className="text-xs text-destructive mt-2">A data final precisa ser maior ou igual à data inicial.</p>
          )}
        </Card>

        {/* Barra de seleção em massa */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(c) => toggleSelectAll(!!c)}
              />
              <span className="text-sm font-medium">Selecionar todas</span>
              <span className="text-xs text-muted-foreground">
                ({visibleSelectedIds.length} de {filtered.length})
              </span>
            </label>

            {visibleSelectedIds.length > 0 && (
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  Mudar status das selecionadas:
                </span>
                <Select value="" onValueChange={(v) => handleBulkStatusChoose(v as DegustacaoStatus)}>
                  <SelectTrigger className="h-9 w-[230px]">
                    <SelectValue placeholder="Escolher novo status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>

                </Select>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Limpar
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Desktop table */}
        <Card className="hidden md:block overflow-hidden">
          <div className="sheet-table overflow-auto max-h-[calc(100vh-320px)]">
            <table className="w-full text-sm table-fixed min-w-[1600px]">
              <colgroup>
                <col className="w-10" />
                <col className="w-[180px]" />
                <col className="w-[110px]" />
                <col className="w-[420px]" />
                <col className="w-[180px]" />
                <col className="w-[320px]" />
                <col className="w-[170px]" />
                <col className="w-[140px]" />
                <col className="w-[100px]" />
              </colgroup>
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr className="text-left">
                  <th className="p-3">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(c) => toggleSelectAll(!!c)}
                    />
                  </th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Data</th>
                  <th className="p-3 font-medium">Cliente</th>
                  <th className="p-3 font-medium">Promotoras</th>
                  <th className="p-3 font-medium">Endereço</th>
                  <th className="p-3 font-medium">Bairro</th>
                  <th className="p-3 font-medium">Cidade</th>
                  <th className="p-3 font-medium">Horário</th>
                </tr>
              </thead>
              {filtered.length === 0 && (
                <tbody>
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhuma degustação</td></tr>
                </tbody>
              )}
              {filtered.map((d) => (
                <tbody key={d.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <tr className="align-top">
                    <td className="p-3 pb-1">
                      <Checkbox
                        checked={selectedDegustacaoIds.includes(d.id)}
                        onCheckedChange={(c) => toggleOne(d.id, !!c)}
                      />
                    </td>
                    <td className="p-3 pb-1">
                      <Select value={d.status} onValueChange={(v) => update.mutate({ id: d.id, patch: { status: v as DegustacaoStatus } })}>
                        <SelectTrigger className={`h-8 w-full border ${STATUS_META[d.status].className}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="realizada">Realizada</SelectItem>
                          <SelectItem value="cancelada">Cancelada</SelectItem>
                        </SelectContent>

                      </Select>
                    </td>
                    <td className="p-3 pb-1 whitespace-nowrap">{format(parseISO(d.data), "dd/MM/yyyy", { locale: ptBR })}</td>
                    <td className="p-3 pb-1 font-medium truncate" title={d.cliente}>{d.cliente}</td>
                    <td className="p-3 pb-1 truncate" title={promotorasDetalhe(d)}>
                      {promotorasLabel(d)}
                      {promotorasDaDegustacao(d).length > 1 && (
                        <span className="ml-1 text-xs text-muted-foreground">({promotorasDaDegustacao(d).length})</span>
                      )}
                    </td>
                    <td className="p-3 pb-1 text-muted-foreground truncate" title={d.endereco ?? ""}>{d.endereco}</td>
                    <td className="p-3 pb-1 truncate" title={d.bairro ?? ""}>{d.bairro}</td>
                    <td className="p-3 pb-1 truncate" title={d.cidade ?? ""}>{d.cidade}</td>
                    <td className="p-3 pb-1 whitespace-nowrap">{formatHorarioRaw(d.horario)}</td>
                  </tr>


                  <tr>
                    <td></td>
                    <td colSpan={8} className="px-3 pb-3 pt-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <RowActions
                          d={d}
                          onEdit={() => openEdit(d)}
                          onDuplicate={() => handleDuplicateOne(d)}
                          onConfirm={() => handleConfirmRealizada(d)}
                          onDelete={() => setDeleteTarget(d)}
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
        </Card>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {filtered.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground">Nenhuma degustação</Card>
          )}
          {filtered.map((d) => (
            <Card key={d.id} className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={selectedDegustacaoIds.includes(d.id)}
                  onCheckedChange={(c) => toggleOne(d.id, !!c)}
                  className="mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="font-semibold text-sm leading-snug break-words"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {d.cliente}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {format(parseISO(d.data), "dd/MM/yyyy", { locale: ptBR })}
                    {formatHorarioRaw(d.horario) && ` • ${formatHorarioRaw(d.horario)}`}
                  </p>
                </div>
                <div className="shrink-0 -mr-1">
                  <RowActions
                    d={d}
                    onEdit={() => openEdit(d)}
                    onDuplicate={() => handleDuplicateOne(d)}
                    onConfirm={() => handleConfirmRealizada(d)}
                    onDelete={() => setDeleteTarget(d)}
                    compact
                  />
                </div>
              </div>
              {d.endereco && <p className="text-sm">{d.endereco}</p>}
              {d.bairro && <p className="text-xs text-muted-foreground">Bairro: {d.bairro}</p>}
              {d.cidade && <p className="text-xs text-muted-foreground">Cidade: {d.cidade}</p>}
              <p className="text-xs text-muted-foreground">Horas do evento: {Number(d.horas_evento ?? 4) || 4}h</p>
              {isSemPromotora(d) ? (
                <p className="text-xs text-muted-foreground">Promotora: {LABEL_SEM_PROMOTORA}</p>
              ) : promotorasDaDegustacao(d).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p>Promotoras ({promotorasDaDegustacao(d).length}):</p>
                  {promotorasDaDegustacao(d).map((p, i) => (
                    <p key={i}>• {p.nome || `Promotora ${i + 1}`} — {moneyBr(p.valor)}</p>
                  ))}
                  <p>Total: {moneyBr(custoTotalPromotoras(d))}</p>
                </div>
              )}
              <Badge className={`border ${STATUS_META[d.status].className}`}>
                {STATUS_META[d.status].label}
              </Badge>
            </Card>
          ))}
        </div>
      </div>

      <DegustacaoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSubmit={handleSubmit}
        extraClientes={extraClientes}
      />
      <SincronizarCadastroDialog {...syncDialogProps} />

      <DuplicarDegustacoesDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        all={all}
        onConfirm={async (rows) => await bulkInsert.mutateAsync(rows)}
        onUpdateDate={async (id, data) => { await update.mutateAsync({ id, patch: { data } }); }}
      />
      <DuplicateActionDialog
        open={dupActionOpen}
        onOpenChange={(o) => {
          setDupActionOpen(o);
          if (!o) setDupActionSources([]);
        }}
        sources={dupActionSources}
        onConfirm={async (rows) => {
          await bulkInsert.mutateAsync(rows);
          clearSelection();
        }}
      />
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>Pré-visualização do relatório</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 p-6">
            <div ref={previewReportRef} className="mx-auto max-w-4xl bg-white text-slate-900 shadow-md rounded-md p-8 space-y-4 print:shadow-none print:rounded-none">
              <div data-report-header className="border-b pb-3">
                <h2 className="text-xl font-bold">Relatório de Degustações</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Emitido em: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
                <p className="text-xs text-slate-600">Período: {periodoLabel}</p>
                <p className="text-xs text-slate-600">Total de registros: {degustacoesSelecionadas.length}</p>
              </div>
              {degustacoesSelecionadas.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Selecione ao menos uma degustação para gerar o relatório.</p>
              ) : (
                <div className="space-y-3">
                  {degustacoesSelecionadas.map((d) => (
                    <div
                      key={d.id}
                      data-report-card
                      className="border border-slate-200 rounded-md p-3 text-xs space-y-1"
                      style={{ pageBreakInside: "avoid", breakInside: "avoid", height: "auto", overflow: "visible" }}
                    >
                      <div className="flex flex-wrap justify-between gap-2 pb-1 border-b border-slate-100">
                        <div>
                          <p className="font-semibold text-sm">{d.cliente}</p>
                          {d.contato_cliente && <p className="text-slate-600">Contato: {d.contato_cliente}</p>}
                        </div>
                        <span className="font-medium">{STATUS_META[d.status].label}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-0.5">
                        <p><b>Data da Degustação:</b> {format(parseISO(d.data), "dd/MM/yyyy", { locale: ptBR })}</p>
                        {isSemPromotora(d) ? (
                          <p><b>Promotora:</b> {LABEL_SEM_PROMOTORA}</p>
                        ) : promotorasDaDegustacao(d).length > 0 && (
                          <p>
                            <b>Promotoras ({promotorasDaDegustacao(d).length}):</b> {promotorasDetalhe(d)} · Total: {moneyBr(custoTotalPromotoras(d))}
                          </p>
                        )}
                        {d.bairro && <p><b>Bairro:</b> {d.bairro}</p>}
                        {d.cidade && <p><b>Cidade:</b> {d.cidade}</p>}
                        {d.data_entrega_materiais && (
                          <p><b>Entrega de Materiais:</b> {format(parseISO(d.data_entrega_materiais), "dd/MM/yyyy", { locale: ptBR })}</p>
                        )}
                        {d.horario && <p><b>Horário:</b> {formatHorarioRaw(d.horario)}</p>}
                        <p><b>Horas do evento:</b> {Number(d.horas_evento ?? 4) || 4}h</p>
                      </div>
                      {d.endereco && <p><b>Endereço:</b> {d.endereco}</p>}

                      {d.status !== "realizada" && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 pt-2 items-stretch">
                          <div className="md:col-span-3 rounded border border-slate-200 bg-slate-50 p-2 min-w-0 h-full" style={{ overflow: "visible" }}>
                            <p className="font-semibold text-[11px] uppercase tracking-wide text-amber-700 mb-1">Materiais</p>
                            {isSemMateriais(d.materiais) ? (
                              <p className="italic text-slate-500">{LABEL_SEM_MATERIAIS}</p>
                            ) : materiaisVisiveis(d.materiais).length > 0 ? (
                              <ul className="space-y-0.5">
                                {materiaisVisiveis(d.materiais).map((m) => (
                                  <li key={m} className="whitespace-nowrap">• {m}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="italic text-slate-400">—</p>
                            )}
                          </div>
                          <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 p-2 min-w-0 h-full" style={{ overflow: "visible" }}>
                            <p className="font-semibold text-[11px] uppercase tracking-wide text-amber-700 mb-1">Equipamentos</p>
                            {isSemEquipamentos(d.equipamentos) ? (
                              <p className="italic text-slate-500">{LABEL_SEM_EQUIPAMENTOS}</p>
                            ) : equipamentosVisiveis(d.equipamentos).length > 0 ? (
                              <ul className="space-y-0.5">
                                {equipamentosVisiveis(d.equipamentos).map((e) => (
                                  <li key={e} className="whitespace-nowrap">• {e}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="italic text-slate-400">—</p>
                            )}
                          </div>
                          <div className="md:col-span-7 rounded border border-amber-200 bg-amber-50/40 p-2.5 min-w-0 h-full" style={{ overflow: "visible" }}>
                            <p className="font-semibold text-[11px] uppercase tracking-wide text-amber-700 mb-1">Produtos</p>
                            {isSemProdutos(d.produtos) ? (
                              <p className="italic text-slate-500">{LABEL_SEM_PRODUTOS}</p>
                            ) : produtosVisiveis(d.produtos).length > 0 ? (
                              <ul className="space-y-1 text-[12.5px] leading-snug">
                                {produtosVisiveis(d.produtos).map((p) => (
                                  <li
                                    key={p.produto_id}
                                    className="whitespace-nowrap"
                                    title={`${formatProductDisplay(p.nome)} — ${p.quantidade} unid.`}
                                  >
                                    • {formatProductDisplay(p.nome)} — {p.quantidade} unid.
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="italic text-slate-400">—</p>
                            )}
                          </div>
                        </div>
                      )}

                      {d.observacoes && <p><b>Obs:</b> {d.observacoes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-3 border-t">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
            <Button onClick={exportPDF}>
              <FileDown className="h-4 w-4 mr-2" /> Exportar PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir degustação?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir esta degustação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) await remove.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de alteração em massa */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja alterar o status de <strong>{visibleSelectedIds.length}</strong> degustações para{" "}
              <strong>{bulkStatus ? STATUS_FULL_LABEL[bulkStatus] : ""}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkStatus("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkConfirm}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function RowActions({
  d, onEdit, onDuplicate, onConfirm, onDelete, compact = false,
}: {
  d: Degustacao;
  onEdit: () => void;
  onDuplicate: () => void;
  onConfirm: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 ${compact ? "flex-wrap justify-end" : "justify-end"}`}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={onEdit}
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Editar</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2"
        onClick={onDuplicate}
        title="Duplicar"
      >
        <Copy className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Duplicar</span>
      </Button>
      {d.status !== "realizada" && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-green-700 dark:text-green-300 border-green-300 hover:bg-green-50 dark:hover:bg-green-500/10"
          onClick={onConfirm}
          title="Confirmar realização"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={onDelete}
        title="Excluir"
      >
        <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Excluir</span>
      </Button>
    </div>
  );
}
