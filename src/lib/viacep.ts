// Busca de CEP via ViaCEP (API pública gratuita)

import { getRegionalByBairro } from "@/data/regionais";

export interface ViaCepResult {
  cep: string;
  rua?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  regiao?: string;
}

export function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function buscarCep(cep: string): Promise<ViaCepResult | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) return null;

    const bairro = data.bairro || undefined;
    const cidade = data.localidade || undefined;

    return {
      cep: maskCep(digits),
      rua: data.logradouro || undefined,
      bairro,
      cidade,
      estado: data.uf || undefined,
      regiao: cidade?.toLowerCase().includes("belo horizonte")
        ? getRegionalByBairro(bairro)
        : undefined,
    };
  } catch (err) {
    console.error("Erro buscando CEP:", err);
    return null;
  }
}

export function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
