import { PodeCriar } from "@/components/PodeCriar";
import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useCrm } from "@/contexts/CrmContext";
import { PIPELINE_STAGES, Lead, PipelineStatus, VisitaStatus, NegocioStatus, ProdutoNegociado, CATALOGO_PRODUTOS, TIPO_ATENDIMENTO_OPTIONS, TipoAtendimento, SEGMENTOS } from "@/types/crm";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { REGIONAIS_BH } from "@/data/bhBairrosRegionais";
import { normalizeBairro, matchBairroRegional } from "@/lib/bairroNormalization";
import { CityBadge } from "@/components/CityBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { GripVertical, MapPin, Package, Building2, Plus, Filter, X, CalendarPlus, MessageSquare, ChevronRight, CheckCircle, XCircle, Handshake, ArrowDownAZ, ArrowUpDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phoneFormatting";
import { toast } from "@/hooks/use-toast";
import { ProspectFormDialog } from "@/components/ProspectFormDialog";
import { AgendarVisitaDialog } from "@/components/AgendarVisitaDialog";
import { FeedbackVisitaDialog } from "@/components/FeedbackVisitaDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePersistentState } from "@/hooks/usePersistentState";
import { EscopoUsuarioBar } from "@/components/EscopoUsuarioBar";

export default function ProspeccaoPage() {
  const { leads, visitas, justificativas, addLead, updateLead, deleteLead, moverPipeline, agendarVisita, darFeedbackVisita, concluirVisitaComResultado, reagendarVisita, getVisitasByLead, addJustificativa } = useCrm();

  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // Agendar
  const [agendarLeadId, setAgendarLeadId] = useState<string | null>(null);
  const [agendarLeadNome, setAgendarLeadNome] = useState("");
  
  // Feedback
  const [feedbackVisitaId, setFeedbackVisitaId] = useState<string | null>(null);
  const [feedbackLeadId, setFeedbackLeadId] = useState<string | null>(null);
  const [feedbackLeadNome, setFeedbackLeadNome] = useState("");

  // Drag and drop
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [deleteConfirmLead, setDeleteConfirmLead] = useState<Lead | null>(null);
  const [deleteMotivo, setDeleteMotivo] = useState("");
  const [encerrarLead, setEncerrarLead] = useState<Lead | null>(null);
  const [encerrarMotivo, setEncerrarMotivo] = useState("");
  const [dragOverStage, setDragOverStage] = useState<PipelineStatus | null>(null);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e: React.DragEvent, stageKey: PipelineStatus) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageKey) {
      setDragOverStage(stageKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the column container itself, not a child
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStage: PipelineStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStage(null);

    if (draggedLeadId) {
      const lead = leads.find(l => l.id === draggedLeadId);
      if (lead && lead.status_pipeline !== targetStage) {
        if (targetStage === 'NEGOCIACAO_ENCERRADA') {
          setEncerrarLead(lead);
          setEncerrarMotivo(lead.motivo_encerramento || "");
        } else {
          moverPipeline(draggedLeadId, targetStage);
          const stageLabel = PIPELINE_STAGES.find(s => s.key === targetStage)?.label || targetStage;
          toast({ title: "Lead movido!", description: `${lead.nome_fantasia} → ${stageLabel}` });
        }
      }
    }

    setDraggedLeadId(null);
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverStage(null);
    setDragOverStage(null);
  };

  // Filters
  const [filterRegional, setFilterRegional] = usePersistentState<string[]>("prospeccao:filterRegional", []);
  const [filterBairro, setFilterBairro] = usePersistentState<string[]>("prospeccao:filterBairro", []);
  const [filterProduto, setFilterProduto] = usePersistentState<string[]>("prospeccao:filterProduto", []);
  const [filterConcorrente, setFilterConcorrente] = usePersistentState<string[]>("prospeccao:filterConcorrente", []);
  const [filterTipoAtendimento, setFilterTipoAtendimento] = usePersistentState<string[]>("prospeccao:filterTipoAtendimento", []);
  const [filterSegmento, setFilterSegmento] = usePersistentState<string[]>("prospeccao:filterSegmento", []);
  const [filterCidade, setFilterCidade] = usePersistentState<string[]>("prospeccao:filterCidade", []);
  const [filterCliente, setFilterClienteRaw] = usePersistentState<string[]>("prospeccao:filterCliente", []);
  const setFilterCliente = (val: string[]) => {
    setFilterClienteRaw(val);
    // When client filter is cleared to "Todos", clear all other filters too
    if (val.length === 0) {
      setFilterRegional([]);
      setFilterBairro([]);
      setFilterCidade([]);
      setFilterProduto([]);
      setFilterConcorrente([]);
      setFilterTipoAtendimento([]);
      setFilterSegmento([]);
    }
  };
  const [sortOrder, setSortOrder] = usePersistentState<string>("prospeccao:sortOrder", 'cadastro_desc');
  const [showFilters, setShowFilters] = usePersistentState("prospeccao:showFilters", false);

  const hasActiveFilters = filterRegional.length > 0 || filterBairro.length > 0 || filterProduto.length > 0 || filterConcorrente.length > 0 || filterCliente.length > 0 || filterTipoAtendimento.length > 0 || filterSegmento.length > 0 || filterCidade.length > 0 || sortOrder !== 'cadastro_desc';
  const clearFilters = () => { setFilterRegional([]); setFilterBairro([]); setFilterProduto([]); setFilterConcorrente([]); setFilterCliente([]); setFilterTipoAtendimento([]); setFilterSegmento([]); setFilterCidade([]); setSortOrder('cadastro_desc'); };

  const bairros = useMemo(() => {
    const seen = new Map<string, string>(); // normalized -> display name
    for (const l of leads) {
      if (!l.bairro) continue;
      const norm = normalizeBairro(l.bairro);
      if (!seen.has(norm)) {
        // Try to find official name
        const match = matchBairroRegional(l.bairro);
        if (match.matches.length > 0) {
          // Use title-case official name
          const oficial = match.matches[0].bairro_oficial;
          seen.set(norm, oficial.charAt(0) + oficial.slice(1).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+D([aeiou])\b/gi, (m, v) => ` d${v.toLowerCase()}`));
          // Simpler: just use the bairro_oficial in title case
          const words = oficial.split(' ').map(w => {
            if (['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(w)) return w.toLowerCase();
            return w.charAt(0) + w.slice(1).toLowerCase();
          });
          seen.set(norm, words.join(' '));
        } else {
          seen.set(norm, l.bairro);
        }
      }
    }
    return [...new Set(seen.values())].sort();
  }, [leads]);
  const regionaisUsadas = useMemo(() => [...REGIONAIS_BH].sort() as string[], []);
  const produtosUnicos = useMemo(() => {
    const fromCatalog = CATALOGO_PRODUTOS.filter(p => p.ativo).map(p => p.nome);
    const fromLeads = leads.flatMap(l => l.produtosInteresse || []);
    return [...new Set([...fromCatalog, ...fromLeads])].sort();
  }, [leads]);
  const concorrentesUnicos = useMemo(() => [...new Set(leads.map(l => l.concorrente).filter(Boolean))].sort() as string[], [leads]);
  const clientesUnicos = useMemo(() => [...new Set(leads.map(l => l.nome_fantasia).filter(Boolean))].sort() as string[], [leads]);
  const cidadesUnicas = useMemo(() => [...new Set(leads.map(l => (l.cidade || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')) as string[], [leads]);

  const filteredLeads = useMemo(() => {
    const filtered = leads.filter(l => {
      // Cliente filter overrides all other filters
      if (filterCliente.length > 0) {
        return filterCliente.includes(l.nome_fantasia || '');
      }
      if (filterRegional.length > 0 && !filterRegional.includes(l.regional || '')) return false;
      if (filterBairro.length > 0 && !filterBairro.some(fb => normalizeBairro(fb) === normalizeBairro(l.bairro || ''))) return false;
      if (filterProduto.length > 0 && !(l.produtosInteresse || []).some(p => filterProduto.includes(p))) return false;
      if (filterConcorrente.length > 0 && !filterConcorrente.includes(l.concorrente || '')) return false;
      if (filterTipoAtendimento.length > 0) {
        const tipoLabel = TIPO_ATENDIMENTO_OPTIONS.find(o => o.value === l.tipo_atendimento)?.label;
        if (!tipoLabel || !filterTipoAtendimento.includes(tipoLabel)) return false;
      }
      if (filterSegmento.length > 0 && !filterSegmento.includes(l.segmento || '')) return false;
      if (filterCidade.length > 0 && !filterCidade.includes((l.cidade || '').trim())) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortOrder) {
        case 'alfa_asc':
          return a.nome_fantasia.localeCompare(b.nome_fantasia, 'pt-BR');
        case 'alfa_desc':
          return b.nome_fantasia.localeCompare(a.nome_fantasia, 'pt-BR');
        case 'cadastro_asc':
          return (a.atualizado_em || a.criado_em || '').localeCompare(b.atualizado_em || b.criado_em || '');
        case 'cadastro_desc':
        default:
          return (b.atualizado_em || b.criado_em || '').localeCompare(a.atualizado_em || a.criado_em || '');
      }
    });
  }, [leads, filterRegional, filterBairro, filterProduto, filterConcorrente, filterCliente, filterTipoAtendimento, filterSegmento, filterCidade, sortOrder]);

  const handleFormSave = (data: any) => {
    if (editingLead) {
      updateLead(editingLead.id, {
        nome_fantasia: data.empresa,
        segmento: data.segmento,
        agendado_por: data.agendadoPor,
        tipo_atendimento: data.tipoAtendimento,
        contato_nome: data.contato,
        telefone: data.telefone,
        whatsapp: data.whatsapp,
        cidade: data.cidade,
        bairro: data.bairro,
        regional: data.regional,
        regional_status: data.regional_status,
        regional_confianca: data.regional_confianca,
        endereco: data.endereco,
        complemento: (data as any).complemento,
        demanda: data.demanda,
        demandaQuantidade: data.demandaQuantidade,
        demandaFrequencia: data.demandaFrequencia,
        paoQueijo: data.paoQueijo,
        recheado: data.recheado,
        empanado: data.empanado,
        biscoito: data.biscoito,
        concorrente: data.concorrente,
        valorConcorrente: data.valorConcorrente,
        produtosInteresse: data.produtosInteresse,
        observacoes: data.observacoes,
      });
      toast({ title: "Lead atualizado!", description: `${data.empresa} foi atualizado.` });
    } else {
      addLead({
        nome_fantasia: data.empresa,
        segmento: data.segmento,
        agendado_por: data.agendadoPor,
        tipo_atendimento: data.tipoAtendimento,
        contato_nome: data.contato,
        telefone: data.telefone,
        whatsapp: data.whatsapp,
        cidade: data.cidade,
        bairro: data.bairro,
        regional: data.regional,
        regional_status: data.regional_status,
        regional_confianca: data.regional_confianca,
        endereco: data.endereco,
        complemento: (data as any).complemento,
        demanda: data.demanda,
        demandaQuantidade: data.demandaQuantidade,
        demandaFrequencia: data.demandaFrequencia,
        paoQueijo: data.paoQueijo,
        recheado: data.recheado,
        empanado: data.empanado,
        biscoito: data.biscoito,
        concorrente: data.concorrente,
        valorConcorrente: data.valorConcorrente,
        produtosInteresse: data.produtosInteresse,
        observacoes: data.observacoes,
      });
      toast({ title: "Lead adicionado!", description: `${data.empresa} — Aguardando Agendamento.` });
    }
    setEditingLead(null);
  };

  const openAgendar = (lead: Lead, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setAgendarLeadId(lead.id);
    setAgendarLeadNome(lead.nome_fantasia);
  };

  const [feedbackLeadProdutos, setFeedbackLeadProdutos] = useState<string[]>([]);

  const openFeedback = (lead: Lead, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const agendada = visitas.find(v => v.lead_id === lead.id && v.status === 'AGENDADA');
    if (agendada) {
      setFeedbackVisitaId(agendada.id);
      setFeedbackLeadId(lead.id);
      setFeedbackLeadNome(lead.nome_fantasia);
      setFeedbackLeadProdutos(lead.produtosInteresse || []);
    }
  };

  const handleAgendarConfirm = (dataVisita: string, horario?: string, notas?: string, tipoAtendimento?: TipoAtendimento) => {
    if (agendarLeadId) {
      agendarVisita(agendarLeadId, dataVisita, horario, notas);
      if (tipoAtendimento) {
        updateLead(agendarLeadId, { tipo_atendimento: tipoAtendimento });
      }
      const horarioStr = horario ? ` às ${horario}` : '';
      toast({ title: "✅ Visita agendada!", description: `Visita marcada para ${format(new Date(dataVisita + 'T12:00:00'), "dd/MM/yyyy")}${horarioStr}.` });
    }
    setAgendarLeadId(null);
  };

  const handleNaoConcluida = () => {
    if (feedbackVisitaId) {
      darFeedbackVisita(feedbackVisitaId, 'NAO_CONCLUIDA');
      toast({ title: 'Visita não concluída. Reagende abaixo.' });
    }
  };

  const handleConcluir = (resultado: NegocioStatus, justificativaId?: string, motivo?: string, produtosNegociados?: ProdutoNegociado[]) => {
    if (feedbackVisitaId) {
      concluirVisitaComResultado(feedbackVisitaId, resultado, justificativaId, motivo, produtosNegociados);
      toast({ title: resultado === 'FECHADO' ? '🎉 Negócio fechado! Lead em Negociação.' : 'Negociação encerrada.' });
    }
  };

  const handleReagendar = (novaData: string, notas?: string) => {
    if (feedbackLeadId) {
      reagendarVisita(feedbackLeadId, novaData, undefined, notas);
      toast({ title: "📅 Visita reagendada!", description: `Nova visita em ${format(new Date(novaData + 'T12:00:00'), "dd/MM/yyyy")}.` });
    }
    setFeedbackVisitaId(null);
    setFeedbackLeadId(null);
  };

  const stageColorMap: Record<string, string> = {
    AGUARDANDO_AGENDAMENTO: 'border-t-info',
    AGENDADO: 'border-t-warning',
    VISITA_AGENDADA: 'border-t-[hsl(280,60%,50%)]',
    EM_NEGOCIACAO: 'border-t-info',
    NEGOCIACAO_CONCRETIZADA: 'border-t-[hsl(142,60%,40%)]',
    NEGOCIACAO_ENCERRADA: 'border-t-destructive',
  };

  // Convert Lead to Prospect-like for form dialog compatibility
  const leadToProspect = (l: Lead) => ({
    id: l.id,
    empresa: l.nome_fantasia,
    segmento: l.segmento,
    agendado_por: l.agendado_por,
    tipo_atendimento: l.tipo_atendimento,
    contato: l.contato_nome,
    telefone: l.telefone,
    cidade: l.cidade,
    bairro: l.bairro,
    regional: l.regional,
    regional_status: l.regional_status,
    regional_confianca: l.regional_confianca,
    regional_fonte: l.regional_fonte,
    endereco: l.endereco,
    complemento: (l as any).complemento,
    demanda: l.demanda,
    demandaQuantidade: l.demandaQuantidade,
    demandaFrequencia: l.demandaFrequencia,
    paoQueijo: l.paoQueijo,
    recheado: l.recheado,
    empanado: l.empanado,
    concorrente: l.concorrente,
    valorConcorrente: l.valorConcorrente,
    produtosInteresse: l.produtosInteresse,
    observacoes: l.observacoes,
    etapa: 'lead_novo' as const,
    createdAt: l.criado_em,
  });

  const produtoLabel = (p: Lead['paoQueijo'], name: string) => {
    if (!p) return null;
    return p.trabalha
      ? `${name}: Sim${p.marca ? ` (${p.marca})` : ''}${p.valorKg ? ` R$${p.valorKg.toFixed(2)}/kg` : ''}`
      : `${name}: Não`;
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading">Prospecção</h1>
            <EscopoUsuarioBar className="mt-3" />
            <p className="text-sm text-muted-foreground mt-1">Pipeline de vendas — acompanhe leads do agendamento à negociação</p>
          </div>
          <div className="flex gap-2">
            <Button variant={showFilters ? "secondary" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-1" /> Filtros
              {hasActiveFilters && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">!</Badge>}
            </Button>
            <PodeCriar modulo={'prospeccao'}><Button onClick={() => { setEditingLead(null); setShowFormDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Prospecção
            </Button></PodeCriar>
          </div>
        </div>

        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Filtros</p>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7">
                  <X className="h-3 w-3 mr-1" /> Limpar
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-3">
              <div>
                <Label className="text-xs">Tipo Atendimento</Label>
                <SearchableCombobox
                  options={TIPO_ATENDIMENTO_OPTIONS.map(o => o.label)}
                  value={filterTipoAtendimento}
                  onValueChange={setFilterTipoAtendimento}
                  placeholder="Todos"
                  searchPlaceholder="Buscar..."
                  emptyMessage="Não encontrado."
                  allLabel="Todos"
                />
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <SearchableCombobox
                  options={clientesUnicos}
                  value={filterCliente}
                  onValueChange={setFilterCliente}
                  placeholder="Todos"
                  searchPlaceholder="Digitar cliente..."
                  emptyMessage="Cliente não encontrado."
                  allLabel="Todos"
                />
              </div>
              <div>
                <Label className="text-xs">Cidade</Label>
                <SearchableCombobox
                  options={cidadesUnicas}
                  value={filterCidade}
                  onValueChange={setFilterCidade}
                  placeholder="Todas"
                  searchPlaceholder="Digitar cidade..."
                  emptyMessage="Cidade não encontrada."
                  allLabel="Todas"
                />
              </div>
              <div>
                <Label className="text-xs">Regional</Label>
                <SearchableCombobox
                  options={regionaisUsadas}
                  value={filterRegional}
                  onValueChange={setFilterRegional}
                  placeholder="Todas"
                  searchPlaceholder="Digitar regional..."
                  emptyMessage="Regional não encontrada."
                  allLabel="Todas"
                />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <SearchableCombobox
                  options={bairros}
                  value={filterBairro}
                  onValueChange={setFilterBairro}
                  placeholder="Todos"
                  searchPlaceholder="Digitar bairro..."
                  emptyMessage="Bairro não encontrado."
                  allLabel="Todos"
                />
              </div>
              <div>
                <Label className="text-xs">Produto</Label>
                <SearchableCombobox
                  options={produtosUnicos}
                  value={filterProduto}
                  onValueChange={setFilterProduto}
                  placeholder="Todos"
                  searchPlaceholder="Digitar produto..."
                  emptyMessage="Produto não encontrado."
                  allLabel="Todos"
                />
              </div>
              <div>
                <Label className="text-xs">Concorrente</Label>
                <SearchableCombobox
                  options={concorrentesUnicos}
                  value={filterConcorrente}
                  onValueChange={setFilterConcorrente}
                  placeholder="Todos"
                  searchPlaceholder="Digitar concorrente..."
                  emptyMessage="Concorrente não encontrado."
                  allLabel="Todos"
                />
              </div>
              <div>
                <Label className="text-xs">Segmento</Label>
                <SearchableCombobox
                  options={[...SEGMENTOS]}
                  value={filterSegmento}
                  onValueChange={setFilterSegmento}
                  placeholder="Todos"
                  searchPlaceholder="Buscar segmento..."
                  emptyMessage="Não encontrado."
                  allLabel="Todos"
                />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><ArrowUpDown className="h-3 w-3" /> Ordenação</Label>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cadastro_desc">Mais recente primeiro</SelectItem>
                    <SelectItem value="cadastro_asc">Mais antigo primeiro</SelectItem>
                    <SelectItem value="alfa_asc">A → Z</SelectItem>
                    <SelectItem value="alfa_desc">Z → A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Kanban */}
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0" onDragOver={(e) => e.preventDefault()}>
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = filteredLeads.filter(l => l.status_pipeline === stage.key);
            return (
              <div key={stage.key} className="flex-shrink-0 w-72">
                <div
                  className={cn(
                    "rounded-lg border border-border bg-muted/30 border-t-4 transition-colors duration-150",
                    stageColorMap[stage.key] || 'border-t-border',
                    dragOverStage === stage.key && 'bg-primary/10 border-primary/40'
                  )}
                  onDragOver={(e) => handleDragOver(e, stage.key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage.key)}
                >
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{stage.label}</h3>
                      <Badge variant="secondary" className="text-xs h-5">{stageLeads.length}</Badge>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[120px] max-h-[60vh] overflow-y-auto">
                    {stageLeads.map(lead => (
                      <Card key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "hover:shadow-card-hover transition-all duration-200 shadow-card cursor-grab active:cursor-grabbing",
                          draggedLeadId === lead.id && 'opacity-40 scale-95'
                        )}
                        onClick={() => { setSelectedLead(lead); setShowDetail(true); }}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-semibold truncate">{lead.nome_fantasia}</p>
                                <CityBadge endereco={lead.endereco} bairro={lead.bairro} cidade={lead.cidade} estado={lead.estado} geoStatus={lead.geo_status} />
                              </div>
                              {(() => {
                                const parts = [
                                  lead.agendado_por ? `Agendado por ${lead.agendado_por}` : null,
                                ].filter(Boolean);
                                return parts.length > 0 ? (
                                  <p className="text-[10px] text-muted-foreground">
                                    {parts.join(' • ')}
                                  </p>
                                ) : null;
                              })()}
                            </div>
                          </div>
                          {lead.tipo_atendimento && (() => {
                            const opt = TIPO_ATENDIMENTO_OPTIONS.find(o => o.value === lead.tipo_atendimento);
                            return opt ? (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 w-fit">{opt.icon} {opt.label}</Badge>
                            ) : null;
                          })()}
                          {(lead.endereco || lead.bairro) && (
                            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>
                                {[
                                  lead.endereco,
                                  lead.bairro,
                                  [lead.cidade, lead.estado].filter(Boolean).join('/') || null,
                                ].filter(Boolean).join(' — ')}
                                {lead.regional ? ` • ${lead.regional}` : ''}
                              </span>
                            </div>
                          )}
                          {(lead.contato_nome || lead.whatsapp || lead.telefone) && (
                            <p className="text-xs text-muted-foreground">
                              {[lead.contato_nome, lead.whatsapp ? `📱 ${formatPhone(lead.whatsapp)}` : lead.telefone ? `📞 ${formatPhone(lead.telefone)}` : null].filter(Boolean).join(' • ')}
                            </p>
                          )}
                          
                          {lead.proxima_visita_em && (() => {
                            const agendada = visitas.find(v => v.lead_id === lead.id && v.status === 'AGENDADA');
                            const horarioStr = agendada?.horario_visita ? ` às ${agendada.horario_visita}` : '';
                            return (
                              <p className="text-[10px] text-warning font-medium">📅 {format(new Date(lead.proxima_visita_em + 'T12:00:00'), "dd/MM/yyyy")} ({format(new Date(lead.proxima_visita_em + 'T12:00:00'), "EEEE", { locale: ptBR })}){horarioStr}</p>
                            );
                          })()}

                          {/* Action buttons */}
                          {lead.status_pipeline === 'AGUARDANDO_AGENDAMENTO' && (
                            <Button size="sm" className="w-full h-7 text-xs" onClick={(e) => openAgendar(lead, e)}>
                              <CalendarPlus className="h-3 w-3 mr-1" /> Agendar
                            </Button>
                          )}
                          {lead.status_pipeline === 'AGENDADO' && (
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={(e) => {
                              e.stopPropagation();
                              moverPipeline(lead.id, 'VISITA_AGENDADA');
                              toast({ title: "✅ Visita realizada!", description: `${lead.nome_fantasia} movido para Visitas Realizadas.` });
                            }}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Visita Realizada
                            </Button>
                          )}
                          {lead.status_pipeline === 'VISITA_AGENDADA' && (
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={(e) => {
                              e.stopPropagation();
                              moverPipeline(lead.id, 'EM_NEGOCIACAO');
                              toast({ title: "🤝 Em negociação!", description: `${lead.nome_fantasia} movido para Em Negociação.` });
                            }}>
                              <Handshake className="h-3 w-3 mr-1" /> Em Negociação
                            </Button>
                          )}
                          {lead.status_pipeline === 'EM_NEGOCIACAO' && (
                            <div className="flex gap-1">
                              <Button size="sm" className="flex-1 h-7 text-xs bg-[hsl(142,60%,40%)] hover:bg-[hsl(142,60%,35%)]" onClick={(e) => {
                                e.stopPropagation();
                                moverPipeline(lead.id, 'NEGOCIACAO_CONCRETIZADA');
                                toast({ title: "🎉 Negócio concretizado!", description: `${lead.nome_fantasia} — parabéns!` });
                              }}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Concretizado
                              </Button>
                              <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" onClick={(e) => {
                                e.stopPropagation();
                                setEncerrarLead(lead);
                                setEncerrarMotivo("");
                              }}>
                                <XCircle className="h-3 w-3 mr-1" /> Encerrado
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{selectedLead?.nome_fantasia}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{PIPELINE_STAGES.find(s => s.key === selectedLead.status_pipeline)?.label}</Badge>
                {selectedLead.regional && <Badge variant="outline">{selectedLead.regional}</Badge>}
                {selectedLead.ultima_visita_status && (
                  <Badge variant={
                    selectedLead.ultima_visita_status === 'CONCLUIDA_SUCESSO' ? 'default' :
                    selectedLead.ultima_visita_status === 'AGENDADA' ? 'secondary' : 'destructive'
                  } className="text-[10px]">
                    {selectedLead.ultima_visita_status === 'CONCLUIDA_SUCESSO' ? 'Última: Sucesso ✓' :
                     selectedLead.ultima_visita_status === 'AGENDADA' ? 'Visita Agendada' :
                     selectedLead.ultima_visita_status === 'NAO_CONCLUIDA' ? 'Não Concluída' : 'Sem Sucesso'}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {selectedLead.contato_nome && <div><Label className="text-xs text-muted-foreground">Contato</Label><p>{selectedLead.contato_nome}</p></div>}
                {selectedLead.telefone && <div><Label className="text-xs text-muted-foreground">Telefone</Label><p>{formatPhone(selectedLead.telefone)}</p></div>}
                {selectedLead.whatsapp && <div><Label className="text-xs text-muted-foreground">WhatsApp</Label><p>{formatPhone(selectedLead.whatsapp)}</p></div>}
                {selectedLead.email && <div><Label className="text-xs text-muted-foreground">E-mail</Label><p>{selectedLead.email}</p></div>}
                {selectedLead.endereco && <div className="col-span-2"><Label className="text-xs text-muted-foreground">Endereço</Label><p>{selectedLead.endereco}</p></div>}
                {(selectedLead as any).complemento && <div className="col-span-2"><Label className="text-xs text-muted-foreground">Complemento</Label><p>{(selectedLead as any).complemento}</p></div>}
                {selectedLead.bairro && <div><Label className="text-xs text-muted-foreground">Bairro</Label><p>{selectedLead.bairro}</p></div>}
                {selectedLead.cidade && <div><Label className="text-xs text-muted-foreground">Cidade</Label><p>{selectedLead.cidade}</p></div>}
                {selectedLead.demanda && <div><Label className="text-xs text-muted-foreground">Demanda</Label><p>{selectedLead.demanda}</p></div>}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Produtos do cliente</Label>
                {[
                  produtoLabel(selectedLead.paoQueijo, 'Pão de queijo'),
                  produtoLabel(selectedLead.recheado, 'Recheado'),
                  produtoLabel(selectedLead.empanado, 'Empanado'),
                ].filter(Boolean).map((txt, i) => (
                  <p key={i} className="text-xs bg-muted/50 p-1.5 rounded">{txt}</p>
                ))}
              </div>

              {selectedLead.concorrente && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-muted-foreground">Concorrente</Label><p>{selectedLead.concorrente}</p></div>
                  {selectedLead.valorConcorrente && <div><Label className="text-xs text-muted-foreground">Valor (kg)</Label><p>R$ {selectedLead.valorConcorrente.toFixed(2)}</p></div>}
                </div>
              )}
              
              {selectedLead.produtosInteresse && selectedLead.produtosInteresse.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Produtos de Interesse</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedLead.produtosInteresse.map(pid => {
                      const prod = CATALOGO_PRODUTOS.find(p => p.id === pid);
                      return <Badge key={pid} variant="outline" className="text-[10px]">{prod?.nome || pid}</Badge>;
                    })}
                  </div>
                </div>
              )}
              {selectedLead.observacoes && <div><Label className="text-xs text-muted-foreground">Observações</Label><p className="text-xs bg-muted/30 p-2 rounded">{selectedLead.observacoes}</p></div>}
              {selectedLead.motivo_encerramento && (
                <div><Label className="text-xs text-muted-foreground">Motivo do Encerramento</Label><p className="text-xs bg-destructive/10 text-destructive p-2 rounded">{selectedLead.motivo_encerramento}</p></div>
              )}
              {/* Visit history */}
              <div>
                <Label className="text-xs text-muted-foreground">Histórico de Visitas</Label>
                <div className="space-y-1 mt-1">
                  {getVisitasByLead(selectedLead.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma visita registrada</p>
                  ) : (
                    getVisitasByLead(selectedLead.id).map(v => (
                      <div key={v.id} className={cn("text-xs p-2 rounded border",
                        v.status === 'AGENDADA' ? 'bg-warning/5 border-warning/20' :
                        v.status === 'CONCLUIDA_SUCESSO' ? 'bg-success/5 border-success/20' :
                        v.status === 'CONCLUIDA_SEM_SUCESSO' ? 'bg-destructive/5 border-destructive/20' :
                        'bg-muted/50 border-border'
                      )}>
                        <div className="flex justify-between">
                          <span className="font-medium">{format(new Date(v.data_visita + 'T12:00:00'), "dd/MM/yyyy")}</span>
                          <Badge variant="outline" className="text-[10px] h-4">
                            {v.status === 'AGENDADA' ? '📅 Agendada' :
                             v.status === 'CONCLUIDA_SUCESSO' ? '✅ Sucesso' :
                             v.status === 'NAO_CONCLUIDA' ? '⏸ Não concluída' :
                             v.status === 'CONCLUIDA_SEM_SUCESSO' ? '❌ Sem sucesso' : v.status}
                          </Badge>
                        </div>
                        {v.motivo && <p className="text-muted-foreground mt-1">{v.motivo}</p>}
                        {v.notas && <p className="text-muted-foreground mt-1">{v.notas}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setEditingLead(selectedLead); setShowFormDialog(true); setShowDetail(false); }}>
                  Editar
                </Button>
                {selectedLead.status_pipeline === 'AGUARDANDO_AGENDAMENTO' && (
                  <Button size="sm" onClick={() => { openAgendar(selectedLead); setShowDetail(false); }}>
                    <CalendarPlus className="h-3 w-3 mr-1" /> Agendar
                  </Button>
                )}
                {selectedLead.status_pipeline === 'AGENDADO' && (
                  <Button size="sm" onClick={() => { openFeedback(selectedLead); setShowDetail(false); }}>
                    <MessageSquare className="h-3 w-3 mr-1" /> Feedback
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => { setDeleteConfirmLead(selectedLead); }}>
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Form Dialog - reuse ProspectFormDialog */}
      <ProspectFormDialog
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        prospect={editingLead ? leadToProspect(editingLead) : null}
        onSave={handleFormSave}
        visitaDate={editingLead?.status_pipeline === 'AGENDADO'
          ? (visitas.find(v => v.lead_id === editingLead.id && v.status === 'AGENDADA')?.data_visita || editingLead.proxima_visita_em)
          : undefined}
        visitaHorario={editingLead?.status_pipeline === 'AGENDADO' ? visitas.find(v => v.lead_id === editingLead.id && v.status === 'AGENDADA')?.horario_visita : undefined}
        onVisitaDateChange={editingLead?.status_pipeline === 'AGENDADO' ? (novaData, horario) => {
          reagendarVisita(editingLead.id, novaData, horario);
          toast({ title: "📅 Data alterada!", description: `Visita reagendada para ${format(new Date(novaData + 'T12:00:00'), "dd/MM/yyyy")}.` });
        } : undefined}
      />

      {/* Agendar Dialog */}
      <AgendarVisitaDialog
        open={!!agendarLeadId}
        onOpenChange={(v) => { if (!v) setAgendarLeadId(null); }}
        leadNome={agendarLeadNome}
        defaultTipoAtendimento={agendarLeadId ? leads.find(l => l.id === agendarLeadId)?.tipo_atendimento : undefined}
        onConfirm={handleAgendarConfirm}
      />

      {/* Feedback Dialog */}
      <FeedbackVisitaDialog
        open={!!feedbackVisitaId}
        onOpenChange={(v) => { if (!v) { setFeedbackVisitaId(null); setFeedbackLeadId(null); } }}
        leadNome={feedbackLeadNome}
        leadProdutosInteresse={feedbackLeadProdutos}
        justificativas={justificativas}
        onNaoConcluida={handleNaoConcluida}
        onConcluir={handleConcluir}
        onReagendar={handleReagendar}
        onAddJustificativa={addJustificativa}
      />

      {/* Delete Confirmation with motivo */}
      <AlertDialog open={!!deleteConfirmLead} onOpenChange={(v) => { if (!v) { setDeleteConfirmLead(null); setDeleteMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirmLead?.nome_fantasia}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Motivo da exclusão *</Label>
            <Textarea
              value={deleteMotivo}
              onChange={e => setDeleteMotivo(e.target.value)}
              placeholder="Informe o motivo da exclusão..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteMotivo.trim()}
              onClick={() => {
                if (deleteConfirmLead) {
                  deleteLead(deleteConfirmLead.id, deleteMotivo.trim());
                  toast({ title: "Lead excluído", description: `${deleteConfirmLead.nome_fantasia} foi removido.` });
                  setShowDetail(false);
                  setDeleteConfirmLead(null);
                  setDeleteMotivo("");
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Encerrar Negociação with motivo */}
      <AlertDialog open={!!encerrarLead} onOpenChange={(v) => { if (!v) { setEncerrarLead(null); setEncerrarMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar Negociação</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo do encerramento da negociação com <strong>{encerrarLead?.nome_fantasia}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Motivo do encerramento *</Label>
            <Textarea
              value={encerrarMotivo}
              onChange={e => setEncerrarMotivo(e.target.value)}
              placeholder="Informe o motivo do encerramento..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!encerrarMotivo.trim()}
              onClick={() => {
                if (encerrarLead) {
                  moverPipeline(encerrarLead.id, 'NEGOCIACAO_ENCERRADA', encerrarMotivo.trim());
                  toast({ title: "Negociação encerrada.", description: `${encerrarLead.nome_fantasia} movido para Encerrada.` });
                  setEncerrarLead(null);
                  setEncerrarMotivo("");
                }
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
