import * as XLSX from "xlsx";
import { shortVendedorName } from "@/hooks/useSalesData";

export interface CommissionRow {
  id: string;
  vendedor: string;
  cliente: string;
  cnpjCpf?: string;
  codigoCliente?: string;
  codigoVenda?: number;
  categoriaVenda?: string;
  produto?: string;
  quantidade?: number;
  precoUnit?: number;
  valor: number;
  custo?: number;
  precoVendaTotal?: number;
  valorFonte?: "Custo (R$)" | "Preço Venda Total (R$)";
  tipo: CommissionTipo;
  tipoRaw?: string;
  pctComissao?: number | null;
  data?: string;
  sheet?: string;
  /** Número da linha na planilha original (1-based), usado nos relatórios de erro. */
  linhaPlanilha?: number;
}

export type CommissionTipo =
  | "VENDA"
  | "BONIFICACAO_BRINDE"
  | "BONIFICACAO_CORTESIA"
  | "BONIFICACAO_DEGUSTACAO"
  | "BONIFICACAO_INTRODUCAO"
  | "BONIFICACAO_PRECO_FINAL"
  | "BONIFICACAO_OUTRAS"
  | "CORTESIA";

export interface CommissionBatch {
  yearMonth: string;
  fileName: string;
  importedAt: string;
  processingVersion?: string;
  bonificacaoValueColumn?: "Custo (R$)";
  rows: CommissionRow[];
}

export const COMMISSION_PROCESSING_VERSION = "bonificacao-custo-v2";
export const BONIFICACAO_VALUE_COLUMN = "Custo (R$)" as const;

const norm = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<string, string[]> = {
  vendedor: ["vendedor", "vend", "representante", "consultor"],
  cliente: ["cliente", "razaosocial", "nomecliente", "clientenome", "nomefantasia"],
  codigoCliente: ["codigocliente", "codcliente", "cliidx", "clientecodigo"],
  cnpjCpf: ["cnpjcpf", "cpfcnpj", "cnpj", "cpf", "documentocliente"],
  codigoVenda: ["codigovenda", "codvenda", "numerovenda", "numeroordem", "numeropedido", "pedido", "nvenda", "novenda", "ndocumento", "numero", "documento", "nfe", "notafiscal"],
  produto: ["produto", "descricao", "item", "descricaoproduto"],
  quantidade: ["quantidade", "qtd", "qtde", "qt"],
  precoUnit: ["preco", "precounitario", "precounit", "valorunitario", "vlrunit", "unitario"],
  valor: ["precovendatotal", "precovendatotalr", "precovendatotalrs", "totalvenda", "totalvendas", "valortotalvenda", "valortotal", "valor", "precototal", "faturamento", "total", "vlrtotal", "valorbruto"],
  custo: ["custo", "custor", "custors", "custototal", "custototalr", "valorcusto", "custobonificacao", "custobonif", "custobonifr", "custounitario"],
  categoriaVenda: ["categoriavenda", "categoria", "categoriaoperacao", "naturezavenda"],
  tipo: ["tipo", "tipooperacao", "operacao", "natureza"],
  pctComissao: ["pctcomissao", "comissao", "percentualcomissao", "porcentagemcomissao", "pct"],
  data: ["data", "dataemissao", "emissao"],
};

function detectColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(norm);
  const usados = new Set<number>();
  const todosAliases = new Set(Object.values(HEADER_ALIASES).flat());
  // 1ª passada: correspondência exata do cabeçalho com um alias conhecido.
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.findIndex((h, i) => h === alias && !usados.has(i));
      if (idx >= 0) { map[field] = idx; usados.add(idx); break; }
    }
  }
  // 2ª passada: correspondência parcial, ignorando colunas já atribuídas e
  // cabeçalhos que são exatamente o nome de outro campo (evita "Código Venda"
  // ser lido como "Vendedor", por exemplo).
  const EXCLUI: Record<string, string[]> = {
    precoUnit: ["total"],
    valor: ["unitario", "unit"],
    custo: ["unitario", "unit"],
  };
  // Campos de valor total têm prioridade sobre preço unitário na busca parcial.
  const ordem = ["valor", "custo", ...Object.keys(HEADER_ALIASES).filter((f) => f !== "valor" && f !== "custo")];
  for (const field of ordem) {
    if (map[field] != null) continue;
    const aliases = HEADER_ALIASES[field];
    const proibidos = EXCLUI[field] ?? [];
    for (const alias of aliases) {
      const idx = normalized.findIndex(
        (h, i) => !usados.has(i) && !todosAliases.has(h) && h.includes(alias) && !proibidos.some((p) => h.includes(p)),
      );
      if (idx >= 0) { map[field] = idx; usados.add(idx); break; }
    }
  }
  return map;
}

