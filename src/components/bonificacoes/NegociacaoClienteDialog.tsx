import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useBonificacaoMutations } from "@/hooks/useBonificacoes";
import type { LinhaClienteBonificacao } from "@/lib/bonificacaoCruzamento";

interface Props {
  linha: LinhaClienteBonificacao | null;
  onOpenChange: (v: boolean) => void;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NegociacaoClienteDialog({ linha, onOpenChange }: Props) {
  const { salvarNegociacao } = useBonificacaoMutations();
  const [pct, setPct] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [precos, setPrecos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!linha) return;
    setPct(String(linha.pctManual ? linha.pct : (linha.pctSugerido ?? linha.pct)));
    setVendedor(linha.vendedor ?? "");
    setObservacoes(linha.itens.map((i) => i.observacoes).find(Boolean) ?? "");
    setPrecos(Object.fromEntries(linha.itens.map((i) => [i.id, String(i.preco_atual ?? 0)])));
  }, [linha]);

  if (!linha) return null;

  const pctNum = Number(String(pct).replace(",", ".")) || 0;
  const geradaPreview = linha.volumeComprado * (pctNum / 100);

  async function salvar() {
    if (!linha) return;
    if (pctNum < 0 || pctNum > 100) {
      toast.error("Informe uma % de negociação entre 0 e 100.");
      return;
    }
    try {
      await salvarNegociacao.mutateAsync({
        ids: linha.itens.map((i) => i.id),
        pct_negociacao: pctNum > 0 ? pctNum : null,
        vendedor: vendedor.trim() || null,
        observacoes: observacoes.trim() || null,
        precos: Object.fromEntries(
          Object.entries(precos)
            .map(([id, v]) => [id, Number(String(v).replace(",", ".")) || 0] as const)
            .filter(([, v]) => v > 0),
        ),
      });
      toast.success("Negociação atualizada. Os cálculos passam a usar a % definida.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Não foi possível salvar: ${e?.message ?? e}`);
    }
  }

  return (
    <Dialog open={!!linha} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Negociação · {linha.cliente}</DialogTitle>
          <DialogDescription>
            A % de negociação é sempre calculada sobre o volume comprado (10 kg comprados + 2 kg bonificados = 20%). O
            valor definido aqui é manual e prevalece sobre a estimativa automática do histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>% de negociação</Label>
            <div className="flex items-center gap-2">
              <Input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Estimativa do histórico: {linha.pctSugerido != null ? `${linha.pctSugerido}%` : "sem histórico"}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Vendedor</Label>
            <Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="rounded-md border border-border p-3 text-sm">
          Volume comprado no período: <strong>{linha.volumeComprado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</strong>{" "}
          × <strong>{pctNum}%</strong> ={" "}
          <strong>{geradaPreview.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</strong> de bonificação gerada.
        </div>

        <div className="max-h-[30vh] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto negociado</TableHead>
                <TableHead className="w-40 text-right">Preço tabela</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linha.itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div>{i.produto}</div>
                    <div className="text-xs text-muted-foreground">{i.categoria}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="h-8 text-right"
                      value={precos[i.id] ?? ""}
                      onChange={(e) => setPrecos((p) => ({ ...p, [i.id]: e.target.value }))}
                      inputMode="decimal"
                    />
                    <div className="mt-1 text-[11px] text-muted-foreground">atual {brl(i.preco_atual)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvarNegociacao.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
