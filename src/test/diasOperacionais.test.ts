import { describe, expect, it } from "vitest";
import { calcDiasOperacionais, getNextBusinessDays, formatDiaMes } from "@/lib/diasOperacionais";

describe("diasOperacionais — janela de entrega de 2 dias úteis após fim de mês", () => {
  it("julho/2026: 31/07 é sexta → entrega 03/08 (seg) e 04/08 (ter)", () => {
    const ref = new Date(2026, 6, 16); // 16/07/2026
    const today = new Date(2026, 6, 16);
    const op = calcDiasOperacionais(ref, undefined, today);
    expect(op.diasEntrega.length).toBe(2);
    expect(formatDiaMes(op.diasEntrega[0])).toBe("03/08");
    expect(formatDiaMes(op.diasEntrega[1])).toBe("04/08");
    // 16/07 é qui: 16,17 + 20-24 + 27-31 = 12 restantes (inclui hoje). Total operacional = 12+2=14.
    expect(op.diasOperacionaisRestantes).toBe(op.diasUteisRestantes + 2);
  });

  it("agosto/2026: 31/08 é segunda → entrega 01/09 (ter) e 02/09 (qua)", () => {
    const ref = new Date(2026, 7, 15);
    const op = calcDiasOperacionais(ref);
    expect(formatDiaMes(op.diasEntrega[0])).toBe("01/09");
    expect(formatDiaMes(op.diasEntrega[1])).toBe("02/09");
  });

  it("ignora sábados e domingos ao buscar próximos dias úteis", () => {
    const friday = new Date(2026, 6, 31); // sexta
    const dias = getNextBusinessDays(friday, 2);
    expect(dias.map(formatDiaMes)).toEqual(["03/08", "04/08"]);
  });

  it("ignora feriados quando informados", () => {
    const friday = new Date(2026, 6, 31);
    const holidays = new Set(["2026-08-03"]); // pula seg
    const dias = getNextBusinessDays(friday, 2, holidays);
    expect(dias.map(formatDiaMes)).toEqual(["04/08", "05/08"]);
  });

  it("diasOperacionaisRestantes = diasUteisRestantes + diasEntrega.length", () => {
    const op = calcDiasOperacionais(new Date(2026, 7, 15));
    expect(op.diasOperacionaisRestantes).toBe(op.diasUteisRestantes + op.diasEntrega.length);
  });
});
