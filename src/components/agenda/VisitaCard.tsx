import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { MapPin, User, MessageSquare, CheckCircle2, CalendarClock, Clock, Pencil, Trash2 } from "lucide-react";
import { formatPhone } from "@/lib/phoneFormatting";
import { cn } from "@/lib/utils";
import { resolveVisitaHorario } from "@/lib/visitaHorario";
import { Visita, VisitaStatus, Lead } from "@/types/crm";
import { AgendarVisitaDialog } from "@/components/AgendarVisitaDialog";
import { CityBadge } from "@/components/CityBadge";

interface VisitaCardProps {
  visita: Visita & { lead?: Lead };
  onFeedback: (visita: Visita & { lead?: Lead }) => void;
  onVisitaRealizada: (visita: Visita & { lead?: Lead }) => void;
  onReagendar: (leadId: string, novaData: string, horario?: string, notas?: string) => void;
  onEditar: (visita: Visita & { lead?: Lead }) => void;
  onExcluir?: (visita: Visita & { lead?: Lead }) => void;
  selected?: boolean;
  onToggleSelect?: (id: string, checked: boolean) => void;
}

const statusLabel = (s: VisitaStatus) => {
  const map: Record<VisitaStatus, string> = {
    'AGENDADA': '📅 Agendada',
    'REALIZADA': '✔ Realizada',
    'NAO_CONCLUIDA': '⏸ Não concluída',
    'CONCLUIDA_SUCESSO': '✅ Negócio Fechado',
    'CONCLUIDA_SEM_SUCESSO': '❌ Não Fechou',
    'CANCELADA': '🚫 Cancelada',
  };
  return map[s] || s;
};

const statusColor = (s: VisitaStatus) => {
  if (s === 'AGENDADA') return 'bg-warning/5 border-warning/20';
  if (s === 'REALIZADA') return 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/30';
  if (s === 'CONCLUIDA_SUCESSO') return 'bg-success/5 border-success/20';
  if (s === 'CONCLUIDA_SEM_SUCESSO' || s === 'CANCELADA') return 'bg-destructive/5 border-destructive/20';
  return 'bg-muted/50 border-border';
};

export function VisitaCard({ visita: v, onFeedback, onVisitaRealizada, onReagendar, onEditar, onExcluir, selected, onToggleSelect }: VisitaCardProps) {
  const lead = v.lead;
  const phoneDisplay = lead?.whatsapp || lead?.telefone;
  const phoneIcon = lead?.whatsapp ? "📱" : "📞";
  const displayHorario = resolveVisitaHorario({ ...v, lead });
  const [showReagendar, setShowReagendar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className={cn("p-3 rounded-lg border transition-colors text-sm", statusColor(v.status), selected && "ring-2 ring-primary/50")}>
        <div className="flex items-start justify-between mb-1 gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {onToggleSelect && (
              <Checkbox
                className="mt-0.5"
                checked={!!selected}
                onCheckedChange={(c) => onToggleSelect(v.id, !!c)}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-semibold text-sm truncate">{lead?.nome_fantasia}</p>
                <CityBadge endereco={lead?.endereco} bairro={lead?.bairro} cidade={lead?.cidade} estado={lead?.estado} geoStatus={lead?.geo_status} />
              </div>
            </div>
          </div>
          <Badge variant="outline" className="text-[11px] h-5 gap-1 flex-shrink-0 ml-2 font-semibold bg-primary/10 text-primary border-primary/20">
            <Clock className="h-3 w-3" />
            {displayHorario}
          </Badge>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground mt-1">
          {(lead?.endereco || lead?.bairro) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>
                {[
                  lead?.endereco,
                  lead?.bairro,
                  [lead?.cidade, lead?.estado].filter(Boolean).join('/') || null,
                ].filter(Boolean).join(' — ')}
                {lead?.regional && ` • ${lead.regional}`}
              </span>
            </span>
          )}

          <span className="flex items-center gap-1">
            <User className="h-3 w-3 flex-shrink-0" />
            {lead?.contato_nome || '—'}
          </span>

          <span className="flex items-center gap-1">
            <span className="text-xs">{phoneIcon}</span>
            {formatPhone(phoneDisplay) || '—'}
          </span>

          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Clock className="h-3 w-3 flex-shrink-0" />
            {displayHorario}
          </span>
        </div>

        {v.notas && <p className="text-xs text-muted-foreground mt-1 bg-muted/30 p-1.5 rounded">{v.notas}</p>}
        {v.motivo && <p className="text-xs text-destructive mt-1 bg-destructive/5 p-1.5 rounded">{v.motivo}</p>}

        <div className="flex gap-2 mt-2 flex-wrap">
          <Button size="sm" variant="default" className="h-7 text-xs flex-1 min-w-[120px]" onClick={() => onVisitaRealizada(v)}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> Visita Realizada
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1 min-w-[100px]" onClick={() => setShowReagendar(true)}>
            <CalendarClock className="h-3 w-3 mr-1" /> Reagendar
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEditar(v)}>
            <Pencil className="h-3 w-3 mr-1" /> Editar
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onFeedback(v)}>
            <MessageSquare className="h-3 w-3 mr-1" /> Feedback
          </Button>
          {onExcluir && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Excluir Agendamento
            </Button>
          )}
        </div>
      </div>

      {/* Confirmação de exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este agendamento? O cliente e seu histórico serão preservados —
              somente o compromisso agendado será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { onExcluir?.(v); setConfirmDelete(false); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reagendar Dialog */}
      <AgendarVisitaDialog
        open={showReagendar}
        onOpenChange={setShowReagendar}
        leadNome={lead?.nome_fantasia || ''}
        onConfirm={(data, horario, notas) => {
          onReagendar(v.lead_id, data, horario, notas);
          setShowReagendar(false);
        }}
      />
    </>
  );
}
