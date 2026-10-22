import { describe, expect, it } from "vitest";

import { buildImportRowKey, deduplicateParsedRows, type ParsedRow } from "@/lib/importSpreadsheet";

const row = (overrides: Partial<ParsedRow>): ParsedRow => ({
  original_row_number: 1,
  codigo_venda: 100,
  data: "2026-06-18T10:15:00.000Z",
  quantidade: 1,
  descricao: "95 - Pão de Queijo Tradicional Ti Delso 1 kg",
  cnpj_cpf: "00000000000000",
  cliente: "Cliente Teste",
  vendedor: "Juliano",
  preco_unitario: 10,
  preco_total: 10,
  sequence: 1,
  nome_arquivo_importado: "arquivo-a.xlsx",
  ...overrides,
});

describe("importação incremental", () => {
  it("usa chave estável por venda, produto e sequência — sem depender de valor/quantidade", () => {
    const original = row({});
    const atualizado = row({ quantidade: 2, preco_total: 20, nome_arquivo_importado: "arquivo-b.xlsx" });

    expect(buildImportRowKey(atualizado)).toBe(buildImportRowKey(original));
  });

  it("preserva linhas legítimas repetidas do mesmo produto no mesmo pedido", () => {
    const frango = row({ descricao: "102 - Pão de Queijo Lanche Frango Ti Delso 1 kg" });
    const requeijao = row({ descricao: "104 - Pão de Queijo Lanche Requeijão Ti Delso 1 kg" });
    // Mesma tupla lógica de frango, mas com sequência 2 → linha adicional preservada
    const repetido = row({ descricao: "102 - Pão de Queijo Lanche Frango Ti Delso 1 kg", original_row_number: 3, sequence: 2 });

    const result = deduplicateParsedRows([frango, requeijao, repetido]);

    expect(result.rows).toHaveLength(3);
    expect(result.duplicateInUploadCount).toBe(0);
  });
});
