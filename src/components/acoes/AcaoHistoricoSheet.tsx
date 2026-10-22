import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCommercialActionHistory, type CommercialAction } from "@/hooks/useCommercialActions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: CommercialAction | null;
}

const dt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function AcaoHistoricoSheet({ open, onOpenChange, action }: Props) {
  const { data: history = [], isLoading } = useCommercialActionHistory(action?.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">Histórico da ação</SheetTitle>
        </SheetHeader>
        {action && (
          <div className="mt-4 space-y-1 text-sm">
            <p className="font-medium">{action.nome}</p>
            <p className="text-muted-foreground text-xs">{action.cliente}</p>
            <p className="text-xs text-muted-foreground">
              Criado por {action.criado_por ?? "—"} · última alteração por {action.atualizado_por ?? "—"} em{" "}
              {dt(action.updated_at)}
            </p>
          </div>
        )}
        <div className="mt-6 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && history.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum registro de alteração.</p>
          )}
          {history.map((h) => (
            <div key={h.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={h.evento === "Criação" ? "secondary" : "outline"}>{h.evento}</Badge>
                <span className="text-[11px] text-muted-foreground">{dt(h.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Por {h.autor ?? "—"}</p>
              {h.alteracoes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {h.alteracoes.map((a, i) => (
                    <li key={i}>
                      <span className="font-medium">{a.campo}: </span>
                      <span className="text-muted-foreground line-through">{a.de}</span>{" → "}
                      <span>{a.para}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
