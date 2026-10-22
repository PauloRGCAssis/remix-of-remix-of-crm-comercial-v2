import React, { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductMonthData {
  qty: number;
  fat: number;
  pctQty: number | null;
}

interface ProductData {
  productName: string;
  months: Record<string, ProductMonthData>;
}

interface AlertItem {
  productName: string;
  type: "queda" | "parou";
  detail: string;
}

interface ClientAlertPopoverProps {
  products: ProductData[];
  visibleMonths: string[];
  allSalesForClient?: { descricao: string; data: string }[];
}

export function ClientAlertPopover({ products, visibleMonths, allSalesForClient }: ClientAlertPopoverProps) {
  const alerts = useMemo(() => {
    if (visibleMonths.length < 2) return [];

    const items: AlertItem[] = [];
    const lastMonth = visibleMonths[visibleMonths.length - 1];
    const prevMonth = visibleMonths[visibleMonths.length - 2];

    products.forEach(p => {
      const currentQty = p.months[lastMonth]?.qty ?? 0;
      const prevQty = p.months[prevMonth]?.qty ?? 0;

      if (currentQty === 0 && prevQty > 0) {
        // Stopped buying - find last purchase date from visible months
        let lastPurchaseMonth = prevMonth;
        for (let i = visibleMonths.length - 2; i >= 0; i--) {
          if ((p.months[visibleMonths[i]]?.qty ?? 0) > 0) {
            lastPurchaseMonth = visibleMonths[i];
            break;
          }
        }

        // Try to get exact last purchase date from sales data
        let lastDateStr = lastPurchaseMonth;
        if (allSalesForClient) {
          const productSales = allSalesForClient
            .filter(s => {
              const cleanName = s.descricao.replace(/^\d+\s*-\s*/, "").trim();
              return cleanName === p.productName;
            })
            .map(s => new Date(s.data))
            .sort((a, b) => b.getTime() - a.getTime());
          if (productSales.length > 0) {
            lastDateStr = productSales[0].toLocaleDateString("pt-BR");
          }
        }

        items.push({
          productName: p.productName,
          type: "parou",
          detail: `Última compra: ${lastDateStr}`,
        });
      } else if (currentQty === 0 && prevQty === 0) {
        // Check if bought in any earlier visible month
        let everBought = false;
        let lastPurchaseMonth = "";
        for (let i = visibleMonths.length - 3; i >= 0; i--) {
          if ((p.months[visibleMonths[i]]?.qty ?? 0) > 0) {
            everBought = true;
            lastPurchaseMonth = visibleMonths[i];
            break;
          }
        }
        if (everBought) {
          let lastDateStr = lastPurchaseMonth;
          if (allSalesForClient) {
            const productSales = allSalesForClient
              .filter(s => {
                const cleanName = s.descricao.replace(/^\d+\s*-\s*/, "").trim();
                return cleanName === p.productName;
              })
              .map(s => new Date(s.data))
              .sort((a, b) => b.getTime() - a.getTime());
            if (productSales.length > 0) {
              lastDateStr = productSales[0].toLocaleDateString("pt-BR");
            }
          }
          items.push({
            productName: p.productName,
            type: "parou",
            detail: `Última compra: ${lastDateStr}`,
          });
        }
      } else if (prevQty > 0 && currentQty > 0) {
        const change = ((currentQty - prevQty) / prevQty) * 100;
        if (change <= -20) {
          items.push({
            productName: p.productName,
            type: "queda",
            detail: `Queda de ${Math.abs(Math.round(change))}% (${prevQty.toLocaleString("pt-BR")} → ${currentQty.toLocaleString("pt-BR")} kg)`,
          });
        }
      }
    });

    return items;
  }, [products, visibleMonths, allSalesForClient]);

  if (alerts.length === 0) return null;

  const stoppedCount = alerts.filter(a => a.type === "parou").length;
  const declineCount = alerts.filter(a => a.type === "queda").length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1 text-xs font-semibold rounded-full px-3",
            "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-3 border-b bg-destructive/5">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Resumo de Alertas
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {stoppedCount > 0 && `${stoppedCount} item(s) parou de comprar`}
            {stoppedCount > 0 && declineCount > 0 && " • "}
            {declineCount > 0 && `${declineCount} item(s) em queda`}
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y">
          {alerts.map((alert, idx) => (
            <div key={idx} className="p-3 flex items-start gap-2.5">
              {alert.type === "parou" ? (
                <ShoppingCart className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              ) : (
                <TrendingDown className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{alert.productName}</p>
                <p className={cn(
                  "text-xs mt-0.5",
                  alert.type === "parou" ? "text-destructive" : "text-warning"
                )}>
                  {alert.type === "parou" ? "Parou de comprar" : "Comprando menos"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
