import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { getComparativoCliente, useInteligenciaData, type InteligenciaFilters } from "@/hooks/useInteligenciaData";
import type { SaleRow } from "@/hooks/useSalesData";

const row = (id: number, cliente: string, data: string, valor: number, vendedor = "Juliano Carneiro Meira Freitas"): SaleRow => ({
  id,
  codigo_venda: id,
  data,
  quantidade: 1,
  descricao: "95 - Pão de Queijo",
  cnpj_cpf: null,
  cliente,
  vendedor,
  preco_unitario: valor,
  preco_total: valor,
});

describe("getComparativoCliente", () => {
  it("normaliza nomes, inclui o fim do dia e não zera cliente com compra no período atual", () => {
    const vendas: SaleRow[] = [
      row(1, "Padaria Bonna Massa - Jardim Canada", "2026-03-26T17:21:00.000Z", 10569),
      row(2, "Padaria Bonna Massa - Jardim Canada (IM)", "2026-04-29T17:11:00.000Z", 13385.4),
      row(3, "Lanchonete Nossa Cantina - Faculdade Dom Helder", "2026-03-17T16:09:00.000Z", 11968.8),
      row(4, "Lanchonete Nossa Cantina - Faculdade Dom Helder (IM)", "2026-04-09T19:55:00.000Z", 5754.7),
    ];
    const filtros: InteligenciaFilters & { vendas: SaleRow[] } = {
      inicio: "2026-04-01",
      fim: "2026-04-29",
      compInicio: "2026-03-01",
      compFim: "2026-03-29",
      vendedores: ["Juliano"],
      cliente: "",
      produto: "",
      vendas,
    };

    const bonna = getComparativoCliente("PADARIA BONNA MASSA – JARDIM CANADA", filtros.inicio, filtros.fim, filtros.compInicio, filtros.compFim, filtros);
    expect(bonna.fatAtual).toBeCloseTo(13385.4);
    expect(bonna.fatComp).toBeCloseTo(10569);
    expect(bonna.diff).toBeGreaterThan(0);
    expect(bonna.pedidosAtual).toBe(1);

    const cantina = getComparativoCliente("Lanchonete Nossa Cantina – Faculdade Dom Helder", filtros.inicio, filtros.fim, filtros.compInicio, filtros.compFim, filtros);
    expect(cantina.fatAtual).toBeCloseTo(5754.7);
    expect(cantina.fatComp).toBeCloseTo(11968.8);
    expect(cantina.diff).toBeLessThan(0);
    expect(cantina.pedidosAtual).toBe(1);
  });

  it("executa obrigatoriamente comparação quando os quatro campos de período estão preenchidos", () => {
    const vendas: SaleRow[] = [
      row(1, "Cliente Junho A", "2026-06-01T10:00:00.000Z", 1200, "Juliano"),
      row(2, "Cliente Junho B", "2026-06-09T15:00:00.000Z", 800, "Juliano"),
      row(3, "Cliente Maio A", "2026-05-01T10:00:00.000Z", 900, "Juliano"),
      row(4, "Cliente Maio B", "2026-05-09T15:00:00.000Z", 700, "Juliano"),
    ];
    const filtros: InteligenciaFilters = {
      inicio: "2026-06-01",
      fim: "2026-06-09",
      compInicio: "2026-05-01",
      compFim: "2026-05-09",
      vendedores: [],
      cliente: "",
      clientes: [],
      produto: "",
      analysisMode: "compare",
    };

    const { result } = renderHook(() => useInteligenciaData(vendas, filtros));
    const data = result.current;

    expect(data).not.toBeNull();
    expect(data?.hasComp).toBe(true);
    expect(data?.comparisonAudit.hasComparisonRequested).toBe(true);
    expect(data?.comparisonAudit.hasComparisonFailure).toBe(false);
    expect(data?.fatComp).toBeGreaterThan(0);
    expect(data?.decomposition.pedidosComp).toBeGreaterThan(0);
    expect(data?.decomposition.clientesAtivosComp).toBeGreaterThan(0);
    expect(data?.decomposition.volumeComp).toBeGreaterThan(0);
    expect(data?.auditComp?.faturamentoTotal).toBeCloseTo(1600);
  });

  it("aplica vendedor, cliente e múltiplos produtos no comparativo com lógica OR sem zerar indevidamente", () => {
    const vendas: SaleRow[] = [
      { ...row(10, "Cliente A", "2026-06-01T10:00:00.000Z", 1000, "Juliano Carneiro Meira Freitas"), descricao: "99 - Pão de Queijo Lanche Frango Ti Delso 1kg", quantidade: 5 },
      { ...row(11, "Cliente A", "2026-06-02T10:00:00.000Z", 700, "Juliano Carneiro Meira Freitas"), descricao: "102 - Pão de Queijo Lanche Requeijão Ti Delso 1kg", quantidade: 3 },
      { ...row(12, "Cliente A", "2026-05-01T10:00:00.000Z", 900, "Juliano Carneiro Meira Freitas"), descricao: "99 - Pão de Queijo Lanche Frango Ti Delso 1kg", quantidade: 4 },
      { ...row(13, "Cliente A", "2026-05-02T10:00:00.000Z", 600, "Juliano Carneiro Meira Freitas"), descricao: "102 - Pão de Queijo Lanche Requeijão Ti Delso 1kg", quantidade: 2 },
      { ...row(14, "Cliente A", "2026-05-03T10:00:00.000Z", 999, "Outro Vendedor"), descricao: "99 - Pão de Queijo Lanche Frango Ti Delso 1kg", quantidade: 1 },
      { ...row(15, "Cliente B", "2026-05-03T10:00:00.000Z", 888, "Juliano Carneiro Meira Freitas"), descricao: "102 - Pão de Queijo Lanche Requeijão Ti Delso 1kg", quantidade: 1 },
    ];
    const filtros: InteligenciaFilters = {
      inicio: "2026-06-01",
      fim: "2026-06-18",
      compInicio: "2026-05-01",
      compFim: "2026-05-18",
      vendedores: ["Juliano"],
      cliente: "",
      clientes: ["Cliente A"],
      produto: "",
      produtos: [
        "99 - Pão de Queijo Lanche Frango Ti Delso 1kg",
        "Pão de Queijo Lanche Requeijão Ti Delso 1kg",
      ],
      analysisMode: "compare",
    };

    const { result } = renderHook(() => useInteligenciaData(vendas, filtros));
    const data = result.current;

    expect(data?.comparisonAudit.isComparisonEmpty).toBe(false);
    const finalStage = data?.comparisonAudit.etapasComparativas[data.comparisonAudit.etapasComparativas.length - 1];
    expect(finalStage?.linhas).toBe(2);
    expect(data?.fatAtual).toBeCloseTo(1700);
    expect(data?.fatComp).toBeCloseTo(1500);
    expect(data?.decomposition.pedidosComp).toBe(2);
    expect(data?.decomposition.volumeComp).toBeCloseTo(6);
  });

  it("carrega comparativo separado para 01/06-18/06 vs 01/05-18/05 com vendedor Juliano", () => {
    const vendas: SaleRow[] = [
      { ...row(20, "Cliente Junho A", "2026-06-01T10:00:00.000Z", 1000, "Juliano Carneiro Meira Freitas"), quantidade: 10 },
      { ...row(21, "Cliente Junho B", "2026-06-18T20:00:00.000Z", 700, "Juliano Carneiro Meira Freitas"), quantidade: 7 },
      { ...row(22, "Cliente Maio A", "2026-05-01T10:00:00.000Z", 900, "Juliano Carneiro Meira Freitas"), quantidade: 9 },
      { ...row(23, "Cliente Maio B", "2026-05-18T20:00:00.000Z", 600, "Juliano Carneiro Meira Freitas"), quantidade: 6 },
    ];
    const filtros: InteligenciaFilters = {
      inicio: "2026-06-01",
      fim: "2026-06-18",
      compInicio: "2026-05-01",
      compFim: "2026-05-18",
      vendedores: ["Juliano"],
      cliente: "",
      clientes: [],
      produto: "",
      produtos: [],
      analysisMode: "compare",
    };

    const { result } = renderHook(() => useInteligenciaData(vendas, filtros));
    const data = result.current;

    expect(data?.comparisonAudit.hasComparisonRequested).toBe(true);
    expect(data?.comparisonAudit.isComparisonEmpty).toBe(false);
    expect(data?.fatAtual).toBeCloseTo(1700);
    expect(data?.fatComp).toBeCloseTo(1500);
    expect(data?.decomposition.pedidosComp).toBe(2);
    expect(data?.decomposition.clientesAtivosComp).toBe(2);
    expect(data?.decomposition.volumeComp).toBeCloseTo(15);
  });
});