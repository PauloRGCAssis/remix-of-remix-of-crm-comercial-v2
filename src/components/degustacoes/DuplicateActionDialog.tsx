import { promotorasDaDegustacao, promotorasLabel, VALOR_PROMOTORA_PADRAO, isSemPromotora, promotoraSemItem, LABEL_SEM_PROMOTORA } from "@/lib/degustacaoPromotoras";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Degustacao, DegustacaoInput, DegustacaoStatus } from "@/hooks/useDegustacoes";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: DegustacaoStatus; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
];

const STATUS_LABEL: Record<DegustacaoStatus, string> = {
  pendente: "Pendente",
  realizada: "Realizada",
  cancelada: "Cancelada",
};


interface RowState {
  id: string; // original id
  source: Degustacao;
  cliente: string;
  data: string;
  dataEntrega: string;
  status: DegustacaoStatus | "";
  promotora: string;
  observacoes: string;
  error?: { data?: boolean; status?: boolean };
}

function toRow(d: Degustacao): RowState {
  return {
    id: d.id,
    source: d,
    cliente: d.cliente,
    data: "",
    dataEntrega: "",
    status: "",
    promotora: promotorasLabel(d) || (d.promotora ?? ""),
    observacoes: d.observacoes ?? "",
  };
}

/** Mantém a lista original quando o nome não foi editado; caso contrário cria uma única promotora. */
function promotorasParaCopia(source: Degustacao, texto: string) {
  const digitado = texto.trim();
  if (isSemPromotora(source) && (!digitado || digitado === LABEL_SEM_PROMOTORA)) return [promotoraSemItem];
  const originais = promotorasDaDegustacao(source);
  const label = originais.map((p) => p.nome).filter(Boolean).join(", ");
  if (!digitado) return [];
  if (digitado === label) return originais;
  return [{ nome: digitado, valor: originais[0]?.valor ?? VALOR_PROMOTORA_PADRAO }];
}

function buildInput(r: RowState): DegustacaoInput {
  const s = r.source;
  const promotorasCopia = promotorasParaCopia(s, r.promotora);
  const semPromotora = promotorasCopia.some((p) => p.nome === promotoraSemItem.nome);
  return {
    cliente: r.cliente.trim() || s.cliente,
    contato_cliente: s.contato_cliente,
    endereco: s.endereco,
    bairro: s.bairro,
    cidade: s.cidade,
    data: r.data,
    data_entrega_materiais: r.dataEntrega || null,
    horario: s.horario,
    promotora: semPromotora ? null : r.promotora.trim() || null,
    promotoras: promotorasCopia,
    horas_evento: Number(s.horas_evento ?? 4) || 4,
    status: r.status as DegustacaoStatus,
    observacoes: r.observacoes.trim() || null,
    materiais: s.materiais ?? [],
    equipamentos: s.equipamentos ?? [],
    produtos: s.produtos ?? [],
  };
}


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sources: Degustacao[];
  onConfirm: (rows: DegustacaoInput[]) => Promise<unknown> | unknown;
}

