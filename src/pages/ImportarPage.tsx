import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Database,
  FileSpreadsheet,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatInteger,
  formatMonthLabel,
  ParsedImportBatch,
  ParsedRow,
  parseFilesToImportBatch,
} from "@/lib/importSpreadsheet";
import { executeSalesImport, refreshSalesCaches } from "@/lib/salesImportRunner";

import { useVendors } from "@/hooks/useVendors";
import { UnknownVendorPrompt } from "@/components/vendedores/UnknownVendorPrompt";
import { shortVendedorName } from "@/lib/vendorRegistry";
import { SalesAuditTab } from "@/components/importacao/SalesAuditTab";

type ImportMode = "incremental";

interface PreviewSummary {
  total: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  staleCount?: number;
  rangeStart: string;
  rangeEnd: string;
}

interface ImportResult extends PreviewSummary {
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
  deactivated?: number;
  errors?: string[];
  mode: ImportMode;
}

interface IntegrityIssueMonth {
  month: string;
  recordCount: number;
}

interface DuplicateKey {
  data: string;
  cliente: string;
  produto: string;
  vendedor: string;
  duplicateCount: number;
  totalValue: number;
}

interface IntegrityReport {
  minDate: string | null;
  maxDate: string | null;
  totalRecords: number;
  uniqueClients: number;
  uniqueProducts: number;
  missingMonths: IntegrityIssueMonth[];
  duplicateKeys: DuplicateKey[];
  hasZeroMonthGap: boolean;
  hasDuplicateKeys: boolean;
}

interface ImportHistoryItem {
  id: string;
  created_at: string;
  import_type: string;
  file_names: string[];
  file_count: number;
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  deleted_count: number;
  range_start: string | null;
  range_end: string | null;
  warning_message: string | null;
}

interface DebugResult {
  month: string;
  totalRecords: number;
  faturamentoTotal: number;
  sampleRows: ParsedRow[];
}

const INITIAL_REPORT: IntegrityReport = {
  minDate: null,
  maxDate: null,
  totalRecords: 0,
  uniqueClients: 0,
  uniqueProducts: 0,
  missingMonths: [],
  duplicateKeys: [],
  hasZeroMonthGap: false,
  hasDuplicateKeys: false,
};

function getDefaultDebugMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildWarningMessage(report: IntegrityReport | null) {
  if (!report) return null;
  if (report.hasZeroMonthGap) {
    return "Dados existentes não estão sendo considerados na análise. Verifique filtros ou estrutura da base.";
  }
  if (report.hasDuplicateKeys) {
    return "Foram encontradas chaves duplicadas na base consolidada. Revise conflitos antes de confiar nos comparativos.";
  }
  return null;
}

