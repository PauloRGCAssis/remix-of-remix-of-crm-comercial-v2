import { describe, it, expect } from "vitest";
import {
  isValidCpf,
  maskCpf,
  maskDocumento,
  documentoLabel,
  formatDocumento,
} from "@/lib/documentoCliente";

describe("documento do cliente (CPF/CNPJ)", () => {
  it("valida dígitos verificadores do CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("aplica máscara de CPF progressivamente", () => {
    expect(maskCpf("529")).toBe("529");
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskDocumento("11222333000181", "CNPJ")).toBe("11.222.333/0001-81");
  });

  it("identifica e formata o documento conforme o tipo", () => {
    expect(documentoLabel("CPF", "52998224725")).toBe("CPF");
    expect(documentoLabel("CNPJ", "11222333000181")).toBe("CNPJ");
    // Cadastro antigo com tipo padrão CNPJ mas documento de 11 dígitos
    expect(documentoLabel("CNPJ", "52998224725")).toBe("CPF");
    expect(formatDocumento("52998224725", "CPF")).toBe("529.982.247-25");
    expect(formatDocumento("11222333000181", "CNPJ")).toBe("11.222.333/0001-81");
    expect(formatDocumento("", "CPF")).toBe("");
  });
});
