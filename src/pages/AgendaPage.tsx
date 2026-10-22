import { useState, useMemo } from "react";
import { EscopoUsuarioBar } from "@/components/EscopoUsuarioBar";
import { AppLayout } from "@/components/AppLayout";
import { useCrm } from "@/contexts/CrmContext";
import { Visita, VisitaStatus, NegocioStatus, ProdutoNegociado, Lead } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveVisitaHorario } from "@/lib/visitaHorario";
import { optimizeRoute } from "@/lib/routeOptimization";
import { toast } from "@/hooks/use-toast";
import { format, isWithinInterval, parseISO, startOfDay, endOfDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FeedbackVisitaDialog } from "@/components/FeedbackVisitaDialog";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { REGIONAIS_BH } from "@/data/bhBairrosRegionais";
import { VisitaCard } from "@/components/agenda/VisitaCard";
import { RouteGenerator } from "@/components/agenda/RouteGenerator";
import { NovaVisitaDialog } from "@/components/agenda/NovaVisitaDialog";
import { EditarVisitaDialog } from "@/components/agenda/EditarVisitaDialog";
import { BatchEditVisitasDialog } from "@/components/agenda/BatchEditVisitasDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, X, Trash2 } from "lucide-react";
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

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'AGENDADA', label: 'Agendadas' },
  { value: 'REALIZADA', label: 'Realizadas' },
  { value: 'CONCLUIDA_SUCESSO', label: 'Negócio Fechado' },
  { value: 'CONCLUIDA_SEM_SUCESSO', label: 'Não Fechou' },
  { value: 'NAO_CONCLUIDA', label: 'Não Concluída' },
  { value: 'CANCELADA', label: 'Cancelada' },
];

