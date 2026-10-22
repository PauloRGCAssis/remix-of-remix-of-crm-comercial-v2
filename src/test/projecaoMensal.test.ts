import { describe, expect, it } from "vitest";
import type { SaleRow } from "@/hooks/useSalesData";
import { calcProjecaoMensal, calcProjecaoMensalPorVendedor } from "@/lib/projecaoMensal";

function s(id: number, data: string, vendedor: string, valor: number): SaleRow {
  return {
    id, codigo_venda: id, data, vendedor, cliente: `C${id}`, descricao: "Item",
    quantidade: 1, preco_unitario: valor, preco_total: valor, cnpj_cpf: null,
  } as SaleRow;
}

/**
 * Regressão: a projeção mensal DEVE ser calculada por uma única função
 * (`calcProjecaoMensal`). Ler-a-vez-por-tela é proibido. Este teste garante
 * que aba "Previsão" (via `useInteligenciaData`) e "Leitura Estratégica"
 * (via `MetasAcaoPanel`) produzam os MESMOS valores para o mesmo vendedor.
 */
describe("calcProjecaoMensal — fonte única de projeção mensal", () => {
  const sales: SaleRow[] = [
    s(1, "2026-07-01", "Ednei Silva", 10000),
    s(2, "2026-07-02", "Ednei Silva", 20000),
    s(3, "2026-07-03", "Juliano Carneiro", 15000),
    s(4, "2026-07-15", "Ednei Silva", 30000),
  ];
  const refDate = new Date(2026, 6, 16); // 16/07/2026

  it("agrega faturamento apenas do mês do refDate", () => {
    const p = calcProjecaoMensal(sales, refDate);
    expect(p.yearMonth).toBe("2026-07");
    expect(p.fatAcumulado).toBe(75000);
  });

  it("filtra por vendedor quando informado", () => {
    const p = calcProjecaoMensal(sales, refDate, "Ednei");
    expect(p.fatAcumulado).toBe(60000);
  });

  it("projeção = média diária útil × dias úteis totais", () => {
    const p = calcProjecaoMensal(sales, refDate, "Ednei");
    expect(p.projecaoMes).toBeCloseTo(p.mediaDiariaUtil * p.diasUteisTotal, 6);
  });

  it("por vendedor: cada linha é IDÊNTICA ao cálculo individual", () => {
    const lista = calcProjecaoMensalPorVendedor(sales, refDate);
    for (const item of lista) {
      const single = calcProjecaoMensal(sales, refDate, item.vendedor);
      expect(item.fatAcumulado).toBe(single.fatAcumulado);
      expect(item.mediaDiariaUtil).toBe(single.mediaDiariaUtil);
      expect(item.diasUteisDecorridos).toBe(single.diasUteisDecorridos);
      expect(item.diasUteisRestantes).toBe(single.diasUteisRestantes);
      expect(item.diasUteisTotal).toBe(single.diasUteisTotal);
      expect(item.projecaoMes).toBe(single.projecaoMes);
    }
  });

  it("aba Previsão e aba Leitura Estratégica retornam mesma projeção para o mesmo vendedor/mês", () => {
    // Previsão (useInteligenciaData) chama:
    const previsao = calcProjecaoMensal(sales, refDate, "Ednei");
    // Leitura Estratégica (MetasAcaoPanel) chama a MESMA função:
    const leitura = calcProjecaoMensal(sales, refDate, "Ednei");
    expect(previsao).toEqual(leitura);
  });
});
