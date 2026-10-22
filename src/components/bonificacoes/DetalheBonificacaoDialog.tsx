import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LinhaClienteBonificacao } from "@/lib/bonificacaoCruzamento";

export type DetalheTipo = "comprado" | "faturamento" | "gerada" | "entregue";

export interface DetalheBonificacao {
  tipo: DetalheTipo;
  periodoLabel: string;
  linha: LinhaClienteBonificacao;
}

const kgFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataFmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const TITULOS: Record<DetalheTipo, string> = {
  comprado: "Volume comprado",
  faturamento: "Faturamento do período",
  gerada: "Bonificação gerada",
  entregue: "Bonificação entregue",
};

export function DetalheBonificacaoDialog({
  detalhe,
  onOpenChange,
}: {
  detalhe: DetalheBonificacao | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!detalhe} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        {detalhe && (
          <>
            <DialogHeader>
              <DialogTitle>
                {TITULOS[detalhe.tipo]} · {detalhe.linha.cliente}
              </DialogTitle>
              <DialogDescription>
                Período {detalhe.periodoLabel} · negociação {detalhe.linha.pct}% sobre o volume comprado ·{" "}
                {detalhe.linha.produtos.length} produto(s) no controle
              </DialogDescription>
            </DialogHeader>

            {detalhe.tipo === "gerada" && (
              <div className="rounded-md border border-border p-3 text-sm space-y-1">
                <p>
                  Cálculo: <strong>{kgFmt(detalhe.linha.volumeComprado)}</strong> ×{" "}
                  <strong>{detalhe.linha.pct}%</strong> ={" "}
                  <strong>{kgFmt(detalhe.linha.bonificacaoGerada)}</strong>
                </p>
                <p className="text-muted-foreground">
                  Entregue {kgFmt(detalhe.linha.bonificacaoEntregue)} · saldo a entregar{" "}
                  {kgFmt(detalhe.linha.saldoAEntregar)} ·{" "}
                  {detalhe.linha.pctManual ? "% definida manualmente" : "% estimada pelo histórico"}
                </p>
              </div>
            )}

            <div className="max-h-[55vh] overflow-auto">
              {detalhe.tipo === "entregue" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente na base</TableHead>
                      <TableHead>Produto bonificado</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhe.linha.entregas.map((e, i) => (
                      <TableRow key={`${e.codigoVenda}-${i}`}>
                        <TableCell>{dataFmt(e.data)}</TableCell>
                        <TableCell className="text-muted-foreground">{e.codigoVenda ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{e.cliente}</TableCell>
                        <TableCell>{e.produto}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.categoria}</TableCell>
                        <TableCell className="text-right">{kgFmt(e.kg)}</TableCell>
                      </TableRow>
                    ))}
                    {detalhe.linha.entregas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nenhuma bonificação entregue no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente na base</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      {detalhe.tipo === "gerada" && <TableHead className="text-right">Bonificação gerada</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhe.linha.compras.map((c, i) => (
                      <TableRow key={`${c.codigoVenda}-${c.data}-${i}`}>
                        <TableCell>{dataFmt(c.data)}</TableCell>
                        <TableCell className="text-muted-foreground">{c.codigoVenda ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{c.cliente}</TableCell>
                        <TableCell>{c.produto}</TableCell>
                        <TableCell className="text-right">{kgFmt(c.kg)}</TableCell>
                        <TableCell className="text-right">{brl(c.valor)}</TableCell>
                        {detalhe.tipo === "gerada" && (
                          <TableCell className="text-right">{kgFmt(c.kg * (detalhe.linha.pct / 100))}</TableCell>
                        )}
                      </TableRow>
                    ))}
                    {detalhe.linha.compras.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Nenhum pedido deste cliente no período selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
              <span>
                Volume: <strong>{kgFmt(detalhe.linha.volumeComprado)}</strong>
              </span>
              <span>
                Faturamento: <strong>{brl(detalhe.linha.faturamento)}</strong>
              </span>
              <span>
                Gerada: <strong>{kgFmt(detalhe.linha.bonificacaoGerada)}</strong>
              </span>
              <span>
                Entregue: <strong>{kgFmt(detalhe.linha.bonificacaoEntregue)}</strong>
              </span>
              <span>
                Saldo: <strong>{kgFmt(detalhe.linha.saldoAEntregar)}</strong>
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
