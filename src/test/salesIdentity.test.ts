import { describe, it, expect, beforeEach } from "vitest";
import {
  cleanProductName,
  extractProductCode,
  registerProductVocabulary,
  resetProductCanonicalMap,
  buildClientNameByDocument,
  resolveClientName,
  getMonthKey,
  type SaleRow,
} from "@/hooks/useSalesData";

function row(partial: Partial<SaleRow>): SaleRow {
  return {
    id: Math.random(),
    codigo_venda: 1,
    data: "2026-07-10T00:00:00+00:00",
    quantidade: 5,
    descricao: "105 - Pão de Queijo Tradicional Recheado Goiabada Ti Delso 1 kg",
    cnpj_cpf: "49933780000111",
    cliente: "Armazem Central - Mercado Central 1 (GR)",
    vendedor: "Juliano",
    preco_unitario: 23.32,
    preco_total: 116.6,
    ...partial,
  } as SaleRow;
}

describe("identidade do produto pelo código", () => {
  beforeEach(() => resetProductCanonicalMap());

  it("extrai o código em todas as variações de prefixo", () => {
    expect(extractProductCode("105 - Pão de Queijo Goiabada 1 kg")).toBe("105");
    expect(extractProductCode("105- Pão de Queijo Goiabada 1kg")).toBe("105");
    expect(extractProductCode("105-1 - Tradicional Recheado Goiabada 1kg")).toBe("105");
    expect(extractProductCode("Pão de Queijo sem código")).toBe("");
  });

  it("agrupa variações de texto do mesmo código em um único produto", () => {
    const variantes = [
      "105 - Pão de Queijo Tradicional Recheado Goiabada Ti Delso 1 kg",
      "105 - Pao de Queijo Tradicional Goiabada Ti Delso 1 kg",
      "105 - Pão de Queijo Tradicional Recheado Goiabada Ti Delso 1kg",
      "105-1 - Tradicional Recheado Goiabada Ti Delso 1kg",
    ];
    registerProductVocabulary(variantes.map((descricao) => ({ descricao })));
    const nomes = new Set(variantes.map((d) => cleanProductName(d)));
    expect(nomes.size).toBe(1);
  });

  it("nunca funde produtos diferentes que têm o mesmo preço", () => {
    const descs = [
      "99 - Pão de Queijo Tradicional Recheado Frango Ti Delso 1 kg",
      "102 - Pão de Queijo Tradicional Recheado Requeijão Ti Delso 1 kg",
      "105 - Pão de Queijo Tradicional Recheado Goiabada Ti Delso 1 kg",
    ];
    registerProductVocabulary(descs.map((descricao) => ({ descricao })));
    expect(new Set(descs.map((d) => cleanProductName(d))).size).toBe(3);
  });
});

describe("identidade do cliente pelo CNPJ", () => {
  it("unifica nomes diferentes com o mesmo documento", () => {
    const rows = [
      { cnpj_cpf: "49.933.780/0001-11", cliente: "Armazem Central - Mercado Central 1 (GR)" },
      { cnpj_cpf: "49933780000111", cliente: "Armazem  Central -  Mercado Central 1 (GR)" },
      { cnpj_cpf: "49933780000111", cliente: "Armazem Central - Mercado Central 1 (GR)" },
    ];
    const map = buildClientNameByDocument(rows);
    const nomes = new Set(rows.map((r) => resolveClientName(r, map)));
    expect(nomes.size).toBe(1);
  });

  it("mantém o nome quando não há documento", () => {
    const map = buildClientNameByDocument([]);
    expect(resolveClientName({ cliente: "Padaria Kero Kero", cnpj_cpf: null }, map)).toContain("Kero");
  });
});

describe("consistência de soma por cliente + produto + mês", () => {
  beforeEach(() => resetProductCanonicalMap());

  it("soma todas as linhas reais, inclusive compras repetidas iguais", () => {
    const linhas = [
      row({ quantidade: 5, preco_total: 116.6 }),
      row({ quantidade: 5, preco_total: 116.6, descricao: "105 - Pao de Queijo Tradicional Goiabada Ti Delso 1 kg" }),
      row({ quantidade: 10, preco_total: 233.2, descricao: "105 - Pão de Queijo Tradicional Recheado Goiabada Ti Delso 1kg" }),
      row({ quantidade: 5, preco_total: 116.6, descricao: "105-1 - Tradicional Recheado Goiabada Ti Delso 1kg" }),
    ];
    registerProductVocabulary(linhas);

    const agg = new Map<string, { qtd: number; fat: number; linhas: number }>();
    for (const l of linhas) {
      const key = `${l.cnpj_cpf}|${extractProductCode(l.descricao)}|${getMonthKey(l.data)}`;
      const e = agg.get(key) ?? { qtd: 0, fat: 0, linhas: 0 };
      e.qtd += l.quantidade;
      e.fat += l.preco_total;
      e.linhas += 1;
      agg.set(key, e);
    }

    expect(agg.size).toBe(1);
    const total = [...agg.values()][0];
    expect(total.qtd).toBe(25);
    expect(total.fat).toBeCloseTo(583, 2);
    expect(total.linhas).toBe(4);
    expect(new Set(linhas.map((l) => cleanProductName(l.descricao))).size).toBe(1);
  });
});

describe("competência do mês (data da venda em UTC)", () => {
  it("não joga vendas do dia 1 para o mês anterior", () => {
    expect(getMonthKey("2026-08-01T00:00:00+00:00")).toBe("Ago/26");
    expect(getMonthKey("2026-07-31T00:00:00+00:00")).toBe("Jul/26");
    expect(getMonthKey("2026-01-01T00:00:00Z")).toBe("Jan/26");
  });
});
