import { describe, expect, it } from "vitest";
import { calcularInvestimentoReal, type CustoDegustacao, type PeriodoMetrics } from "@/lib/acaoResultado";
import { buildCustoProdutoIndex } from "@/lib/produtoCusto";

const periodo: PeriodoMetrics = {
  inicio: "2026-08-01", fim: "2026-08-31", dias: 31, meses: 1,
  faturamento: 1000, kg: 100, pedidos: 10, itens: 10, ticketMedio: 100, precoMedioKg: 10,
};

const degustacao: CustoDegustacao = {
  id: "d1", data: "2026-08-10", loja: "Cliente A", promotora: "Maria",
  promotoras: [{ nome: "Maria", valor: 100 }],
  produtos: "Produto A (7)", kg: 7, custoProdutos: 73.15, custoPromotora: 100,
  total: 173.15, itens: [{ nome: "Produto A", quantidade: 7, custoKg: 10.45, total: 73.15 }],
  produtosSemCusto: [],
};

describe("investimento real da ação", () => {
  it("soma degustação, promotora, bonificação, evento e outros custos", () => {
    const custoProdutos = buildCustoProdutoIndex([
      { produto: "Produto A", quantidade: 10, custo: 104.5, data: "2026-08-01" },
    ]);
    const result = calcularInvestimentoReal({
      action: {
        cliente: "Cliente A", data_inicio: "2026-08-01", data_fim: "2026-08-31", status: "Em andamento",
        valor_investimento: 200, quantidade_bonificada: 10, bonificacao_unidade: "kg",
        bonificacao_produtos: ["Produto A"], outros_custos: 50,
      },
      durante: periodo,
      rowsCliente: [],
      degustacoes: [degustacao],
      custoProdutos,
    });

    expect(result.custoDegustacoes).toBeCloseTo(73.15);
    expect(result.custoPromotoras).toBe(100);
    expect(result.bonificacao).toBeCloseTo(104.5);
    expect(result.total).toBeCloseTo(527.65);
    expect(result.custoPendente).toBe(false);
  });

  it("sinaliza produto sem custo em vez de tratá-lo silenciosamente como zero", () => {
    const result = calcularInvestimentoReal({
      action: {
        cliente: "Cliente A", data_inicio: "2026-08-01", data_fim: "2026-08-31", status: "Planejada",
        valor_investimento: 0, quantidade_bonificada: 5, bonificacao_unidade: "kg",
        bonificacao_produtos: ["Produto sem preço"], outros_custos: 0,
      },
      durante: periodo,
      rowsCliente: [],
      degustacoes: [],
      custoProdutos: buildCustoProdutoIndex([]),
    });

    expect(result.custoPendente).toBe(true);
    expect(result.produtosSemCusto).toContain("Produto sem preço");
  });
});