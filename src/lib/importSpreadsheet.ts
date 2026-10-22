import * as XLSX from "xlsx";

export interface ParsedRow {
  original_row_number: number;
  codigo_venda: number;
  data: string;
  quantidade: number;
  descricao: string;
  cnpj_cpf: string;
  cliente: string;
  vendedor: string;
  preco_unitario: number;
  preco_total: number;
  /**
   * Ordinal de ocorrência dentro de (codigo_venda + dia + produto).
   * Garante que linhas legítimas repetidas da planilha (ex.: mesmo produto lançado
   * duas vezes no mesmo pedido) NÃO sejam colapsadas pela chave de importação.
   */
  sequence: number;
  nome_arquivo_importado?: string;
}

export interface ImportFileSummary {
  name: string;
  size: number;
  rows: number;
  rangeStart: string | null;
  rangeEnd: string | null;
}

export interface ParsedImportBatch {
  rows: ParsedRow[];
  previewRows: ParsedRow[];
  fileSummaries: ImportFileSummary[];
  rawRowCount: number;
  ignoredRowCount: number;
  duplicateInUploadCount: number;
  duplicateCodeCounts: Array<{ codigoVenda: number; aparicoes: number }>;
  sheetTotal: number;
  footerTotal: number | null;
  isCompleteReport: boolean;
  rangeStart: string | null;
  rangeEnd: string | null;
}

const HEADER_ALIASES = {
  codigo_venda: ["codigo venda", "codigo", "cod venda", "codigo_venda", "cod pedido", "codigo pedido", "numero pedido", "n pedido", "nro pedido", "pedido", "num pedido"],
  // A competência vem somente da coluna literalmente chamada Data.
  data: ["data"],
  quantidade: ["quantidade", "qtd", "qtde", "quant"],
  descricao: ["descricao", "produto", "descricao produto", "item", "descricao item", "nome produto", "mercadoria"],
  cnpj_cpf: ["cnpj cpf", "cnpj/cpf", "cnpj", "cpf", "documento", "cpf cnpj"],
  cliente: ["cliente", "razao social", "nome cliente", "nome", "razao", "destinatario"],
  vendedor: ["vendedor", "representante", "rca", "vendedor responsavel"],
  preco_unitario: ["preco venda r", "preco venda", "valor unitario", "preco unitario", "vlr unitario", "valor unit", "preco unit", "preco"],
  // O faturamento vem somente da coluna Preço Venda Total (R$).
  preco_total: ["preco venda total r"],
} as const;

function normalizeHeader(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseExcelDate(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(
        Date.UTC(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H || 0,
        parsed.M || 0,
        parsed.S || 0,
        ),
      ).toISOString();
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):?(\d{2})?)?$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      let year = Number(match[3]);
      if (year < 100) year += 2000;
      const hour = Number(match[4] || 0);
      const minute = Number(match[5] || 0);
      return new Date(Date.UTC(year, month, day, hour, minute)).toISOString();
    }

    const directDate = new Date(trimmed);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.toISOString();
    }
  }

  return null;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  }

  return Number.parseFloat(normalized) || 0;
}

function getField(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);
  for (const alias of aliases) {
    const match = normalizedEntries.find(([key]) => key === alias || key.startsWith(`${alias} `) || key.endsWith(` ${alias}`));
    if (match) return match[1];
  }
  return undefined;
}

export function buildImportRowKey(row: ParsedRow): string {
  const productToken = normalizeSpaces(row.descricao).match(/^(\d+)\s*-/)?.[1] ?? normalizeSpaces(row.descricao).toLowerCase();
  return [
    String(row.codigo_venda ?? 0),
    String(row.data).slice(0, 10),
    productToken,
    String(row.sequence ?? 1),
  ].join("|");
}

/**
 * Atribui uma sequência estável (1, 2, 3, ...) para cada linha que compartilha
 * a mesma tupla (codigo_venda + dia + produto). Isso permite manter
 * linhas legítimas repetidas na planilha (mesmo produto lançado 2x no pedido)
 * sem que a chave de importação as colapse.
 */
function assignSequences(rows: ParsedRow[]): void {
  const counters = new Map<string, number>();
  for (const row of rows) {
    const productToken = normalizeSpaces(row.descricao).match(/^(\d+)\s*-/)?.[1] ?? normalizeSpaces(row.descricao).toLowerCase();
    const groupKey = [
      String(row.codigo_venda ?? 0),
      String(row.data).slice(0, 10),
      productToken,
    ].join("|");
    const next = (counters.get(groupKey) ?? 0) + 1;
    counters.set(groupKey, next);
    row.sequence = next;
  }
}


