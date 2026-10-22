import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CommercialAction } from "@/hooks/useCommercialActions";
import type { AcaoResultado } from "@/lib/acaoResultado";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface InvestimentoDetalheItem {
  action: CommercialAction;
  resultado: AcaoResultado;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: InvestimentoDetalheItem[];
}

export function InvestimentoDetalheDialog({ open, onOpenChange, title, items }: Props) {
  const total = items.reduce((sum, item) => sum + item.resultado.roi.custo, 0);
  const pendentes = [...new Set(items.flatMap((item) => item.resultado.roi.produtosSemCusto))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {items.map(({ action, resultado }) => {
            const roi = resultado.roi;
            return (
              <div key={action.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{action.nome}</p>
                    <p className="text-xs text-muted-foreground">{action.cliente} · {action.responsavel ?? "Sem responsável"}</p>
                  </div>
                  <p className="font-heading text-lg font-bold">{money(roi.custo)}</p>
                </div>
                <div className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <p className="flex justify-between gap-3"><span>Produtos degustados</span><strong>{money(roi.custoDegustacoes)}</strong></p>
                  <p className="flex justify-between gap-3"><span>Promotoras</span><strong>{money(roi.custoPromotoras)}</strong></p>
                  <p className="flex justify-between gap-3"><span>Bonificação</span><strong>{money(roi.bonificacao)}</strong></p>
                  <p className="flex justify-between gap-3"><span>Evento/promoção e investimento direto</span><strong>{money(roi.investimento)}</strong></p>
                  <p className="flex justify-between gap-3"><span>Outros custos</span><strong>{money(roi.outrosCustos)}</strong></p>
                </div>
                {roi.custoIncompleto && (
                  <div className="mt-3 flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <p className="font-medium">Custo pendente</p>
                      {roi.produtosSemCusto.map((produto) => <p key={produto}>{produto}</p>)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 font-bold">
          <span>Total</span>
          <span className="font-heading text-xl">{money(total)}</span>
        </div>
        {pendentes.length > 0 && <p className="text-xs text-muted-foreground">Total parcial: há {pendentes.length} produto(s) com custo pendente.</p>}
      </DialogContent>
    </Dialog>
  );
}