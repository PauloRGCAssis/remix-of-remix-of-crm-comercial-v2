import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseCommissionFile, WorkbookReadError } from "@/lib/commissionImport";

function workbookFile(name: string, sheets: Array<{ name: string; rows: unknown[][] }>): File {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return {
    name,
    size: bytes.byteLength,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    arrayBuffer: async () => bytes,
  } as File;
}

describe("importação mensal com múltiplas worksheets", () => {
  it("lê explicitamente Faturamento e Bonificações com parsers independentes", async () => {
    const headersVenda = [
      "Código Venda", "Data", "Quantidade", "Descrição", "CNPJ/CPF", "Cliente", "Vendedor",
      "Preço Venda (R$)", "Preço Venda Total (R$)",
    ];
    const headersBonif = [...headersVenda, "Categoria Venda", "Custo (R$)"];
    const file = workbookFile("Total Vendas Agosto - 2026.xlsx", [
      {
        name: "Faturamento",
        rows: [
          headersVenda,
          [120001, "01/08/2026", 10, "93 - Produto", "123", "Cliente A", "Raiane Pereira Batista", 20, 200],
        ],
      },
      {
        name: "Bonificações",
        rows: [
          [],
          ["Demonstrativo"],
          headersBonif,
          [120002, "02/08/2026", 2, "95 - Produto B", "456", "Cliente B", "Juliano Carneiro Meira Freitas", 15, 30, "GR - Bonificação Brinde", 12],
        ],
      },
    ]);

    const parsed = await parseCommissionFile(file);
    const vendas = parsed.sheets.find((sheet) => sheet.kind === "vendas");
    const bonificacoes = parsed.sheets.find((sheet) => sheet.kind === "bonificacoes");

    expect(parsed.sheets).toHaveLength(2);
    expect(vendas?.lidas).toBe(1);
    expect(parsed.sheetNames).toEqual(["Faturamento", "Bonificações"]);
    expect(parsed.fileDiagnostics.arrayBufferSize).toBe(file.size);
    expect(bonificacoes?.sheet).toBe("Bonificações");
    expect(bonificacoes?.linhaCabecalho).toBe(3);
    expect(bonificacoes?.lidas).toBe(1);
    expect(bonificacoes?.rows[0]).toMatchObject({
      tipo: "BONIFICACAO_BRINDE",
      valor: 12,
      custo: 12,
      codigoVenda: 120002,
      vendedor: "Juliano",
      linhaPlanilha: 4,
    });
  });

  it("bloqueia uma versão convertida de agosto contendo apenas Sheet 1", async () => {
    const file = workbookFile("Total Vendas Agosto - 2026.xlsx", [{
      name: "Sheet 1",
      rows: [["Código Venda", "Data", "Descrição", "Cliente", "Vendedor", "Preço Venda Total (R$)"], [1, "01/08/2026", "Produto", "Cliente", "Juliano", 10]],
    }]);

    await expect(parseCommissionFile(file)).rejects.toMatchObject({
      name: "WorkbookReadError",
      message: expect.stringContaining("versão convertida contendo apenas Sheet 1"),
    } satisfies Partial<WorkbookReadError>);
  });

  it("aceita Bonificação como fallback normalizado sem confundir os cabeçalhos", async () => {
    const file = workbookFile("Total Vendas Fevereiro - 2026.xlsx", [
      {
        name: "Faturamento",
        rows: [
          ["Código Venda", "Data", "Descrição", "Cliente", "Vendedor", "Preço Venda Total (R$)"],
          [1, "01/02/2026", "Produto A", "Cliente A", "Juliano Carneiro", 100],
        ],
      },
      {
        name: "Bonificação",
        rows: [
          ["Cliente", "Vendedor", "Descrição", "Categoria Venda", "Custo (R$)"],
          ["Cliente A", "Juliano Carneiro", "Produto A", "GR - Bonificação", 10],
          ["Cliente B", "Raiane Pereira", "Produto B", "GR - Cortesia", 20],
        ],
      },
    ]);

    const parsed = await parseCommissionFile(file);
    expect(parsed.sheets.find((sheet) => sheet.kind === "vendas")?.lidas).toBe(1);
    expect(parsed.sheets.find((sheet) => sheet.kind === "bonificacoes")?.lidas).toBe(2);
  });

  it("identifica abas pelas colunas, ignorando nome e ordem", async () => {
    const hv = ["CODIGO VENDA", "data", "Quantidade", "Descricao", "CNPJ/CPF", "cliente", " Vendedor ", "Preço Venda (R$)", "Total Venda"];
    const file = workbookFile("qualquer.xlsx", [
      { name: "Planilha2", rows: [[...hv, "Categoria Venda", "Custo (R$)"], [2, "02/08/2026", 1, "95 - B", "1", "Cli B", "Juliano", 10, 10, "GR - Bonificação Brinde", 7]] },
      { name: "Bonificações", rows: [hv, [1, "01/08/2026", 1, "93 - A", "1", "Cli A", "Raiane", 50, 50]] },
      { name: "Notas", rows: [["Observação", "Autor", "Quando"], ["x", "y", "z"]] },
    ]);
    const parsed = await parseCommissionFile(file);
    expect(parsed.sheets.find((s) => s.sheet === "Planilha2")?.kind).toBe("bonificacoes");
    expect(parsed.sheets.find((s) => s.sheet === "Bonificações")?.kind).toBe("vendas");
    expect(parsed.rows.filter((r) => r.tipo === "VENDA")).toHaveLength(1);
    expect(parsed.sheets.find((s) => s.sheet === "Notas")?.parserError).toContain("Não foi possível identificar automaticamente esta aba");
  });
});