export function createCommissionBatch(yearMonth: string, fileName: string, rows: CommissionRow[]): CommissionBatch {
  return {
    yearMonth,
    fileName,
    importedAt: new Date().toISOString(),
    processingVersion: COMMISSION_PROCESSING_VERSION,
    bonificacaoValueColumn: BONIFICACAO_VALUE_COLUMN,
    rows,
  };
}

function parseNumberBR(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null;
    return d ? d.toISOString().slice(0, 10) : String(v);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yy = y.length === 2 ? "20" + y : y;
    return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

export function classifyTipo(raw: string, sheetName?: string): CommissionTipo {
  const s = norm(sheetName || "");
  const n = norm(raw);
  // Sheet-based classification
  const sheetIsBonif = s.includes("bonif") || s.includes("cortesia") || s.includes("brinde") || s.includes("degust");
  if (sheetIsBonif) {
    if (n.includes("brinde")) return "BONIFICACAO_BRINDE";
    if (n.includes("cortesia")) return "BONIFICACAO_CORTESIA";
    if (n.includes("degust")) return "BONIFICACAO_DEGUSTACAO";
    if (n.includes("introd")) return "BONIFICACAO_INTRODUCAO";
    if (n.includes("preco")) return "BONIFICACAO_PRECO_FINAL";
    // fallback by sheet name
    if (s.includes("brinde")) return "BONIFICACAO_BRINDE";
    if (s.includes("cortesia")) return "BONIFICACAO_CORTESIA";
    if (s.includes("degust")) return "BONIFICACAO_DEGUSTACAO";
    return "BONIFICACAO_OUTRAS";
  }
  // Fatur sheet
  if (!n || n.includes("venda") || n === "v") return "VENDA";
  if (n.includes("brinde")) return "BONIFICACAO_BRINDE";
  if (n.includes("cortesia")) return n.includes("bonif") ? "BONIFICACAO_CORTESIA" : "CORTESIA";
  if (n.includes("degust")) return "BONIFICACAO_DEGUSTACAO";
  if (n.includes("introd")) return "BONIFICACAO_INTRODUCAO";
  if (n.includes("preco")) return "BONIFICACAO_PRECO_FINAL";
  if (n.includes("bonif")) return "BONIFICACAO_OUTRAS";
  return "VENDA";
}

export const TIPO_LABEL: Record<CommissionTipo, string> = {
  VENDA: "Venda",
  BONIFICACAO_BRINDE: "Brinde",
  BONIFICACAO_CORTESIA: "Cortesia (Bonif.)",
  BONIFICACAO_DEGUSTACAO: "Degustação",
  BONIFICACAO_INTRODUCAO: "Introdução",
  BONIFICACAO_PRECO_FINAL: "Preço Final",
  BONIFICACAO_OUTRAS: "Outras Bonif.",
  CORTESIA: "Cortesia",
};

export const BONIFICACAO_TIPOS: CommissionTipo[] = [
  "BONIFICACAO_BRINDE",
  "BONIFICACAO_CORTESIA",
  "BONIFICACAO_DEGUSTACAO",
  "BONIFICACAO_INTRODUCAO",
  "BONIFICACAO_PRECO_FINAL",
  "BONIFICACAO_OUTRAS",
];

export function isBonificacao(tipo: CommissionTipo): boolean {
  return BONIFICACAO_TIPOS.includes(tipo);
}

export type SheetKind = "vendas" | "bonificacoes" | "desconhecida";

export interface SheetIgnoredDetail {
  linha: number;
  aba: string;
  coluna: string;
  motivo: string;
  conteudo: string;
}

export interface SheetParseResult {
  sheet: string;
  kind: SheetKind;
  totalLinhasWorksheet: number;
  primeiraLinhaNaoVazia: number | null;
  primeiraLinhaConteudo: string[];
  linhaCabecalho: number | null;
  inicioDados: number | null;
  cabecalhos: string[];
  motivoClassificacao: string;
  parserError?: string;
  /** Linhas de dados encontradas (excluindo cabeçalhos e linhas totalmente vazias). */
  linhas: number;
  lidas: number;
  ignoradas: number;
  ignoradasDetalhe: SheetIgnoredDetail[];
  rows: CommissionRow[];
}

export interface ParseResult {
  rows: CommissionRow[];
  totalRowsInSheet: number;
  ignored: number;
  sheetsRead: string[];
  /** Nomes originais, na ordem exata em que aparecem no workbook. */
  sheetNames: string[];
  fileDiagnostics: FileReadDiagnostics;
  /** Detalhamento por aba do arquivo — TODAS as abas são percorridas. */
  sheets: SheetParseResult[];
}

export interface FileReadDiagnostics {
  fileName: string;
  fileType: string;
  fileSize: number;
  isBrowserFile: boolean;
  arrayBufferSize: number;
  firstBytes: string;
  sheetNames: string[];
}

export class WorkbookReadError extends Error {
  readonly diagnostics: FileReadDiagnostics;

  constructor(message: string, diagnostics: FileReadDiagnostics) {
    super(message);
    this.name = "WorkbookReadError";
    this.diagnostics = diagnostics;
  }
}

function nonEmptyCells(row: unknown[] | undefined): string[] {
  return (row ?? []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
}

function headerScore(map: Record<string, number>): number {
  const core = ["cliente", "vendedor", "produto", "data", "codigoVenda"];
  const values = ["valor", "custo", "quantidade", "categoriaVenda"];
  return core.filter((field) => map[field] != null).length * 3
    + values.filter((field) => map[field] != null).length;
}

function findHeader(raw: unknown[][]): { index: number; headers: string[]; map: Record<string, number> } | null {
  let best: { index: number; headers: string[]; map: Record<string, number>; score: number } | null = null;
  for (let index = 0; index < Math.min(30, raw.length); index++) {
    const direct = (raw[index] ?? []).map((cell) => String(cell ?? "").trim());
    if (nonEmptyCells(direct).length < 3) continue;
    const map = detectColumnMap(direct);
    const score = headerScore(map);
    if (score >= 7 && (!best || score > best.score)) best = { index, headers: direct, map, score };
  }
  return best ? { index: best.index, headers: best.headers, map: best.map } : null;
}

function parseWorksheet(
  sheetName: string,
  sheet: XLSX.WorkSheet,
  uidPrefix: string,
  expectedKind: Exclude<SheetKind, "desconhecida">,
): SheetParseResult {
  const empty: SheetParseResult = {
    sheet: sheetName,
    kind: "desconhecida",
    totalLinhasWorksheet: 0,
    primeiraLinhaNaoVazia: null,
    primeiraLinhaConteudo: [],
    linhaCabecalho: null,
    inicioDados: null,
    cabecalhos: [],
    motivoClassificacao: "A worksheet não contém uma assinatura de cabeçalhos reconhecível nas primeiras 30 linhas.",
    linhas: 0,
    lidas: 0,
    ignoradas: 0,
    ignoradasDetalhe: [],
    rows: [],
  };
  const worksheetRange = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  const physicalRowOffset = worksheetRange?.s.r ?? 0;
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  const firstNonEmptyIndex = raw.findIndex((row) => nonEmptyCells(row).length > 0);
  empty.totalLinhasWorksheet = worksheetRange ? worksheetRange.e.r + 1 : raw.length;
  empty.primeiraLinhaNaoVazia = firstNonEmptyIndex >= 0 ? physicalRowOffset + firstNonEmptyIndex + 1 : null;
  empty.primeiraLinhaConteudo = firstNonEmptyIndex >= 0 ? nonEmptyCells(raw[firstNonEmptyIndex]) : [];
  if (raw.length < 2) return empty;

  const foundHeader = findHeader(raw);
  if (!foundHeader) return empty;
  const headerIdx = foundHeader.index;
  // Combina cabeçalhos de até 2 linhas (cabeçalhos multi-linha comuns em planilhas de bonificação)
  const headerRow = foundHeader.headers;
  const rawNextRow = raw[headerIdx + 1] ? raw[headerIdx + 1].map((h) => String(h ?? "")) : [];
  const nextHasHeaderWords = rawNextRow.some((c) => {
    const h = norm(String(c));
    return h.includes("custo") || h.includes("precovenda") || h.includes("valortotal") || h === "valor" || h === "total";
  });
  const nextHasDataNumbers = rawNextRow.some((c) => parseNumberBR(c) > 100);
  const nextIsHeader = nextHasHeaderWords && !nextHasDataNumbers;
  const nextRow = nextIsHeader ? rawNextRow : [];
  const prevRow = headerIdx > 0 ? raw[headerIdx - 1].map((h) => String(h ?? "")) : [];
  const maxLen = Math.max(headerRow.length, nextRow.length, prevRow.length);
  const headers: string[] = [];
  for (let c = 0; c < maxLen; c++) {
    const parts = [prevRow[c] ?? "", headerRow[c] ?? "", nextRow[c] ?? ""]
      .map((s) => String(s).trim())
      .filter(Boolean);
    headers.push(parts.join(" "));
  }
  const directMap = detectColumnMap(headerRow);
  const mergedMap = detectColumnMap(headers);
  const map: Record<string, number | undefined> = {
    ...mergedMap,
    ...directMap,
    custo: directMap.custo ?? mergedMap.custo,
    categoriaVenda: directMap.categoriaVenda ?? mergedMap.categoriaVenda,
  };

  const baseTabular = map.cliente != null && map.vendedor != null && map.produto != null;
  const assinaturaBonificacao = baseTabular && (map.custo != null || map.categoriaVenda != null);
  const assinaturaVendas = baseTabular && map.valor != null && map.codigoVenda != null && map.data != null;
  const estruturaValida = expectedKind === "bonificacoes" ? assinaturaBonificacao : assinaturaVendas;
  const abaEhBonificacao = expectedKind === "bonificacoes";
  const motivoClassificacao = estruturaValida
    ? expectedKind === "bonificacoes"
      ? "Bonificações: identificada pelas colunas (Cliente, Vendedor, Produto + Custo/Categoria Venda), independentemente do nome da aba."
      : "Vendas/Faturamento: identificada pelas colunas (Código Venda, Data, Cliente, Vendedor, Produto, Valor total), independentemente do nome da aba."
    : expectedKind === "bonificacoes"
      ? "A worksheet Bonificações existe, mas faltam Cliente, Vendedor, Produto/Descrição e Custo/Categoria Venda."
      : "A worksheet Faturamento existe, mas faltam Código Venda, Data, Cliente, Vendedor, Produto/Descrição ou valor total.";

  if (!estruturaValida) {
    return {
      ...empty,
      totalLinhasWorksheet: worksheetRange ? worksheetRange.e.r + 1 : raw.length,
      primeiraLinhaNaoVazia: physicalRowOffset + firstNonEmptyIndex + 1,
      primeiraLinhaConteudo: nonEmptyCells(raw[firstNonEmptyIndex]),
      linhaCabecalho: physicalRowOffset + headerIdx + 1,
      inicioDados: physicalRowOffset + headerIdx + 2,
      cabecalhos: headers.filter((header) => header.trim() !== ""),
      motivoClassificacao,
      parserError: motivoClassificacao,
    };
  }

  const dataStart = headerIdx + (nextIsHeader ? 2 : 1);
  const rows: CommissionRow[] = [];
  const ignoradasDetalhe: SheetIgnoredDetail[] = [];
  let ignored = 0;
  let linhas = 0;

  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c) => c === "" || c == null)) continue;
    linhas++;
    const vendedor = map.vendedor != null ? String(r[map.vendedor] ?? "").trim() : "";
    const cliente = map.cliente != null ? String(r[map.cliente] ?? "").trim() : "";
    const precoVendaTotal = map.valor != null ? parseNumberBR(r[map.valor]) : 0;
    const custo = map.custo != null ? parseNumberBR(r[map.custo]) : 0;
    const produtoCol = map.produto != null ? String(r[map.produto] ?? "").trim() : "";

    const registrarIgnorada = (coluna: string, motivo: string) => {
      ignored++;
      if (ignoradasDetalhe.length < 50) {
        ignoradasDetalhe.push({
          linha: physicalRowOffset + i + 1,
          aba: sheetName,
          coluna,
          motivo,
          conteudo: JSON.stringify({ vendedor, cliente, produto: produtoCol, custo, precoVendaTotal }),
        });
      }
    };

    if (!cliente) {
      // Linha de subtotal/rodapé não tem cliente nem produto: descarta sem alarde.
      if (!produtoCol && custo === 0 && precoVendaTotal === 0) continue;
      registrarIgnorada("Cliente", "Cliente ausente");
      continue;
    }
    if (!vendedor) {
      registrarIgnorada("Vendedor", "Vendedor ausente");
      continue;
    }

    const categoriaVenda = map.categoriaVenda != null ? String(r[map.categoriaVenda] ?? "").trim() : "";
    const tipoOperacao = map.tipo != null ? String(r[map.tipo] ?? "").trim() : "";
    const tipoRaw = categoriaVenda || tipoOperacao;
    const tipo = classifyTipo(tipoRaw, abaEhBonificacao ? `bonificacao ${sheetName}` : "");
    // Regra OBRIGATÓRIA: bonificações usam EXCLUSIVAMENTE a coluna Custo (R$).
    // Nunca cair para Preço Venda Total. Se não houver custo, valor = 0 (torna o erro visível).
    const isBonif = tipo !== "VENDA";
    const valor = isBonif ? custo : precoVendaTotal;

    rows.push({
      id: `${uidPrefix}-${i}`,
      vendedor: vendedor ? shortVendedorName(vendedor) : "Não informado",
      cliente,
      cnpjCpf: map.cnpjCpf != null ? String(r[map.cnpjCpf] ?? "").trim() || undefined : undefined,
      codigoCliente: map.codigoCliente != null ? String(r[map.codigoCliente] ?? "").trim() || undefined : undefined,
      codigoVenda: map.codigoVenda != null ? (parseNumberBR(r[map.codigoVenda]) || undefined) : undefined,
      categoriaVenda: categoriaVenda || undefined,
      produto: produtoCol || undefined,
      quantidade: map.quantidade != null ? parseNumberBR(r[map.quantidade]) : undefined,
      precoUnit: map.precoUnit != null ? parseNumberBR(r[map.precoUnit]) : undefined,
      valor,
      custo: isBonif ? custo : custo || undefined,
      precoVendaTotal: precoVendaTotal || undefined,
      valorFonte: isBonif ? BONIFICACAO_VALUE_COLUMN : "Preço Venda Total (R$)",
      tipo,
      tipoRaw: tipoRaw || undefined,
      pctComissao: map.pctComissao != null ? parseNumberBR(r[map.pctComissao]) || null : null,
      data: map.data != null ? parseDate(r[map.data]) : undefined,
      sheet: sheetName,
      linhaPlanilha: physicalRowOffset + i + 1,
    });
  }

  const kind: SheetKind = rows.length > 0 ? expectedKind : "desconhecida";

  return {
    sheet: sheetName,
    kind,
    totalLinhasWorksheet: worksheetRange ? worksheetRange.e.r + 1 : raw.length,
    primeiraLinhaNaoVazia: physicalRowOffset + firstNonEmptyIndex + 1,
    primeiraLinhaConteudo: nonEmptyCells(raw[firstNonEmptyIndex]),
    linhaCabecalho: physicalRowOffset + headerIdx + 1,
    inicioDados: physicalRowOffset + dataStart + 1,
    cabecalhos: headers.filter((header) => header.trim() !== ""),
    motivoClassificacao,
    parserError: rows.length === 0
      ? `A worksheet “${sheetName}” foi localizada e teve seu cabeçalho lido, mas nenhuma linha foi aceita. ${ignoradasDetalhe.map((item) => `Linha ${item.linha}, ${item.coluna}: ${item.motivo}`).slice(0, 3).join(" | ") || "Não há linhas de dados preenchidas após o cabeçalho."}`
      : undefined,
    linhas,
    lidas: rows.length,
    ignoradas: ignored,
    ignoradasDetalhe,
    rows,
  };
}

