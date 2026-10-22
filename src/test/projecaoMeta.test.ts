import { describe, expect, it } from "vitest";
import { calcProjecaoMeta } from "@/lib/projecaoMeta";

describe("calcProjecaoMeta — coerência entre projeção e necessário por dia", () => {
  const base = { realizado: 210946.57, unidadesDecorridas: 16, unidadesRestantes: 8 };

  it("A) média atual maior que o necessário/dia → projeção bate", () => {
    const r = calcProjecaoMeta({ ...base, meta: 290139.65 });
    expect(r.mediaPorUnidade).toBeGreaterThan(r.necessarioPorUnidade);
    expect(r.projecaoFechamento).toBeCloseTo(210946.57 + (210946.57 / 16) * 8, 2);
    expect(r.projetaBate).toBe(true);
    expect(r.excedenteProjetado).toBeGreaterThan(0);
  });

  it("B) média atual igual ao necessário/dia → projeção bate", () => {
    // realizado 100 em 10 unidades (média 10); faltam 5 unidades e meta 150 → necessário 10
    const r = calcProjecaoMeta({ realizado: 100, unidadesDecorridas: 10, unidadesRestantes: 5, meta: 150 });
    expect(r.mediaPorUnidade).toBeCloseTo(r.necessarioPorUnidade, 6);
    expect(r.projecaoFechamento).toBeCloseTo(150, 6);
    expect(r.projetaBate).toBe(true);
  });

  it("C) média atual menor que o necessário/dia → projeção não bate", () => {
    const r = calcProjecaoMeta({ realizado: 100, unidadesDecorridas: 10, unidadesRestantes: 5, meta: 200 });
    expect(r.mediaPorUnidade).toBeLessThan(r.necessarioPorUnidade);
    expect(r.projetaBate).toBe(false);
    expect(r.deficitProjetado).toBeCloseTo(50, 6);
  });

  it("D) meta já atingida", () => {
    const r = calcProjecaoMeta({ realizado: 300, unidadesDecorridas: 10, unidadesRestantes: 3, meta: 200 });
    expect(r.batido).toBe(true);
    expect(r.projetaBate).toBe(true);
    expect(r.falta).toBe(0);
  });

  it("E) último dia operacional do período", () => {
    const r = calcProjecaoMeta({ realizado: 190, unidadesDecorridas: 19, unidadesRestantes: 1, meta: 200 });
    expect(r.necessarioPorUnidade).toBeCloseTo(10, 6);
    expect(r.mediaPorUnidade).toBeCloseTo(10, 6);
    expect(r.projetaBate).toBe(true);
  });

  it("F) nenhum dia operacional restante → projeção = realizado", () => {
    const r = calcProjecaoMeta({ realizado: 150, unidadesDecorridas: 20, unidadesRestantes: 0, meta: 200 });
    expect(r.projecaoFechamento).toBe(150);
    expect(r.necessarioPorUnidade).toBe(0);
    expect(r.projetaBate).toBe(false);
  });

  it("nunca informa 'não bate' quando a média já cobre o necessário", () => {
    for (let restantes = 1; restantes <= 25; restantes++) {
      for (const meta of [50, 137.5, 1000, 999999]) {
        const r = calcProjecaoMeta({ realizado: 12345, unidadesDecorridas: 7, unidadesRestantes: restantes, meta });
        if (!r.batido && r.mediaPorUnidade >= r.necessarioPorUnidade && r.necessarioPorUnidade > 0) {
          expect(r.projetaBate).toBe(true);
        }
      }
    }
  });
});
