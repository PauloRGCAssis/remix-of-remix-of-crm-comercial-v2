import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, DollarSign, ShoppingBag, TrendingUp, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface RecompraPendingClient {
  cliente: string;
  ultimaCompra: Date;
  diasSemComprar: number;
  valorUltimaCompra: number;
  totalPedidos: number;
  ticketMedio: number;
  faturamentoHistorico: number;
  /** Month label when client first appeared (e.g. "Fev/2026") */
  mesEntrada?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendedor: string | null;
  clients: RecompraPendingClient[];
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

export function RecompraPendingDrawer({ open, onOpenChange, vendedor, clients }: Props) {
  const navigate = useNavigate();

  // Sort: most days without buying, then highest historical revenue
  const sorted = [...clients].sort((a, b) => {
    if (b.diasSemComprar !== a.diasSemComprar) return b.diasSemComprar - a.diasSemComprar;
    return b.faturamentoHistorico - a.faturamentoHistorico;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>Clientes aguardando recompra</SheetTitle>
          <SheetDescription>
            {vendedor ? `${vendedor} — ${sorted.length} ${sorted.length === 1 ? "cliente" : "clientes"}` : ""}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4 -mx-6 px-6">
          <div className="space-y-2 pb-6">
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente pendente.</p>
            )}
            {sorted.map((c) => {
              const critical = c.diasSemComprar >= 30;
              return (
                <div
                  key={c.cliente}
                  className={`rounded-md border p-3 space-y-2 ${
                    critical ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight">{c.cliente}</p>
                    <Badge variant={critical ? "destructive" : "secondary"} className="text-xs shrink-0">
                      {c.diasSemComprar}d
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Última: {fmtDate(c.ultimaCompra)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      <span>Últ.: {fmtBRL(c.valorUltimaCompra)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ShoppingBag className="h-3 w-3" />
                      <span>{c.totalPedidos} pedidos</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>Ticket: {fmtBRL(c.ticketMedio)}</span>
                    </div>
                    {c.mesEntrada && (
                      <div className="flex items-center gap-1 col-span-2">
                        <Calendar className="h-3 w-3" />
                        <span>Entrou em: <strong className="text-foreground">{c.mesEntrada}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/clientes?busca=${encodeURIComponent(c.cliente)}`);
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Ver cliente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/agenda?cliente=${encodeURIComponent(c.cliente)}`);
                      }}
                    >
                      Adicionar à agenda
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
