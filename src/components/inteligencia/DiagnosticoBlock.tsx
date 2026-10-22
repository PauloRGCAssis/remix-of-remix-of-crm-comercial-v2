import { Brain, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";

export interface DiagnosticoSection {
  title: string;
  /** Ícone opcional para o tópico. Use chaves abreviadas para não puxar tipos pesados. */
  tone?: "up" | "down" | "warn" | "insight" | "neutral";
  items: string[];
}

interface Props {
  title?: string;
  sections: DiagnosticoSection[];
  variant?: "diagnostico" | "leitura";
}

function ToneIcon({ tone }: { tone?: DiagnosticoSection["tone"] }) {
  switch (tone) {
    case "up": return <TrendingUp className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "down": return <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case "warn": return <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    case "insight": return <Lightbulb className="h-3.5 w-3.5 text-yellow-600 shrink-0" />;
    default: return <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-muted-foreground/60 shrink-0" />;
  }
}

/**
 * Bloco padronizado de diagnóstico em formato escaneável (tópicos + bullets).
 * Substitui textos corridos longos por seções claras e separadas.
 */
export function DiagnosticoBlock({ title, sections, variant = "diagnostico" }: Props) {
  const isLeitura = variant === "leitura";
  const cls = isLeitura
    ? "rounded-md border border-primary/30 bg-primary/5 p-3"
    : "rounded-md border bg-muted/40 p-3";
  const headerLabel = title ?? (isLeitura ? "Leitura Estratégica" : "Diagnóstico");
  const HeaderIcon = isLeitura ? Sparkles : Brain;

  if (sections.length === 0) {
    return (
      <div className={cls}>
        <div className="flex items-center gap-2 mb-1">
          <HeaderIcon className={`h-3.5 w-3.5 ${isLeitura ? "text-primary" : "text-primary"}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${isLeitura ? "text-primary" : "text-muted-foreground"}`}>{headerLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground">Sem dados suficientes para diagnóstico.</p>
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="flex items-center gap-2 mb-2">
        <HeaderIcon className="h-3.5 w-3.5 text-primary" />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isLeitura ? "text-primary" : "text-muted-foreground"}`}>{headerLabel}</span>
      </div>
      <div className="space-y-2.5">
        {sections.map((sec, i) => (
          <div key={i} className={i > 0 ? "pt-2.5 border-t border-border/60" : ""}>
            <div className="flex items-center gap-1.5 mb-1">
              <ToneIcon tone={sec.tone} />
              <p className="text-[11px] font-semibold text-foreground">{sec.title}</p>
            </div>
            <ul className="space-y-0.5 pl-5">
              {sec.items.map((it, j) => (
                <li key={j} className="text-xs leading-relaxed text-foreground/90 list-disc">
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
