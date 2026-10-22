export function hasCompleteDateRange(start: string, end: string): boolean {
  return Boolean(start && end);
}

export function hasPartialDateRange(start: string, end: string): boolean {
  return Boolean((start && !end) || (!start && end));
}

export function calculateVariation(current: number, comparison: number): number | null {
  if (comparison <= 0) return null;
  return ((current - comparison) / comparison) * 100;
}

export function formatPeriodLabel(start: string, end: string): string {
  if (!start || !end) return "";

  const formatDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");

  return `${formatDate(start)} — ${formatDate(end)}`;
}
