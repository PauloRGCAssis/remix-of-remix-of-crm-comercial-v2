import { useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, Search, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateTime, formatInteger, ParsedImportBatch, ParsedRow } from "@/lib/importSpreadsheet";
import { shortVendedorName } from "@/lib/vendorRegistry";

type AuditStatus = "ok" | "missing" | "duplicated" | "extra" | "wrong_vendor" | "ignored";
type AuditOrigin = "Planilha" | "CRM" | "Banco ignorado pelo CRM";

interface DbSaleRow {
  id: number;
  original_row_number?: number | null;
  codigo_venda: number;
  data: string;
  quantidade: number;
  descricao: string;
  cnpj_cpf?: string | null;
  cliente: string;
  vendedor: string;
  preco_venda?: number | null;
  preco_venda_total?: number | null;
  preco_unitario?: number | null;
  preco_total?: number | null;
  nome_arquivo_importado?: string | null;
  data_importacao?: string | null;
  created_at?: string | null;
  import_key?: string | null;
}

interface AuditDetailRow {
  key: string;
  codigo_venda: number;
  data: string;
  cliente: string;
  descricao: string;
  vendedor: string;
  valor: number;
  origem: AuditOrigin;
  qtdCodigoBanco: number;
  status: AuditStatus;
  detalhe: string;
  idBanco?: number;
  arquivo?: string | null;
  importKey?: string | null;
}

interface VendorAuditSummary {
  vendedor: string;
  totalPlanilha: number;
  totalCrm: number;
  diferenca: number;
  vendasPlanilha: number;
  vendasBanco: number;
  itensPlanilha: number;
  itensCrm: number;
  duplicadas: number;
  ausentes: number;
  vendedorErrado: number;
  ignoradas: number;
}

interface SourceCheck {
  salesRawRows: { rows: number; total: number };
  salesLegacy: { rows: number; total: number };
}

interface AuditResult {
  dbRows: DbSaleRow[];
  sourceCheck: SourceCheck;
  details: AuditDetailRow[];
  vendorSummaries: VendorAuditSummary[];
  totals: {
    sheet: number;
    crm: number;
    difference: number;
    missing: number;
    duplicated: number;
    extra: number;
    wrongVendor: number;
    ignored: number;
  };
}

const PAGE_SIZE = 1000;

function normalizeText(value: string | number | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function normalizeQuantity(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(4) : "0.0000";
}

function minuteKey(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : date.toISOString().slice(0, 16);
}

function rowValue(row: ParsedRow | DbSaleRow): number {
  return Number((row as DbSaleRow).preco_venda_total ?? row.preco_total ?? 0);
}

function exactKey(row: ParsedRow | DbSaleRow): string {
  return [
    String(row.codigo_venda ?? 0),
    minuteKey(row.data),
    normalizeText(row.cliente),
    normalizeText(row.descricao),
    normalizeQuantity(row.quantidade),
    normalizeMoney(rowValue(row)),
    normalizeText(shortVendedorName(row.vendedor ?? "")),
  ].join("|");
}

function rowKeyWithoutVendor(row: ParsedRow | DbSaleRow): string {
  return [
    String(row.codigo_venda ?? 0),
    minuteKey(row.data),
    normalizeText(row.cliente),
    normalizeText(row.descricao),
    normalizeQuantity(row.quantidade),
    normalizeMoney(rowValue(row)),
  ].join("|");
}

function groupByKey<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function countCodes(rows: Array<ParsedRow | DbSaleRow>): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.codigo_venda, (map.get(row.codigo_venda) ?? 0) + 1);
  return map;
}

function distinctCodeCount(rows: Array<ParsedRow | DbSaleRow>): number {
  return new Set(rows.map((row) => row.codigo_venda)).size;
}

function statusLabel(status: AuditStatus): string {
  const labels: Record<AuditStatus, string> = {
    ok: "Conferido",
    missing: "Faltando",
    duplicated: "Duplicado",
    extra: "Sobrando",
    wrong_vendor: "Vendedor errado",
    ignored: "Ignorado",
  };
  return labels[status];
}

