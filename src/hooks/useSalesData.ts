import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_VENDEDORES,
  buildValidVendorRegistry,
  getValidVendorOptions,
  shortVendedorName,
  type ValidVendorRecord,
} from "@/lib/vendorRegistry";
import { normalizeClientName, setDynamicAliases } from "@/lib/clientNameNormalization";
import { useVendorScope, vendorScopeKey } from "@/hooks/useVendorScope";
import { CATALOGO_PRODUTOS } from "@/types/crm";


export interface SaleRow {
  id: number;
  original_row_number?: number;
  codigo_venda: number;
  data: string;
  created_at?: string;
  quantidade: number;
  descricao: string;
  cnpj_cpf: string | null;
  cliente: string;
  vendedor: string;
  preco_unitario: number;
  preco_total: number;
  nome_arquivo_importado?: string | null;
  data_importacao?: string;
}

function normalizeDedupText(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeDedupNumber(value: string | number | null | undefined): string {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(4) : "0.0000";
}

export function buildSalesDedupKey(sale: Pick<SaleRow, "codigo_venda" | "data" | "cliente" | "descricao" | "quantidade" | "preco_total">): string {
  return [
    String(sale.codigo_venda ?? 0),
    String(sale.data ?? "").slice(0, 16),
    normalizeDedupText(sale.cliente),
    normalizeDedupText(sale.descricao),
    normalizeDedupNumber(sale.quantidade),
    normalizeDedupNumber(sale.preco_total),
  ].join("|");
}

/**
 * ESPELHO DA PLANILHA: NÃO deduplica.
 * Cada linha importada = 1 linha no relatório.
 * A garantia de não-duplicação vem do UPSERT incremental na importação.
 * Aqui apenas ordenamos.
 */
export function deduplicateSalesRows(sales: SaleRow[]): SaleRow[] {
  return [...sales].sort((a, b) => {
    const byDate = new Date(a.data).getTime() - new Date(b.data).getTime();
    if (byDate !== 0) return byDate;
    const byCodigo = a.codigo_venda - b.codigo_venda;
    if (byCodigo !== 0) return byCodigo;
    return a.id - b.id;
  });
}

// ==========================================================================
// IDENTIDADE DO CLIENTE — mesmo CNPJ/CPF = mesmo cliente.
// Variações de nome (espaços duplos, acentos, sufixos) não podem fragmentar
// o histórico. Linhas sem documento continuam usando a normalização de nome.
// ==========================================================================

export function normalizeDocument(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function buildClientNameByDocument(rows: Array<{ cnpj_cpf?: string | null; cliente?: string | null; data?: string }>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const doc = normalizeDocument(row?.cnpj_cpf);
    if (doc.length !== 11 && doc.length !== 14) continue;
    const nome = normalizeClientName(String(row?.cliente ?? ""));
    if (!nome) continue;
    let variants = counts.get(doc);
    if (!variants) {
      variants = new Map();
      counts.set(doc, variants);
    }
    variants.set(nome, (variants.get(nome) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const [doc, variants] of counts) {
    let best = "";
    let bestCount = -1;
    for (const [nome, count] of variants) {
      if (count > bestCount || (count === bestCount && nome.length > best.length)) {
        best = nome;
        bestCount = count;
      }
    }
    if (best) result.set(doc, best);
  }
  return result;
}

export function resolveClientName(
  row: { cliente?: string | null; cnpj_cpf?: string | null },
  nameByDocument: Map<string, string>,
): string {
  const doc = normalizeDocument(row?.cnpj_cpf);
  const canonical = doc ? nameByDocument.get(doc) : undefined;
  return canonical ?? normalizeClientName(String(row?.cliente ?? ""));
}



export function useSalesData() {
  // Escopo global: o login só enxerga as vendas dos vendedores autorizados
  // pelo administrador. Escopo "empresa" enxerga tudo.
  const scope = useVendorScope();
  const scopeKey = vendorScopeKey(scope);

  return useQuery({
    queryKey: ["sales-data", "sales-raw-rows-v1", "no-cache-v1", scopeKey],
    select: useCallback((rows: SaleRow[]) => scope.filtrar(rows, (r) => r.vendedor, (r) => r.cliente), [scope]),


    queryFn: async () => {
      // Garante que vendas sejam consolidadas por aliases antes da leitura.
      // Evita a corrida em que a análise carregava antes do bootstrap global de aliases.
      try {
        const { data: aliasRows, error: aliasError } = await supabase
          .from("client_aliases" as any)
          .select("alias_name, canonical_name");
        if (!aliasError) {
          const aliasMap: Record<string, string> = {};
          for (const row of (aliasRows ?? []) as any[]) {
            if (row?.alias_name && row?.canonical_name) aliasMap[row.alias_name] = row.canonical_name;
          }
          setDynamicAliases(aliasMap);
        } else {
          console.warn("[useSalesData] Não foi possível carregar aliases de clientes.", aliasError.message);
        }
      } catch (e) {
        console.warn("[useSalesData] Falha ao sincronizar aliases de clientes.", e);
      }

      // PostgREST limita cada requisição a 1000 linhas por padrão (max-rows).
      // Mesmo pedindo .range(0, 4999), só voltam 1000. Por isso usamos batchSize=1000
      // para garantir que não perdemos linhas (o que fazia as vendas mais recentes
      // sumirem da Análise de Clientes).
      const batchSize = 1000;

      // 1) Discover total row count (HEAD request, no rows transferred)
      const { count, error: countError } = await supabase
        .from("sales_raw_rows" as any)
        .select("*", { count: "exact", head: true })
        .eq("active", true);
      if (countError) throw countError;

      const total = count ?? 0;
      if (total === 0) {
        resetProductCanonicalMap();
        return [];
      }

      // 2) Fetch all pages with controlled concurrency. Disparar dezenas de
      // requisições simultâneas sobrecarrega o Data API e faz algumas páginas
      // voltarem 500, deixando a Inteligência presa no skeleton.
      const pageCount = Math.ceil(total / batchSize);
      const fetchPage = (i: number) => {
        const fromIdx = i * batchSize;
        const toIdx = fromIdx + batchSize - 1;
        return supabase
          .from("sales_raw_rows" as any)
          .select("id, original_row_number, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_venda, preco_venda_total, preco_unitario, preco_total, nome_arquivo_importado, data_importacao, created_at")
            .eq("active", true)
          .order("data", { ascending: true })
          .order("id", { ascending: true })
          .range(fromIdx, toIdx);
      };

      const pages = [] as Awaited<ReturnType<typeof fetchPage>>[];
      const concurrency = 4;
      for (let i = 0; i < pageCount; i += concurrency) {
        const batch = Array.from({ length: Math.min(concurrency, pageCount - i) }, (_, offset) => fetchPage(i + offset));
        pages.push(...(await Promise.all(batch)));
      }
      const allRows: SaleRow[] = [];
      for (const page of pages) {
        if (page.error) throw page.error;
        if (page.data) allRows.push(...((page.data as unknown) as SaleRow[]));
      }

      // Sanity check: se trouxemos menos linhas que o esperado, avisa no console
      // para facilitar o diagnóstico de problemas futuros de paginação.
      if (allRows.length < total) {
        console.warn(
          `[useSalesData] Esperava ${total} linhas, recebeu ${allRows.length}. ` +
          `Possível limite de paginação do PostgREST (max-rows).`,
        );
      }

      resetProductCanonicalMap();
      // Mesmo código de produto = mesmo produto, mesmo com variações de texto.
      registerProductVocabulary(allRows as any[]);
      // Mesmo CNPJ/CPF = mesmo cliente, mesmo com variações de nome.
      const clientNameByDoc = buildClientNameByDocument(allRows as any[]);
      const importedRows = allRows
        .map((row: any) => ({
          ...row,
          preco_unitario: Number(row.preco_venda ?? row.preco_unitario ?? 0),
          preco_total: Number(row.preco_venda_total ?? row.preco_total ?? 0),
          cliente: resolveClientName(row, clientNameByDoc),
        }));
      const sheetRows = deduplicateSalesRows(importedRows);


      _lastSalesExclusionAudit = buildExclusionAudit(importedRows, sheetRows);

      return sheetRows;
    },
    // Evita recarregar a planilha quando o usuário volta de outro app no iPhone.
    // Safari iOS dispara focus/visibilitychange ao retornar do background; com
    // staleTime curto + refetchOnWindowFocus a tela inteira "piscava" como reload.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Precisa refazer o fetch ao montar quando o cache foi invalidado por uma
    // importação — antes a tela de Metas continuava mostrando dados antigos.
    refetchOnMount: true,
  });
}

// Auditoria publicada após cada fetch para componentes de transparência.
let _lastSalesExclusionAudit: SalesExclusionAudit | null = null;
export function getLastSalesExclusionAudit(): SalesExclusionAudit | null {
  return _lastSalesExclusionAudit;
}

export { ACTIVE_VENDEDORES, shortVendedorName };
export type { ValidVendorRecord };

export function getValidVendorRegistry(sales: SaleRow[]): ValidVendorRecord[] {
  return buildValidVendorRegistry(sales);
}

// ==========================================================================
// IDENTIDADE DO PRODUTO — REGRA ÚNICA DO SISTEMA
// --------------------------------------------------------------------------
// O produto é identificado pelo CÓDIGO da planilha ("105 - ..."), nunca pelo
// texto e nunca pelo preço. Variações de digitação da mesma descrição
// ("Recheado"/sem "Recheado", "1kg"/"1 kg", acentos, "93-1 - ...") pertencem
// ao MESMO produto e precisam somar na mesma linha em todas as telas.
// ==========================================================================

const _productCanonicalMap = new Map<string, string>(); // texto normalizado -> nome exibido
const _productCodeNameMap = new Map<string, string>(); // código -> nome exibido canônico

const CATALOG_NAME_BY_CODE = new Map<string, string>(
  CATALOGO_PRODUTOS.filter((p) => p.codigo).map((p) => [String(p.codigo), p.nome]),
);

/** Remove o prefixo de código da descrição, preservando o nome original. */
export function stripProductCodePrefix(desc: string | null | undefined): string {
  return String(desc ?? "")
    .replace(/^\s*\d+(?:-\d+)?\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Constrói o vocabulário canônico de produtos a partir das linhas reais.
 * Para cada código, escolhe o nome do catálogo oficial; se o código não estiver
 * no catálogo, usa a variante de texto mais frequente (empate → mais completa).
 */
export function registerProductVocabulary(rows: Array<{ descricao?: string | null }>): void {
  _productCodeNameMap.clear();
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const desc = String(row?.descricao ?? "");
    const code = extractProductCode(desc);
    if (!code) continue;
    const name = stripProductCodePrefix(desc);
    if (!name) continue;
    let variants = counts.get(code);
    if (!variants) {
      variants = new Map();
      counts.set(code, variants);
    }
    variants.set(name, (variants.get(name) ?? 0) + 1);
  }
  for (const [code, variants] of counts) {
    const catalogName = CATALOG_NAME_BY_CODE.get(code);
    if (catalogName) {
      _productCodeNameMap.set(code, catalogName);
      continue;
    }
    let best = "";
    let bestCount = -1;
    for (const [name, count] of variants) {
      if (count > bestCount || (count === bestCount && name.length > best.length)) {
        best = name;
        bestCount = count;
      }
    }
    if (best) _productCodeNameMap.set(code, best);
  }
}

// Helper: nome canônico do produto. Mesmo código = mesmo produto.
export function cleanProductName(desc: string): string {
  const code = extractProductCode(desc);
  if (code) {
    const byVocabulary = _productCodeNameMap.get(code);
    if (byVocabulary) return byVocabulary;
    const byCatalog = CATALOG_NAME_BY_CODE.get(code);
    if (byCatalog) return byCatalog;
  }

  let name = stripProductCodePrefix(desc);
  name = name.normalize("NFC");
  const canonical = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*kg\s*$/i, "$1 kg")
    .replace(/(\d)kg$/i, "$1 kg")
    .replace(/\b000$/, "")
    .trim();
  if (!_productCanonicalMap.has(canonical)) {
    _productCanonicalMap.set(canonical, name);
  }
  return _productCanonicalMap.get(canonical)!;
}

export function resetProductCanonicalMap() {
  _productCanonicalMap.clear();
  _productCodeNameMap.clear();
}


export function filterByDateRange(sales: SaleRow[], inicio: string, fim: string): SaleRow[] {
  const [startYear, startMonth, startDay] = inicio.split("-").map(Number);
  const [endYear, endMonth, endDay] = fim.split("-").map(Number);
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
  return sales.filter((s) => {
    // A competência é exclusivamente a coluna Data da planilha. Nunca mover
    // vendas entre meses com base no arquivo, faturamento ou importação.
    const d = new Date(s.data);
    return d >= startDate && d <= endDate;
  });
}

// Helper: lista de vendedores ATIVOS para filtros/seletores em TODA a ferramenta.
// Regra unificada (mesma fonte usada na Inteligência Comercial):
//   - vendedores presentes na lista base oficial (ACTIVE_VENDEDORES), OU
//   - vendedores com pelo menos 1 venda em 2026 (movimentação atual).
// Vendedores históricos/desligados sem movimentação em 2026 NÃO aparecem.
export function getUniqueVendedores(sales: SaleRow[], _includeInactive = false): string[] {
  const set = new Set<string>();
  for (const nome of ACTIVE_VENDEDORES) set.add(nome);
  for (const s of sales) {
    const raw = String(s.vendedor ?? "").trim();
    if (!raw) continue;
    const ano = String(s.data ?? "").slice(0, 4);
    if (ano !== "2026") continue;
    set.add(shortVendedorName(raw));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Lista de vendedores normalizados que tiveram pelo menos 1 venda em 2026.
 * Usada nos filtros operacionais (Inteligência Comercial, etc) para evitar
 * nomes históricos/duplicados que poluem o filtro.
 */
export function getVendedoresWith2026Sales(sales: SaleRow[]): string[] {
  const set = new Set<string>();
  for (const s of sales) {
    const raw = String(s.vendedor ?? "").trim();
    if (!raw) continue;
    const ano = String(s.data ?? "").slice(0, 4);
    if (ano !== "2026") continue;
    set.add(shortVendedorName(raw));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function isVendorEligibleForFilters(vendorName: string, sales: SaleRow[]): boolean {
  return getUniqueVendedores(sales).includes(vendorName);
}

export function getVendorDebugRows(sales: SaleRow[]): ValidVendorRecord[] {
  return getValidVendorRegistry(sales);
}

// ==========================================================================
// REGRA CENTRAL: ESPELHO DA PLANILHA
// --------------------------------------------------------------------------
// O faturamento deve ser a soma direta da coluna importada
// "Preço Venda Total (R$)" (`preco_total`). Nenhum item é excluído por texto,
// SKU, categoria, quantidade ou tipo de produto.
// ==========================================================================

// Mantido apenas por compatibilidade com telas antigas. Não é usado para
// excluir faturamento.
export const FINISHED_PRODUCT_CODES = new Set<string>([
  "92", "93", "95", "96", "97", "99", "101", "102", "104", "105",
  "111", "112", "867", "991", "1530", "1531", "1794", "1858", "2349",
]);

// Mantido apenas por compatibilidade. Não é usado para excluir faturamento.
export const EXCLUDED_PRODUCT_CODES = new Set<string>([
  // Frete
  "132", "283",
  // Caixas de isopor
  "240", "241", "242", "247", "248", "631", "1188", "1641", "1716",
  // Caixa de papelão
  "647",
  // Embalagens / saquinhos
  "643",
  // Fornos e equipamentos
  "139", "141", "371",
  // Material de marketing / degustação / brindes
  "182", "408", "413", "416", "417", "424", "426", "688", "690", "693",
  "694", "697", "698",
  // Amostras grátis (não geram faturamento real)
  "1092", "186", "187", "188", "189", "190", "191", "192", "193", "194",
  "195", "196", "197", "198", "1942",
]);

// Mantido apenas por compatibilidade. Não é usado para excluir faturamento.
export const EXCLUDED_PRODUCT_PATTERNS = [
  "caixa de isopor",
  "caixa de papelao",
  "isopor",
  "papelao",
  "embalagem",
  "frete",
  "gelo",
  "taxa",
  "ajuste",
  "bonificacao",
  "bonificação",
  "desconto manual",
  "servico",
  "serviço",
  "cobranca extra",
  "cobrança extra",
  "acrescimo",
  "acréscimo",
  "amostra",
  "forno eletrico",
  "forno elétrico",
  "banner",
  "avental",
  "chapeu chef",
  "chapéu chef",
  "guardanapo",
  "dolma degustacao",
  "dolmã degustação",
  "luva plastica",
  "luva plástica",
  "assadeira",
  "tabuleiro",
  "saquinho de papel",
  "vasilha plastica",
  "vasilha plástica",
  "cesta de palha",
  "porta banner",
  "porta guardanapo",
  "bandeja de degustacao",
  "bandeja de degustação",
];

/**
 * Extrai o código (SKU) do prefixo da descrição.
 * Aceita "93 - Nome", "93- Nome", "93-1 - Nome" (variante de lote da planilha).
 * O código é o identificador PRINCIPAL do produto — nunca o texto ou o preço.
 */
export function extractProductCode(descricao: string | null | undefined): string {
  if (!descricao) return "";
  const match = String(descricao).match(/^\s*(\d+)(?:-\d+)?\s*-\s*\S/);
  return match ? match[1].trim() : "";
}


// Mantido por compatibilidade com importações existentes
export const EXCLUDED_PRODUCTS = EXCLUDED_PRODUCT_PATTERNS;

function normalizeForExclusionCheck(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isExcludedProduct(name: string): boolean {
  return false;
}

/**
 * Espelho da planilha: todo item importado entra no faturamento.
 */
export function isProdutoAcabado(item: { descricao?: string | null; quantidade?: number | string | null; preco_total?: number | string | null }): boolean {
  return true;
}

export interface SalesExclusionAudit {
  totalLinhasBruto: number;
  totalLinhasComercial: number;
  linhasExcluidas: number;
  linhasDuplicadasDescartadas: number;
  totalBruto: number;
  totalComercial: number;
  totalExcluido: number;
  codigosVendaDuplicados: Array<{ codigoVenda: number; aparicoes: number }>;
  descricoesExcluidas: Array<{ descricao: string; codigo: string; motivo: "fora_catalogo" | "sku" | "texto"; linhas: number; valor: number }>;
}

export function buildExclusionAudit(rawRows: SaleRow[], commercialRows: SaleRow[]): SalesExclusionAudit {
  const totalBruto = rawRows.reduce((s, r) => s + Number(r.preco_total ?? 0), 0);
  const totalComercial = commercialRows.reduce((s, r) => s + Number(r.preco_total ?? 0), 0);
  const duplicateKeyCounts = new Map<string, { codigoVenda: number; count: number }>();

  for (const row of rawRows) {
    const key = buildSalesDedupKey(row);
    const entry = duplicateKeyCounts.get(key) ?? { codigoVenda: row.codigo_venda, count: 0 };
    entry.count += 1;
    duplicateKeyCounts.set(key, entry);
  }

  const duplicateCodeCounts = new Map<number, number>();
  for (const { codigoVenda, count } of duplicateKeyCounts.values()) {
    if (count <= 1) continue;
    duplicateCodeCounts.set(codigoVenda, (duplicateCodeCounts.get(codigoVenda) ?? 0) + count);
  }

  const excludedMap = new Map<string, { codigo: string; motivo: "fora_catalogo" | "sku" | "texto"; linhas: number; valor: number }>();
  for (const row of rawRows) {
    if (isProdutoAcabado(row)) continue;
    const codigo = extractProductCode(String(row.descricao ?? ""));
    const motivo: "fora_catalogo" | "sku" | "texto" = codigo
      ? EXCLUDED_PRODUCT_CODES.has(codigo) ? "sku" : "fora_catalogo"
      : "texto";
    const nome = cleanProductName(String(row.descricao ?? "")) || "(sem descrição)";
    const key = `${codigo}|${nome}`;
    const entry = excludedMap.get(key) ?? { codigo, motivo, linhas: 0, valor: 0 };
    entry.linhas += 1;
    entry.valor += Number(row.preco_total ?? 0);
    excludedMap.set(key, entry);
  }

  return {
    totalLinhasBruto: rawRows.length,
    totalLinhasComercial: commercialRows.length,
    linhasExcluidas: rawRows.length - commercialRows.length,
    linhasDuplicadasDescartadas: rawRows.length - commercialRows.length,
    totalBruto,
    totalComercial,
    totalExcluido: totalBruto - totalComercial,
    codigosVendaDuplicados: [...duplicateCodeCounts.entries()]
      .map(([codigoVenda, aparicoes]) => ({ codigoVenda, aparicoes }))
      .sort((a, b) => b.aparicoes - a.aparicoes || a.codigoVenda - b.codigoVenda),
    descricoesExcluidas: [...excludedMap.entries()]
      .map(([key, v]) => ({ descricao: key.split("|")[1], codigo: v.codigo, motivo: v.motivo, linhas: v.linhas, valor: v.valor }))
      .sort((a, b) => b.valor - a.valor),
  };
}

// ==========================================================================
// CATÁLOGO COMERCIAL CENTRAL — usado por todas as telas do sistema.
// --------------------------------------------------------------------------
// Regra única para definir o que é um "produto válido para análise comercial"
// da Ti Delso. Toda tela (Vendas, Inteligência Comercial, Estudo de Vendas,
// Relatórios, Metas, Vendedores, Dashboard, Análise de Clientes, etc.) DEVE
// usar `getProdutosComerciaisValidos()` para listar opções de filtro e
// `isCommercialProductDescription()` para filtrar linhas de venda.
// ==========================================================================

// Itens que NÃO pertencem à linha oficial de Pão de Queijo Ti Delso.
const NON_PDQ_LINE_PATTERNS = [
  "amostra",
  "brownie",
  "chocolate",
  "petit gateau",
  "petit-gateau",
  "petitgateau",
  "empada",
  "empadinha",
  "quibe",
  "kibe",
  "biscoito",
  "biscoitos",
  "bolo",
  "torta",
  "coxinha",
  "esfiha",
  "esfirra",
  "pastel",
  "pizza",
  "risoles",
  "rissoles",
  "rissole",
  "salgad",
  "doce",
  "pudim",
  "mousse",
  // exclusões duras (já cobertas por EXCLUDED_PRODUCT_PATTERNS, listadas
  // novamente por segurança caso a descrição venha sem código):
  "frete",
  "isopor",
  "papelao",
  "papelão",
  "embalagem",
];

// A linha oficial precisa conter uma destas marcas/famílias:
const PDQ_LINE_KEYWORDS = ["pao de queijo", "palito de queijo"];

function _normalizeForCommercialCheck(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Decide se uma linha de venda representa um produto válido da Ti Delso.
 * REGRA ÚNICA — não duplicar a lógica em outras camadas.
 */
export function isCommercialProductDescription(desc: string | null | undefined): boolean {
  const text = String(desc ?? "");
  if (!text.trim()) return false;
  const codigo = extractProductCode(text);
  if (!codigo) return false;
  if (EXCLUDED_PRODUCT_CODES.has(codigo)) return false;

  const normalized = _normalizeForCommercialCheck(text);

  for (const pattern of EXCLUDED_PRODUCT_PATTERNS) {
    if (normalized.includes(pattern)) return false;
  }
  for (const pattern of NON_PDQ_LINE_PATTERNS) {
    if (normalized.includes(pattern)) return false;
  }
  return PDQ_LINE_KEYWORDS.some((kw) => normalized.includes(kw));
}

/** Chave canônica do produto (só o nome, sem código) — usada em todas as
 * comparações de filtro, agregações e ordenações. */
export function productKey(desc: string | null | undefined): string {
  return cleanProductName(String(desc ?? ""));
}

/**
 * Normaliza valores vindos de estado persistido / selects legados.
 * Aceita tanto "Pão de Queijo ..." (formato novo) quanto
 * "101 - Pão de Queijo ..." (formato legado) e devolve a mesma chave canônica.
 */
export function normalizeSelectedProduto(value: string): string {
  return cleanProductName(String(value ?? "").replace(/^\s*\d+\s*-\s*/, ""));
}

/**
 * Lista oficial de produtos exibida em QUALQUER filtro de Produto do sistema.
 * - Só inclui itens comerciais da Ti Delso (regra única acima).
 * - Sem código no nome.
 * - Sem duplicidades (cleanProductName colapsa variações).
 * - Ordenada alfabeticamente pelo nome exibido.
 */
export function getProdutosComerciaisValidos(sales: SaleRow[] | null | undefined): string[] {
  if (!sales) return [];
  const set = new Set<string>();
  for (const s of sales) {
    if (!isCommercialProductDescription(s.descricao)) continue;
    const nome = productKey(s.descricao);
    if (nome) set.add(nome);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Mantido por compatibilidade com chamadas antigas, agora delega para a regra central.
export function getUniqueProducts(sales: SaleRow[]): string[] {
  return getProdutosComerciaisValidos(sales);
}

// Helper: get unique clients
export function getUniqueClients(sales: SaleRow[]): string[] {
  return [...new Set(sales.map(s => s.cliente))].sort();
}

// Helper: get month key from date string.
// A competência é sempre a DATA DA VENDA em UTC (como gravada na importação).
// Ler com o fuso local jogava vendas do dia 1 (00:00 UTC) para o mês anterior.
export function getMonthKey(dateStr: string): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const iso = String(dateStr ?? "").match(/^(\d{4})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const monthIndex = Number(iso[2]) - 1;
    return `${months[monthIndex]}/${(year % 100).toString().padStart(2, '0')}`;
  }
  const d = new Date(dateStr);
  return `${months[d.getUTCMonth()]}/${(d.getUTCFullYear() % 100).toString().padStart(2, '0')}`;
}


// Helper: last purchase date per client
export function getLastPurchaseByClient(sales: SaleRow[]): Map<string, Date> {
  const map = new Map<string, Date>();
  sales.forEach(s => {
    const d = new Date(s.data);
    const existing = map.get(s.cliente);
    if (!existing || d > existing) {
      map.set(s.cliente, d);
    }
  });
  return map;
}

// Helper: first purchase date per client
export function getFirstPurchaseByClient(sales: SaleRow[]): Map<string, Date> {
  const map = new Map<string, Date>();
  sales.forEach(s => {
    const d = new Date(s.data);
    const existing = map.get(s.cliente);
    if (!existing || d < existing) {
      map.set(s.cliente, d);
    }
  });
  return map;
}
