import { describe, expect, it } from "vitest";

import { computeVendedorMetas, type MetaConfig } from "@/hooks/useMetasData";
import type { SaleRow } from "@/hooks/useSalesData";

const config: MetaConfig = {
  pct_gasolina: 5,
  pct_verde: 10,
  pct_roxa: 10,
  pct_azul: 20,
};

describe("computeVendedorMetas", () => {
  it("computes metas from sales data without hardcoded overrides", () => {
    const sales: SaleRow[] = [
      { id: 1, codigo_venda: 1, data: "2026-03-15", vendedor: "Juliano Carneiro", cliente: "Test", descricao: "Item", quantidade: 1, preco_unitario: 100000, preco_total: 100000, cnpj_cpf: null },
      { id: 2, codigo_venda: 2, data: "2026-03-20", vendedor: "Juliano Carneiro", cliente: "Test2", descricao: "Item2", quantidade: 1, preco_unitario: 204221.47, preco_total: 204221.47, cnpj_cpf: null },
    ];
    const metas = computeVendedorMetas(sales, config, 2026, 2);
    const juliano = metas.find((item) => item.vendedor === "Juliano");

    expect(juliano?.faturamentoMes).toBeCloseTo(304221.47, 2);
  });

  it("returns zero faturamento when no sales exist", () => {
    const metas = computeVendedorMetas([] as SaleRow[], config, 2026, 2);
    const ednei = metas.find((item) => item.vendedor === "Ednei");
    expect(ednei?.faturamentoMes).toBe(0);
  });
});
