import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useSalesData } from "@/hooks/useSalesData";
import { useClientAliases } from "@/hooks/useClientAliases";
import { detectDuplicateCandidates, pairKey } from "@/lib/clientAliasResolver";

export function DuplicatesBanner() {
  const { data: sales = [] } = useSalesData();
  const { decisions } = useClientAliases();

  const pendingCount = useMemo(() => {
    if (!sales.length) return 0;
    const decided = new Set<string>();
    for (const d of decisions) {
      if (d.decisao !== "perguntar_depois") decided.add(pairKey(d.cliente_a, d.cliente_b));
    }
    const clientes = Array.from(new Set(sales.map((s) => s.cliente).filter(Boolean)));
    // Fonte única de verdade: somente duplicados reais (≥95%) e que NÃO sejam redes/filiais.
    return detectDuplicateCandidates(clientes, { decidedPairs: decided })
      .filter((c) => c.confidence >= 0.95 && !c.possibleBranch)
      .length;
  }, [sales, decisions]);

  if (pendingCount === 0) return null;

  return (
    <Link
      to="/clientes-duplicados"
      className="flex items-center gap-2 rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>
        Existem <strong>{pendingCount}</strong> possíveis clientes duplicados que podem afetar esta
        análise.
      </span>
      <span className="ml-auto underline">Revisar</span>
    </Link>
  );
}
