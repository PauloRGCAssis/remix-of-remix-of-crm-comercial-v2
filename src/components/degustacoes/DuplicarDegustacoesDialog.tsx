import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { Degustacao, DegustacaoInput } from "@/hooks/useDegustacoes";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatHorarioRaw } from "@/lib/horarioRange";
import { promotorasDaDegustacao, isSemPromotora, promotoraSemItem, promotorasLabel } from "@/lib/degustacaoPromotoras";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  all: Degustacao[];
  onConfirm: (rows: DegustacaoInput[]) => Promise<Degustacao[] | void> | Degustacao[] | void;
  onUpdateDate?: (id: string, data: string) => Promise<void> | void;
}

export function DuplicarDegustacoesDialog({ open, onOpenChange, all, onConfirm, onUpdateDate }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetDate, setTargetDate] = useState("");
  const [createdRows, setCreatedRows] = useState<Degustacao[]>([]);
  const [editedDates, setEditedDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(1);
    setDataInicio("");
    setDataFim("");
    setSelectedIds(new Set());
    setTargetDate("");
    setCreatedRows([]);
    setEditedDates({});
    setSaving(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const rangeInvalid = !!(dataInicio && dataFim && dataFim < dataInicio);
  const rangeReady = !!dataInicio && !!dataFim && !rangeInvalid;

  const matched = useMemo(() => {
    if (!rangeReady) return [];
    return all
      .filter((d) => d.data >= dataInicio && d.data <= dataFim)
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [all, dataInicio, dataFim, rangeReady]);

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(matched.map((m) => m.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const handleConfirm = async () => {
    const rows: DegustacaoInput[] = matched
      .filter((m) => selectedIds.has(m.id))
      .map((m) => ({
        cliente: m.cliente,
        contato_cliente: m.contato_cliente,
        endereco: m.endereco,
        bairro: m.bairro,
        cidade: m.cidade,
        data: targetDate,
        data_entrega_materiais: null,
        horario: m.horario,
        promotora: isSemPromotora(m) ? null : m.promotora,
        promotoras: isSemPromotora(m) ? [promotoraSemItem] : promotorasDaDegustacao(m),
        horas_evento: Number((m as any).horas_evento ?? 4) || 4,
        status: "pendente",
        observacoes: m.observacoes,
        materiais: m.materiais ?? [],
        equipamentos: m.equipamentos ?? [],
        produtos: m.produtos ?? [],
      }));
    const result = await onConfirm(rows);
    const created = Array.isArray(result) ? result : [];
    if (created.length > 0) {
      setCreatedRows(created);
      setEditedDates(Object.fromEntries(created.map((r) => [r.id, r.data])));
      setStep(4);
    } else {
      handleClose(false);
    }
  };

  const handleFinishStep4 = async () => {
    if (!onUpdateDate) {
      handleClose(false);
      return;
    }
    const changes = createdRows.filter((r) => editedDates[r.id] && editedDates[r.id] !== r.data);
    if (changes.length === 0) {
      handleClose(false);
      return;
    }
    setSaving(true);
    try {
      await Promise.all(changes.map((r) => onUpdateDate(r.id, editedDates[r.id])));
      toast.success(`${changes.length} data(s) ajustada(s)`);
      handleClose(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ajustar datas");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Duplicar Degustações — Passo {step} de 4</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <Label>De qual período deseja buscar as degustações?</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Data inicial</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Data final</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </div>
            {rangeInvalid && (
              <p className="text-xs text-destructive">A data final precisa ser maior ou igual à data inicial.</p>
            )}
            {rangeReady && (
              <p className="text-sm text-muted-foreground">
                {matched.length} degustações encontradas entre{" "}
                {format(parseISO(dataInicio), "dd/MM/yyyy", { locale: ptBR })} e{" "}
                {format(parseISO(dataFim), "dd/MM/yyyy", { locale: ptBR })}.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={() => setStep(2)} disabled={!rangeReady || matched.length === 0}>
                Próximo
              </Button>
            </DialogFooter>
          </div>
        )}


        {step === 2 && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <Label>Selecione as degustações a duplicar ({matched.length} encontradas)</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sel-all"
                  checked={matched.length > 0 && selectedIds.size === matched.length}
                  onCheckedChange={(c) => toggleAll(!!c)}
                />
                <label htmlFor="sel-all" className="text-sm">Selecionar todas</label>
              </div>
            </div>
            <div className="border rounded-md max-h-[50vh] overflow-y-auto overflow-x-auto divide-y">
              {matched.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Nenhuma degustação encontrada nas datas selecionadas.</p>
              )}
              {matched.map((m) => (
                <label key={m.id} className="flex items-start gap-3 p-3 min-w-[360px] cursor-pointer hover:bg-muted/40">
                  <Checkbox
                    checked={selectedIds.has(m.id)}
                    onCheckedChange={(c) => toggleOne(m.id, !!c)}
                  />
                  <div className="flex-1 min-w-0 basis-[300px] sm:min-w-[300px]">
                    <p className="font-medium truncate" title={m.cliente}>{m.cliente}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[m.bairro, m.horario, promotorasLabel(m)].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Data original: {format(parseISO(m.data), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={() => setStep(3)} disabled={selectedIds.size === 0}>
                Próximo ({selectedIds.size})
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2">
            <Label>Para qual nova data deseja duplicar?</Label>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            <p className="text-sm text-muted-foreground">
              {selectedIds.size} degustações serão duplicadas como “Pendente de confirmação”.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
              <Button onClick={handleConfirm} disabled={!targetDate}>Confirmar duplicação</Button>
            </DialogFooter>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 py-2">
            <div>
              <Label>Revisar datas das degustações duplicadas</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Ajuste a data individual se alguma degustação precisar ir para outro dia. Cliente, endereço, bairro, horário e promotora permanecem iguais.
              </p>
            </div>
            <div className="border rounded-md max-h-[55vh] overflow-y-auto overflow-x-auto divide-y">
              {createdRows.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 min-w-[420px]">
                  <div className="flex-1 min-w-0 sm:min-w-[300px]">
                    <p className="font-medium truncate" title={r.cliente}>{r.cliente}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[r.bairro, formatHorarioRaw(r.horario), promotorasLabel(r)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Input
                    type="date"
                    className="sm:w-[170px]"
                    value={editedDates[r.id] ?? r.data}
                    onChange={(e) =>
                      setEditedDates((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={saving}>
                Fechar sem ajustar
              </Button>
              <Button onClick={handleFinishStep4} disabled={saving}>
                {saving ? "Salvando..." : "Salvar ajustes"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
