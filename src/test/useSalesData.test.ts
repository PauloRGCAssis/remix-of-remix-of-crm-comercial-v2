import { describe, expect, it } from "vitest";

import { deduplicateSalesRows, type SaleRow } from "@/hooks/useSalesData";

describe("deduplicateSalesRows (espelho da planilha)", () => {
  it("mantém todas as linhas e apenas ordena (não deduplica)", () => {
    const sales: SaleRow[] = [
      {
        id: 2,
        codigo_venda: 100,
        data: "2026-03-31T10:00:00.000Z",
        quantidade: 1,
        descricao: "95 - Pão de Queijo",
        cnpj_cpf: null,
        cliente: "Cliente A",
        vendedor: "Juliano",
        preco_unitario: 120,
        preco_total: 120,
      },
      {
        id: 1,
        codigo_venda: 100,
        data: "2026-03-31T10:00:00.000Z",
        quantidade: 1,
        descricao: "95 - Pão de Queijo",
        cnpj_cpf: null,
        cliente: "Cliente A",
        vendedor: "Juliano",
        preco_unitario: 120,
        preco_total: 120,
      },
      {
        id: 3,
        codigo_venda: 101,
        data: "2026-03-31T12:00:00.000Z",
        quantidade: 1,
        descricao: "96 - Palito de Queijo",
        cnpj_cpf: null,
        cliente: "Cliente B",
        vendedor: "Ednei",
        preco_unitario: 80,
        preco_total: 80,
      },
    ];

    const result = deduplicateSalesRows(sales);

    expect(result).toHaveLength(3);
    const total = result.reduce((s, r) => s + Number(r.preco_total), 0);
    expect(total).toBe(320);
  });
});
