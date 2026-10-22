// Documento do cliente: CNPJ (pessoa jurídica) ou CPF (pessoa física).
// Somente validação local dos dígitos verificadores — nenhuma consulta de dados
// pessoais por CPF é realizada.

import { isValidCnpj, onlyDigits } from "@/lib/cnpjLookup";
import { maskCnpj } from "@/lib/viacep";

export type TipoDocumento = "CNPJ" | "CPF";

export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Validação matemática dos dígitos verificadores do CPF */
export function isValidCpf(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export function maskDocumento(value: string, tipo: TipoDocumento): string {
  return tipo === "CPF" ? maskCpf(value) : maskCnpj(value);
}

export function isValidDocumento(value: string, tipo: TipoDocumento): boolean {
  return tipo === "CPF" ? isValidCpf(value) : isValidCnpj(value);
}

/** Descobre o tipo a partir da quantidade de dígitos (fallback para cadastros antigos). */
export function inferTipoDocumento(value: string | null | undefined): TipoDocumento {
  return onlyDigits(String(value ?? "")).length === 11 ? "CPF" : "CNPJ";
}

/** Rótulo a exibir para o documento de um cadastro. */
export function documentoLabel(
  tipo: TipoDocumento | null | undefined,
  documento?: string | null,
): TipoDocumento {
  if (tipo === "CPF" || tipo === "CNPJ") {
    // Cadastro antigo pode ter tipo padrão CNPJ com documento de 11 dígitos
    const digits = onlyDigits(String(documento ?? ""));
    if (digits.length === 11) return "CPF";
    if (digits.length === 14) return "CNPJ";
    return tipo;
  }
  return inferTipoDocumento(documento);
}

/** Documento formatado conforme o tipo, sem alterar o valor armazenado. */
export function formatDocumento(
  documento?: string | null,
  tipo?: TipoDocumento | null,
): string {
  const raw = String(documento ?? "").trim();
  if (!raw) return "";
  const label = documentoLabel(tipo, raw);
  const digits = onlyDigits(raw);
  if (label === "CPF" && digits.length === 11) return maskCpf(digits);
  if (label === "CNPJ" && digits.length === 14) return maskCnpj(digits);
  return raw;
}
