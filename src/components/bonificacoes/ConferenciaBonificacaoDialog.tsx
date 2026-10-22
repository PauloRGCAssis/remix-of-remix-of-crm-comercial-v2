import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/lib/bonificacaoLogic";
import { statusLinha, type LinhaClienteBonificacao } from "@/lib/bonificacaoCruzamento";

interface Props {
  linha: LinhaClienteBonificacao | null;
  onOpenChange: (v: boolean) => void;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const mesBR = (m: string) => {
  const [y, mm] = m.split("-");
  return `${mm}/${y}`;
};

export function ConferenciaBonificacaoDialog({ linha, onOpenChange }: Props) {
  if (!linha) return null;

  const totComprado = linha.historico.reduce((a, h) => a + h.volumeComprado, 0);
  const totFat = linha.historico.reduce((a, h) => a + h.faturamento, 0);
  const totGerada = linha.historico.reduce((a, h) => a + h.bonificacaoGerada, 0);
  const totEntregue = linha.historico.reduce((a, h) => a + h.bonificacaoEntregue, 0);

  return (
    <Dialog open={!!linha} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{linha.cliente}</DialogTitle>
          <DialogDescription>
            Negociação de <strong>{linha.pct}%</strong> sobre o volume comprado{" "}
            {linha.pctManual ? "(definida manualmente)" : "(estimada pelo histórico)"} ·{" "}
            {linha.produtos.join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Comprado (histórico)" value={kg(totComprado)} />
          <Kpi label="Faturamento (histórico)" value={brl(totFat)} />
          <Kpi label="Bonificação gerada" value={kg(totGerada)} />
          <Kpi label="Bonificação entregue" value={kg(totEntregue)} />
        </div>

        {linha.nomesVendas.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Cruzando com as vendas de: {linha.nomesVendas.join(" · ")}
          </p>
        )}

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Volume comprado</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Bonificação gerada</TableHead>
                <TableHead className="text-right">Bonificação entregue</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">% real</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linha.historico.map((h) => {
                const st = statusLinha(h.volumeComprado, h.bonificacaoGerada, h.bonificacaoEntregue);
                return (
                  <TableRow key={h.mes}>
                    <TableCell className="font-medium">{mesBR(h.mes)}</TableCell>
                    <TableCell className="text-right">{kg(h.volumeComprado)}</TableCell>
                    <TableCell className="text-right">{brl(h.faturamento)}</TableCell>
                    <TableCell className="text-right">{kg(h.bonificacaoGerada)}</TableCell>
                    <TableCell className="text-right">{kg(h.bonificacaoEntregue)}</TableCell>
                    <TableCell className={`text-right ${h.saldo > 0.05 ? "text-destructive" : "text-success"}`}>
                      {kg(h.saldo)}
                    </TableCell>
                    <TableCell className="text-right">{h.pctReal.toFixed(1)}%</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_META[st].className}>
                        {STATUS_META[st].icon} {STATUS_META[st].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