export function DuplicateActionDialog({ open, onOpenChange, sources, onConfirm }: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRows(sources.map(toRow));
  }, [open, sources]);

  const isSingle = sources.length === 1;

  const update = (id: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, error: undefined } : r)));
  };

  const applyToAll = (field: "data" | "status" | "dataEntrega", value: string) => {
    setRows((prev) => prev.map((r) => ({ ...r, [field]: value, error: undefined })));
  };


  const handleConfirm = async () => {
    const validated = rows.map((r) => ({
      ...r,
      error: {
        data: !r.data,
        status: !r.status,
      },
    }));
    const hasError = validated.some((r) => r.error?.data || r.error?.status);
    setRows(validated);
    if (hasError) {
      toast.error("Preencha nova data e novo status em todas as linhas.");
      return;
    }
    setSaving(true);
    try {
      const inputs = validated.map(buildInput);
      await onConfirm(inputs);
      toast.success("Degustações duplicadas com sucesso.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao duplicar.");
    } finally {
      setSaving(false);
    }
  };

  const title = isSingle
    ? "Duplicar degustação"
    : `Duplicar ${sources.length} degustações`;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", isSingle ? "max-w-lg" : "max-w-[96vw] xl:max-w-[1400px]")}>
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>

        {isSingle && rows[0] && (
          <SingleForm row={rows[0]} onChange={(p) => update(rows[0].id, p)} />
        )}

        {!isSingle && (
          <BatchForm
            rows={rows}
            onUpdate={update}
            onApplyAll={applyToAll}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || rows.length === 0}>
            {saving ? "Duplicando..." : "Confirmar duplicação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SingleForm({ row, onChange }: { row: RowState; onChange: (p: Partial<RowState>) => void }) {
  const s = row.source;
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
        <p className="font-medium">{s.cliente}</p>
        <p className="text-muted-foreground text-xs">
          Data original:{" "}
          <span className="font-medium text-foreground">
            {format(parseISO(s.data), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Status original:{" "}
          <Badge variant="outline" className="ml-1 text-[10px]">
            {STATUS_LABEL[s.status]}
          </Badge>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Nova data da degustação *</Label>
          <Input
            type="date"
            value={row.data}
            onChange={(e) => onChange({ data: e.target.value })}
            className={cn(row.error?.data && "border-destructive")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Novo status *</Label>
          <Select value={row.status || undefined} onValueChange={(v) => onChange({ status: v as DegustacaoStatus })}>
            <SelectTrigger className={cn(row.error?.status && "border-destructive")}>
              <SelectValue placeholder="Escolher status..." />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Data de entrega dos materiais</Label>
          <Input
            type="date"
            value={row.dataEntrega}
            onChange={(e) => onChange({ dataEntrega: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Promotora</Label>
          <Input value={row.promotora} onChange={(e) => onChange({ promotora: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Cliente</Label>
          <Input value={row.cliente} onChange={(e) => onChange({ cliente: e.target.value })} />
        </div>
      </div>


      <div className="grid gap-1.5">
        <Label className="text-xs">Observações</Label>
        <Textarea
          value={row.observacoes}
          onChange={(e) => onChange({ observacoes: e.target.value })}
          rows={3}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Endereço, bairro, cidade, produtos, materiais e equipamentos serão copiados da degustação original.
      </p>
    </div>
  );
}

function BatchForm({
  rows,
  onUpdate,
  onApplyAll,
}: {
  rows: RowState[];
  onUpdate: (id: string, patch: Partial<RowState>) => void;
  onApplyAll: (field: "data" | "status" | "dataEntrega", value: string) => void;
}) {
  const [bulkDate, setBulkDate] = useState("");
  const [bulkDelivery, setBulkDelivery] = useState("");
  const [bulkStatus, setBulkStatus] = useState<DegustacaoStatus | "">("");

  return (
    <div className="space-y-3 py-2">
      <div className="rounded-md border bg-muted/30 p-3 flex flex-wrap items-end gap-3">
        <p className="text-xs text-muted-foreground basis-full">
          Atalho: aplicar a todas as linhas
        </p>
        <div className="grid gap-1">
          <Label className="text-xs">Nova data</Label>
          <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="h-9 w-[160px]" />
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={!bulkDate}
          onClick={() => onApplyAll("data", bulkDate)}
        >
          Aplicar data
        </Button>
        <div className="grid gap-1">
          <Label className="text-xs">Nova data de entrega dos materiais</Label>
          <Input
            type="date"
            value={bulkDelivery}
            onChange={(e) => setBulkDelivery(e.target.value)}
            className="h-9 w-[200px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bulkDelivery}
          onClick={() => onApplyAll("dataEntrega", bulkDelivery)}
        >
          Aplicar data de entrega
        </Button>

        <div className="grid gap-1">
          <Label className="text-xs">Novo status</Label>
          <Select value={bulkStatus || undefined} onValueChange={(v) => setBulkStatus(v as DegustacaoStatus)}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Status..." /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!bulkStatus}
          onClick={() => onApplyAll("status", bulkStatus as string)}
        >
          Aplicar status
        </Button>
      </div>

      <div className="sheet-table border rounded-md max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[1100px] text-sm table-fixed">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[92px]" />
            <col className="w-[140px]" />
            <col className="w-[140px]" />
            <col className="w-[140px]" />
            <col className="w-[130px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr className="text-left">
              <th className="p-2 font-medium min-w-[320px]">Cliente</th>
              <th className="p-2 font-medium whitespace-nowrap text-xs">Data original</th>
              <th className="p-2 font-medium whitespace-nowrap text-xs">Nova data *</th>
              <th className="p-2 font-medium whitespace-nowrap text-xs">Data entrega</th>
              <th className="p-2 font-medium whitespace-nowrap text-xs">Novo status *</th>

              <th className="p-2 font-medium text-xs">Promotora</th>
              <th className="p-2 font-medium text-xs">Observações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hasErr = r.error?.data || r.error?.status;
              return (
                <tr
                  key={r.id}
                  className={cn("border-t align-top", hasErr && "bg-destructive/5")}
                >
                  <td className="p-2">
                    <Input
                      value={r.cliente}
                      title={r.cliente}
                      onChange={(e) => onUpdate(r.id, { cliente: e.target.value })}
                      className="h-8 w-full text-ellipsis"
                    />
                  </td>
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                    {format(parseISO(r.source.data), "dd/MM/yyyy", { locale: ptBR })}
                  </td>
                  <td className="p-2">
                    <Input
                      type="date"
                      value={r.data}
                      onChange={(e) => onUpdate(r.id, { data: e.target.value })}
                      className={cn("h-8 w-full px-2 text-xs", r.error?.data && "border-destructive")}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="date"
                      value={r.dataEntrega}
                      onChange={(e) => onUpdate(r.id, { dataEntrega: e.target.value })}
                      className="h-8 w-full px-2 text-xs"
                    />
                  </td>
                  <td className="p-2">

                    <Select
                      value={r.status || undefined}
                      onValueChange={(v) => onUpdate(r.id, { status: v as DegustacaoStatus })}
                    >
                      <SelectTrigger className={cn("h-8 w-full px-2 text-xs", r.error?.status && "border-destructive")}>
                        <SelectValue placeholder="Status..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={r.promotora}
                      onChange={(e) => onUpdate(r.id, { promotora: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="p-2">
                    <Textarea
                      value={r.observacoes}
                      onChange={(e) => onUpdate(r.id, { observacoes: e.target.value })}
                      rows={1}
                      className="min-h-[34px] text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Endereço, bairro, cidade, horário, produtos, materiais e equipamentos serão copiados de cada degustação original.
      </p>
    </div>
  );
}
