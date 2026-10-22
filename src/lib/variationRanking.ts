export type RankingDirection = "growth" | "drop";

type ValueGetter<T> = keyof T | ((item: T) => number | null | undefined);
type NameGetter<T> = keyof T | ((item: T) => string | null | undefined);

export interface VariationRankingOptions<T> {
  variationKey?: ValueGetter<T>;
  percentKey?: ValueGetter<T>;
  previousValueKey?: ValueGetter<T>;
  minPreviousValue?: number;
  minAbsVariation?: number;
  limit?: number;
  label?: string;
  nameKey?: NameGetter<T>;
  include?: (item: T) => boolean;
}

function readNumber<T>(item: T, getter: ValueGetter<T> | undefined, fallbackKeys: string[]): number {
  const raw = typeof getter === "function"
    ? getter(item)
    : getter
      ? item[getter]
      : fallbackKeys.map(key => (item as Record<string, unknown>)[key]).find(value => typeof value === "number");
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function readName<T>(item: T, getter?: NameGetter<T>): string {
  const raw = typeof getter === "function"
    ? getter(item)
    : getter
      ? item[getter]
      : (item as Record<string, unknown>).nome;
  return String(raw ?? "item");
}

export function getVariationValue<T>(item: T, variationKey?: ValueGetter<T>): number {
  return readNumber(item, variationKey, ["variacaoValor", "diff", "delta", "deltaFat", "impacto"]);
}

export function assertVariationRankingOrder<T>(
  label: string,
  items: readonly T[],
  direction: RankingDirection,
  options: Pick<VariationRankingOptions<T>, "variationKey" | "nameKey"> = {},
) {
  for (let i = 1; i < items.length; i++) {
    const prev = getVariationValue(items[i - 1], options.variationKey);
    const curr = getVariationValue(items[i], options.variationKey);
    const ok = direction === "growth" ? prev >= curr : prev <= curr;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error(`Ranking ordenado incorretamente [${label}] em #${i}: ${readName(items[i - 1], options.nameKey)} (${prev}) -> ${readName(items[i], options.nameKey)} (${curr})`);
      break;
    }
  }
}

export function rankVariation<T>(
  items: readonly T[],
  direction: RankingDirection,
  options: VariationRankingOptions<T> = {},
): T[] {
  const ranked = items
    .filter(item => {
      if (options.include && !options.include(item)) return false;
      const variation = getVariationValue(item, options.variationKey);
      if (direction === "growth" ? variation <= 0 : variation >= 0) return false;
      if (options.minAbsVariation !== undefined && Math.abs(variation) < options.minAbsVariation) return false;
      if (options.minPreviousValue !== undefined) {
        const previous = readNumber(item, options.previousValueKey, ["valorAnterior", "fatComp", "fC", "antes"]);
        if (previous < options.minPreviousValue) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const av = getVariationValue(a, options.variationKey);
      const bv = getVariationValue(b, options.variationKey);
      if (av !== bv) return direction === "growth" ? bv - av : av - bv;

      const ap = readNumber(a, options.percentKey, ["variacaoPercentual", "diffPct", "varPct", "pct"]);
      const bp = readNumber(b, options.percentKey, ["variacaoPercentual", "diffPct", "varPct", "pct"]);
      if (ap !== bp) return direction === "growth" ? bp - ap : ap - bp;

      return 0;
    });

  const limited = options.limit ? ranked.slice(0, options.limit) : ranked;
  if (options.label) assertVariationRankingOrder(options.label, limited, direction, options);
  return limited;
}