/**
 * Importação incremental: a mesma venda não pode ser enviada duas vezes no lote.
 * A chave estável permite UPSERT/MERGE no backend sem apagar histórico.
 */
export function deduplicateParsedRows(rows: ParsedRow[]): { rows: ParsedRow[]; duplicateInUploadCount: number; duplicateCodeCounts: Array<{ codigoVenda: number; aparicoes: number }> } {
  const byKey = new Map<string, ParsedRow>();
  const codeCounts = new Map<number, number>();
  for (const row of rows) {
    const key = buildImportRowKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
    codeCounts.set(row.codigo_venda, (codeCounts.get(row.codigo_venda) ?? 0) + 1);
  }
  return {
    rows: [...byKey.values()],
    duplicateInUploadCount: rows.length - byKey.size,
    duplicateCodeCounts: [...codeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([codigoVenda, aparicoes]) => ({ codigoVenda, aparicoes }))
      .sort((a, b) => b.aparicoes - a.aparicoes || a.codigoVenda - b.codigoVenda),
  };
}

function getDateRange(rows: ParsedRow[]): { rangeStart: string | null; rangeEnd: string | null } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const t = new Date(row.data).getTime();
    if (Number.isNaN(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { rangeStart: null, rangeEnd: null };
  return {
    rangeStart: new Date(min).toISOString(),
    rangeEnd: new Date(max).toISOString(),
  };
}

function detectHeaderRow(matrix: unknown[][]): { headerIndex: number; headers: string[] } | null {
  const maxScan = Math.min(matrix.length, 30);
  const requiredKeys = ["data", "cliente", "descricao"] as const;
  let best: { headerIndex: number; headers: string[]; score: number } | null = null;
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i] || [];
    const headers = row.map((c) => String(c ?? ""));
    const normalized = headers.map(normalizeHeader);
    let score = 0;
    for (const key of requiredKeys) {
      const aliases = HEADER_ALIASES[key];
      if (normalized.some((h) => aliases.some((a) => h === a || h.startsWith(`${a} `) || h.endsWith(` ${a}`) || h.includes(a)))) {
        score++;
      }
    }
    if (score >= 2 && (!best || score > best.score)) {
      best = { headerIndex: i, headers, score };
      if (score === requiredKeys.length) break;
    }
  }
  return best ? { headerIndex: best.headerIndex, headers: best.headers } : null;
}

function pickBestSheet(workbook: XLSX.WorkBook): { sheetName: string; matrix: unknown[][]; header: { headerIndex: number; headers: string[] } } | null {
  let best: { sheetName: string; matrix: unknown[][]; header: { headerIndex: number; headers: string[] } } | null = null;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false }) as unknown[][];
    if (!matrix.length) continue;
    const header = detectHeaderRow(matrix);
    if (header && (!best || matrix.length > best.matrix.length)) {
      best = { sheetName, matrix, header };
    }
  }
  return best;
}

