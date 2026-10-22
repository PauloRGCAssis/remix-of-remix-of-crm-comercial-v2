import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Visita, Lead, TipoAtendimento, TIPO_ATENDIMENTO_OPTIONS } from "@/types/crm";
import { useCrm } from "@/contexts/CrmContext";

interface BatchEditVisitasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitas: Array<Visita & { lead?: Lead }>;
  onDone: () => void;
}

type HorarioMode = "sequencial" | "mesmo";

const addMinutes = (hhmm: string, minutes: number): string => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total % (24 * 60)) / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
};

export function BatchEditVisitasDialog({ open, onOpenChange, visitas, onDone }: BatchEditVisitasDialogProps) {
  const { updateLead, updateVisita } = useCrm();

  const [alterarTipo, setAlterarTipo] = useState(false);
  const [tipo, setTipo] = useState<TipoAtendimento>("visita_externa");

  const [alterarData, setAlterarData] = useState(false);
  const [data, setData] = useState<Date | undefined>();

  const [alterarHorario, setAlterarHorario] = useState(false);
  const [horarioMode, setHorarioMode] = useState<HorarioMode>("sequencial");
  const [horarioInicial, setHorarioInicial] = useState("08:00");
  const [intervalo, setIntervalo] = useState(30);
  const [horarioUnico, setHorarioUnico] = useState("09:00");

  useEffect(() => {
    if (!open) {
      setAlterarTipo(false);
      setAlterarData(false);
      setAlterarHorario(false);
      setData(undefined);
    }
  }, [open]);

  const preview = useMemo(() => {
    if (!alterarHorario) return [];
    return visitas.map((_, idx) => {
      if (horarioMode === "mesmo") return horarioUnico;
      return addMinutes(horarioInicial, idx * intervalo);
    });
  }, [alterarHorario, horarioMode, horarioInicial, intervalo, horarioUnico, visitas]);

  const handleSave = () => {
    if (!alterarTipo && !alterarData && !alterarHorario) {
      toast({ title: "Selecione ao menos uma alteração", variant: "destructive" });
      return;
    }
    if (alterarData && !data) {
      toast({ title: "Informe a nova data", variant: "destructive" });
      return;
    }

    const novaData = data ? format(data, "yyyy-MM-dd") : undefined;

    visitas.forEach((v, idx) => {
      const horario = alterarHorario
        ? horarioMode === "mesmo"
          ? horarioUnico
          : addMinutes(horarioInicial, idx * intervalo)
        : undefined;

      const visitaPatch: any = {};
      if (alterarData && novaData) visitaPatch.data_visita = novaData;
      if (alterarHorario && horario) visitaPatch.horario_visita = horario;
      if (Object.keys(visitaPatch).length > 0) updateVisita(v.id, visitaPatch);

      if (alterarTipo && v.lead) {
        updateLead(v.lead.id, { tipo_atendimento: tipo });
      }
      if (alterarHorario && horario && v.lead) {
        updateLead(v.lead.id, { horario });
      }
    });

    toast({
      title: `✔ ${visitas.length} visita(s) atualizada(s)`,
      description: "As alterações em lote foram aplicadas.",
    });
    onDone();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Alteração em lote</DialogTitle>
          <DialogDescription>
            {visitas.length} visita(s) selecionada(s). Marque os campos que deseja alterar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Tipo de atendimento */}
          <section className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Tipo de atendimento</Label>
              <Switch checked={alterarTipo} onCheckedChange={setAlterarTipo} />
            </div>
            {alterarTipo && (
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAtendimento)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_ATENDIMENTO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.icon} {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </section>

          {/* Data */}
          <section className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Data da visita</Label>
              <Switch checked={alterarData} onCheckedChange={setAlterarData} />
            </div>
            {alterarData && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !data && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {data ? format(data, "dd/MM/yyyy") : "Selecione a nova data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={data} onSelect={setData} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            )}
          </section>

          {/* Horário */}
          <section className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Horário da visita</Label>
              <Switch checked={alterarHorario} onCheckedChange={setAlterarHorario} />
            </div>
            {alterarHorario && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={horarioMode === "sequencial"}
                      onChange={() => setHorarioMode("sequencial")}
                    />
                    Sequencial (redistribuir por intervalo)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={horarioMode === "mesmo"}
                      onChange={() => setHorarioMode("mesmo")}
                    />
                    Mesmo horário para todas
                  </label>
                </div>

                {horarioMode === "sequencial" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Horário inicial</Label>
                      <Input type="time" value={horarioInicial} onChange={(e) => setHorarioInicial(e.target.value)} className="mt-1 h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Intervalo (min)</Label>
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        value={intervalo}
                        onChange={(e) => setIntervalo(Math.max(5, parseInt(e.target.value || "30", 10)))}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Horário</Label>
                    <Input type="time" value={horarioUnico} onChange={(e) => setHorarioUnico(e.target.value)} className="mt-1 h-9" />
                  </div>
                )}

                {preview.length > 0 && (
                  <div className="rounded-md bg-muted/40 p-2 text-xs max-h-40 overflow-y-auto space-y-1">
                    <p className="font-medium mb-1 text-muted-foreground">Prévia da distribuição:</p>
                    {visitas.map((v, idx) => (
                      <div key={v.id} className="flex justify-between gap-2">
                        <span className="truncate">{v.lead?.nome_fantasia || "—"}</span>
                        <span className="font-mono font-semibold">{preview[idx]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Aplicar em {visitas.length} visita(s)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
