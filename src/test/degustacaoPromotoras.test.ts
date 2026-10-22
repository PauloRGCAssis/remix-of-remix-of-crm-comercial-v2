import { describe, expect, it } from "vitest";
import {
  custoTotalPromotoras,
  promotorasDaDegustacao,
  promotorasLabel,
} from "@/lib/degustacaoPromotoras";

describe("promotoras da degustação", () => {
  it("soma o valor de cada promotora uma única vez", () => {
    const d = {
      promotora: "Lorrayne, Maria",
      promotoras: [
        { nome: "Lorrayne", valor: 100 },
        { nome: "Maria", valor: 150 },
      ],
    };
    expect(promotorasDaDegustacao(d)).toHaveLength(2);
    expect(custoTotalPromotoras(d)).toBe(250);
    expect(promotorasLabel(d)).toBe("Lorrayne, Maria");
  });

  it("converte registro antigo em Promotora 1 com valor padrão", () => {
    const d = { promotora: "Ana", promotoras: [] };
    expect(promotorasDaDegustacao(d)).toEqual([{ nome: "Ana", valor: 100 }]);
    expect(custoTotalPromotoras(d, 80)).toBe(80);
  });

  it("ignora linhas vazias", () => {
    const d = { promotora: null, promotoras: [{ nome: "", valor: 0 }] };
    expect(promotorasDaDegustacao(d)).toEqual([]);
    expect(custoTotalPromotoras(d)).toBe(0);
  });
});