export default function ImportarPage() {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<ParsedImportBatch | null>(null);
  const [unknownVendors, setUnknownVendors] = useState<string[]>([]);
  const { data: vendorsList } = useVendors();
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport>(INITIAL_REPORT);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [debugMonth, setDebugMonth] = useState(getDefaultDebugMonth());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [checkingDebug, setCheckingDebug] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mode: ImportMode = "incremental";
  const [lastImport, setLastImport] = useState<ImportHistoryItem | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

  // Tamanho do bloco enviado pra edge function. Mantém cada request rápido
  // e evita statement timeout no Postgres mesmo com planilhas grandes.
  const CHUNK_SIZE = 300;

  const warningMessage = useMemo(() => buildWarningMessage(integrityReport), [integrityReport]);

  const refreshHistory = async () => {
    const { data, error } = await (supabase as any)
      .from("import_history")
      .select("id, created_at, import_type, file_names, file_count, total_rows, inserted_count, updated_count, unchanged_count, deleted_count, range_start, range_end, warning_message")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) throw error;
    const items = (data ?? []) as ImportHistoryItem[];
    setHistory(items);
    setLastImport(items[0] ?? null);
  };

  const refreshIntegrity = async () => {
    setCheckingIntegrity(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_import_integrity_report");
      if (error) throw error;
      setIntegrityReport((data ?? INITIAL_REPORT) as IntegrityReport);
    } catch (error: any) {
      toast({ title: "Erro ao verificar integridade", description: error.message, variant: "destructive" });
    } finally {
      setCheckingIntegrity(false);
    }
  };

  useEffect(() => {
    void Promise.all([refreshIntegrity(), refreshHistory()]);
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    setLoadingFiles(true);
    setSummary(null);
    setDebugResult(null);

    try {
      const parsedBatch = await parseFilesToImportBatch(selectedFiles);
      setFiles(selectedFiles);
      setBatch(parsedBatch);
      toast({
        title: `${selectedFiles.length} arquivo(s) processado(s)`,
        description: `${formatInteger(parsedBatch.rows.length)} linhas válidas prontas para importação incremental.`,
      });
    } catch (error: any) {
      toast({ title: "Erro ao ler planilhas", description: error.message, variant: "destructive" });
    } finally {
      setLoadingFiles(false);
      event.target.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!batch?.rows.length) return;
    setAnalyzing(true);
    setProgress({ current: 0, total: 0, phase: "Analisando..." });
    try {
      const rows = batch.rows;
      if (batch.isCompleteReport) {
        setProgress({ current: 1, total: 1, phase: "Analisando relatório completo" });
        const { data, error } = await supabase.functions.invoke("import-sales", {
          body: { rows, mode: "preview", syncFullReport: true },
        });
        if (error) throw error;
        const r = data as PreviewSummary;
        setSummary({
          total: r.total,
          newCount: r.newCount ?? 0,
          updateCount: r.updateCount ?? 0,
          unchangedCount: r.unchangedCount ?? 0,
          staleCount: r.staleCount ?? 0,
          rangeStart: r.rangeStart ?? "",
          rangeEnd: r.rangeEnd ?? "",
        });
        return;
      }

      // Para importações parciais, preview em blocos sem desativar sobras.
      const chunks = Math.ceil(rows.length / CHUNK_SIZE);
      let total = 0;
      let newCount = 0;
      let updateCount = 0;
      let unchangedCount = 0;
      let staleCount = 0;
      let minRange: string | null = null;
      let maxRange: string | null = null;

      for (let i = 0; i < chunks; i++) {
        const slice = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        setProgress({ current: i + 1, total: chunks, phase: "Analisando diferenças" });
        const { data, error } = await supabase.functions.invoke("import-sales", {
          body: { rows: slice, mode: "preview" },
        });
        if (error) throw error;
        const r = data as PreviewSummary;
        total += r.total;
        newCount += r.newCount ?? 0;
        updateCount += r.updateCount ?? 0;
        unchangedCount += r.unchangedCount ?? 0;
        staleCount += r.staleCount ?? 0;
        if (!minRange || r.rangeStart < minRange) minRange = r.rangeStart;
        if (!maxRange || r.rangeEnd > maxRange) maxRange = r.rangeEnd;
      }

      setSummary({
        total,
        newCount,
        updateCount,
        unchangedCount,
        staleCount,
        rangeStart: minRange ?? "",
        rangeEnd: maxRange ?? "",
      });
    } catch (error: any) {
      toast({ title: "Erro na análise", description: error.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  };

  const handleDebugMonth = async () => {
    if (!debugMonth) return;
    setCheckingDebug(true);
    try {
      const [year, month] = debugMonth.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const allRows: ParsedRow[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("sales_raw_rows" as any)
          .select("original_row_number, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_venda, preco_venda_total, preco_unitario, preco_total, nome_arquivo_importado, data_importacao")
          .eq("active", true)
          .gte("data", start.toISOString())
          .lt("data", end.toISOString())
          .order("data", { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data?.length) break;
        allRows.push(...(((data ?? []).map((row: any) => ({
          ...row,
          preco_unitario: Number(row.preco_venda ?? row.preco_unitario ?? 0),
          preco_total: Number(row.preco_venda_total ?? row.preco_total ?? 0),
        })) as unknown) as ParsedRow[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setDebugResult({
        month: debugMonth,
        totalRecords: allRows.length,
        faturamentoTotal: allRows.reduce((sum, row) => sum + Number(row.preco_total || 0), 0),
        sampleRows: allRows.slice(0, 12),
      });
    } catch (error: any) {
      toast({ title: "Erro no debug do período", description: error.message, variant: "destructive" });
    } finally {
      setCheckingDebug(false);
    }
  };

  const persistHistory = async (result: ImportResult, report: IntegrityReport) => {
    if (!batch) return;
    const warning = buildWarningMessage(report);
    await (supabase as any).from("import_history").insert({
      import_type: mode,
      file_names: batch.fileSummaries.map((item) => item.name),
      file_count: batch.fileSummaries.length,
      range_start: result.rangeStart,
      range_end: result.rangeEnd,
      total_rows: batch.rows.length,
      inserted_count: result.inserted,
      updated_count: result.updated,
      unchanged_count: result.unchanged,
      deleted_count: result.deleted,
      warning_message: warning,
      integrity_snapshot: report,
      debug_sample: batch.previewRows,
      imported_by: "Lovable Cloud",
    });
  };

  const runImport = async () => {
    if (!batch?.rows.length || !summary) return;
    setImporting(true);
    setProgress({ current: 0, total: 0, phase: "Preparando..." });
    try {
      const rows = batch.rows;
      const chunks = batch.isCompleteReport ? 1 : Math.ceil(rows.length / CHUNK_SIZE);

      // Núcleo compartilhado: mesma função usada pelo botão da aba "Ponto de Venda".
      const counts = await executeSalesImport(batch, setProgress);
      const inserted = counts.inserted;
      const updated = counts.updated;
      const unchanged = counts.unchanged;
      const deactivated = counts.deactivated;
      const deleted = deactivated;
      const errors = counts.errors;


      const result: ImportResult = {
        ...summary,
        inserted,
        updated,
        unchanged,
        deleted,
        deactivated,
        errors,
        mode,
      };

      // 3) Pós-processamento — gravar histórico PRIMEIRO (rápido e crítico),
      // depois tentar o relatório de integridade (pesado, pode dar timeout).
      // 3a) Histórico SEMPRE é gravado (mesmo sem mudanças) para o card
      // "Última importação" refletir a tentativa mais recente.
      setProgress({ current: chunks, total: chunks, phase: "Registrando importação" });
      try {
        await persistHistory(result, INITIAL_REPORT);
        await refreshHistory();
      } catch (e) {
        console.warn("persistHistory falhou:", e);
      }

      // 3b) Relatório de integridade (best-effort).
      setProgress({ current: chunks, total: chunks, phase: "Atualizando indicadores" });
      let reportFailed = false;
      try {
        const { data: reportData, error: reportError } = await (supabase as any).rpc("get_import_integrity_report");
        if (reportError) throw reportError;
        const report = (reportData ?? INITIAL_REPORT) as IntegrityReport;
        setIntegrityReport(report);
      } catch (e: any) {
        reportFailed = true;
        console.warn("Relatório de integridade falhou (timeout em bases grandes):", e?.message);
      }
      await refreshSalesCaches(queryClient);

      toast({
        title: "Importação concluída",
        description: `${formatInteger(inserted)} inseridos, ${formatInteger(updated)} atualizados, ${formatInteger(unchanged)} preservados e ${formatInteger(deactivated)} substituídos.`,
      });

      if (reportFailed) {
        toast({
          title: "Relatório de integridade indisponível",
          description: "A importação foi concluída com sucesso, mas o relatório de integridade demorou demais. Use a aba 'Integridade da base' para gerar manualmente.",
        });
      }

      if (errors.length) {
        toast({ title: "Alguns blocos retornaram erro", description: errors.slice(0, 3).join(" | "), variant: "destructive" });
      }

      // Detect unknown vendors in imported rows
      try {
        const known = new Set((vendorsList ?? []).map((v) => v.nome.trim().toLowerCase()));
        const found = new Set<string>();
        for (const r of batch?.rows ?? []) {
          const short = shortVendedorName(String(r.vendedor ?? "")).trim();
          if (!short) continue;
          if (!known.has(short.toLowerCase())) found.add(short);
        }
        if (found.size > 0) setUnknownVendors([...found]);
      } catch (e) {
        console.warn("Detecção de vendedores falhou:", e);
      }
    } catch (error: any) {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setConfirmOpen(false);
      setProgress(null);
    }
  };

  return (
    <AppLayout>
      <UnknownVendorPrompt unknownNames={unknownVendors} onClose={() => setUnknownVendors([])} />
      <TooltipProvider>
        <div className="space-y-6">
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-bold md:text-3xl">Importar Planilha</h1>
            <p className="text-sm text-muted-foreground">
              Consolide múltiplos arquivos, valide a base e importe com transparência antes de atualizar o CRM Comercial.
            </p>
          </div>

          {warningMessage && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Alerta automático de integridade</AlertTitle>
              <AlertDescription>{warningMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-base">
                  <Upload className="h-5 w-5 text-primary" /> Upload múltiplo de planilhas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50">
                  <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="mb-3 text-sm text-muted-foreground">Selecione vários arquivos .xlsx/.xls/.csv de uma vez.</p>
                  <Input type="file" accept=".xlsx,.xls,.csv,.xlsm" multiple onChange={handleFileChange} className="mx-auto max-w-sm" />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <Label>Tipo de importação</Label>
                    <div className="rounded-md border border-border p-3">
                      <div className="space-y-1">
                        <span className="text-sm font-medium">Incremental com espelho de relatório completo</span>
                        <p className="text-xs text-muted-foreground">Relatórios completos sincronizam o período importado e preservam itens substituídos fora do faturamento ativo.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Resumo do lote</Label>
                      {loadingFiles && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Arquivos</div>
                        <div className="font-semibold">{formatInteger(files.length)}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Linhas da planilha</div>
                        <div className="font-semibold">{formatInteger(batch?.rows.length ?? 0)}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Linhas ignoradas</div>
                        <div className="font-semibold">{formatInteger(batch?.ignoredRowCount ?? 0)}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Total da planilha</div>
                        <div className="font-semibold">{formatCurrency(batch?.sheetTotal ?? 0)}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Total do rodapé</div>
                        <div className="font-semibold">{batch?.footerTotal != null ? formatCurrency(batch.footerTotal) : "—"}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Período coberto</div>
                        <div className="font-semibold text-xs">{batch ? `${formatDate(batch.rangeStart)} → ${formatDate(batch.rangeEnd)}` : "—"}</div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <div className="text-xs text-muted-foreground">Tipo de relatório</div>
                        <div className="font-semibold text-xs">{batch?.isCompleteReport ? "Completo (sincroniza)" : "Parcial (incremental)"}</div>
                      </div>
                    </div>
                    {!!batch?.duplicateCodeCounts?.length && (
                      <details className="rounded-md bg-muted/30 p-3 text-xs">
                        <summary className="cursor-pointer font-medium">Códigos de venda duplicados ({batch.duplicateCodeCounts.length})</summary>
                        <div className="mt-2 max-h-28 overflow-auto space-y-1">
                          {batch.duplicateCodeCounts.map((item) => (
                            <div key={item.codigoVenda} className="flex justify-between gap-3">
                              <span className="font-mono">#{item.codigoVenda}</span>
                              <span className="text-muted-foreground">{formatInteger(item.aparicoes)} aparições</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>

                {!!batch?.fileSummaries.length && (
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Arquivo</TableHead>
                          <TableHead>Tamanho</TableHead>
                          <TableHead>Linhas</TableHead>
                          <TableHead>Intervalo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batch.fileSummaries.map((item) => (
                          <TableRow key={item.name}>
                            <TableCell className="font-medium break-all">{item.name}</TableCell>
                            <TableCell>{formatFileSize(item.size)}</TableCell>
                            <TableCell>{formatInteger(item.rows)}</TableCell>
                            <TableCell>{`${formatDate(item.rangeStart)} → ${formatDate(item.rangeEnd)}`}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleAnalyze} disabled={!batch?.rows.length || analyzing || importing}>
                    {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Analisar diferenças
                  </Button>
                  <Button onClick={() => setConfirmOpen(true)} disabled={!summary || importing || analyzing || !batch?.rows.length}>
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Confirmar importação
                  </Button>
                </div>

                {progress && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{progress.phase}</span>
                      <span className="text-muted-foreground">
                        {progress.total > 0
                          ? `${progress.current}/${progress.total} blocos (${Math.round((progress.current / progress.total) * 100)}%)`
                          : "Processando..."}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "10%" }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-base">
                  <History className="h-5 w-5 text-primary" /> Última importação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Data</div>
                  <div className="font-semibold">{formatDateTime(lastImport?.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Arquivos</div>
                  <div className="space-y-1">
                    {lastImport?.file_names?.length ? lastImport.file_names.map((name) => <div key={name} className="break-all">{name}</div>) : <div>—</div>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Inseridos</div>
                    <div className="font-semibold">{formatInteger(lastImport?.inserted_count ?? 0)}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Atualizados</div>
                    <div className="font-semibold">{formatInteger(lastImport?.updated_count ?? 0)}</div>
                  </div>
                </div>
                {lastImport?.warning_message && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{lastImport.warning_message}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="analise" className="space-y-4">
            <TabsList>
              <TabsTrigger value="analise">Análise da importação</TabsTrigger>
              <TabsTrigger value="integridade">Integridade da base</TabsTrigger>
              <TabsTrigger value="auditoria">Auditoria planilha x CRM</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="debug">Debug por período</TabsTrigger>
            </TabsList>

            <TabsContent value="analise">
              <Card className="shadow-card overflow-hidden">
                <CardHeader>
                  <CardTitle className="font-heading text-base">Pré-visualização consolidada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summary && (
                    <div className="grid gap-3 md:grid-cols-5">
                      <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Linhas da planilha</div><div className="text-xl font-semibold">{formatInteger(summary.total)}</div></div>
                      <div className="rounded-lg bg-success/10 p-3"><div className="text-xs text-success">Novas vendas</div><div className="text-xl font-semibold text-success">{formatInteger(summary.newCount)}</div></div>
                      <div className="rounded-lg bg-warning/10 p-3"><div className="text-xs text-warning">Substituídos</div><div className="text-xl font-semibold text-warning">{formatInteger(summary.staleCount ?? 0)}</div></div>
                      <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Total da planilha</div><div className="text-xl font-semibold">{formatCurrency(batch?.sheetTotal ?? 0)}</div></div>
                      <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Regra</div><div className="text-sm font-semibold">{batch?.isCompleteReport ? "Sincronização" : "Incremental"}</div></div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <Table className="min-w-[1050px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batch?.previewRows?.map((row, index) => (
                          <TableRow key={`${row.codigo_venda}-${index}`}>
                            <TableCell>{formatDate(row.data)}</TableCell>
                            <TableCell className="max-w-[240px] break-words font-medium">{row.cliente}</TableCell>
                            <TableCell className="max-w-[320px] break-words">{row.descricao}</TableCell>
                            <TableCell>{row.vendedor}</TableCell>
                            <TableCell className="text-right">{formatInteger(row.quantidade)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.preco_total)}</TableCell>
                          </TableRow>
                        ))}
                        {!batch?.previewRows?.length && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">Envie arquivos para gerar a prévia.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integridade">
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 font-heading text-base"><ShieldCheck className="h-5 w-5 text-primary" /> Verificar integridade da base</CardTitle>
                  <Button variant="outline" onClick={refreshIntegrity} disabled={checkingIntegrity}>{checkingIntegrity ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}Atualizar diagnóstico</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Data mínima</div><div className="font-semibold">{formatDate(integrityReport.minDate)}</div></div>
                    <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Data máxima</div><div className="font-semibold">{formatDate(integrityReport.maxDate)}</div></div>
                    <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Registros</div><div className="font-semibold">{formatInteger(integrityReport.totalRecords)}</div></div>
                    <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Clientes únicos</div><div className="font-semibold">{formatInteger(integrityReport.uniqueClients)}</div></div>
                    <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Produtos únicos</div><div className="font-semibold">{formatInteger(integrityReport.uniqueProducts)}</div></div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-2 text-sm font-medium">Meses sem dados</div>
                      <div className="space-y-2 text-sm">
                        {integrityReport.missingMonths.length ? integrityReport.missingMonths.map((item) => (
                          <div key={item.month} className="flex items-center justify-between rounded-md bg-destructive/5 px-3 py-2">
                            <span>{formatMonthLabel(item.month)}</span>
                            <span className="font-medium">{formatInteger(item.recordCount)}</span>
                          </div>
                        )) : <div className="text-muted-foreground">Nenhum mês vazio dentro do intervalo histórico.</div>}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-2 text-sm font-medium">Possíveis conflitos de chave</div>
                      <div className="space-y-2 text-sm">
                        {integrityReport.duplicateKeys.length ? integrityReport.duplicateKeys.slice(0, 6).map((item) => (
                          <Tooltip key={`${item.data}-${item.cliente}-${item.produto}`}>
                            <TooltipTrigger asChild>
                              <div className="cursor-help rounded-md bg-warning/10 px-3 py-2">
                                <div className="font-medium break-words">{item.cliente}</div>
                                <div className="text-xs text-muted-foreground">{item.duplicateCount} registros | {item.data}</div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <div className="space-y-1 text-xs">
                                <div><strong>Produto:</strong> {item.produto}</div>
                                <div><strong>Vendedor:</strong> {item.vendedor}</div>
                                <div><strong>Valor total:</strong> {formatCurrency(item.totalValue)}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )) : <div className="text-muted-foreground">Nenhum conflito relevante encontrado.</div>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="auditoria">
              <SalesAuditTab batch={batch} />
            </TabsContent>

            <TabsContent value="historico">
              <Card className="shadow-card overflow-hidden">
                <CardHeader>
                  <CardTitle className="font-heading text-base">Histórico de importações</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[980px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Arquivos</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-right">Linhas</TableHead>
                          <TableHead className="text-right">Inseridos</TableHead>
                          <TableHead className="text-right">Atualizados</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.length ? history.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{formatDateTime(item.created_at)}</TableCell>
                            <TableCell>Incremental</TableCell>
                            <TableCell className="max-w-[320px] break-words">{item.file_names.join(", ")}</TableCell>
                            <TableCell>{`${formatDate(item.range_start)} → ${formatDate(item.range_end)}`}</TableCell>
                            <TableCell className="text-right">{formatInteger(item.total_rows)}</TableCell>
                            <TableCell className="text-right">{formatInteger(item.inserted_count)}</TableCell>
                            <TableCell className="text-right">{formatInteger(item.updated_count)}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">Ainda não há histórico registrado.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="debug">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="font-heading text-base">Visualizar registros por período</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="space-y-2">
                      <Label htmlFor="debug-month">Mês de referência</Label>
                      <Input id="debug-month" type="month" value={debugMonth} onChange={(event) => setDebugMonth(event.target.value)} className="w-[220px]" />
                    </div>
                    <Button variant="outline" onClick={handleDebugMonth} disabled={checkingDebug}>{checkingDebug ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Verificar período</Button>
                  </div>

                  {debugResult && (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Registros encontrados</div><div className="text-xl font-semibold">{formatInteger(debugResult.totalRecords)}</div></div>
                        <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Faturamento do período</div><div className="text-xl font-semibold">{formatCurrency(debugResult.faturamentoTotal)}</div></div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table className="min-w-[980px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Produto</TableHead>
                              <TableHead>Vendedor</TableHead>
                              <TableHead className="text-right">Qtd</TableHead>
                              <TableHead className="text-right">Faturamento</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {debugResult.sampleRows.map((row, index) => (
                              <TableRow key={`${row.codigo_venda}-${index}`}>
                                <TableCell>{formatDate(row.data)}</TableCell>
                                <TableCell className="max-w-[220px] break-words">{row.cliente}</TableCell>
                                <TableCell className="max-w-[300px] break-words">{row.descricao}</TableCell>
                                <TableCell>{row.vendedor}</TableCell>
                                <TableCell className="text-right">{formatInteger(row.quantidade)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(row.preco_total)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="max-w-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Confirmar importação incremental
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                {summary && (
                  <>
                    <p>Arquivos: <strong>{files.length}</strong> | Linhas da planilha: <strong>{formatInteger(batch?.rows.length ?? 0)}</strong></p>
                    <p>Período: <strong>{formatDate(summary.rangeStart)}</strong> até <strong>{formatDate(summary.rangeEnd)}</strong></p>
                    <p>Prévia: <strong>{formatInteger(summary.newCount)}</strong> novas, <strong>{formatInteger(summary.updateCount)}</strong> atualizações e <strong>{formatInteger(summary.unchangedCount)}</strong> já existentes preservadas.</p>
                    <p>Nenhum registro histórico será apagado.</p>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={runImport}>Continuar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </AppLayout>
  );
}
