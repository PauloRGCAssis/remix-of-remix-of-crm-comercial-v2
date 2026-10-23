import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link2, Unlink } from "lucide-react";
import { useBonificacaoVinculoMutations } from "@/hooks/useBonificacoes";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { toast } from "@/hooks/use-toast";
import type { EntregaDetalhe, LinhaClienteBonificacao, VinculoOrigem } from "@/lib/bonificacaoCruzamento";

const kgFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataFmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const sinal = (v: number) => `${v > 0 ? "+" : ""}${kgFmt(v)}`;

const ORIGEM_LABEL: Record<VinculoOrigem, string> = {
  codigo: "mesmo pedido",
  data: "mesma data",
  proximidade: "data próxima",
  manual: "vínculo manual",
  pendente: "pendente de conciliação",
  sem_pedido: "sem pedido",
};

export function PedidosClienteDialog({
  linha,
  periodoLabel,
  onOpenChange,
}: {
  linha: LinhaClienteBonificacao | null;
  periodoLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { vincular, limparVinculo } = useBonificacaoVinculoMutations();
  const { podeEditar } = useModuleCrud("bonificacoes", "vínculos de bonificação");

  const pedidosDeCompra = (linha?.pedidos ?? []).filter((p) => !p.semCompra && p.codigo);

  const acaoVincular = async (entrega: EntregaDetalhe, codigo: string | null, desvinculado = false) => {
    try {
      await vincular.mutateAsync({ rowId: entrega.id, codigoVenda: codigo, desvinculado });
      toast({
        title: desvinculado ? "Bonificação desvinculada" : "Bonificação vinculada",
        description: desvinculado ? "Ela passa a aparecer sem pedido de compra." : `Vinculada ao pedido ${codigo}.`,
      });
    } catch (e: any) {
      toast({ title: "Não foi possível salvar o vínculo", description: e?.message, variant: "destructive" });
    }
  };

  const acaoLimpar = async (entrega: EntregaDetalhe) => {
    try {
      await limparVinculo.mutateAsync(entrega.id);
      toast({ title: "Vínculo removido", description: "A bonificação volta para a conciliação automática." });
    } catch (e: any) {
      toast({ title: "Não foi possível remover o vínculo", description: e?.message, variant: "destructive" });
    }
  };

  const MenuVinculo = ({ entrega }: { entrega: EntregaDetalhe }) => !podeEditar ? null : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]">
          <Link2 className="h-3 w-3" /> Vincular
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
        <DropdownMenuLabel>Vincular ao pedido</DropdownMenuLabel>
        {pedidosDeCompra.map((p) => (
          <DropdownMenuItem key={p.codigo} onSelect={() => acaoVincular(entrega, p.codigo)}>
            Pedido {p.codigo} · {dataFmt(p.data)} · {kgFmt(p.kg)}
          </DropdownMenuItem>
        ))}
        {pedidosDeCompra.length === 0 && (
          <DropdownMenuItem disabled>Nenhum pedido no período</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => acaoVincular(entrega, null, true)}>
          <Unlink className="mr-2 h-3.5 w-3.5" /> Marcar como sem pedido
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => acaoLimpar(entrega)}>Voltar à conciliação automática</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Dialog open={!!linha} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        {linha && (
          <>
            <DialogHeader>
              <DialogTitle>Pedidos · {linha.cliente}</DialogTitle>
              <DialogDescription>
                Período {periodoLabel} · {linha.qtdPedidos} pedido(s) · negociação {linha.pct}% sobre o volume
                comprado{linha.unidade ? ` · unidade ${linha.unidade}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
              {linha.pedidos.map((p, i) => (
                <div
                  key={`${p.codigo ?? "s"}-${p.data ?? i}`}
                  className={`rounded-lg border p-3 text-sm ${
                    p.pendenteConciliacao
                      ? "border-warning/60 bg-warning/10"
                      : p.divergente
                        ? "border-warning/60 bg-warning/5"
                        : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {p.pendenteConciliacao
                          ? "⚠ Bonificação pendente de conciliação"
                          : p.semCompra
                            ? "Bonificação sem pedido de compra"
                            : `Pedido ${p.codigo ?? "—"}`}
                        <span className="ml-2 text-xs text-muted-foreground">{dataFmt(p.data)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{p.cliente}</p>
                    </div>
                    {p.semCompra ? (
                      <div className="flex items-center gap-1">
                        {p.entregas[0] && <MenuVinculo entrega={p.entregas[0]} />}
                      </div>
                    ) : p.divergente ? (
                      <Badge variant="outline" className="bg-warning/25 text-warning border-warning/60">
                        ⚠ Divergência {sinal(p.diferenca)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-success/20 text-success border-success/50">
                        ✅ Conforme
                      </Badge>
                    )}
                  </div>

                  {!p.semCompra && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
                      <Info label="Volume comprado" value={kgFmt(p.kg)} />
                      <Info label="Faturamento" value={brl(p.valor)} />
                      <Info label="% negociação" value={`${linha.pct}%`} />
                      <Info label="Bonificação esperada" value={kgFmt(p.esperado)} />
                      <Info
                        label="Bonificação enviada"
                        value={kgFmt(p.entregue)}
                        className={p.divergente ? "text-warning" : ""}
                      />
                    </div>
                  )}

                  {p.itens.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {p.itens.map((it, j) => (
                        <li key={`${it.produto}-${j}`}>
                          {it.produto} — {kgFmt(it.kg)} · {brl(it.valor)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {p.entregas.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2 text-xs">
                      <p className="mb-1 font-medium">Bonificações vinculadas</p>
                      <ul className="space-y-1 text-muted-foreground">
                        {p.entregas.map((e, j) => (
                          <li key={`${e.id}-${j}`} className="flex items-center justify-between gap-2">
                            <span>
                              {dataFmt(e.data)} · {e.produto} — {kgFmt(e.kg)} · {e.categoria}
                              {e.vinculo && !p.semCompra && (
                                <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                                  ({ORIGEM_LABEL[e.vinculo]})
                                </span>
                              )}
                            </span>
                            {!p.semCompra && <MenuVinculo entrega={e} />}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {p.entregas.length === 0 && !p.semCompra && (
                    <p className="mt-2 text-xs text-destructive">Nenhuma bonificação vinculada a este pedido.</p>
                  )}
                </div>
              ))}

              {linha.pedidos.length === 0 && (
                <p className="py-10 text-center text-muted-foreground">
                  Nenhum pedido deste cliente no período selecionado.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
              <span>
                Volume: <strong>{kgFmt(linha.volumeComprado)}</strong>
              </span>
              <span>
                Faturamento: <strong>{brl(linha.faturamento)}</strong>
              </span>
              <span>
                Gerada: <strong>{kgFmt(linha.bonificacaoGerada)}</strong>
              </span>
              <span>
                Entregue: <strong>{kgFmt(linha.bonificacaoEntregue)}</strong>
              </span>
              <span>
                Saldo: <strong>{kgFmt(linha.saldoAEntregar)}</strong>
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-medium ${className}`}>{value}</p>
    </div>
  );
}
