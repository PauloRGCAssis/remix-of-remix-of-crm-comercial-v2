import { describe, it, expect } from "vitest";
import {
  getRevenueForPeriod,
  getQuantityForPeriod,
  getAlertsForPeriod,
  getPerformanceForPeriod,
  getMetricsForPeriod,
  type PeriodoClient,
} from "@/lib/estudoVendasPeriodo";

const MESES = ["Jan/26", "Fev/26", "Mar/26", "Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26"];

function cliente(nome: string, fats: number[]): PeriodoClient {
  const months: Record<string, { qty: number; fat: number }> = {};
  MESES.forEach((m, i) => {
    months[m] = { qty: fats[i] / 10, fat: fats[i] };
  });
  return { clientName: nome, products: [{ productName: "P1", months }] };
}

// A: alto no começo, baixo no fim. B: baixo no começo, alto no fim. C: estável.
const A = cliente("A", [10000, 10000, 10000, 10000, 10000, 10000, 10000, 1000]);
const B = cliente("B", [2000, 2000, 2000, 2000, 2000, 2000, 2000, 20000]);
const C = cliente("C", [5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]);

const ordenar = (meses: string[]) =>
  [A, B, C]
    .map((c) => ({ nome: c.clientName, fat: getRevenueForPeriod(c, meses) }))
    .sort((x, y) => y.fat - x.fat || x.nome.localeCompare(y.nome))
    .map((x) => x.nome);

describe("métricas de período do Estudo de Vendas", () => {
  it("soma faturamento de todo o período, não do último mês", () => {
    expect(getRevenueForPeriod(A, MESES)).toBe(71000);
    expect(getRevenueForPeriod(B, MESES)).toBe(34000);
  });

  it("soma quantidade de todo o período", () => {
    expect(getQuantityForPeriod(A, MESES)).toBeCloseTo(7100);
  });

  it("ordena por faturamento total do período (A antes de B)", () => {
    // A=71.000, C=40.000, B=34.000 — B faturou mais em Ago, mas menos no período
    expect(ordenar(MESES)).toEqual(["A", "C", "B"]);

  });

  it("muda a ordem conforme o período selecionado", () => {
    expect(ordenar(MESES.slice(3))).toEqual(["A", "B", "C"]); // Abr→Ago
    expect(ordenar(MESES.slice(6))).toEqual(["B", "A", "C"]); // Jul→Ago
    expect(ordenar(MESES.slice(7))).toEqual(["B", "C", "A"]); // Ago→Ago
  });

  it("crescimento e queda usam primeiro vs último mês do período", () => {
    expect(getMetricsForPeriod(A, MESES).pctFat).toBeCloseTo(-90);
    expect(getMetricsForPeriod(B, MESES).pctFat).toBeCloseTo(900);
    expect(getMetricsForPeriod(C, MESES).pctFat).toBe(0);
  });

  it("desempenho reflete o período, não só o último mês", () => {
    expect(getPerformanceForPeriod(A, MESES)).toBe("critical");
    expect(getPerformanceForPeriod(B, MESES)).toBe("positive");
    expect(getPerformanceForPeriod(C, MESES)).toBe("neutral");
  });

  it("alertas contam quedas dentro do período selecionado", () => {
    expect(getAlertsForPeriod(A, MESES)).toBe(1);
    expect(getAlertsForPeriod(B, MESES)).toBe(0);
    // Jul→Ago: A cai, B cresce
    expect(getAlertsForPeriod(A, MESES.slice(6))).toBe(1);
    expect(getAlertsForPeriod(B, MESES.slice(6))).toBe(0);
  });

  it("período de um único mês usa apenas aquele mês", () => {
    const um = MESES.slice(7);
    expect(getRevenueForPeriod(B, um)).toBe(20000);
    expect(getMetricsForPeriod(B, um).pctFat).toBeNull();
  });
});
