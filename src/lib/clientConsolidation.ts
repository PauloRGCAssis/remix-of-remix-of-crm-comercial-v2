// Data-driven client consolidation for strategic analysis.
//
// Política atual (revisada em 2026):
//  - NÃO agrupar filiais/unidades diferentes apenas por nome parcial.
//  - "Padaria Bonna Massa - Vale do Sol" e "Padaria Bonna Massa - Jardim Canadá"
//    são CLIENTES DIFERENTES e devem permanecer separados.
//  - A normalização apenas:
//      • remove tags operacionais curtas no final ("(GR)", "(IM)", etc.)
//      • aplica normalizeClientName (trim, capitalização, pequenos erros de escrita)
//  - Filiais/unidades (após " - ", " – ", " — ", " / ") são preservadas.
//
// O resultado expõe a mesma API (map + groups) para evitar quebra em consumidores.
// `groups` permanece vazio porque, por design, não fazemos agrupamento automático.

import { normalizeClientName } from "@/lib/clientNameNormalization";

function stripTrailingTags(value: string): string {
  let s = value.trim();
  while (true) {
    const next = s.replace(/\s*\([^()]{0,12}\)\s*$/u, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function baseNameOf(raw: string): string {
  if (!raw) return "";
  const stripped = stripTrailingTags(String(raw));
  return normalizeClientName(stripped) || stripped;
}

export interface ConsolidationGroup {
  consolidated: string;
  variants: string[];
}

export interface ConsolidationResult {
  /** raw name -> canonical display name (preserva unidade/filial) */
  map: Map<string, string>;
  /** Sempre vazio — não agrupamos filiais automaticamente */
  groups: ConsolidationGroup[];
}

export function buildClientConsolidation(rawNames: Iterable<string>): ConsolidationResult {
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const r of rawNames) {
    if (r === undefined || r === null) continue;
    if (seen.has(r)) continue;
    seen.add(r);
    const base = baseNameOf(r);
    map.set(r, base || r || "(sem cliente)");
  }
  return { map, groups: [] };
}
