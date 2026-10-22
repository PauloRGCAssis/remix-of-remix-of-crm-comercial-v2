// Consulta de dados de empresa por CNPJ.
// Serviço principal: BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj}) — público, sem chave.
// Fallback: CNPJ.ws público (https://publica.cnpj.ws/cnpj/{cnpj}) — público, sem chave.
// Ambos são consultados direto do navegador (CORS liberado) — nenhuma chave/segredo envolvido.

import { getRegionalByBairro } from "@/data/regionais";
import { formatPhone } from "@/lib/phoneFormatting";

export interface CnpjLookupResult {
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  regiao?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  telefone?: string;
  email?: string;
  ramo_atividade?: string;
}

export type CnpjLookupStatus = "ok" | "invalid" | "not_found" | "error";

export interface CnpjLookupResponse {
  status: CnpjLookupStatus;
  data?: CnpjLookupResult;
  message?: string;
  /** Diagnóstico do serviço efetivamente usado (sem segredos) */
  source?: string;
  httpStatus?: number;
}

export function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Validação matemática dos dígitos verificadores do CNPJ */
export function isValidCnpj(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(c[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

function maskCepValue(cep?: string | null): string | undefined {
  const digits = onlyDigits(String(cep ?? ""));
  if (digits.length !== 8) return undefined;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function clean(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

function withRegiao(base: CnpjLookupResult): CnpjLookupResult {
  const regiao = base.cidade?.toLowerCase().includes("belo horizonte")
    ? getRegionalByBairro(base.bairro)
    : undefined;
  return { ...base, regiao: regiao && regiao !== "Não definida" ? regiao : undefined };
}

async function fetchJson(url: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { httpStatus: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

function mapBrasilApi(d: any): CnpjLookupResult {
  const telefone = clean(d.ddd_telefone_1) ?? clean(d.ddd_telefone_2);
  return withRegiao({
    razao_social: clean(d.razao_social),
    nome_fantasia: clean(d.nome_fantasia),
    cep: maskCepValue(d.cep),
    rua: [clean(d.descricao_tipo_de_logradouro), clean(d.logradouro)].filter(Boolean).join(" ").trim() || undefined,
    numero: clean(d.numero),
    complemento: clean(d.complemento),
    bairro: clean(d.bairro),
    cidade: clean(d.municipio),
    estado: clean(d.uf),
    telefone: telefone ? formatPhone(telefone) : undefined,
    email: clean(d.email),
    ramo_atividade: clean(d.cnae_fiscal_descricao),
  });
}

function mapCnpjWs(d: any): CnpjLookupResult {
  const est = d.estabelecimento ?? {};
  const ie = Array.isArray(est.inscricoes_estaduais)
    ? clean(est.inscricoes_estaduais.find((i: any) => i?.ativo)?.inscricao_estadual)
    : undefined;
  const telefone = est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : undefined;
  return withRegiao({
    razao_social: clean(d.razao_social),
    nome_fantasia: clean(est.nome_fantasia),
    cep: maskCepValue(est.cep),
    rua: [clean(est.tipo_logradouro), clean(est.logradouro)].filter(Boolean).join(" ").trim() || undefined,
    numero: clean(est.numero),
    complemento: clean(est.complemento),
    bairro: clean(est.bairro),
    cidade: clean(est.cidade?.nome),
    estado: clean(est.estado?.sigla),
    inscricao_estadual: ie,
    telefone: telefone ? formatPhone(telefone) : undefined,
    email: clean(est.email),
    ramo_atividade: clean(est.atividade_principal?.descricao),
  });
}

/**
 * Consulta o CNPJ e distingue claramente:
 * - CNPJ matematicamente inválido
 * - cadastro inexistente (404 explícito)
 * - falha de serviço (timeout, 429, 5xx, rede/CORS)
 */
export async function consultarCnpj(cnpj: string): Promise<CnpjLookupResponse> {
  const digitado = cnpj ?? "";
  const digits = onlyDigits(digitado);

  if (!isValidCnpj(digits)) {
    console.info("[CNPJ] digitado:", digitado, "| normalizado:", digits, "| resultado: inválido (dígitos verificadores)");
    return { status: "invalid", message: "CNPJ inválido. Confira o número informado." };
  }

  const providers = [
    {
      name: "BrasilAPI",
      url: `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      map: mapBrasilApi,
    },
    {
      name: "CNPJ.ws (público)",
      url: `https://publica.cnpj.ws/cnpj/${digits}`,
      map: mapCnpjWs,
    },
  ];

  let notFound = false;
  let lastHttp: number | undefined;
  let lastSource: string | undefined;

  for (const p of providers) {
    lastSource = p.name;
    try {
      const { httpStatus, ok, body } = await fetchJson(p.url);
      lastHttp = httpStatus;
      console.info(
        `[CNPJ] digitado: ${digitado} | normalizado: ${digits} | serviço: ${p.name} | URL: ${p.url} | HTTP: ${httpStatus}`,
      );

      if (ok && body) {
        return { status: "ok", data: p.map(body), source: p.name, httpStatus };
      }
      if (httpStatus === 404) {
        notFound = true;
        continue;
      }
      console.warn(`[CNPJ] resposta de erro do serviço ${p.name}:`, body);
    } catch (err) {
      console.warn(`[CNPJ] falha de rede/timeout no serviço ${p.name}:`, err);
    }
  }

  if (notFound) {
    return {
      status: "not_found",
      message: "CNPJ não encontrado na base da Receita Federal.",
      source: lastSource,
      httpStatus: lastHttp,
    };
  }

  return {
    status: "error",
    message: "Não foi possível consultar o CNPJ no momento. Tente novamente.",
    source: lastSource,
    httpStatus: lastHttp,
  };
}

/** @deprecated use consultarCnpj — mantido para compatibilidade */
export async function buscarCnpj(cnpj: string): Promise<CnpjLookupResult | null> {
  const r = await consultarCnpj(cnpj);
  return r.status === "ok" ? r.data ?? null : null;
}
