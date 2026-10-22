import { describe, expect, it } from "vitest";
import { filterByDateRange, type SaleRow } from "@/hooks/useSalesData";

const baseRow: SaleRow = {
  id: 1,
  codigo_venda: 118343,
  data: "2026-06-30T20:35:00.000Z",
  quantidade: 1,
  descricao: "93 - Pão de Queijo Tradicional Ti Delso 1 kg",
  cnpj_cpf: null,
  cliente: "Armazem Central - Castelo (GR)",
  vendedor: "Juliano Carneiro Meira Freitas",
  preco_unitario: 18.63,
  preco_total: 558.9,
  nome_arquivo_importado: "ReportPedidosItens (96).xlsx",
};

describe("filterByDateRange", () => {
  it("mantém cada linha na competência indicada pela coluna Data", () => {
    const rows: SaleRow[] = [
      baseRow,
      { ...baseRow, id: 2, codigo_venda: 118389, data: "2026-07-01T17:02:00.000Z", preco_total: 145.8 },
    ];

    expect(filterByDateRange(rows, "2026-07-01", "2026-07-16").map((row) => row.id)).toEqual([2]);
    expect(filterByDateRange(rows, "2026-06-01", "2026-06-30").map((row) => row.id)).toEqual([1]);
  });

  it("mantém o último dia no próprio mês quando o arquivo não contém o mês seguinte", () => {
    const rows: SaleRow[] = [baseRow];

    expect(filterByDateRange(rows, "2026-07-01", "2026-07-16")).toHaveLength(0);
    expect(filterByDateRange(rows, "2026-06-01", "2026-06-30")).toHaveLength(1);
  });
});