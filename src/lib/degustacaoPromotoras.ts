// Fonte única das promotoras de uma degustação.
// Suporta o campo legado `promotora` (texto único) e a lista `promotoras`.

export interface PromotoraItem {
  nome: string;
  valor: number;
}

export const VALOR_PROMOTORA_PADRAO = 100;

/** Sentinela salvo em `promotoras` quando a degustação é realizada pela própria loja. */
export const SEM_PROMOTORA = "__SEM_PROMOTORA__";
export const LABEL_SEM_PROMOTORA = "Realizada pela loja";
export const promotoraSemItem: PromotoraItem = { nome: SEM_PROMOTORA, valor: 0 };

interface DegustacaoLike {
  promotora?: string | null;
  promotoras?: unknown;
}

/** Normaliza qualquer payload em uma lista de promotoras válida. */
export function normalizePromotoras(value: unknown): PromotoraItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const nome = String(item.nome ?? "").trim();
      const valor = Number(item.valor ?? 0) || 0;
      return { nome, valor };
    })
    .filter((p) => p.nome !== "" || p.valor > 0);
}

/** Degustação marcada como "sem promotora — realizada pela própria loja". */
export function isSemPromotora(d: DegustacaoLike): boolean {
  const lista = normalizePromotoras(d.promotoras);
  if (lista.some((p) => p.nome === SEM_PROMOTORA)) return true;
  return (d.promotora ?? "").trim() === SEM_PROMOTORA;
}

/**
 * Promotoras efetivas da degustação.
 * Se a lista estiver vazia mas existir o campo antigo `promotora`,
 * converte para "Promotora 1" com o valor padrão informado.
 */
export function promotorasDaDegustacao(
  d: DegustacaoLike,
  valorPadrao = VALOR_PROMOTORA_PADRAO,
): PromotoraItem[] {
  if (isSemPromotora(d)) return [];
  const lista = normalizePromotoras(d.promotoras);
  if (lista.length) return lista;
  const legado = (d.promotora ?? "").trim();
  if (!legado) return [];
  return [{ nome: legado, valor: valorPadrao }];
}


export function custoTotalPromotoras(
  d: DegustacaoLike,
  valorPadrao = VALOR_PROMOTORA_PADRAO,
): number {
  return promotorasDaDegustacao(d, valorPadrao).reduce((s, p) => s + (Number(p.valor) || 0), 0);
}

/** Rótulo curto: "Lorrayne, Maria" ou "Realizada pela loja" */
export function promotorasLabel(d: DegustacaoLike): string {
  if (isSemPromotora(d)) return LABEL_SEM_PROMOTORA;
  return promotorasDaDegustacao(d)
    .map((p) => p.nome)
    .filter(Boolean)
    .join(", ");
}

/** Rótulo detalhado: "Lorrayne — R$ 100,00 · Maria — R$ 100,00" */
export function promotorasDetalhe(d: DegustacaoLike): string {
  if (isSemPromotora(d)) return LABEL_SEM_PROMOTORA;
  return promotorasDaDegustacao(d)
    .map((p) => `${p.nome || "Promotora"} — ${p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)
    .join(" · ");
}
