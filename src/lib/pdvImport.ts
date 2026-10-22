// Regras de importação das DUAS planilhas que alimentam o módulo Ponto de Venda.
//
// 1) "PDV Atuais"  -> dados comerciais (pedidos, produtos, quantidades, preços, faturamento).
// 2) "Cadastro Clientes Sige" -> apenas dados cadastrais/localização que complementam o cliente.
//
// Nenhuma das duas apaga os dados da outra. O cruzamento usa, nesta ordem:
// código do cliente → CPF/CNPJ normalizado → nome fantasia normalizado → razão social normalizada.

import { nameKey, normalizeDoc } from "@/lib/pontoVenda";
import type { ClientProfile } from "@/types/clientProfile";
import type { SaleRow } from "@/hooks/useSalesData";

/* ------------------------------------------------------------------ campos */

export const CADASTRO_FIELDS = [
  { key: "nome_fantasia", label: "Nome fantasia", match: /fantasia/i },
  { key: "rua", label: "Endereço (logradouro)", match: /logradouro|^rua|endere/i },
  { key: "numero", label: "Número", match: /n[uú]mero|numero|^n[ºo°]?$/i },
  { key: "complemento", label: "Complemento", match: /complemento/i },
  { key: "bairro", label: "Bairro", match: /bairro/i },
  { key: "cidade", label: "Cidade", match: /cidade|munic[ií]pio/i },
  { key: "estado", label: "Estado (UF)", match: /^uf$|estado/i },
  { key: "vendedor", label: "Vendedor responsável", match: /vendedor/i },
  { key: "segmento", label: "Segmento", match: /segmento|categoria|grupo/i },
] as const;

export const CADASTRO_ID_FIELDS = [
  { key: "codigo_cliente", label: "Código do cliente", match: /c[oó]digo\s*(identificador|do\s*cliente)|identificador\s*[uú]nico/i },
  { key: "cnpj_cpf", label: "CPF / CNPJ", match: /cnpj|cpf|documento/i },
  { key: "razao_social", label: "Razão social", match: /raz[aã]o/i },
] as const;

export const PDV_FIELDS = [
  { key: "cliente", label: "Cliente", match: /^cliente$|nome\s*do\s*cliente|raz[aã]o/i },
  { key: "cnpj_cpf", label: "CPF / CNPJ", match: /cnpj|cpf|documento/i },
  { key: "codigo_cliente", label: "Código do cliente", match: /c[oó]digo\s*(do\s*)?cliente/i },
  { key: "codigo_venda", label: "Número do pedido", match: /c[oó]digo\s*venda|pedido|n[uú]mero\s*venda/i },
  { key: "data", label: "Data do pedido", match: /^data$|data\s*(do\s*)?pedido|emiss/i },
  { key: "produto", label: "Produto / Descrição", match: /descri|produto/i },
  { key: "codigo_produto", label: "Código do produto", match: /c[oó]digo\s*(do\s*)?produto|sku/i },
  { key: "quantidade", label: "Quantidade / Peso", match: /quantidade|qtd|peso|volume/i },
  { key: "preco_unitario", label: "Preço unitário", match: /pre[çc]o\s*venda\s*\(|pre[çc]o\s*unit/i },
  { key: "preco_total", label: "Faturamento (total)", match: /total/i },
  { key: "vendedor", label: "Vendedor", match: /vendedor/i },
  { key: "segmento", label: "Segmento", match: /segmento|categoria|grupo/i },
] as const;

export type CadastroFieldKey = (typeof CADASTRO_FIELDS)[number]["key"];
export type CadastroIdKey = (typeof CADASTRO_ID_FIELDS)[number]["key"];
export type PdvFieldKey = (typeof PDV_FIELDS)[number]["key"];

export const NONE = "__none__";

export function autoMap(
  headers: string[],
  fields: ReadonlyArray<{ key: string; match: RegExp }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of fields) {
    const found = headers.find((h) => !used.has(h) && f.match.test(h));
    if (found) used.add(found);
    out[f.key] = found ?? NONE;
  }
  return out;
}

export function cellValue(row: Record<string, any>, column: string | undefined): string {
  if (!column || column === NONE) return "";
  const raw = row[column];
  if (raw === null || raw === undefined) return "";
  const text = String(raw).trim();
  // A exportação do Sige usa "---" como valor vazio
  return text === "---" || text === "-" ? "" : text;
}

