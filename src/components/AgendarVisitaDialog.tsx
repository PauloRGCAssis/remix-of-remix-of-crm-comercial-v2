import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TipoAtendimento, TIPO_ATENDIMENTO_OPTIONS } from "@/types/crm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadNome: string;
  defaultTipoAtendimento?: TipoAtendimento;
  onConfirm: (dataVisita: string, horario?: string, notas?: string, tipoAtendimento?: TipoAtendimento) => void;
}

export function AgendarVisitaDialog({ open, onOpenChange, leadNome, defaultTipoAtendimento, onConfirm }: Props) {
  const [date, setDate] = useState<Date>();
  const [horario, setHorario] = useState("");
  const [notas, setNotas] = useState("");
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento | undefined>(defaultTipoAtendimento);

  const handleConfirm = () => {
    if (!date) return;
    onConfirm(format(date, 'yyyy-MM-dd'), horario || undefined, notas || undefined, tipoAtendimento);
    setDate(undefined);
    setHorario("");
    setNotas("");
    setTipoAtendimento(undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Agendar Visita</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Lead: <strong>{leadNome}</strong></p>

          <div>
            <Label>Tipo de atendimento *</Label>
            <RadioGroup
              value={tipoAtendimento || ""}
              onValueChange={(val) => setTipoAtendimento(val as TipoAtendimento)}
              className="flex gap-3 mt-2"
            >
              {TIPO_ATENDIMENTO_OPTIONS.map(opt => (
                <div key={opt.value} className="flex items-center space-x-1.5">
                  <RadioGroupItem value={opt.value} id={`agendar-tipo-${opt.value}`} />
                  <Label htmlFor={`agendar-tipo-${opt.value}`} className="text-xs font-normal cursor-pointer">
                    {opt.icon} {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          
          <div>
            <Label>Data da visita *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Horário da visita</Label>
            <div className="relative mt-1">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="time"
                value={horario}
                onChange={e => setHorario(e.target.value)}
                className="pl-10"
                placeholder="08:00"
              />
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas sobre a visita..." rows={3} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!date}>Confirmar Agendamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
