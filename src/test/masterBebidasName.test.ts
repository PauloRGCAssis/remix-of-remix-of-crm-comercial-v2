import { describe, expect, it } from "vitest";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { buildClientNameByDocument, resolveClientName } from "@/hooks/useSalesData";

describe("nome comercial Master Bebidas - Nova Lima", () => {
  it("mantém variantes do nome antigo associadas ao nome novo", () => {
    expect(normalizeClientName("Rosana Domingos Martins- Master Bebidas (GR)"))
      .toBe("Master Bebidas - Nova Lima");
    expect(normalizeClientName("Rosana Domingos Martins"))
      .toBe("Master Bebidas - Nova Lima");
  });

  it("exibe as vendas existentes com o mesmo nome pelo documento", () => {
    const rows = [{ cnpj_cpf: "05108936605", cliente: "Rosana Domingos Martins- Master Bebidas (GR)" }];
    const names = buildClientNameByDocument(rows);
    expect(resolveClientName(rows[0], names)).toBe("Master Bebidas - Nova Lima");
  });
});