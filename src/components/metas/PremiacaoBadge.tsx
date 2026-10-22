import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { type VendorPerformanceSummary } from "@/hooks/usePerformanceData";

interface Props {
  perf: VendorPerformanceSummary;
  /** Optional override: hide entirely (e.g. card already has another badge) */
  className?: string;
}

/**
 * Premiação tag rules:
 * - Mostra a tag sempre que o vendedor bateu pelo menos a meta Impulso (tier.key !== "abaixo").
 * - Conquistada (verde): cumpriu também os requisitos do tier (tierValid).
 * - Pendente (amarelo): bateu a meta do tier mas faltam clientes novos válidos.
 * - Não exibe nada quando não bateu nem Impulso.
 */
export function PremiacaoBadge({ perf, className = "" }: Props) {
  const [open, setOpen] = useState(false);

  // Tag aparece sempre que ao menos o tier Impulso foi atingido
  const bateuAlgumTier = perf.tier.key !== "abaixo" && perf.tier.key !== "";
  if (!bateuAlgumTier) return null;

  const conquistada = perf.tierValid;
  const tone = conquistada ? "success" : "warning";
  const Icon = conquistada ? CheckCircle2 : AlertTriangle;
  const label = conquistada
    ? `✔ Premiação ${perf.tier.label.replace("Meta ", "")} Conquistada`
    : `⚠ Premiação ${perf.tier.label.replace("Meta ", "")} Pendente`;

  const toneClasses =
    tone === "success"
      ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
      : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15";

  // Requisito do tier atingido (clientes novos válidos), considerando o que falta
  const requeridosClientes = (perf.faltaClientes ?? 0) + perf.clientesNovos;


  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${toneClasses} ${className}`}
        title={conquistada ? "Premiação liberada" : "Clique para ver o que falta"}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="leading-none">{label}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{conquistada ? "Premiação Conquistada" : "Premiação Pendente"}</SheetTitle>
            <SheetDescription>
              {perf.vendedor} — {perf.tier.label}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <RowMetric
                label="Faturamento"
                value={`Meta ${perf.tier.label.replace("Meta ", "")} atingida`}
                ok={bateuAlgumTier}
              />
              <RowMetric
                label="Clientes novos válidos"
                value={`${perf.clientesNovos} / ${requeridosClientes}`}
                ok={(perf.faltaClientes ?? 0) === 0}
              />

            </div>

            {conquistada ? (
              <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm text-foreground">
                ✔ Todas as condições foram cumpridas. Bônus de comissão liberado:
                <strong className="ml-1">+{perf.commissionBonusPct}%</strong>.
              </div>
            ) : (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-foreground">
                {perf.faltaClientes > 0 && (
                  <p>
                    {perf.faltaClientes === 1
                      ? "Falta 1 cliente novo válido."
                      : `Faltam ${perf.faltaClientes} clientes novos válidos.`}
                  </p>
                )}

                <p className="mt-2 text-xs text-muted-foreground">
                  A meta de faturamento foi batida, mas o bônus de comissão só é liberado quando
                  os requisitos adicionais são cumpridos.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function RowMetric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${ok ? "text-success" : "text-warning"}`}>
        {ok ? "✓ " : "• "}
        {value}
      </span>
    </div>
  );
}
