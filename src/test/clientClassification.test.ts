import { describe, it, expect } from "vitest";
import { classifyClientsForPeriod } from "@/lib/clientClassification";
import type { SaleRow } from "@/hooks/useSalesData";

function row(over: Partial<SaleRow>): SaleRow {
  return {
    id: Math.random(),
    codigo_venda: 1,
    data: "2026-07-10",
    vendedor: "Juliano",
    cliente: "Cliente X",
    descricao: "PROD",
    quantidade: 1,
    preco_unitario: 100,
    preco_total: 100,
    ...(over as any),
  } as any;
}

describe("classifyClientsForPeriod (gap-based)", () => {
  const inicio = "2026-07-01";
  const fim = "2026-07-16";

  it("classifica NOVO quando não há histórico anterior", () => {
    const rows = [row({ cliente: "Novo LTDA", data: "2026-07-05" })];
    const { novos, reativados, recorrentes } = classifyClientsForPeriod({
      todasAsVendas: rows,
      vendasNoPeriodoAtualFiltradas: rows,
      inicio, fim,
      reativacaoDiasSemCompra: 60,
    });
    expect(novos.map(c => c.cliente)).toEqual(["Novo LTDA"]);
    expect(reativados).toHaveLength(0);
    expect(recorrentes).toHaveLength(0);
    expect(novos[0].motivo).toMatch(/Primeira compra/);
  });

  it("classifica REATIVADO quando gap ≥ 60 dias", () => {
    const rows = [
      row({ cliente: "Volta LTDA", data: "2026-03-01", codigo_venda: 1 }),
      row({ cliente: "Volta LTDA", data: "2026-07-05", codigo_venda: 2 }),
    ];
    const atual = rows.filter(r => r.data >= inicio);
    const { reativados, novos, recorrentes } = classifyClientsForPeriod({
      todasAsVendas: rows,
      vendasNoPeriodoAtualFiltradas: atual,
      inicio, fim,
      reativacaoDiasSemCompra: 60,
    });
    expect(reativados.map(c => c.cliente)).toEqual(["Volta LTDA"]);
    expect(novos).toHaveLength(0);
    expect(recorrentes).toHaveLength(0);
    expect(reativados[0].diasSemComprar).toBeGreaterThanOrEqual(60);
    expect(reativados[0].motivo).toMatch(/dias sem comprar/);
  });

  it("classifica RECORRENTE quando gap < 60 dias", () => {
    const rows = [
      row({ cliente: "Fiel LTDA", data: "2026-06-20", codigo_venda: 1 }),
      row({ cliente: "Fiel LTDA", data: "2026-07-10", codigo_venda: 2 }),
    ];
    const atual = rows.filter(r => r.data >= inicio);
    const { recorrentes, novos, reativados } = classifyClientsForPeriod({
      todasAsVendas: rows,
      vendasNoPeriodoAtualFiltradas: atual,
      inicio, fim,
      reativacaoDiasSemCompra: 60,
    });
    expect(recorrentes.map(c => c.cliente)).toEqual(["Fiel LTDA"]);
    expect(novos).toHaveLength(0);
    expect(reativados).toHaveLength(0);
  });

  it("respeita limiar configurável (30 dias faz virar reativado)", () => {
    const rows = [
      row({ cliente: "Meio LTDA", data: "2026-05-25", codigo_venda: 1 }),
      row({ cliente: "Meio LTDA", data: "2026-07-05", codigo_venda: 2 }),
    ];
    const atual = rows.filter(r => r.data >= inicio);
    const r60 = classifyClientsForPeriod({
      todasAsVendas: rows, vendasNoPeriodoAtualFiltradas: atual,
      inicio, fim, reativacaoDiasSemCompra: 60,
    });
    expect(r60.recorrentes).toHaveLength(1);
    const r30 = classifyClientsForPeriod({
      todasAsVendas: rows, vendasNoPeriodoAtualFiltradas: atual,
      inicio, fim, reativacaoDiasSemCompra: 30,
    });
    expect(r30.reativados).toHaveLength(1);
    expect(r30.recorrentes).toHaveLength(0);
  });

  it("nunca soma novos + reativados no mesmo bucket", () => {
    const rows = [
      row({ cliente: "A Nova", data: "2026-07-02", codigo_venda: 1 }),
      row({ cliente: "B Reativada", data: "2026-01-05", codigo_venda: 2 }),
      row({ cliente: "B Reativada", data: "2026-07-08", codigo_venda: 3 }),
      row({ cliente: "C Recorrente", data: "2026-06-25", codigo_venda: 4 }),
      row({ cliente: "C Recorrente", data: "2026-07-10", codigo_venda: 5 }),
    ];
    const atual = rows.filter(r => r.data >= inicio);
    const res = classifyClientsForPeriod({
      todasAsVendas: rows, vendasNoPeriodoAtualFiltradas: atual,
      inicio, fim, reativacaoDiasSemCompra: 60,
    });
    expect(res.novos.map(c => c.cliente)).toEqual(["A Nova"]);
    expect(res.reativados.map(c => c.cliente)).toEqual(["B Reativada"]);
    expect(res.recorrentes.map(c => c.cliente)).toEqual(["C Recorrente"]);
  });

  it("cliente com compra há mais de 4 anos NÃO é novo — é reativado (regressão Cafeteria Café Gourmet)", () => {
    // Caso real: Cafeteria Cafe Gourmet comprou até 12/01/2022 e voltou em 09/07/2026.
    // A tela detalhada usava janela de 6 meses e classificava como NOVO — errado.
    // A fonte única deve retornar REATIVADO.
    const rows = [
      row({ cliente: "Cafeteria Cafe Gourmet", data: "2022-01-12", codigo_venda: 10 }),
      row({ cliente: "Cafeteria Cafe Gourmet (IM)", data: "2026-07-09", codigo_venda: 11 }),
    ];
    const atual = rows.filter(r => r.data >= inicio);
    const res = classifyClientsForPeriod({
      todasAsVendas: rows, vendasNoPeriodoAtualFiltradas: atual,
      inicio, fim, reativacaoDiasSemCompra: 60,
    });
    expect(res.novos).toHaveLength(0);
    expect(res.reativados).toHaveLength(1);
    expect(res.reativados[0].diasSemComprar).toBeGreaterThan(365 * 4);
  });
});