/** Parser exclusivo da worksheet Faturamento. */
export function parseFaturamento(sheet: XLSX.WorkSheet, sheetName = "Faturamento"): SheetParseResult {
  return parseWorksheet(sheetName, sheet, "faturamento", "vendas");
}

/** Parser exclusivo da worksheet Bonificações. */
export function parseBonificacoes(sheet: XLSX.WorkSheet, sheetName = "Bonificações"): SheetParseResult {
  return parseWorksheet(sheetName, sheet, "bonificacoes", "bonificacoes");
}

/** Identifica a função da aba somente pelos cabeçalhos (tolerante a acento/caixa/espaços). */
export function detectSheetKind(sheet: XLSX.WorkSheet): { kind: SheetKind; headers: string[]; headerRow: number | null } {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });
  const found = findHeader(raw);
  if (!found) {
    const first = raw.find((r) => nonEmptyCells(r).length > 0);
    return { kind: "desconhecida", headers: nonEmptyCells(first), headerRow: null };
  }
  const next = (raw[found.index + 1] ?? []).map((c) => String(c ?? ""));
  const map = { ...detectColumnMap(next), ...found.map } as Record<string, number | undefined>;
  const nextMap = detectColumnMap(found.headers.map((h, i) => `${h} ${next[i] ?? ""}`.trim()));
  map.custo ??= nextMap.custo;
  map.categoriaVenda ??= nextMap.categoriaVenda;
  const base = map.cliente != null && map.vendedor != null && map.produto != null;
  const headers = found.headers.filter((h) => h.trim() !== "");
  if (base && (map.custo != null || map.categoriaVenda != null)) return { kind: "bonificacoes", headers, headerRow: found.index + 1 };
  if (base && map.valor != null && map.codigoVenda != null && map.data != null) return { kind: "vendas", headers, headerRow: found.index + 1 };
  return { kind: "desconhecida", headers, headerRow: found.index + 1 };
}