function statusClass(status: AuditStatus): string {
  const classes: Record<AuditStatus, string> = {
    ok: "border-success/30 bg-success/10 text-success",
    missing: "border-destructive/30 bg-destructive/10 text-destructive",
    duplicated: "border-warning/30 bg-warning/10 text-warning",
    extra: "border-warning/30 bg-warning/10 text-warning",
    wrong_vendor: "border-destructive/30 bg-destructive/10 text-destructive",
    ignored: "border-muted-foreground/30 bg-muted text-muted-foreground",
  };
  return classes[status];
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchRowsByDateRange<T>(
  table: "sales_raw_rows" | "sales",
  select: string,
  start: string,
  end: string,
  onlyActive = false,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    let query = (supabase as any)
      .from(table)
      .select(select)
      .gte("data", start)
      .lte("data", end);
    if (onlyActive && table === "sales_raw_rows") query = query.eq("active", true);
    query = query
      .order("data", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function buildAudit(batch: ParsedImportBatch, dbRows: DbSaleRow[], sourceCheck: SourceCheck): AuditResult {
  const sheetRows = batch.rows;
  const crmRows = dbRows;
  const ignoredRows: DbSaleRow[] = [];

  const sheetExact = groupByKey(sheetRows, (row) => exactKey(row));
  const crmExact = groupByKey(crmRows, (row) => exactKey(row));
  const sheetNoVendor = groupByKey(sheetRows, (row) => rowKeyWithoutVendor(row));
  const crmNoVendor = groupByKey(crmRows, (row) => rowKeyWithoutVendor(row));
  const dbCodeCounts = countCodes(dbRows);
  const sheetCodeCounts = countCodes(sheetRows);
  const sheetVendorsByCode = new Map<number, Set<string>>();
  const crmVendorsByCode = new Map<number, Set<string>>();
  for (const row of sheetRows) {
    const set = sheetVendorsByCode.get(row.codigo_venda) ?? new Set<string>();
    set.add(shortVendedorName(row.vendedor));
    sheetVendorsByCode.set(row.codigo_venda, set);
  }
  for (const row of crmRows) {
    const set = crmVendorsByCode.get(row.codigo_venda) ?? new Set<string>();
    set.add(shortVendedorName(row.vendedor));
    crmVendorsByCode.set(row.codigo_venda, set);
  }

  const details: AuditDetailRow[] = [];

  for (const [key, rows] of sheetExact) {
    const crmMatches = crmExact.get(key) ?? [];
    for (const [index, row] of rows.entries()) {
      const noVendorMatches = crmNoVendor.get(rowKeyWithoutVendor(row)) ?? [];
      const codeVendors = crmVendorsByCode.get(row.codigo_venda) ?? new Set<string>();
      const existsOnlyUnderOtherVendor = codeVendors.size > 0 && !codeVendors.has(shortVendedorName(row.vendedor));
      const status: AuditStatus = index < crmMatches.length
        ? "ok"
        : noVendorMatches.length > index
          ? "wrong_vendor"
          : existsOnlyUnderOtherVendor
            ? "wrong_vendor"
            : "missing";
      details.push({
        key: `sheet-${key}-${index}`,
        codigo_venda: row.codigo_venda,
        data: row.data,
        cliente: row.cliente,
        descricao: row.descricao,
        vendedor: shortVendedorName(row.vendedor),
        valor: rowValue(row),
        origem: "Planilha",
        qtdCodigoBanco: dbCodeCounts.get(row.codigo_venda) ?? 0,
        status,
        detalhe: status === "wrong_vendor" ? "Mesmo item existe no banco, mas associado a outro vendedor." : status === "missing" ? "Linha da planilha não encontrada nos registros usados pelo CRM." : "Linha encontrada no CRM.",
        arquivo: row.nome_arquivo_importado,
      });
    }
  }

  for (const [key, rows] of crmExact) {
    const sheetMatches = sheetExact.get(key) ?? [];
    for (const [index, row] of rows.entries()) {
      const hasSheetCode = (sheetCodeCounts.get(row.codigo_venda) ?? 0) > 0;
      const hasNoVendorSheetMatch = (sheetNoVendor.get(rowKeyWithoutVendor(row)) ?? []).length > index;
      const expectedVendors = sheetVendorsByCode.get(row.codigo_venda) ?? new Set<string>();
      const codeBelongsToOtherVendor = expectedVendors.size > 0 && !expectedVendors.has(shortVendedorName(row.vendedor));
      const status: AuditStatus = index < sheetMatches.length
        ? "ok"
        : hasNoVendorSheetMatch
          ? "wrong_vendor"
          : codeBelongsToOtherVendor
            ? "wrong_vendor"
            : hasSheetCode
              ? "duplicated"
              : "extra";
      details.push({
        key: `crm-${row.id}`,
        codigo_venda: row.codigo_venda,
        data: row.data,
        cliente: row.cliente,
        descricao: row.descricao,
        vendedor: shortVendedorName(row.vendedor),
        valor: rowValue(row),
        origem: "CRM",
        qtdCodigoBanco: dbCodeCounts.get(row.codigo_venda) ?? 0,
        status,
        detalhe: status === "duplicated" ? "Registro do banco excede a quantidade encontrada na planilha para a mesma venda." : status === "extra" ? "Código existe no banco, mas não está na planilha auditada." : status === "wrong_vendor" ? "Item corresponde à planilha, mas o vendedor gravado é diferente." : "Registro usado pelo CRM confere com a planilha.",
        idBanco: row.id,
        arquivo: row.nome_arquivo_importado,
        importKey: row.import_key,
      });
    }
  }

  for (const row of ignoredRows) {
    details.push({
      key: `ignored-${row.id}`,
      codigo_venda: row.codigo_venda,
      data: row.data,
      cliente: row.cliente,
      descricao: row.descricao,
      vendedor: shortVendedorName(row.vendedor),
      valor: rowValue(row),
      origem: "Banco ignorado pelo CRM",
      qtdCodigoBanco: dbCodeCounts.get(row.codigo_venda) ?? 0,
      status: "ignored",
      detalhe: "Registro está no banco, mas a regra atual de aliases o remove das análises do CRM.",
      idBanco: row.id,
      arquivo: row.nome_arquivo_importado,
      importKey: row.import_key,
    });
  }

  const vendors = new Set<string>();
  for (const row of sheetRows) vendors.add(shortVendedorName(row.vendedor));
  for (const row of crmRows) vendors.add(shortVendedorName(row.vendedor));

  const vendorSummaries = [...vendors]
    .filter(Boolean)
    .map((vendedor) => {
      const sheetVendorRows = sheetRows.filter((row) => shortVendedorName(row.vendedor) === vendedor);
      const crmVendorRows = crmRows.filter((row) => shortVendedorName(row.vendedor) === vendedor);
      const detailForVendor = details.filter((row) => row.vendedor === vendedor);
      const totalPlanilha = sheetVendorRows.reduce((sum, row) => sum + rowValue(row), 0);
      const totalCrm = crmVendorRows.reduce((sum, row) => sum + rowValue(row), 0);
      return {
        vendedor,
        totalPlanilha,
        totalCrm,
        diferenca: totalCrm - totalPlanilha,
        vendasPlanilha: distinctCodeCount(sheetVendorRows),
        vendasBanco: distinctCodeCount(crmVendorRows),
        itensPlanilha: sheetVendorRows.length,
        itensCrm: crmVendorRows.length,
        duplicadas: detailForVendor.filter((row) => row.origem === "CRM" && row.status === "duplicated").length,
        ausentes: detailForVendor.filter((row) => row.origem === "Planilha" && row.status === "missing").length,
        vendedorErrado: detailForVendor.filter((row) => row.status === "wrong_vendor").length,
        ignoradas: detailForVendor.filter((row) => row.status === "ignored").length,
      } satisfies VendorAuditSummary;
    })
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || a.vendedor.localeCompare(b.vendedor, "pt-BR"));

  const totals = {
    sheet: sheetRows.reduce((sum, row) => sum + rowValue(row), 0),
    crm: crmRows.reduce((sum, row) => sum + rowValue(row), 0),
    difference: 0,
    missing: details.filter((row) => row.origem === "Planilha" && row.status === "missing").length,
    duplicated: details.filter((row) => row.origem === "CRM" && row.status === "duplicated").length,
    extra: details.filter((row) => row.origem === "CRM" && row.status === "extra").length,
    wrongVendor: details.filter((row) => row.status === "wrong_vendor").length,
    ignored: details.filter((row) => row.status === "ignored").length,
  };
  totals.difference = totals.crm - totals.sheet;

  return {
    dbRows,
    sourceCheck,
    details: details.sort((a, b) => a.codigo_venda - b.codigo_venda || a.origem.localeCompare(b.origem) || new Date(a.data).getTime() - new Date(b.data).getTime()),
    vendorSummaries,
    totals,
  };
}

export function SalesAuditTab({ batch }: { batch: ParsedImportBatch | null }) {
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<"issues" | "all" | AuditStatus>("issues");
  const [search, setSearch] = useState("");

  const runAudit = async () => {
    if (!batch?.rows.length || !batch.rangeStart || !batch.rangeEnd) return;
    setLoading(true);
    try {
      const dbRows = await fetchRowsByDateRange<DbSaleRow>(
        "sales_raw_rows",
        "id, original_row_number, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_venda, preco_venda_total, preco_unitario, preco_total, nome_arquivo_importado, data_importacao, created_at, import_key, active",
        batch.rangeStart,
        batch.rangeEnd,
        true,
      );
      const legacyRows = await fetchRowsByDateRange<DbSaleRow>(
        "sales",
        "id, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_unitario, preco_total, created_at",
        batch.rangeStart,
        batch.rangeEnd,
      );

      setAudit(buildAudit(batch, dbRows, {
        salesRawRows: { rows: dbRows.length, total: dbRows.reduce((sum, row) => sum + rowValue(row), 0) },
        salesLegacy: { rows: legacyRows.length, total: legacyRows.reduce((sum, row) => sum + rowValue(row), 0) },
      }));
    } catch (error: any) {
      toast({ title: "Erro na auditoria", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredDetails = useMemo(() => {
    if (!audit) return [];
    const term = normalizeText(search);
    return audit.details.filter((row) => {
      const statusMatch = statusFilter === "all"
        || (statusFilter === "issues" ? row.status !== "ok" : row.status === statusFilter);
      if (!statusMatch) return false;
      if (!term) return true;
      return normalizeText(`${row.codigo_venda} ${row.cliente} ${row.descricao} ${row.vendedor} ${row.detalhe}`).includes(term);
    });
  }, [audit, search, statusFilter]);

  const exportCsv = () => {
    if (!audit) return;
    const header = ["Codigo da Venda", "Data", "Cliente", "Produto", "Vendedor", "Valor do item", "Origem", "Qtd codigo no banco", "Status", "Detalhe", "ID banco", "Arquivo", "Import key"];
    const lines = audit.details.map((row) => [
      row.codigo_venda,
      formatDateTime(row.data),
      row.cliente,
      row.descricao,
      row.vendedor,
      normalizeMoney(row.valor),
      row.origem,
      row.qtdCodigoBanco,
      statusLabel(row.status),
      row.detalhe,
      row.idBanco ?? "",
      row.arquivo ?? "",
      row.importKey ?? "",
    ].map(csvEscape).join(";"));
    const blob = new Blob([[header.map(csvEscape).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auditoria-vendas-planilha-vs-crm.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-heading text-base">
            <ShieldCheck className="h-5 w-5 text-primary" /> Auditoria planilha x CRM
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare a planilha carregada agora com os registros gravados e usados pelo CRM.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const { data, error } = await supabase.rpc("rebuild_sales_dedupe" as any, {});
              if (error) {
                toast({ title: "Falha ao reconstruir", description: error.message, variant: "destructive" });
                return;
              }
              const row = Array.isArray(data) ? (data as any[])[0] : (data as any);
              toast({
                title: "Dedupe concluída",
                description: `${row?.linhas_desativadas ?? 0} linhas duplicadas desativadas (R$ ${Number(row?.valor_removido ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} removidos).`,
              });
            }}
          >
            <ShieldCheck className="mr-2 h-4 w-4" /> Reconstruir dedupe
          </Button>
          <Button variant="outline" onClick={runAudit} disabled={!batch?.rows.length || loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Executar auditoria
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!batch?.rows.length && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Envie a planilha oficial</AlertTitle>
            <AlertDescription>Carregue o ReportPedidosItens no upload acima para a auditoria comparar cada registro contra o banco.</AlertDescription>
          </Alert>
        )}

        {audit && (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Total da planilha</div><div className="text-xl font-semibold">{formatCurrency(audit.totals.sheet)}</div></div>
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Total do CRM</div><div className="text-xl font-semibold">{formatCurrency(audit.totals.crm)}</div></div>
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Diferença</div><div className={audit.totals.difference === 0 ? "text-xl font-semibold text-success" : "text-xl font-semibold text-destructive"}>{formatCurrency(audit.totals.difference)}</div></div>
              <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Ocorrências com divergência</div><div className="text-xl font-semibold">{formatInteger(audit.details.filter((row) => row.status !== "ok").length)}</div></div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Faltando</div><div className="font-semibold">{formatInteger(audit.totals.missing)}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Duplicados</div><div className="font-semibold">{formatInteger(audit.totals.duplicated)}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Sobrando</div><div className="font-semibold">{formatInteger(audit.totals.extra)}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Vendedor errado</div><div className="font-semibold">{formatInteger(audit.totals.wrongVendor)}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Ignorados pelo CRM</div><div className="font-semibold">{formatInteger(audit.totals.ignored)}</div></div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Diagnóstico de fonte de dados</AlertTitle>
              <AlertDescription>
                O cálculo atual do CRM usa sales_raw_rows: {formatInteger(audit.sourceCheck.salesRawRows.rows)} registros / {formatCurrency(audit.sourceCheck.salesRawRows.total)} no período auditado. A tabela legada sales também existe no banco, mas não é a fonte do CRM: {formatInteger(audit.sourceCheck.salesLegacy.rows)} registros / {formatCurrency(audit.sourceCheck.salesLegacy.total)} no mesmo recorte.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <Label htmlFor="audit-search">Buscar na auditoria</Label>
                  <Input id="audit-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, cliente, produto ou vendedor" className="md:w-[360px]" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["issues", "Somente divergências"],
                    ["all", "Todos"],
                    ["missing", "Faltando"],
                    ["duplicated", "Duplicados"],
                    ["extra", "Sobrando"],
                    ["wrong_vendor", "Vendedor errado"],
                    ["ignored", "Ignorados"],
                  ] as const).map(([value, label]) => (
                    <Button key={value} type="button" variant={statusFilter === value ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(value)}>
                      {label}
                    </Button>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />CSV</Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table className="min-w-[1320px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código da Venda</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Valor do item</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Qtd código no banco</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Onde está a divergência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDetails.slice(0, 500).map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-mono">{row.codigo_venda}</TableCell>
                        <TableCell>{formatDateTime(row.data)}</TableCell>
                        <TableCell className="max-w-[240px] break-words font-medium">{row.cliente}</TableCell>
                        <TableCell className="max-w-[300px] break-words">{row.descricao}</TableCell>
                        <TableCell>{row.vendedor}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.valor)}</TableCell>
                        <TableCell>{row.origem}</TableCell>
                        <TableCell className="text-right">{formatInteger(row.qtdCodigoBanco)}</TableCell>
                        <TableCell><Badge variant="outline" className={statusClass(row.status)}>{statusLabel(row.status)}</Badge></TableCell>
                        <TableCell className="max-w-[340px] break-words text-sm text-muted-foreground">
                          {row.detalhe}{row.idBanco ? ` ID ${row.idBanco}.` : ""}{row.arquivo ? ` Arquivo: ${row.arquivo}.` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredDetails.length && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum registro encontrado para o filtro atual.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredDetails.length > 500 && <p className="text-xs text-muted-foreground">Exibindo 500 de {formatInteger(filteredDetails.length)} registros filtrados. Use o CSV para a auditoria completa.</p>}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Total da planilha</TableHead>
                    <TableHead className="text-right">Total do CRM</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="text-right">Vendas planilha</TableHead>
                    <TableHead className="text-right">Vendas banco</TableHead>
                    <TableHead className="text-right">Itens planilha</TableHead>
                    <TableHead className="text-right">Itens CRM</TableHead>
                    <TableHead className="text-right">Duplicadas</TableHead>
                    <TableHead className="text-right">Ausentes</TableHead>
                    <TableHead className="text-right">Vend. errado</TableHead>
                    <TableHead className="text-right">Ignoradas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.vendorSummaries.map((row) => (
                    <TableRow key={row.vendedor}>
                      <TableCell className="font-medium">{row.vendedor}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalPlanilha)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalCrm)}</TableCell>
                      <TableCell className={row.diferenca === 0 ? "text-right text-success" : "text-right text-destructive"}>{formatCurrency(row.diferenca)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.vendasPlanilha)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.vendasBanco)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.itensPlanilha)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.itensCrm)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.duplicadas)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.ausentes)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.vendedorErrado)}</TableCell>
                      <TableCell className="text-right">{formatInteger(row.ignoradas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}