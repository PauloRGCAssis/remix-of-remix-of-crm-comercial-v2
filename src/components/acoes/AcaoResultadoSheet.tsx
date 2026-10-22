import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AcaoResultadoPanel } from "@/components/acoes/AcaoResultadoPanel";
import type { CommercialAction } from "@/hooks/useCommercialActions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: CommercialAction | null;
}

export function AcaoResultadoSheet({ open, onOpenChange, action }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">
            {action ? `Resultado — ${action.nome}` : "Resultado da ação"}
          </SheetTitle>
        </SheetHeader>
        {action && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">
              {action.cliente} ·{" "}
              {action.data_inicio.split("-").reverse().join("/")} –{" "}
              {action.data_fim.split("-").reverse().join("/")}
            </p>
            <AcaoResultadoPanel action={action} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
