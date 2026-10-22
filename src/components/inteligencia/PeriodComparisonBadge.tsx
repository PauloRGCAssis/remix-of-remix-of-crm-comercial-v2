import { Calendar, GitCompare, Info } from "lucide-react";

export type ComparisonMethod =
  | "manual"
  | "auto-previous"
  | "continuous-halves"
  | "none";

function fmt(d: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function diffDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start + "T00:00:00").getTime();
  const b = new Date(end + "T00:00:00").getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export interface PeriodComparisonBadgeProps {
  inicio: string;
  fim: string;
  compInicio?: string;
  compFim?: string;
  method: ComparisonMethod;
  /** Opcional — texto curto extra, ex: "Últimos 3 meses". */
  contextLabel?: string;
  className?: string;
  variant?: "default" | "compact";
}

/**
 * Card pequeno e padronizado que explica explicitamente:
 * - qual é o período atual
 * - qual é o período comparado
 * - como a comparação foi calculada
 *
 * Usado em todos os indicadores e diagnósticos da Inteligência Comercial.
 */
export function PeriodComparisonBadge({
  inicio,
  fim,
  compInicio,
  compFim,
  method,
  contextLabel,
  className = "",
  variant = "default",
}: PeriodComparisonBadgeProps) {
  const dias = diffDays(inicio, fim);
  const diasComp = diffDays(compInicio ?? "", compFim ?? "");

  const methodLabel = (() => {
    switch (method) {
      case "manual":
        return `Comparação manual escolhida pelo usuário (${diasComp} dias vs ${dias} dias)`;
      case "auto-previous":
        return `Janela anterior automática — mesmo número de dias (${dias}) imediatamente antes do período atual`;
      case "continuous-halves":
        return `Período contínuo dividido ao meio: 1ª metade vs 2ª metade do intervalo`;
      case "none":
      default:
        return "Sem comparação — apenas evolução do período atual";
    }
  })();

  if (variant === "compact") {
    return (
      <div className={`text-[10px] text-muted-foreground leading-tight ${className}`}>
        <span className="font-medium">Atual:</span> {fmt(inicio)} → {fmt(fim)}
        {method !== "none" && compInicio && compFim ? (
          <>
            {" · "}
            <span className="font-medium">vs:</span> {fmt(compInicio)} → {fmt(compFim)}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`rounded-md border border-dashed bg-muted/30 p-2.5 text-[11px] leading-snug ${className}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <div className="flex items-start gap-1.5 min-w-0">
          <Calendar className="h-3 w-3 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-foreground">Atual:</span>{" "}
            <span className="tabular-nums">{fmt(inicio)} → {fmt(fim)}</span>
            <span className="text-muted-foreground"> ({dias} {dias === 1 ? "dia" : "dias"})</span>
            {contextLabel ? <span className="text-muted-foreground"> · {contextLabel}</span> : null}
          </div>
        </div>
        {method !== "none" && compInicio && compFim && (
          <div className="flex items-start gap-1.5 min-w-0">
            <GitCompare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-foreground">Comparado com:</span>{" "}
              <span className="tabular-nums">{fmt(compInicio)} → {fmt(compFim)}</span>
              <span className="text-muted-foreground"> ({diasComp} {diasComp === 1 ? "dia" : "dias"})</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-start gap-1.5 text-muted-foreground">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span><span className="font-medium">Método:</span> {methodLabel}</span>
      </div>
    </div>
  );
}