export default function AgendaPage() {
  const { leads, visitas, justificativas, getLeadById, darFeedbackVisita, concluirVisitaComResultado, reagendarVisita, agendarVisita, moverPipeline, addJustificativa, deleteVisita, deleteVisitas } = useCrm();

  // Multi-select filters
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({ from: undefined, to: undefined });
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [clienteFilter, setClienteFilter] = useState<string[]>([]);
  const [regionalFilter, setRegionalFilter] = useState<string[]>([]);
  const [bairroFilter, setBairroFilter] = useState<string[]>([]);
  const [origemFilter, setOrigemFilter] = useState<"todos" | "PROSPECCAO" | "BASE">("todos");
  const [novaVisitaOpen, setNovaVisitaOpen] = useState(false);
  const [editarVisita, setEditarVisita] = useState<(Visita & { lead?: Lead }) | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // Feedback dialog
  const [feedbackVisitaId, setFeedbackVisitaId] = useState<string | null>(null);
  const [feedbackLeadId, setFeedbackLeadId] = useState<string | null>(null);
  const [feedbackLeadNome, setFeedbackLeadNome] = useState("");
  const [feedbackLeadProdutos, setFeedbackLeadProdutos] = useState<string[]>([]);

  // Enrich visitas with lead data — show only visits that are still scheduled in both Agenda and Pipeline
  const enrichedVisitas = useMemo(() => {
    const scheduledVisitas = visitas
      .map(v => {
        const lead = getLeadById(v.lead_id);
        if (!lead || lead.status_pipeline !== 'AGENDADO' || v.status !== 'AGENDADA') {
          return null;
        }
        const horario = resolveVisitaHorario({ ...v, lead }, '');
        return { ...v, horario_visita: horario || undefined, lead };
      })
      .filter(Boolean);

    return scheduledVisitas as Array<Visita & { lead: Lead }>;
  }, [visitas, getLeadById]);

  // Filter
  const filteredVisitas = useMemo(() => {
    return enrichedVisitas.filter(v => {
      // Status
      if (statusFilter.length > 0 && !statusFilter.includes(v.status)) return false;

      // Cliente
      if (clienteFilter.length > 0 && !clienteFilter.includes(v.lead?.nome_fantasia || '')) return false;

      // Date range
      if (dateRange.from || dateRange.to) {
        const vDate = parseISO(v.data_visita);
        if (dateRange.from && dateRange.to) {
          if (!isWithinInterval(vDate, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) })) return false;
        } else if (dateRange.from) {
          if (vDate < startOfDay(dateRange.from)) return false;
        } else if (dateRange.to) {
          if (vDate > endOfDay(dateRange.to)) return false;
        }
      }

      // Regional
      if (regionalFilter.length > 0 && !regionalFilter.includes(v.lead?.regional || '')) return false;
      // Bairro
      if (bairroFilter.length > 0 && !bairroFilter.includes(v.lead?.bairro || '')) return false;

      // Origem
      if (origemFilter !== 'todos') {
        const leadOrigem = v.lead?.origem || 'PROSPECCAO';
        if (leadOrigem !== origemFilter) return false;
      }

      return true;
    }).sort((a, b) => a.data_visita.localeCompare(b.data_visita));
  }, [enrichedVisitas, statusFilter, clienteFilter, dateRange, regionalFilter, bairroFilter, origemFilter]);

  // Group by date using the same route optimization shown in the route generator
  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof filteredVisitas> = {};
    filteredVisitas.forEach(v => {
      if (!groups[v.data_visita]) groups[v.data_visita] = [];
      groups[v.data_visita].push(v);
    });

    Object.keys(groups).forEach((date) => {
      groups[date] = optimizeRoute(groups[date]) as typeof filteredVisitas;
    });

    return groups;
  }, [filteredVisitas]);

  const clientesAgendados = useMemo(() => [...new Set(enrichedVisitas.map(v => v.lead?.nome_fantasia).filter(Boolean))].sort() as string[], [enrichedVisitas]);
  const regionaisUsadas = useMemo(() => [...REGIONAIS_BH].sort() as string[], []);
  const bairros = useMemo(() => [...new Set(leads.map(l => l.bairro).filter(Boolean))].sort() as string[], [leads]);

  const openFeedback = (visita: Visita & { lead?: Lead }) => {
    setFeedbackVisitaId(visita.id);
    setFeedbackLeadId(visita.lead_id);
    setFeedbackLeadNome(visita.lead?.nome_fantasia || '');
    setFeedbackLeadProdutos(visita.lead?.produtosInteresse || []);
  };

  // Marcar visita como realizada — move lead para "Visitas Realizadas"
  const handleVisitaRealizada = (visita: Visita & { lead?: Lead }) => {
    darFeedbackVisita(visita.id, 'REALIZADA' as VisitaStatus);
    moverPipeline(visita.lead_id, 'VISITA_AGENDADA');
    toast({ title: '✔ Visita realizada!', description: 'O lead foi movido para "Visitas Realizadas".' });
  };

  // Reagendar direto do card da agenda
  const handleReagendarDireto = (leadId: string, novaData: string, horario?: string, notas?: string) => {
    reagendarVisita(leadId, novaData, horario, notas);
    toast({ title: "📅 Visita reagendada!", description: `Nova visita em ${format(new Date(novaData + 'T12:00:00'), "dd/MM/yyyy")}.` });
  };

  const handleNaoConcluida = () => {
    if (feedbackVisitaId) {
      darFeedbackVisita(feedbackVisitaId, 'NAO_CONCLUIDA');
      toast({ title: 'Visita não concluída.' });
    }
  };

  const handleConcluir = (resultado: NegocioStatus, justificativaId?: string, motivo?: string, produtosNegociados?: ProdutoNegociado[]) => {
    if (feedbackVisitaId) {
      concluirVisitaComResultado(feedbackVisitaId, resultado, justificativaId, motivo, produtosNegociados);
      toast({ title: resultado === 'FECHADO' ? '🎉 Negócio fechado!' : 'Negociação encerrada.' });
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading">Agenda de Visitas</h1>
            <EscopoUsuarioBar className="mt-3" />
            <p className="text-sm text-muted-foreground mt-1">Visitas agendadas, agrupadas por data — dê feedback direto aqui</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setNovaVisitaOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nova Visita
            </Button>
            <RouteGenerator visitas={enrichedVisitas} />
          </div>
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div>
                <Label className="text-xs">Origem</Label>
                <Select value={origemFilter} onValueChange={(v) => setOrigemFilter(v as typeof origemFilter)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="PROSPECCAO">Prospecção</SelectItem>
                    <SelectItem value="BASE">Base de Clientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">De</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-xs", !dateRange.from && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {dateRange.from ? format(dateRange.from, "dd/MM/yy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateRange.from} onSelect={d => setDateRange(prev => ({ ...prev, from: d }))} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-xs", !dateRange.to && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {dateRange.to ? format(dateRange.to, "dd/MM/yy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateRange.to} onSelect={d => setDateRange(prev => ({ ...prev, to: d }))} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <SearchableCombobox
                  options={STATUS_OPTIONS.map(s => s.label)}
                  value={statusFilter.map(s => STATUS_OPTIONS.find(o => o.value === s)?.label || s)}
                  onValueChange={(labels) => {
                    setStatusFilter(labels.map(l => STATUS_OPTIONS.find(o => o.label === l)?.value || l));
                  }}
                  placeholder="Todos"
                  allLabel="Todos"
                  searchPlaceholder="Buscar status..."
                />
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <SearchableCombobox
                  options={clientesAgendados}
                  value={clienteFilter}
                  onValueChange={setClienteFilter}
                  placeholder="Todos"
                  allLabel="Todos"
                  searchPlaceholder="Buscar cliente..."
                />
              </div>
              <div>
                <Label className="text-xs">Regional</Label>
                <SearchableCombobox
                  options={regionaisUsadas}
                  value={regionalFilter}
                  onValueChange={setRegionalFilter}
                  placeholder="Todas"
                  allLabel="Todas"
                  searchPlaceholder="Buscar regional..."
                />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <SearchableCombobox
                  options={bairros}
                  value={bairroFilter}
                  onValueChange={setBairroFilter}
                  placeholder="Todos"
                  allLabel="Todos"
                  searchPlaceholder="Buscar bairro..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">{filteredVisitas.length} visita(s) encontrada(s)</p>

        {/* Visitas grouped by date */}
        {Object.keys(groupedByDate).length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma visita encontrada no período selecionado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByDate).map(([dateStr, dayVisitas]) => {
              const dateObj = new Date(dateStr + 'T12:00:00');
              const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
              const dayIds = dayVisitas.map(v => v.id);
              const daySelectedCount = dayIds.filter(id => selectedIds.includes(id)).length;
              const allDaySelected = daySelectedCount === dayIds.length && dayIds.length > 0;
              const someDaySelected = daySelectedCount > 0 && !allDaySelected;
              const toggleDay = (checked: boolean) => {
                if (checked) {
                  setSelectedIds(cur => Array.from(new Set([...cur, ...dayIds])));
                } else {
                  const set = new Set(dayIds);
                  setSelectedIds(cur => cur.filter(id => !set.has(id)));
                }
              };
              return (
                <Card key={dateStr} className={cn("shadow-card", isToday && "ring-2 ring-primary/30")}>
                  <CardHeader className="pb-2 bg-muted/30 rounded-t-lg">
                    <CardTitle className="text-sm font-heading flex items-center justify-between gap-2 flex-wrap">
                      <span className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={allDaySelected ? true : someDaySelected ? "indeterminate" : false}
                            onCheckedChange={(c) => toggleDay(!!c)}
                          />
                          <span className="text-xs font-medium">Selecionar todas</span>
                        </label>
                        <CalendarIcon className="h-4 w-4" />
                        {format(dateObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        {isToday && <Badge className="text-[10px] h-4">Hoje</Badge>}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {daySelectedCount > 0 ? `${daySelectedCount}/${dayVisitas.length} selecionadas` : `${dayVisitas.length} visita(s)`}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    {dayVisitas.map(v => (
                      <VisitaCard
                        key={`${v.id}-${v.data_visita}-${v.horario_visita || 'sem-hora'}-${v.criado_em}`}
                        visita={v}
                        onFeedback={openFeedback}
                        onVisitaRealizada={handleVisitaRealizada}
                        onReagendar={handleReagendarDireto}
                        onEditar={setEditarVisita}
                        onExcluir={(vis) => {
                          deleteVisita(vis.id);
                          setSelectedIds(cur => cur.filter(id => id !== vis.id));
                          toast({ title: "Agendamento excluído com sucesso." });
                        }}
                        selected={selectedIds.includes(v.id)}
                        onToggleSelect={(id, checked) =>
                          setSelectedIds(cur => checked ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter(x => x !== id))
                        }
                      />
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de ações em lote */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedIds.length} visita(s) selecionada(s)
          </span>
          <Button size="sm" onClick={() => setBatchOpen(true)} className="gap-1">
            <Pencil className="h-3.5 w-3.5" /> Alteração em lote
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBatchDeleteOpen(true)}
            className="gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir Selecionadas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="gap-1">
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        </div>
      )}

      {/* Confirmação de exclusão em lote */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamentos?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedIds.length} agendamento(s)? Os clientes e seu histórico
              serão preservados — somente os compromissos agendados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const count = deleteVisitas(selectedIds);
                setSelectedIds([]);
                setBatchDeleteOpen(false);
                toast({ title: `${count} agendamento(s) excluído(s) com sucesso.` });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BatchEditVisitasDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        visitas={enrichedVisitas.filter(v => selectedIds.includes(v.id))}
        onDone={() => setSelectedIds([])}
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

      <NovaVisitaDialog open={novaVisitaOpen} onOpenChange={setNovaVisitaOpen} />

      <EditarVisitaDialog
        open={!!editarVisita}
        onOpenChange={(v) => { if (!v) setEditarVisita(null); }}
        visita={editarVisita}
        lead={editarVisita?.lead ?? null}
      />
    </AppLayout>
  );
}
