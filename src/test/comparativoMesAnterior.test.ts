import { describe, expect, it } from "vitest";
import { calcComparativoMesmoPonto } from "@/lib/comparativoMesAnterior";
import type { SaleRow } from "@/hooks/useSalesData";

const venda = (id: number, data: string, preco_total: number): SaleRow => ({
  id,
  codigo_venda: id,
  data,
  quantidade: 1,
  descricao: "Produto",
  cnpj_cpf: null,
  cliente: "Cliente",
  vendedor: "Henrique",
  preco_unitario: preco_total,
  preco_total,
});

describe("comparativo no mesmo ponto operacional", () => {
  it("soma o acumulado até 21/08 e o restante do ciclo separadamente", () => {
    const previousCycleSales = [
      venda(1, "2026-08-03", 51402.5),
      venda(2, "2026-08-19", 3134.9),
      venda(3, "2026-08-20", 3938.65),
      venda(4, "2026-08-21", 4545.4),
      venda(5, "2026-08-24", 3875.35),
      venda(6, "2026-08-26", 12711.6),
      venda(7, "2026-08-31", 19037.2),
    ];

    const result = calcComparativoMesmoPonto({
      sales: [venda(10, "2026-09-01", 51417.35)],
      previousCycleSales,
      refDate: new Date(2026, 8, 15),
      today: new Date(2026, 8, 22),
      vendedorShort: "Henrique",
      faturamentoAtual: 51417.35,
    });

    expect(result?.cortePrevio).toBe("21/08");
    expect(result?.anterior).toBeCloseTo(63021.45, 2);
    expect(result?.restanteAnterior).toBeCloseTo(35624.15, 2);
  });
});