export async function parseCommissionFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetNames = [...wb.SheetNames];
  const firstBytes = Array.from(new Uint8Array(buf).slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  const fileDiagnostics: FileReadDiagnostics = {
    fileName: file.name,
    fileType: file.type || "não informado",
    fileSize: file.size,
    isBrowserFile: typeof File !== "undefined" && file instanceof File,
    arrayBufferSize: buf.byteLength,
    firstBytes,
    sheetNames,
  };
  console.info("[Comissão][arquivo original]", fileDiagnostics);

  const normalizedFileName = norm(file.name);
  const isAugustMonthlyFile = normalizedFileName.includes("totalvendasagosto2026");
  const receivedOnlyGenericSheet = sheetNames.length === 1 && /^sheet\s*1$/i.test(sheetNames[0]?.trim() ?? "");
  if (isAugustMonthlyFile && receivedOnlyGenericSheet) {
    throw new WorkbookReadError(
      "ERRO DE LEITURA DO ARQUIVO: o XLSX original possui múltiplas abas, mas o sistema recebeu uma versão convertida contendo apenas Sheet 1.",
      fileDiagnostics,
    );
  }
  // Classificação EXCLUSIVAMENTE pelas colunas — nome e ordem das abas são ignorados.
  const sheets: SheetParseResult[] = [];
  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const det = detectSheetKind(ws);
    if (det.kind === "bonificacoes") sheets.push(parseBonificacoes(ws, name));
    else if (det.kind === "vendas") sheets.push(parseFaturamento(ws, name));
    else if (det.headers.length > 0) {
      const msg = `Não foi possível identificar automaticamente esta aba (“${name}”). Colunas encontradas: ${det.headers.join(", ") || "nenhuma"}.`;
      sheets.push({
        sheet: name, kind: "desconhecida", totalLinhasWorksheet: 0, primeiraLinhaNaoVazia: null,
        primeiraLinhaConteudo: [], linhaCabecalho: det.headerRow, inicioDados: null, cabecalhos: det.headers,
        motivoClassificacao: msg, parserError: msg, linhas: 0, lidas: 0, ignoradas: 0, ignoradasDetalhe: [], rows: [],
      });
    }
  }
  const faturamentoName = sheets.find((x) => x.kind === "vendas")?.sheet;
  const bonificacoesName = sheets.find((x) => x.kind === "bonificacoes")?.sheet;

  const allRows = sheets.flatMap((entry) => entry.rows);
  const ignored = sheets.reduce((sum, entry) => sum + entry.ignoradas, 0);
  const sheetsRead = sheets.filter((entry) => entry.rows.length > 0).map((entry) => entry.sheet);
  console.info("[Comissão][workbook encontrado]", {
    abas: sheetNames,
    faturamento: faturamentoName ?? "não encontrada",
    bonificacoes: bonificacoesName ?? "não encontrada",
  });
  console.info("[Comissão][diagnóstico de worksheets]", sheets.map((entry) => ({
    aba: entry.sheet,
    linhasWorksheet: entry.totalLinhasWorksheet,
    primeiraLinhaNaoVazia: entry.primeiraLinhaNaoVazia,
    primeiraLinha: entry.primeiraLinhaConteudo,
    linhaCabecalho: entry.linhaCabecalho,
    cabecalhos: entry.cabecalhos,
    tipo: entry.kind,
    regra: entry.motivoClassificacao,
    lidas: entry.lidas,
    ignoradas: entry.ignoradas,
    erroParser: entry.parserError,
  })));
  return { rows: allRows, totalRowsInSheet: allRows.length, ignored, sheetsRead, sheetNames, fileDiagnostics, sheets };
}