export async function parseSpreadsheetFile(file: File): Promise<{ rows: ParsedRow[]; summary: ImportFileSummary; ignoredRowCount: number; footerTotal: number | null }> {
  const arrayBuffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellStyles: false, cellFormula: false, dense: false });
  } catch {
    try {
      workbook = XLSX.read(arrayBuffer, { type: "array", raw: true, cellStyles: false, cellFormula: false, WTF: false });
    } catch (err) {
      throw new Error(`Não foi possível abrir "${file.name}". O arquivo pode estar corrompido ou em formato incompatível.`);
    }
  }

  if (!workbook.SheetNames.length) {
    throw new Error(`"${file.name}" não possui abas com dados.`);
  }

  const picked = pickBestSheet(workbook);
  if (!picked) {
    throw new Error(`Não foi possível interpretar os cabeçalhos da planilha "${file.name}". Verifique se ela contém as colunas Data, Cliente e Descrição/Produto.`);
  }

  const { sheetName, matrix, header } = picked;
  const headerMap: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  const normalizedHeaders = header.headers.map(normalizeHeader);
  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>) {
    const aliases = HEADER_ALIASES[key];
    const mustMatchExactly = key === "data" || key === "preco_total";
    const idx = normalizedHeaders.findIndex((h) => aliases.some((a) =>
      mustMatchExactly ? h === a : h === a || h.startsWith(`${a} `) || h.endsWith(` ${a}`) || h.includes(a)
    ));
    if (idx >= 0) headerMap[key] = idx;
  }

  const missing: string[] = [];
  if (headerMap.data === undefined) missing.push("Data");
  if (headerMap.cliente === undefined) missing.push("Cliente");
  if (headerMap.descricao === undefined) missing.push("Descrição/Produto");
  if (headerMap.preco_total === undefined) missing.push("Preço Venda Total (R$)");
  if (missing.length) {
    throw new Error(`Planilha "${file.name}" (aba "${sheetName}") está sem as colunas obrigatórias: ${missing.join(", ")}.`);
  }

  const get = (row: unknown[], key: keyof typeof HEADER_ALIASES): unknown => {
    const idx = headerMap[key];
    return idx === undefined ? undefined : row[idx];
  };

  const rows: ParsedRow[] = [];
  let ignoredRowCount = 0;
  let footerTotal: number | null = null;
  for (let i = header.headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (!row.length || row.every((c) => c === "" || c === null || c === undefined)) continue;

    const codigoRaw = String(get(row, "codigo_venda") ?? "").trim().toLowerCase();
    if (codigoRaw === "total") {
      footerTotal = parseNumber(get(row, "preco_total"));
      ignoredRowCount++;
      continue;
    }

    const data = parseExcelDate(get(row, "data"));
    const cliente = String(get(row, "cliente") ?? "").trim();
    const descricao = String(get(row, "descricao") ?? "").trim();
    if (!data || !cliente || !descricao) {
      ignoredRowCount++;
      continue;
    }

    rows.push({
      original_row_number: i + 1,
      codigo_venda: parseNumber(get(row, "codigo_venda")),
      data,
      quantidade: parseNumber(get(row, "quantidade")),
      descricao,
      cnpj_cpf: String(get(row, "cnpj_cpf") ?? "").trim(),
      cliente,
      vendedor: String(get(row, "vendedor") ?? ""),
      preco_unitario: parseNumber(get(row, "preco_unitario")),
      preco_total: parseNumber(get(row, "preco_total")),
      sequence: 1,
      nome_arquivo_importado: file.name,
    });
  }

  if (!rows.length) {
    throw new Error(`Planilha "${file.name}" foi lida (aba "${sheetName}"), mas nenhuma linha de dados válida foi encontrada abaixo dos cabeçalhos. Verifique se as colunas Data, Cliente e Produto estão preenchidas.`);
  }

  assignSequences(rows);

  const { rangeStart, rangeEnd } = getDateRange(rows);


  return {
    rows,
    ignoredRowCount,
    footerTotal,
    summary: {
      name: file.name,
      size: file.size,
      rows: rows.length,
      rangeStart,
      rangeEnd,
    },
  };
}

export async function parseFilesToImportBatch(files: File[]): Promise<ParsedImportBatch> {
  const parsedFiles = await Promise.all(files.map((file) => parseSpreadsheetFile(file)));
  const rawRows = parsedFiles.flatMap((entry) => entry.rows);
  // Reatribui sequências considerando o conjunto agregado dos arquivos:
  // se o mesmo pedido aparecer em dois arquivos, cada linha ganha sua própria
  // ordem estável na chave de importação. NÃO colapsa linhas.
  assignSequences(rawRows);
  const { rows, duplicateInUploadCount, duplicateCodeCounts } = deduplicateParsedRows(rawRows);
  const { rangeStart, rangeEnd } = getDateRange(rows);
  const sheetTotal = rows.reduce((sum, row) => sum + Number(row.preco_total || 0), 0);
  const footerTotals = parsedFiles
    .map((entry) => entry.footerTotal)
    .filter((value): value is number => value !== null);
  const footerTotal = footerTotals.length === 1 ? footerTotals[0] : null;

  return {
    rows,
    previewRows: rows.slice(0, 12),
    fileSummaries: parsedFiles.map((entry) => entry.summary),
    rawRowCount: rawRows.length,
    ignoredRowCount: parsedFiles.reduce((sum, entry) => sum + entry.ignoredRowCount, 0),
    duplicateInUploadCount,
    duplicateCodeCounts,
    sheetTotal,
    footerTotal,
    isCompleteReport: footerTotal !== null && Math.abs(footerTotal - sheetTotal) <= 0.01,
    rangeStart,
    rangeEnd,
  };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
