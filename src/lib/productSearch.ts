/**
 * Busca rápida e inteligente de produtos — regra padrão do CRM.
 *
 * Qualquer seletor de produto deve usar estes helpers:
 *  - ignora maiúsculas/minúsculas e acentos;
 *  - aceita partes do nome, em qualquer ordem ("empanado requeijao");
 *  - localiza por código ("1531"), recheio/tipo e gramatura ("1kg", "300g");
 *  - ordena por compatibilidade (mais relevante primeiro);
 *  - sem texto digitado, devolve a lista completa na ordem original.
 */

export function normalizeProductText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Gera variantes de gramatura para casar "1kg" com "1 kg", "300g" etc. */
function withWeightVariants(text: string): string {
  const extra: string[] = [];
  const re = /(\d+)\s*(kg|g)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) extra.push(`${m[1]}${m[2]}`, `${m[1]} ${m[2]}`);
  return extra.length ? `${text} ${extra.join(" ")}` : text;
}

export function buildProductHaystack(...parts: (string | null | undefined)[]): string {
  return withWeightVariants(normalizeProductText(parts.filter(Boolean).join(" ")));
}

export function productSearchTokens(query: string): string[] {
  return withWeightVariants(normalizeProductText(query)).split(" ").filter(Boolean);
}

/**
 * Pontuação de compatibilidade. Retorna null quando o item não atende à busca
 * (todos os termos digitados precisam existir em algum ponto do texto).
 */
export function scoreProductMatch(haystack: string, tokens: string[]): number | null {
  if (!tokens.length) return 0;
  let score = 0;
  for (const t of tokens) {
    const idx = haystack.indexOf(t);
    if (idx < 0) return null;
    // termo no início do texto (normalmente o código) vale mais
    if (idx === 0) score += 40;
    // termo que inicia uma palavra vale mais que um pedaço no meio
    else if (haystack[idx - 1] === " ") score += 25;
    else score += 10;
    // termo exatamente igual a uma palavra
    if (new RegExp(`(^| )${t}( |$)`).test(haystack)) score += 15;
  }
  // texto mais curto = correspondência mais específica
  score += Math.max(0, 30 - haystack.length / 10);
  return score;
}

export interface ProductSearchable {
  /** texto pesquisável (nome + código + sinônimos) */
  haystack: string;
}

/** Filtra e ordena qualquer lista por relevância na busca de produto. */
export function searchProducts<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
): T[] {
  const tokens = productSearchTokens(query);
  if (!tokens.length) return items;
  const scored: { item: T; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const score = scoreProductMatch(buildProductHaystack(getSearchText(item)), tokens);
    if (score != null) scored.push({ item, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.item);
}
