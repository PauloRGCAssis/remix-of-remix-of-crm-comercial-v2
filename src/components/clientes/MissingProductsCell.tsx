import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MinusCircle, Package, Calendar, Scale, CheckCircle2 } from "lucide-react";
import { type SaleRow, cleanProductName, isExcludedProduct } from "@/hooks/useSalesData";
import { formatProductDisplay } from "@/lib/productDisplay";

const INACTIVITY_THRESHOLD_DAYS = 30;

interface Props {
  clienteNome: string;
  allSales: SaleRow[];
}

interface MissingProduct {
  product: string;
  daysSince: number;
}

interface OrderItem {
  product: string;
  quantidade: number;
  precoTotal: number;
}

interface GroupedOrder {
  codigo_venda: number;
  date: Date;
  items: OrderItem[];
  totalKg: number;
  totalFat: number;
}

export function MissingProductsCell({ clienteNome, allSales }: Props) {
  const [open, setOpen] = useState(false);

  const { missingProducts, lastOrders } = useMemo(() => {
    const today = new Date();
    const clientSales = allSales.filter((s) => s.cliente === clienteNome);

    // Compute last purchase date per product
    const productLastDate = new Map<string, Date>();
    clientSales.forEach((s) => {
      const product = cleanProductName(s.descricao);
      if (!product || isExcludedProduct(product)) return;
      const d = new Date(s.data);
      const existing = productLastDate.get(product);
      if (!existing || d > existing) productLastDate.set(product, d);
    });

    const missing: MissingProduct[] = [];
    productLastDate.forEach((d, product) => {
      const days = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (days > INACTIVITY_THRESHOLD_DAYS) {
        missing.push({ product, daysSince: days });
      }
    });
    missing.sort((a, b) => b.daysSince - a.daysSince);

    // Group last 3 orders by codigo_venda
    const orderMap = new Map<number, GroupedOrder>();
    clientSales.forEach((s) => {
      const product = cleanProductName(s.descricao);
      if (!product || isExcludedProduct(product)) return;
      const existing = orderMap.get(s.codigo_venda);
      const item: OrderItem = {
        product,
        quantidade: Number(s.quantidade),
        precoTotal: Number(s.preco_total),
      };
      if (!existing) {
        orderMap.set(s.codigo_venda, {
          codigo_venda: s.codigo_venda,
          date: new Date(s.data),
          items: [item],
          totalKg: Number(s.quantidade),
          totalFat: Number(s.preco_total),
        });
      } else {
        existing.items.push(item);
        existing.totalKg += Number(s.quantidade);
        existing.totalFat += Number(s.preco_total);
      }
    });

    const orders: GroupedOrder[] = Array.from(orderMap.values())
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 3);

    return { missingProducts: missing, lastOrders: orders };
  }, [clienteNome, allSales]);

  if (missingProducts.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Sem produtos parados há mais de {INACTIVITY_THRESHOLD_DAYS} dias</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
              className="inline-flex"
            >
              <Badge
                variant="outline"
                className="gap-1 cursor-pointer border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
              >
                <MinusCircle className="h-3 w-3" />
                {missingProducts.length} produto{missingProducts.length === 1 ? "" : "s"}
              </Badge>
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-semibold mb-1 text-xs">
              Produtos sem comprar há mais de {INACTIVITY_THRESHOLD_DAYS} dias:
            </p>
            <ul className="text-xs list-disc list-inside space-y-0.5">
              {missingProducts.slice(0, 8).map((m) => (
                <li key={m.product}>
                  {formatProductDisplay(m.product)} ({m.daysSince} dias)
                </li>
              ))}
              {missingProducts.length > 8 && (
                <li className="text-muted-foreground">
                  +{missingProducts.length - 8} produto(s)…
                </li>
              )}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-1">Clique para ver últimos pedidos</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold leading-tight">
              Últimos 3 Pedidos
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{clienteNome}</p>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {lastOrders.length === 0 ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)
            ) : (
              lastOrders.map((order, index) => (
                <div
                  key={order.codigo_venda}
                  className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-medium">
                      Pedido #{index + 1}
                    </Badge>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {order.date.toLocaleDateString("pt-BR")}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="flex-1">{formatProductDisplay(item.product)}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 text-sm border-t border-border pt-2">
                    <Scale className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-primary">
                      Total: {order.totalKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      R${" "}
                      {order.totalFat.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ·{" "}
                      {order.items.length} {order.items.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