export function toNumber(value: string): number {
  if (!value) return 0;
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function toIsoDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value).trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`).toISOString();
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString();
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ----------------------------------------------------- cruzamento clientes */

export interface MatchIndex {
  byCodigo: Map<string, ClientProfile[]>;
  byDoc: Map<string, ClientProfile[]>;
  byName: Map<string, ClientProfile[]>;
}

export function buildMatchIndex(profiles: ClientProfile[]): MatchIndex {
  const byCodigo = new Map<string, ClientProfile[]>();
  const byDoc = new Map<string, ClientProfile[]>();
  const byName = new Map<string, ClientProfile[]>();
  const push = (map: Map<string, ClientProfile[]>, key: string, p: ClientProfile) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((x) => x.id === p.id)) list.push(p);
    map.set(key, list);
  };
  for (const p of profiles) {
    push(byCodigo, String(p.codigo_cliente ?? "").trim(), p);
    push(byDoc, normalizeDoc(p.cnpj), p);
    push(byName, nameKey(p.nome_fantasia), p);
    push(byName, nameKey(p.nome), p);
  }
  return { byCodigo, byDoc, byName };
}

export interface MatchInput {
  codigo_cliente?: string;
  cnpj_cpf?: string;
  nome_fantasia?: string;
  razao_social?: string;
}

export type MatchResult =
  | { status: "match"; profile: ClientProfile; via: string }
  | { status: "ambiguo"; candidates: ClientProfile[] }
  | { status: "nao_encontrado" };

/** Cruzamento por prioridade. Nomes semelhantes duplicados nunca casam automaticamente. */
export function matchProfile(input: MatchInput, index: MatchIndex): MatchResult {
  const attempts: Array<[string, ClientProfile[] | undefined]> = [
    ["código do cliente", index.byCodigo.get(String(input.codigo_cliente ?? "").trim())],
    ["CPF/CNPJ", index.byDoc.get(normalizeDoc(input.cnpj_cpf))],
    ["nome fantasia", index.byName.get(nameKey(input.nome_fantasia))],
    ["razão social", index.byName.get(nameKey(input.razao_social))],
  ];
  for (const [via, list] of attempts) {
    if (!list || list.length === 0) continue;
    if (list.length === 1) return { status: "match", profile: list[0], via };
    return { status: "ambiguo", candidates: list };
  }
  return { status: "nao_encontrado" };
}

/** Chave estável de um registro do cadastro, usada na fila de pendências. */
export function stagingKey(input: MatchInput): string {
  return [
    String(input.codigo_cliente ?? "").trim(),
    normalizeDoc(input.cnpj_cpf),
    nameKey(input.nome_fantasia),
    nameKey(input.razao_social),
  ].join("|");
}

/* ------------------------------------------------------ PDV Atuais → linhas */

export interface PdvRowInput {
  import_key: string;
  cliente: string;
  cliente_key: string;
  cnpj_cpf: string | null;
  codigo_cliente: string | null;
  codigo_venda: string | null;
  data: string | null;
  codigo_produto: string | null;
  produto: string;
  quantidade: number;
  preco_unitario: number;
  preco_total: number;
  vendedor: string | null;
  segmento: string | null;
  source_file: string;
}

export interface ParsePdvResult {
  rows: PdvRowInput[];
  ignoradas: number;
  duplicadas: number;
  erros: string[];
  clientes: Map<string, { nome: string; cnpj: string; codigo: string; vendedor: string; segmento: string }>;
  minData: string | null;
  maxData: string | null;
  produtos: Set<string>;
  pedidos: Set<string>;
}

export function parsePdvSheet(
  rows: Record<string, any>[],
  mapping: Record<string, string>,
  fileName: string,
): ParsePdvResult {
  const out: PdvRowInput[] = [];
  const seen = new Map<string, number>();
  const clientes = new Map<string, { nome: string; cnpj: string; codigo: string; vendedor: string; segmento: string }>();
  const produtos = new Set<string>();
  const pedidos = new Set<string>();
  const erros: string[] = [];
  let ignoradas = 0;
  let duplicadas = 0;
  let minData: string | null = null;
  let maxData: string | null = null;

  for (const row of rows) {
    const cliente = cellValue(row, mapping.cliente);
    const key = nameKey(cliente);
    if (!key) {
      ignoradas += 1;
      continue;
    }
    const dataIso = toIsoDate(row[mapping.data] ?? cellValue(row, mapping.data));
    const produtoRaw = cellValue(row, mapping.produto);
    const codigoProduto =
      cellValue(row, mapping.codigo_produto) || (produtoRaw.match(/^(\d+)\s*-/)?.[1] ?? "");
    const codigoVenda = cellValue(row, mapping.codigo_venda);
    const quantidade = toNumber(cellValue(row, mapping.quantidade));
    const precoUnit = toNumber(cellValue(row, mapping.preco_unitario));
    const precoTotal = toNumber(cellValue(row, mapping.preco_total)) || quantidade * precoUnit;
    const doc = normalizeDoc(cellValue(row, mapping.cnpj_cpf));
    const codigoCliente = cellValue(row, mapping.codigo_cliente);
    const vendedor = cellValue(row, mapping.vendedor);
    const segmento = cellValue(row, mapping.segmento);

    const dia = dataIso ? dataIso.slice(0, 10) : "";
    const base = `${key}|${codigoVenda}|${dia}|${codigoProduto || nameKey(produtoRaw)}`;
    const seq = (seen.get(base) ?? 0) + 1;
    seen.set(base, seq);
    const importKey = `${base}|${seq}`;
    if (out.some((r) => r.import_key === importKey)) {
      duplicadas += 1;
      continue;
    }

    if (dataIso) {
      if (!minData || dataIso < minData) minData = dataIso;
      if (!maxData || dataIso > maxData) maxData = dataIso;
    }
    if (produtoRaw) produtos.add(produtoRaw);
    if (codigoVenda) pedidos.add(`${key}|${codigoVenda}`);

    const atual = clientes.get(key);
    clientes.set(key, {
      nome: atual?.nome || cliente,
      cnpj: atual?.cnpj || doc,
      codigo: atual?.codigo || codigoCliente,
      vendedor: vendedor || atual?.vendedor || "",
      segmento: segmento || atual?.segmento || "",
    });

    out.push({
      import_key: importKey,
      cliente,
      cliente_key: key,
      cnpj_cpf: doc || null,
      codigo_cliente: codigoCliente || null,
      codigo_venda: codigoVenda || null,
      data: dataIso,
      codigo_produto: codigoProduto || null,
      produto: produtoRaw,
      quantidade,
      preco_unitario: precoUnit,
      preco_total: precoTotal,
      vendedor: vendedor || null,
      segmento: segmento || null,
      source_file: fileName,
    });
  }

  return { rows: out, ignoradas, duplicadas, erros, clientes, minData, maxData, produtos, pedidos };
}

/** Converte linhas do PDV para o formato usado pela agregação de vendas do módulo. */
export function pdvRowsToSaleRows(rows: any[]): SaleRow[] {
  return rows.map((r, i) => ({
    id: i,
    codigo_venda: Number(r.codigo_venda ?? 0) || 0,
    data: r.data ?? "",
    quantidade: Number(r.quantidade ?? 0),
    descricao: String(r.produto ?? ""),
    cnpj_cpf: r.cnpj_cpf ?? null,
    cliente: String(r.cliente ?? ""),
    vendedor: String(r.vendedor ?? ""),
    preco_unitario: Number(r.preco_unitario ?? 0),
    preco_total: Number(r.preco_total ?? 0),
  })) as unknown as SaleRow[];
}

/* ------------------------------------------------- aplicação dos endereços */

export interface AddressValues {
  nome_fantasia?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  vendedor?: string;
  segmento?: string;
}

export const ADDRESS_REQUIRED: Array<keyof AddressValues> = ["rua", "bairro", "cidade", "estado"];

/**
 * Monta o patch da ficha sobrescrevendo SOMENTE os campos importados e preenchidos.
 * Todo o restante do cadastro é preservado.
 */
export function buildAddressPatch(
  values: AddressValues,
  profile: ClientProfile,
  sourceFile: string,
): { patch: Record<string, any>; changes: Array<{ campo: string; de: string; para: string }> } {
  const patch: Record<string, any> = {};
  const changes: Array<{ campo: string; de: string; para: string }> = [];
  for (const field of CADASTRO_FIELDS) {
    const value = String((values as any)[field.key] ?? "").trim();
    if (!value) continue;
    const atual = String((profile as any)[field.key] ?? "").trim();
    if (atual === value) continue;
    patch[field.key] = value;
    changes.push({ campo: field.label, de: atual || "—", para: value });
  }
  if (Object.keys(patch).length > 0) {
    patch.endereco_origem = sourceFile;
    patch.endereco_atualizado_em = new Date().toISOString();
  }
  return { patch, changes };
}

export function isAddressIncomplete(values: AddressValues): boolean {
  return ADDRESS_REQUIRED.some((k) => !String((values as any)[k] ?? "").trim());
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/**
 * Fonte de vendas do módulo Ponto de Venda.
 * Para os clientes presentes na planilha "PDV Atuais" (fonte comercial oficial) usamos
 * exclusivamente essas linhas; os demais continuam com as vendas gerais já importadas.
 * Assim nenhum pedido é contado duas vezes.
 */
export function mergeSalesSources(sales: SaleRow[], pdvRows: any[]): SaleRow[] {
  if (!pdvRows?.length) return sales;
  const keys = new Set(pdvRows.map((r) => String(r.cliente_key ?? nameKey(r.cliente))));
  const rest = sales.filter((s) => !keys.has(nameKey(s.cliente)));
  return [...rest, ...pdvRowsToSaleRows(pdvRows)];
}
