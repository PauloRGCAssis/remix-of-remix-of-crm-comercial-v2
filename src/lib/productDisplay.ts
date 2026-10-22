/**
 * Camada de EXIBIÇÃO de nomes de produto.
 * NÃO altera o cadastro original — apenas reduz termos longos para
 * deixar relatórios, tabelas, cards e PDFs mais compactos e legíveis.
 *
 * Regras de substituição:
 *  - "Pão de Queijo" → "PDQ"
 *  - "Tradicional"   → "Trad."
 *  - "Unidade(s)"    → "unid."
 *
 * Uso: SEMPRE em camadas de apresentação (JSX, PDF, Excel, tooltip).
 * NUNCA usar para comparar/filtrar/agrupar dados.
 */

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bPão de Queijo\b/gi, "PDQ"],
  [/\bTradicional\b/gi, "Trad."],
  [/\bRecheado\b\s*/gi, ""],
  [/\bPremium\b\s*/gi, ""],
  [/\bUnidades\b/gi, "unid."],
  [/\bUnidade\b/gi, "unid."],
  // Remover " de " quando aparece no meio do nome do produto
  // (ex.: "Empanado de Frango" → "Empanado Frango")
  [/\s+de\s+/gi, " "],
];

export function formatProductDisplay(name: string | null | undefined): string {
  if (!name) return "";
  let out = String(name);
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Rótulo de unidade abreviado para quantidades. */
export function unitLabel(qty: number): string {
  return "unid.";
}
