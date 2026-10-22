// Identificação inteligente entre os registros de endereço (client_address_staging)
// e a base OFICIAL de clientes (client_profiles + clientes com vendas importadas).
//
// Ordem de confiança (nunca funde por "nome parecido" sozinho):
//   1. ID / código do cliente
//   2. CNPJ / CPF
//   3. Telefone
//   4. Nome normalizado (sem acento, caixa, pontuação, tags "(IM)", "(GR)", "(INATIVO)")
//   5. Nome-base + endereço (rua + número/bairro) coincidentes
//   6. Similaridade alta -> apenas SUGESTÃO para associação manual

import { normalizeClientName } from "@/lib/clientNameNormalization";

/* --------------------------------------------------------------- normalização */

export function stripAccents(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Remove tags de sistema e status usados no Sige: (IM), (GR), (INATIVO), [ ], etc. */
export function stripTags(value: string): string {
  return value
    .replace(/\((?:im|gr|inativo|inadimplente|matriz|filial)\)/gi, " ")
    .replace(/\b(?:inativo|inadimplente)\b\s*[:-]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave canônica de nome: sem acento, caixa, pontuação, hífen, tags e espaços extras. */
export function nameKeyStrict(value: string | null | undefined): string {
  const canonical = normalizeClientName(String(value ?? ""));
  return stripAccents(stripTags(canonical || String(value ?? "")))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PREFIXOS = [
  "cafeteria", "cafe", "padaria", "panificadora", "supermercado", "mercado", "mercearia",
  "lanchonete", "restaurante", "hotel", "emporio", "empório", "sacolao", "sacolão",
  "confeitaria", "distribuidor", "distribuidora", "conveniencia", "loja", "bar", "posto",
  "escola", "colegio", "buffet", "atacado", "quitanda", "armazem",
];

const SUFIXOS_EMPRESA = [
  "ltda", "me", "epp", "eireli", "sa", "s a", "comercio", "com", "e cia", "cia",
  "industria", "servicos", "alimentos", "produtos",
];

/** Núcleo do nome: sem prefixo de segmento e sem sufixos societários / localidade. */
export function nameKeyCore(value: string | null | undefined): string {
  let key = nameKeyStrict(value);
  if (!key) return "";
  const palavras = key.split(" ");
  while (palavras.length > 1 && PREFIXOS.includes(palavras[0])) palavras.shift();
  key = palavras.join(" ");
  for (const sufixo of SUFIXOS_EMPRESA) {
    key = key.replace(new RegExp(`(^|\\s)${sufixo}(\\s|$)`, "g"), " ");
  }
  return key.replace(/\s+/g, " ").trim();
}

/** Nome sem a unidade/localidade final ("Padaria X - Betim" -> "padaria x"). */
export function nameKeyBase(value: string | null | undefined): string {
  const semUnidade = stripTags(normalizeClientName(String(value ?? "")) || String(value ?? ""))
    .split(/\s+[-–/]\s+/)[0];
  return nameKeyStrict(semUnidade);
}

export function docKey(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14 ? digits : "";
}

export function phoneKey(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^55/, "");
  return digits.length >= 10 ? digits.slice(-11) : "";
}

export function addressKey(parts: {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
}): string {
  const rua = stripAccents(parts.rua ?? "")
    .toLowerCase()
    .replace(/\b(rua|r|avenida|av|alameda|al|praca|travessa|rodovia|estrada)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const numero = String(parts.numero ?? "").replace(/\D/g, "");
  const bairro = stripAccents(parts.bairro ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const cidade = stripAccents(parts.cidade ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!rua) return "";
  return [rua, numero, bairro, cidade].filter(Boolean).join("|");
}

/* ------------------------------------------------------------- similaridade */

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.includes(shorter) && shorter.length >= 6) {
    return Math.max(0.85, shorter.length / longer.length);
  }
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let last = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let val = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1]) val = Math.min(val, last, costs[j]) + 1;
        costs[j - 1] = last;
        last = val;
      }
    }
    if (i > 0) costs[shorter.length] = last;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

/* ------------------------------------------------------------------- índice */

export interface ClientRef {
  /** id da ficha (client_profiles) quando existir */
  id?: string;
  nome: string;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  codigo?: string | null;
  telefone?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  /** true quando o cliente só existe na base de vendas (ainda sem ficha) */
  somenteVendas?: boolean;
}

export interface ClientIndex {
  refs: ClientRef[];
  byCodigo: Map<string, ClientRef[]>;
  byDoc: Map<string, ClientRef[]>;
  byPhone: Map<string, ClientRef[]>;
  byName: Map<string, ClientRef[]>;
  byCore: Map<string, ClientRef[]>;
  byAddress: Map<string, ClientRef[]>;
}

function push(map: Map<string, ClientRef[]>, key: string, ref: ClientRef) {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(ref)) list.push(ref);
  map.set(key, list);
}

