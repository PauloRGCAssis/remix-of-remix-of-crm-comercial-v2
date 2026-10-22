// Busca de clientes padronizada em todo o sistema.
// Regras: ignora acentos, maiúsculas/minúsculas, espaços duplicados e pontuação.
// Aceita qualquer parte do nome e múltiplos termos em qualquer ordem
// ("flav", "supermercado flavinho", "flavinho funilandia").

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

/**
 * Verifica se um registro atende a busca. `haystacks` são todos os campos
 * pesquisáveis (nome, fantasia, razão social, aliases, cidade, vendedor...).
 */
export function matchesClientQuery(
  query: string,
  haystacks: (string | null | undefined)[],
  cnpj?: string | null,
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;

  const qDigits = digitsOnly(query);
  if (qDigits.length >= 3 && digitsOnly(cnpj).includes(qDigits)) return true;

  const hay = haystacks.map((h) => normalizeSearchText(h)).filter(Boolean).join(" | ");
  if (!hay) return false;

  return q.split(" ").every((token) => hay.includes(token));
}

/** Pontuação simples para ordenar os resultados mais relevantes primeiro. */
export function clientMatchScore(query: string, nome: string): number {
  const q = normalizeSearchText(query);
  const n = normalizeSearchText(nome);
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  return 20;
}