export function buildClientIndex(refs: ClientRef[]): ClientIndex {
  const index: ClientIndex = {
    refs,
    byCodigo: new Map(), byDoc: new Map(), byPhone: new Map(),
    byName: new Map(), byCore: new Map(), byAddress: new Map(),
  };
  for (const ref of refs) {
    push(index.byCodigo, String(ref.codigo ?? "").trim(), ref);
    push(index.byDoc, docKey(ref.cnpj), ref);
    push(index.byPhone, phoneKey(ref.telefone), ref);
    push(index.byName, nameKeyStrict(ref.nome), ref);
    push(index.byName, nameKeyStrict(ref.nomeFantasia), ref);
    push(index.byCore, nameKeyCore(ref.nome), ref);
    push(index.byCore, nameKeyCore(ref.nomeFantasia), ref);
    push(index.byAddress, addressKey(ref), ref);
  }
  return index;
}

/* ---------------------------------------------------------------- resolução */

export interface AddressRecord {
  nome_fantasia?: string | null;
  razao_social?: string | null;
  cnpj_cpf?: string | null;
  codigo_cliente?: string | null;
  telefone?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
}

export type ResolveResult =
  | { status: "match"; ref: ClientRef; via: string; confianca: number }
  | { status: "sugestao"; sugestoes: Array<{ ref: ClientRef; score: number; via: string }> }
  | { status: "nenhum" };

function unico(list: ClientRef[] | undefined): ClientRef | undefined {
  if (!list || list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  // várias fichas para a mesma chave: prioriza a que já tem ficha cadastrada
  const comFicha = list.filter((r) => r.id);
  return comFicha.length === 1 ? comFicha[0] : undefined;
}

export function resolveAddressClient(record: AddressRecord, index: ClientIndex): ResolveResult {
  const nomes = [record.nome_fantasia, record.razao_social].filter(Boolean) as string[];

  // 1. código do cliente
  const porCodigo = unico(index.byCodigo.get(String(record.codigo_cliente ?? "").trim()));
  if (porCodigo && String(record.codigo_cliente ?? "").trim()) {
    return { status: "match", ref: porCodigo, via: "código do cliente", confianca: 1 };
  }
  // 2. CNPJ / CPF
  const doc = docKey(record.cnpj_cpf);
  const porDoc = unico(index.byDoc.get(doc));
  if (doc && porDoc) return { status: "match", ref: porDoc, via: "CNPJ/CPF", confianca: 1 };

  // 3. telefone
  const fone = phoneKey(record.telefone);
  const porFone = unico(index.byPhone.get(fone));
  if (fone && porFone) return { status: "match", ref: porFone, via: "telefone", confianca: 0.95 };

  // 4. nome normalizado (exato após limpeza)
  for (const nome of nomes) {
    const ref = unico(index.byName.get(nameKeyStrict(nome)));
    if (ref) return { status: "match", ref, via: "nome normalizado", confianca: 0.95 };
  }
  // 4b. núcleo do nome (sem prefixo de segmento e sufixos societários)
  for (const nome of nomes) {
    const core = nameKeyCore(nome);
    if (core.length < 6) continue;
    const ref = unico(index.byCore.get(core));
    if (ref) return { status: "match", ref, via: "nome (núcleo)", confianca: 0.9 };
  }

  // 5. nome-base + endereço coincidentes
  const endereco = addressKey(record);
  if (endereco) {
    const noEndereco = index.byAddress.get(endereco) ?? [];
    for (const ref of noEndereco) {
      const base = nameKeyBase(record.nome_fantasia ?? record.razao_social ?? "");
      if (!base) continue;
      const refBase = nameKeyBase(ref.nome) || nameKeyBase(ref.nomeFantasia);
      if (base === refBase || similarity(base, refBase) >= 0.8) {
        return { status: "match", ref, via: "nome + endereço", confianca: 0.9 };
      }
    }
  }

  // 6. similaridade -> sugestão manual
  const alvo = nameKeyCore(nomes[0] ?? "");
  const sugestoes: Array<{ ref: ClientRef; score: number; via: string }> = [];
  if (alvo.length >= 6) {
    for (const ref of index.refs) {
      const score = Math.max(
        similarity(alvo, nameKeyCore(ref.nome)),
        similarity(alvo, nameKeyCore(ref.nomeFantasia ?? "")),
      );
      if (score >= 0.82) sugestoes.push({ ref, score, via: "nome semelhante" });
    }
  }
  sugestoes.sort((a, b) => b.score - a.score);
  if (sugestoes.length) return { status: "sugestao", sugestoes: sugestoes.slice(0, 5) };
  return { status: "nenhum" };
}

/** Motivo legível para o relatório de auditoria. */
export function motivoSemCorrespondencia(record: AddressRecord): string {
  if (!docKey(record.cnpj_cpf)) return "sem CNPJ/CPF válido e nenhum cliente com nome equivalente";
  return "CNPJ não encontrado na base de clientes e nenhum nome equivalente";
}
