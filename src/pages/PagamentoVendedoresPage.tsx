import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Check, X, Trash2, Plus, Upload, FileSpreadsheet, FileText, DollarSign, ListChecks, Eye, Lock, LockOpen, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BONIFICACAO_VALUE_COLUMN, createCommissionBatch, parseCommissionFile, WorkbookReadError, type FileReadDiagnostics } from "@/lib/commissionImport";
import { commissionRowsToBonificacaoRows, useBonificacaoCategorias } from "@/hooks/useBonificacoes";
import { calcularAcerto, bonifCategoria, type ClienteDesconto, type AjusteManual } from "@/lib/commissionCalc";
import { exportAcertoExcelResumo, exportAcertoExcelCompleto, exportAcertoPDFFromNode, type MetaLine } from "@/lib/commissionExport";
import { preopenPdfTab } from "@/lib/pdfDownload";
import { AcertoResumoDocument, type OutroCredito } from "@/components/pagamento/AcertoResumoDocument";
import { AcertoCompletoDocument } from "@/components/pagamento/AcertoCompletoDocument";
import { ClienteSmartSearch } from "@/components/pagamento/ClienteSmartSearch";
import { CommissionPersistenceError, describeSupabaseError, useCommissionImport, getCurrentYearMonth } from "@/hooks/useCommissionImport";
import { validateCommissionRows, describeIssues, type CommissionRowIssue } from "@/lib/commissionValidation";
import { useMetaConfig, useVendorMetas, computeVendedorMetas, TEAM_VENDEDORES } from "@/hooks/useMetasData";
import { useVendorScope } from "@/hooks/useVendorScope";
import { useSalesData } from "@/hooks/useSalesData";
import { commissionRowsToSalesPayload } from "@/lib/commissionToSalesRow";
import { getFaturamentoBruto } from "@/lib/faturamentoMensal";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { usePagamentoFechamento, usePagamentoFechamentosMes, useSavePagamentoFechamento } from "@/hooks/usePagamentoFechamento";
import { calcularComissaoEquipe, isJulianoVendedor, type ComissaoEquipeResult } from "@/lib/comissaoEquipe";

interface SheetSummary {
  aba: string;
  tipo: "vendas" | "bonificacoes" | "desconhecida";
  lidas: number;
  gravadas: number;
  ignoradas: number;
  duplicadas: number;
  erros: number;
  totalLinhasWorksheet: number;
  primeiraLinhaNaoVazia: number | null;
  linhaCabecalho: number | null;
  cabecalhos: string[];
  motivoClassificacao: string;
  parserError?: string;
}

interface ImportReport {
  arquivo: string;
  mes: string;
  lidas: number;
  gravadas: number;
  ignoradas: number;
  comErro: number;
  duplicadas: number;
  issues: CommissionRowIssue[];
  abas?: SheetSummary[];
  bonificacoesGravadas?: number;
  sheetNames?: string[];
  fileDiagnostics?: FileReadDiagnostics;
  erro?: string;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PagamentoVendedoresPage() {
  const vendorScope = useVendorScope();
  const [yearMonth, setYearMonth] = useState<string>(getCurrentYearMonth());
  const { batch, setBatch, clear, loading: batchLoading } = useCommissionImport(yearMonth);
  const [vendedor, setVendedor] = useState<string>("");
  const [pctPadrao, setPctPadrao] = useState<number>(10);
  const [tiposFat, setTiposFat] = useState<string[]>([]);
  const [tiposCom, setTiposCom] = useState<string[]>([]);
  /** Categorias de bonificação elegíveis ao desconto (null = ainda não configurado). */
  const [tiposDesconto, setTiposDesconto] = useState<string[] | null>(null);
  const [descontos, setDescontos] = useState<ClienteDesconto[]>([]);
  const [ajustes, setAjustes] = useState<AjusteManual[]>([]);
  const [participaPremiacao, setParticipaPremiacao] = useState<boolean>(true);
  const [metasAcumulativas, setMetasAcumulativas] = useState<boolean>(false);
  const [ajudaCusto, setAjudaCusto] = useState<number>(0);
  const [outrosCreditos, setOutrosCreditos] = useState<OutroCredito[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"resumo" | "completo">("resumo");
  const previewDocRef = useRef<HTMLDivElement>(null);
  const completoDocRef = useRef<HTMLDivElement>(null);

  // Persistência do fechamento por (competência + vendedor)
  const { data: fechamento, isLoading: fechamentoLoading } = usePagamentoFechamento(yearMonth, vendedor);
  const saveFechamento = useSavePagamentoFechamento();
  const [editing, setEditing] = useState<boolean>(false);
  const isClosed = fechamento?.status === "closed";
  const isLocked = isClosed && !editing;

  const prefKey = `pagto-prefs-v3-${vendedor}-${yearMonth}`;

  // Hidrata state a partir do fechamento salvo (DB) — fonte da verdade.
  // Se não houver fechamento no DB, cai no rascunho local (localStorage).
  useEffect(() => {
    if (!vendedor) return;
    const isJuliano = vendedor.toLowerCase().includes("juliano");

    if (fechamento?.config) {
      const p = fechamento.config;
      setPctPadrao(p.pctPadrao ?? 10);
      setTiposFat(p.tiposFat ?? []);
      setTiposCom(p.tiposCom ?? []);
      setTiposDesconto(Array.isArray(p.tiposDesconto) ? p.tiposDesconto : null);
      setDescontos(p.descontos ?? []);
      setAjustes(p.ajustes ?? []);
      setParticipaPremiacao(p.participaPremiacao ?? true);
      setMetasAcumulativas(p.metasAcumulativas ?? isJuliano);
      setAjudaCusto(p.ajudaCusto ?? 0);
      setOutrosCreditos(p.outrosCreditos ?? []);
      setEditing(fechamento.status === "open");
      return;
    }

    if (fechamentoLoading) return;

    // Sem registro no DB — usa rascunho local se existir
    try {
      const raw = localStorage.getItem(prefKey);
      if (raw) {
        const p = JSON.parse(raw);
        setPctPadrao(p.pctPadrao ?? 10);
        setTiposFat(p.tiposFat ?? []);
        setTiposCom(p.tiposCom ?? []);
        setTiposDesconto(Array.isArray(p.tiposDesconto) ? p.tiposDesconto : null);
        setDescontos(p.descontos ?? []);
        setAjustes(p.ajustes ?? []);
        setParticipaPremiacao(p.participaPremiacao ?? true);
        setMetasAcumulativas(p.metasAcumulativas ?? isJuliano);
        setAjudaCusto(p.ajudaCusto ?? 0);
        setOutrosCreditos(p.outrosCreditos ?? []);
      } else {
        setPctPadrao(10); setTiposFat([]); setTiposCom([]); setTiposDesconto(null); setDescontos([]); setAjustes([]);
        setParticipaPremiacao(true);
        setMetasAcumulativas(isJuliano);
        setAjudaCusto(0);
        setOutrosCreditos([]);
      }
    } catch { /* ignore */ }
    setEditing(true);
  }, [prefKey, vendedor, fechamento, fechamentoLoading]);

  const savePrefs = (patch: Partial<{ pctPadrao: number; tiposFat: string[]; tiposCom: string[]; tiposDesconto: string[]; descontos: ClienteDesconto[]; ajustes: AjusteManual[]; participaPremiacao: boolean; metasAcumulativas: boolean; ajudaCusto: number; outrosCreditos: OutroCredito[] }>) => {
    if (!vendedor) return;
    const cur = { pctPadrao, tiposFat, tiposCom, tiposDesconto, descontos, ajustes, participaPremiacao, metasAcumulativas, ajudaCusto, outrosCreditos, ...patch };
    localStorage.setItem(prefKey, JSON.stringify(cur));
  };

  const buildConfig = () => ({
    pctPadrao, tiposFat, tiposCom, tiposDesconto: tiposDesconto ?? [], descontos, ajustes,
    participaPremiacao, metasAcumulativas, ajudaCusto, outrosCreditos,
  });

  const handleSalvarFechamento = async () => {
    if (!vendedor) return;
    try {
      await saveFechamento.mutateAsync({ yearMonth, vendedor, config: buildConfig(), status: "closed" });
      setEditing(false);
      toast.success(`Fechamento de ${vendedor} (${yearMonth}) salvo.`);
    } catch (e) {
      toast.error("Erro ao salvar fechamento: " + (e as Error).message);
    }
  };

  const handleSalvarAlteracoes = async () => {
    if (!vendedor) return;
    try {
      await saveFechamento.mutateAsync({ yearMonth, vendedor, config: buildConfig(), status: "closed" });
      setEditing(false);
      toast.success("Alterações salvas.");
    } catch (e) {
      toast.error("Erro ao salvar alterações: " + (e as Error).message);
    }
  };

  const handleEditarFechamento = () => {
    setEditing(true);
    toast.info("Edição habilitada. Clique em 'Salvar Alterações' quando terminar.");
  };



  const queryClient = useQueryClient();

  const runImport = async (f: File) => {
    setImporting(true);
    setVendedor("");
    setImportReport(null);
    try {
      console.info("[Comissão][leitura] Iniciando arquivo", { yearMonth, fileName: f.name, size: f.size });
      const res = await parseCommissionFile(f);
      console.info("[Comissão][leitura] Arquivo processado", {
        yearMonth,
        sheetNames: res.sheetNames,
        rowsRead: res.rows.length,
        ignored: res.ignored,
        sheets: res.sheets.map((s) => ({
          nome: s.sheet,
          linhas: s.totalLinhasWorksheet,
          primeiraLinhaNaoVazia: s.primeiraLinhaNaoVazia,
          primeiraLinha: s.primeiraLinhaConteudo,
          linhaCabecalho: s.linhaCabecalho,
          cabecalhos: s.cabecalhos,
          tipo: s.kind,
          regra: s.motivoClassificacao,
        })),
      });
      const abasBonif = res.sheets.filter((s) => s.kind === "bonificacoes");
      const abasVendas = res.sheets.filter((s) => s.kind === "vendas");
      // Validação prévia — nada é gravado se houver linha inválida.
      const validacao = validateCommissionRows(res.rows);
      console.info("[Comissão][validação] Resultado", { yearMonth, ...validacao });

      // Resumo por aba (vendas e bonificações são reportadas separadamente).
      const dupPorAba = new Map<string, number>();
      const vistos = new Set<string>();
      for (const r of res.rows) {
        const chave = [r.sheet, r.codigoVenda ?? "", r.data ?? "", r.cliente, r.produto ?? "", r.quantidade ?? "", r.valor].join("|");
        if (vistos.has(chave)) dupPorAba.set(r.sheet ?? "—", (dupPorAba.get(r.sheet ?? "—") ?? 0) + 1);
        else vistos.add(chave);
      }
      const errosPorAba = new Map<string, number>();
      for (const i of validacao.issues) errosPorAba.set(i.aba, (errosPorAba.get(i.aba) ?? 0) + 1);
      const montarAbas = (gravou: boolean): SheetSummary[] =>
        res.sheets
          .filter((s) => s.linhas > 0)
          .map((s) => ({
            aba: s.sheet,
            tipo: s.kind,
            lidas: s.lidas,
            gravadas: gravou ? s.lidas : 0,
            ignoradas: s.ignoradas,
            duplicadas: dupPorAba.get(s.sheet) ?? 0,
            erros: errosPorAba.get(s.sheet) ?? 0,
            totalLinhasWorksheet: s.totalLinhasWorksheet,
            primeiraLinhaNaoVazia: s.primeiraLinhaNaoVazia,
            linhaCabecalho: s.linhaCabecalho,
            cabecalhos: s.cabecalhos,
            motivoClassificacao: s.motivoClassificacao,
            parserError: s.parserError,
          }));

      if (abasVendas.length === 0 || abasBonif.length === 0) {
        const faltando = abasVendas.length === 0 ? "Vendas/Faturamento" : "Bonificações";
        const diagnostico = res.sheets.map((s) =>
          `Aba “${s.sheet}”: ${s.totalLinhasWorksheet} linhas; primeira linha não vazia ${s.primeiraLinhaNaoVazia ?? "não encontrada"}; cabeçalho ${s.linhaCabecalho ?? "não identificado"}; colunas [${s.cabecalhos.join(", ") || "nenhuma"}]; regra: ${s.motivoClassificacao}`,
        ).join("\n");
        const motivo = `${faltando} não foi processada. SheetNames encontrados: [${res.sheetNames.join(", ")}].\n${diagnostico}`;
        setImportReport({
          arquivo: f.name,
          mes: yearMonth,
          lidas: res.rows.length,
          gravadas: 0,
          ignoradas: res.ignored,
          comErro: 1,
          duplicadas: validacao.duplicadas,
          issues: [],
          abas: montarAbas(false),
          sheetNames: res.sheetNames,
          fileDiagnostics: res.fileDiagnostics,
          erro: motivo,
        });
        toast.error(`Importação bloqueada: ${faltando} não processada. Consulte o diagnóstico das abas. O lote anterior foi preservado.`);
        return;
      }

      if (res.rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada nas abas obrigatórias. Consulte o diagnóstico técnico.");
        return;
      }

      if (!validacao.ok) {
        setImportReport({
          arquivo: f.name,
          mes: yearMonth,
          lidas: validacao.total,
          gravadas: 0,
          ignoradas: res.ignored,
          comErro: validacao.comErro,
          duplicadas: validacao.duplicadas,
          issues: validacao.issues,
          abas: montarAbas(false),
          sheetNames: res.sheetNames,
          fileDiagnostics: res.fileDiagnostics,
          erro: `${validacao.comErro} linha(s) com problema. ${describeIssues(validacao.issues)}`,
        });
        toast.error(
          `Importação bloqueada: ${validacao.comErro} linha(s) inválida(s). ${describeIssues(validacao.issues, 1)} O lote anterior foi preservado.`,
        );
        return;
      }

      const b = createCommissionBatch(yearMonth, f.name, res.rows);
      const bonifRows = abasBonif.flatMap((aba) => aba.rows);
      const bonificacaoPayload = commissionRowsToBonificacaoRows(bonifRows, f.name, yearMonth);
      // Persistência no banco (vinculada à competência). Se falhar, o mês
      // mantém a importação anterior íntegra — nada fica pela metade.
      try {
        const persistidas = await setBatch(b, bonificacaoPayload);
        queryClient.invalidateQueries({ queryKey: ["bonificacao_rows"] });
        queryClient.invalidateQueries({ queryKey: ["bonificacao_categorias"] });
        setImportReport({
          arquivo: f.name,
          mes: yearMonth,
          lidas: res.rows.length,
          gravadas: res.rows.length,
          ignoradas: res.ignored,
          comErro: 0,
          duplicadas: validacao.duplicadas,
          issues: [],
          abas: montarAbas(false).map((aba) => ({
            ...aba,
            gravadas: aba.tipo === "bonificacoes" ? persistidas : aba.lidas,
          })),
          sheetNames: res.sheetNames,
          fileDiagnostics: res.fileDiagnostics,
          bonificacoesGravadas: persistidas,
        });
        toast.success(
          `Importação concluída · vendas: ${abasVendas.reduce((sum, s) => sum + s.lidas, 0)} · bonificações: ${persistidas} · mês ${yearMonth}`,
        );
      } catch (e) {
        const failure = e instanceof CommissionPersistenceError ? e : null;
        const motivo = failure ? failure.message : describeSupabaseError(e);
        const detail = failure
          ? `Etapa: ${failure.stage}. ${failure.readCount} registros processados, ${failure.writtenCount} gravados. Motivo: ${motivo}`
          : `Motivo: ${motivo}`;
        setImportReport({
          arquivo: f.name,
          mes: yearMonth,
          lidas: res.rows.length,
          gravadas: 0,
          ignoradas: res.ignored,
          comErro: 0,
          duplicadas: validacao.duplicadas,
          issues: [],
          abas: montarAbas(false),
          sheetNames: res.sheetNames,
          fileDiagnostics: res.fileDiagnostics,
          erro: motivo,
        });
        toast.error(
          `Erro na importação de ${yearMonth}. ${detail} O lote anterior foi preservado.`,
        );
        return;
      }
      // Validação: categorias distintas lidas na planilha x categorias que o seletor exibirá.
      try {
        const norm = (s: string) => s.replace(/\s+/g, " ").trim();
        const naPlanilha = new Set<string>();
        for (const r of res.rows) {
          if (r.tipo === "VENDA") continue;
          const c = norm(bonifCategoria(r));
          if (c) naPlanilha.add(c);
        }
        const noSeletor = new Set<string>();
        for (const r of b.rows) {
          if (r.tipo === "VENDA") continue;
          const c = norm(bonifCategoria(r));
          if (c) noSeletor.add(c);
        }
        const faltantes = [...naPlanilha].filter((c) => !noSeletor.has(c));
        console.info("[Comissão][categorias] Validação de categorias de bonificação", {
          yearMonth,
          encontradasNaImportacao: naPlanilha.size,
          disponiveisNoSeletor: noSeletor.size,
          categorias: [...naPlanilha].sort(),
        });
        if (faltantes.length > 0) {
          console.warn("[Comissão][categorias] Categorias faltantes no seletor:", faltantes);
        }
      } catch (e) {
        console.warn("[Comissão][categorias] Falha na validação de categorias", e);
      }


      // Etapa OBRIGATÓRIA: gravar as bonificações lidas no Controle de Bonificações.
      // A importação só é considerada concluída com vendas E bonificações processadas.
      // FONTE ÚNICA — enviar linhas de VENDA para `sales_raw_rows` via edge function
      // para que Ranking e Metas Comerciais reflitam a mesma planilha.
      const { payload, skipped, reasons } = commissionRowsToSalesPayload(res.rows, f.name);
      if (payload.length > 0) {
        const CHUNK = 500;
        let inserted = 0, updated = 0, unchanged = 0;
        const errors: string[] = [];
        for (let i = 0; i < payload.length; i += CHUNK) {
          const slice = payload.slice(i, i + CHUNK);
          const { data, error } = await supabase.functions.invoke("import-sales", {
            body: { rows: slice, mode: "chunk" },
          });
          if (error) { errors.push(error.message); continue; }
          const r = data as { inserted?: number; updated?: number; unchanged?: number };
          inserted += r.inserted ?? 0;
          updated += r.updated ?? 0;
          unchanged += r.unchanged ?? 0;
        }
        queryClient.invalidateQueries({ queryKey: ["sales-data"] });
        queryClient.invalidateQueries({ queryKey: ["vendor-metas"] });
        const skipMsg = skipped > 0 ? ` (${reasons.semCodigo} sem código, ${reasons.semData} sem data ignoradas)` : "";
        if (errors.length > 0) {
          toast.warning(`CRM sincronizado parcialmente: ${inserted} novas, ${updated} atualizadas${skipMsg}. ${errors.length} bloco(s) com erro.`);
        } else {
          toast.success(`CRM sincronizado: ${inserted} novas, ${updated} atualizadas, ${unchanged} preservadas${skipMsg}. Ranking e Metas atualizados.`);
        }
      } else if (skipped > 0) {
        toast.warning(`Nenhuma linha enviada ao CRM: ${reasons.semCodigo} sem código de venda, ${reasons.semData} sem data. Ranking/Metas não foram atualizados por esta planilha.`);
      }
    } catch (e) {
      const motivo = describeSupabaseError(e);
      const workbookFailure = e instanceof WorkbookReadError ? e : null;
      console.error("[Comissão][leitura] Falha ao processar planilha", { yearMonth, fileName: f.name, erro: motivo, bruto: e });
      setImportReport((prev) => prev ?? {
        arquivo: f.name, mes: yearMonth, lidas: 0, gravadas: 0, ignoradas: 0,
        comErro: 1, duplicadas: 0, issues: [], erro: motivo,
        sheetNames: workbookFailure?.diagnostics.sheetNames,
        fileDiagnostics: workbookFailure?.diagnostics,
      });
      toast.error(`Erro ao ler planilha. Etapa: leitura. Motivo: ${motivo}`);
    } finally { setImporting(false); }
  };

  const handleImport = (f: File) => {
    if (batch) {
      setPendingReplacement(f);
      return;
    }
    void runImport(f);
  };

  const vendedoresImportados = useMemo(() => {
    if (!batch) return [] as string[];
    return [...new Set(batch.rows.map((r) => r.vendedor))].sort();
  }, [batch]);

  const [y, m] = yearMonth.split("-").map(Number);
  const { data: sales = [] } = useSalesData();
  const { data: metaConfig } = useMetaConfig();
  const { data: vendorOverrides } = useVendorMetas(yearMonth);

  const metasCalculadas = useMemo(() => {
    if (!metaConfig) return [];
    return computeVendedorMetas(sales, metaConfig, y, (m ?? 1) - 1, vendorOverrides ?? undefined, vendorScope.opcoesVendedor([...TEAM_VENDEDORES, ...vendedoresImportados]));
  }, [sales, metaConfig, y, m, vendorOverrides, vendedoresImportados]);

  const metaVendedor = metasCalculadas.find((v) => v.vendedor === vendedor);

  // ---- Bonificações consideradas no desconto (seleção múltipla dinâmica) ----
  const { data: categoriasBase = [] } = useBonificacaoCategorias();

  /**
   * Todas as categorias de bonificação REALMENTE existentes na competência importada
   * (coluna "Categoria Venda"), independente de vendedor, mais as já existentes na base.
   * Nada é hardcoded: qualquer categoria nova aparece automaticamente.
   */
  const categoriasBonificacao = useMemo(() => {
    const set = new Set<string>(categoriasBase.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean));
    if (batch) {
      for (const r of batch.rows) {
        if (r.tipo === "VENDA") continue;
        const c = bonifCategoria(r).replace(/\s+/g, " ").trim();
        if (c) set.add(c);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [categoriasBase, batch]);

  // Padrão inicial: Preço Final + Introdução (quando ainda não configurado).
  useEffect(() => {
    if (tiposDesconto !== null || categoriasBonificacao.length === 0) return;
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    setTiposDesconto(
      categoriasBonificacao.filter((c) => {
        const n = norm(c);
        return (n.includes("preco") && n.includes("final")) || n.includes("introducao");
      }),
    );
  }, [tiposDesconto, categoriasBonificacao]);

  const selecionadas = tiposDesconto ?? [];
  /** Só categorias marcadas no seletor entram no desconto de faturamento/comissão. */
  const tiposFatEfetivos = useMemo(() => tiposFat.filter((c) => selecionadas.includes(c)), [tiposFat, selecionadas]);
  const tiposComEfetivos = useMemo(() => tiposCom.filter((c) => selecionadas.includes(c)), [tiposCom, selecionadas]);

  const setSelecao = (next: string[]) => {
    setTiposDesconto(next);
    // Novas categorias marcadas caem, por padrão, no desconto do faturamento.
    const novas = next.filter((c) => !tiposFat.includes(c) && !tiposCom.includes(c));
    if (novas.length > 0) {
      const nf = [...tiposFat, ...novas];
      setTiposFat(nf);
      savePrefs({ tiposDesconto: next, tiposFat: nf });
    } else {
      savePrefs({ tiposDesconto: next });
    }
  };

  const toggleSelecao = (cat: string) =>
    setSelecao(selecionadas.includes(cat) ? selecionadas.filter((c) => c !== cat) : [...selecionadas, cat]);

  // Metas — sincronizado com aba Metas Comerciais.
  // Meta Média e Combustível: SIM/NÃO — não somam na comissão líquida.
  // Meta 0,5% e Meta 1%: somam quando atingidas.
  // Primeiro passo: calcular acerto SEM premiações para obter Faturamento Líquido correto.
  const acertoBase = useMemo(() => {
    if (!batch || !vendedor) return null;
    return calcularAcerto({
      vendedor,
      rows: batch.rows,
      pctPadrao,
      tiposDescontoFaturamento: tiposFatEfetivos,
      tiposDescontoComissao: tiposComEfetivos,
      descontosClientes: descontos,
      ajustesManuais: ajustes,
      premiacaoComissao: 0,
    });
  }, [batch, vendedor, pctPadrao, tiposFatEfetivos, tiposComEfetivos, descontos, ajustes]);

  // Metas — REGRA OBRIGATÓRIA:
  // O "Realizado" utilizado para validar metas é SEMPRE o Faturamento Bruto do
  // acerto mensal (planilha importada no mês, filtrada pelo vendedor).
  // NÃO usar faturamento da aba Metas Comerciais, CRM, histórico ou cache.
  // Apenas os ALVOS (metaImpulso, metaPerformance, metaAceleracao, metaExcelencia)
  // são lidos da configuração de metas.
  // Meta Média e Combustível: SIM/NÃO — não somam na comissão líquida.
  // Meta 0,5% e Meta 1%: calculadas sobre o FATURAMENTO LÍQUIDO e somam quando atingidas.
  const premData = useMemo(() => {
    let premiacaoComissao = 0;
    const metas: MetaLine[] = [];
    if (participaPremiacao && metaVendedor && acertoBase) {
      // FONTE CANÔNICA: getFaturamentoBruto — mesmo número usado em Ranking/Metas/DRE.
      const realizado = getFaturamentoBruto(vendedor, yearMonth, sales);
      const baseLiquida = acertoBase.faturamentoLiquido;
      // Degraus HIERÁRQUICOS e CUMULATIVOS: atingir um nível superior implica ter
      // atingido todos os inferiores (Meta Média → Combustível → 0,5% → 1%).
      const hitUm = realizado >= metaVendedor.metaExcelencia && metaVendedor.metaExcelencia > 0;
      const hitMeio = hitUm || (realizado >= metaVendedor.metaAceleracao && metaVendedor.metaAceleracao > 0);
      const hitComb = hitMeio || (realizado >= metaVendedor.metaPerformance && metaVendedor.metaPerformance > 0);
      const hitMedia = hitComb || (realizado >= metaVendedor.metaImpulso && metaVendedor.metaImpulso > 0);


      // Regra fixa: valor SEMPRE calculado (mostrado riscado quando não bater).
      const premMeio = baseLiquida * 0.005;
      const premUm = baseLiquida * 0.01;

      // Cumulatividade entre 0,5% e 1%:
      // - Acumulativas SIM (ex.: Juliano): ambas somam quando atingidas.
      // - Acumulativas NÃO: se atingiu 1%, não paga 0,5%.
      const pagaMeio = hitMeio && (metasAcumulativas || !hitUm);
      const pagaUm = hitUm;
      if (pagaMeio) premiacaoComissao += premMeio;
      if (pagaUm) premiacaoComissao += premUm;
      if (hitComb) premiacaoComissao += 300;

      metas.push({ nome: "META MÉDIA", alvo: metaVendedor.metaImpulso, realizado, atingida: hitMedia, premiacao: 0, tipo: "sim_nao" });
      metas.push({ nome: "META COMBUSTÍVEL", alvo: metaVendedor.metaPerformance, realizado, atingida: hitComb, premiacao: 300, tipo: "combustivel" });
      metas.push({
        nome: hitMeio && !metasAcumulativas && hitUm ? "META 0,5% (substituída pela 1%)" : "META 0,5%",
        alvo: metaVendedor.metaAceleracao,
        realizado,
        atingida: pagaMeio,
        // valor SEMPRE calculado — a UI risca quando `atingida=false`.
        premiacao: premMeio,
        tipo: "valor",
      });
      metas.push({ nome: "META 1%", alvo: metaVendedor.metaExcelencia, realizado, atingida: pagaUm, premiacao: premUm, tipo: "valor" });
    }
    return { premiacaoComissao, metas };
  }, [metaVendedor, acertoBase, participaPremiacao, metasAcumulativas, vendedor, yearMonth, sales]);


  // ---- Comissão Equipe (1%) do Juliano — calculada dinamicamente ----
  // Base = soma do FATURAMENTO LÍQUIDO de Ednei + Henrique + João Paulo + Vinícius,
  // usando as categorias de bonificação descontadas do faturamento salvas para CADA um.
  const { data: fechamentosMes = [] } = usePagamentoFechamentosMes(yearMonth);

  const comissaoEquipe: ComissaoEquipeResult | null = useMemo(() => {
    if (!batch || !vendedor || !isJulianoVendedor(vendedor)) return null;
    const descontosFaturamentoPorVendedor: Record<string, string[] | undefined> = {};
    for (const f of fechamentosMes) {
      const cfg = f.config ?? ({} as any);
      const selecionadasV = Array.isArray(cfg.tiposDesconto) ? cfg.tiposDesconto : null;
      const fat = Array.isArray(cfg.tiposFat) ? cfg.tiposFat : [];
      descontosFaturamentoPorVendedor[f.vendedor] = selecionadasV
        ? fat.filter((c: string) => selecionadasV.includes(c))
        : fat;
    }
    const res = calcularComissaoEquipe({ rows: batch.rows, descontosFaturamentoPorVendedor });
    // Auditoria: composição exata usada no cálculo.
    console.info("[Comissão Equipe]", {
      competencia: yearMonth,
      membros: res.membros.map((m) => ({
        vendedor: m.vendedor,
        bruto: m.faturamentoBruto,
        bonificacoesDescontadas: m.bonificacoesDescontadas,
        liquido: m.faturamentoLiquido,
        categorias: m.categorias,
        encontradoNaPlanilha: m.encontrado,
      })),
      base: res.base,
      percentual: `${res.pct}%`,
      resultado: res.valor,
    });
    return res;
  }, [batch, vendedor, fechamentosMes, yearMonth]);

  /** Créditos manuais, excluindo lançamentos antigos de "Comissão Equipe" (agora automáticos). */
  const outrosCreditosVisiveis = useMemo(() => {
    if (!comissaoEquipe) return outrosCreditos;
    return outrosCreditos.filter(
      (c) => !/comiss\w*\s+equipe/i.test((c.descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
    );
  }, [outrosCreditos, comissaoEquipe]);

  // Remove definitivamente lançamentos manuais antigos de "Comissão Equipe" (valor agora é automático).
  useEffect(() => {
    if (!comissaoEquipe) return;
    if (outrosCreditosVisiveis.length === outrosCreditos.length) return;
    setOutrosCreditos(outrosCreditosVisiveis);
    savePrefs({ outrosCreditos: outrosCreditosVisiveis });
  }, [comissaoEquipe, outrosCreditos, outrosCreditosVisiveis]);


  const creditosExtras = useMemo(() => {
    const outros = outrosCreditosVisiveis.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    return (Number(ajudaCusto) || 0) + outros + (comissaoEquipe?.valor ?? 0);
  }, [ajudaCusto, outrosCreditosVisiveis, comissaoEquipe]);

  // Mesmos parâmetros passados aos documentos PDF Resumo/Completo.
  const excelOpts = {
    pctPadrao,
    metas: premData.metas,
    participaPremiacao,
    metasAcumulativas,
    ajudaCusto: Number(ajudaCusto) || 0,
    outrosCreditos: outrosCreditosVisiveis,
    comissaoEquipe,
    tiposDescontoFaturamento: tiposFatEfetivos,
    tiposDescontoComissao: tiposComEfetivos,
  };

  const acerto = useMemo(() => {
    if (!acertoBase) return null;
    return {
      ...acertoBase,
      premiacaoComissao: premData.premiacaoComissao,
      comissaoLiquida: acertoBase.comissaoLiquida + premData.premiacaoComissao + creditosExtras,
    };
  }, [acertoBase, premData, creditosExtras]);

  const edneiPrecoFinalValidation = useMemo(() => {
    if (!vendedor.toLowerCase().includes("ednei") || !acerto) return null;
    const item = acerto.bonificacoesResumoPorTipo.find((b) => {
      const cat = b.categoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return cat.includes("gr") && cat.includes("preco") && cat.includes("final");
    });
    if (!item) return null;
    return { total: item.total, ok: Math.abs(item.total - 6824.42) < 0.01 };
  }, [acerto, vendedor]);

  /**
   * FONTE ÚNICA das categorias de bonificação: DISTINCT de "Categoria Venda"
   * nas linhas de bonificação da COMPETÊNCIA atual e do VENDEDOR selecionado
   * (todos os vendedores quando nenhum estiver selecionado).
   * Traz também o total por categoria já filtrado pelo vendedor.
   * Usada nos 3 seletores e alinhada ao "Resumo por Tipo".
   */
  const bonusCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of batch?.rows ?? []) {
      if (r.tipo === "VENDA") continue;
      if (vendedor && r.vendedor !== vendedor) continue;
      const c = bonifCategoria(r).replace(/\s+/g, " ").trim();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + (r.custo ?? 0));
    }
    return map;
  }, [batch, vendedor]);

  const availableBonusCategories = useMemo(
    () => [...bonusCategoryTotals.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [bonusCategoryTotals],
  );

  const totalCategoria = (c: string) =>
    acerto?.bonificacoesResumoPorTipo.find((b) => b.categoria === c)?.total ?? bonusCategoryTotals.get(c) ?? 0;


  const toggleTipo = (list: string[], setList: (v: string[]) => void, key: "tiposFat" | "tiposCom", cat: string) => {
    const marcando = !list.includes(cat);
    const next = marcando ? [...list, cat] : list.filter((c) => c !== cat);
    setList(next);
    // Marcar em faturamento/comissão implica que a categoria participa do desconto.
    if (marcando && !selecionadas.includes(cat)) {
      const nextSel = [...selecionadas, cat];
      setTiposDesconto(nextSel);
      savePrefs({ [key]: next, tiposDesconto: nextSel } as any);
      return;
    }
    savePrefs({ [key]: next } as any);
  };


  const addDesconto = () => { const n = [...descontos, { cliente: "", pctAcordado: 5 }]; setDescontos(n); savePrefs({ descontos: n }); };
  const updateDesconto = (i: number, patch: Partial<ClienteDesconto>) => { const n = descontos.map((d, idx) => idx === i ? { ...d, ...patch } : d); setDescontos(n); savePrefs({ descontos: n }); };
  const removeDesconto = (i: number) => { const n = descontos.filter((_, idx) => idx !== i); setDescontos(n); savePrefs({ descontos: n }); };

  const addAjuste = () => { const n = [...ajustes, { id: crypto.randomUUID(), descricao: "", valor: 0, observacao: "" }]; setAjustes(n); savePrefs({ ajustes: n }); };
  const updateAjuste = (i: number, patch: Partial<AjusteManual>) => { const n = ajustes.map((a, idx) => idx === i ? { ...a, ...patch } : a); setAjustes(n); savePrefs({ ajustes: n }); };
  const removeAjuste = (i: number) => { const n = ajustes.filter((_, idx) => idx !== i); setAjustes(n); savePrefs({ ajustes: n }); };

  const totalComissaoLinha = acerto
    ? acerto.vendasRows.reduce((s, r) => s + r.valor * ((r.pctComissao ?? pctPadrao) / 100), 0)
    : 0;

  const waitForPreviewNode = async (mode: "resumo" | "completo") => {
    setPreviewMode(mode);
    setPreviewOpen(true);

    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const node = mode === "resumo" ? previewDocRef.current : completoDocRef.current;
      if (node) return node;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return null;
  };

  const downloadPreviewPdf = async (mode: "resumo" | "completo", quality: "padrao" | "alta" = "padrao") => {
    if (!acerto) return;
    // iOS: abrir a aba ainda dentro do gesto do toque, antes do processamento assíncrono.
    const preopened = preopenPdfTab();
    const node = await waitForPreviewNode(mode);
    if (!node) {
      preopened?.close();
      toast.error("Não foi possível capturar a visualização.");
      return;
    }

    const label = mode === "resumo" ? "Resumo" : "Completo";
    try {
      await exportAcertoPDFFromNode(node, `Acerto_${label}_${acerto.vendedor}_${yearMonth}.pdf`, preopened, quality);
      toast.success(`PDF ${label} exportado.`);
    } catch (e) {
      preopened?.close();
      toast.error("Erro ao exportar PDF: " + (e as Error).message);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <AlertDialog open={pendingReplacement !== null} onOpenChange={(open) => { if (!open) setPendingReplacement(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Já existem dados importados para esta competência.</AlertDialogTitle>
              <AlertDialogDescription>
                A importação atual continuará preservada até que a nova planilha seja totalmente gravada e validada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                const file = pendingReplacement;
                setPendingReplacement(null);
                if (file) void runImport(file);
              }}>
                Substituir importação existente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-primary" />
              Pagamento Vendedores
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Importe a planilha mensal única (Faturamento + Bonificações) e faça o fechamento do vendedor.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="w-44" />
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(event) => {
                const originalFile = event.target.files?.[0];
                if (originalFile) handleImport(originalFile);
                event.target.value = "";
              }} />
            <Button onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload className="h-4 w-4 mr-1" /> Importar planilha
            </Button>
            {batch && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await clear();
                    setVendedor("");
                    toast.success(`Importação de ${yearMonth} removida.`);
                  } catch (e) {
                    toast.error("Erro ao limpar importação: " + (e as Error).message);
                  }
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>

        {importReport && (
          <Card className={importReport.erro ? "border-destructive" : undefined}>
            <CardContent className="pt-4 pb-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{importReport.arquivo}</span>
                <Badge variant="outline">Mês {importReport.mes}</Badge>
                <Badge variant="secondary">{importReport.lidas} lidas</Badge>
                <Badge variant={importReport.gravadas > 0 ? "default" : "destructive"}>
                  {importReport.gravadas} gravadas
                </Badge>
                <Badge variant="outline">{importReport.ignoradas} ignoradas</Badge>
                <Badge variant={importReport.comErro > 0 ? "destructive" : "outline"}>
                  {importReport.comErro} com erro
                </Badge>
                <Badge variant="outline">{importReport.duplicadas} duplicadas</Badge>
                <Button variant="ghost" size="sm" onClick={() => setImportReport(null)}>Fechar</Button>
              </div>
              {importReport.sheetNames && (
                <div className="rounded-md border p-2 text-xs">
                  <span className="font-medium">SheetNames reais:</span> [{importReport.sheetNames.join(", ")}]
                  {importReport.fileDiagnostics && (
                    <div className="mt-1 break-words text-muted-foreground">
                      Tipo: {importReport.fileDiagnostics.fileType} · arquivo original: {importReport.fileDiagnostics.isBrowserFile ? "sim" : "não"} · tamanho: {importReport.fileDiagnostics.fileSize} bytes · ArrayBuffer: {importReport.fileDiagnostics.arrayBufferSize} bytes · primeiros bytes: {importReport.fileDiagnostics.firstBytes}
                    </div>
                  )}
                </div>
              )}
              {importReport.abas && importReport.abas.length > 0 && (
                <div className="space-y-2">
                  {importReport.abas.map((s) => (
                    <div key={s.aba} className="rounded-md border p-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={s.tipo === "bonificacoes" ? "secondary" : "default"}>
                          {s.tipo === "bonificacoes" ? "Bonificações" : s.tipo === "vendas" ? "Vendas/Faturamento" : "Não identificada"}
                        </Badge>
                        <span className="font-medium">Aba “{s.aba}”</span>
                        <span className="text-muted-foreground">{s.lidas} lidas</span>
                        <span className="text-muted-foreground">{s.gravadas} gravadas</span>
                        <span className="text-muted-foreground">{s.ignoradas} ignoradas</span>
                        <span className="text-muted-foreground">{s.duplicadas} duplicadas</span>
                        <span className={s.erros > 0 ? "text-destructive" : "text-muted-foreground"}>{s.erros} erros</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Cabeçalho na linha {s.linhaCabecalho ?? "não identificado"} · primeira linha não vazia {s.primeiraLinhaNaoVazia ?? "—"} · {s.totalLinhasWorksheet} linhas na worksheet
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground break-words">
                        Colunas: {s.cabecalhos.join(" · ") || "nenhuma coluna reconhecida"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Regra: {s.motivoClassificacao}</div>
                      {s.parserError && <div className="mt-1 text-xs text-destructive">Erro do parser: {s.parserError}</div>}
                    </div>
                  ))}
                  {importReport.bonificacoesGravadas != null && (
                    <p className="text-xs text-muted-foreground">
                      Controle de Bonificações: {importReport.bonificacoesGravadas} registro(s) gravado(s).
                    </p>
                  )}
                </div>
              )}
              {importReport.erro && (
                <p className="text-destructive text-xs whitespace-pre-wrap">{importReport.erro}</p>
              )}
              {importReport.issues.length > 0 && (
                <ul className="max-h-48 overflow-y-auto space-y-1 text-xs text-muted-foreground">
                  {importReport.issues.map((i, idx) => (
                    <li key={idx}>
                      <span className="font-medium text-foreground">Linha {i.linha}</span> (aba {i.aba}) · coluna “{i.coluna}”: {i.motivo}
                      <br />
                      <span className="opacity-70">{i.conteudo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {batch && (
          <Card>
            <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-3 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{batch.fileName}</span>
              <Badge variant="secondary">{batch.rows.length} linhas</Badge>
              <Badge variant="outline">{vendedoresImportados.length} vendedores</Badge>
              <Badge variant="outline">Salvo na nuvem</Badge>
            </CardContent>
          </Card>
        )}

        {!batch ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              {batchLoading || importing ? "Carregando importação da competência…" : "Importe a planilha mensal para começar."}
            </CardContent>
          </Card>
        ) : (

          <>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>Vendedor</Label>
                    <Select value={vendedor} onValueChange={setVendedor}>
                      <SelectTrigger><SelectValue placeholder="Escolha um vendedor" /></SelectTrigger>
                      <SelectContent>
                        {vendedoresImportados
                          .filter((v) => typeof v === "string" && v.trim() !== "")
                          .map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>% Comissão padrão</Label>
                    <Input type="number" step="0.1" value={pctPadrao} disabled={isLocked}
                      onChange={(e) => { const v = Number(e.target.value); setPctPadrao(v); savePrefs({ pctPadrao: v }); }} />
                  </div>
                  <div>
                    <Label>Participa do Programa de Premiações?</Label>
                    <Select
                      value={participaPremiacao ? "sim" : "nao"}
                      onValueChange={(v) => {
                        const val = v === "sim";
                        setParticipaPremiacao(val);
                        savePrefs({ participaPremiacao: val });
                      }}
                      disabled={!vendedor || isLocked}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">SIM — aplica metas e premiações</SelectItem>
                        <SelectItem value="nao">NÃO — apenas comissão normal</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Configurável por vendedor e por mês. Quando NÃO, oculta Meta Combustível, 0,5% e 1% da DRE.
                    </p>
                  </div>
                  <div>
                    <Label>Metas Acumulativas?</Label>
                    <Select
                      value={metasAcumulativas ? "sim" : "nao"}
                      onValueChange={(v) => {
                        const val = v === "sim";
                        setMetasAcumulativas(val);
                        savePrefs({ metasAcumulativas: val });
                      }}
                      disabled={!vendedor || !participaPremiacao || isLocked}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">SIM — soma todas as metas atingidas</SelectItem>
                        <SelectItem value="nao">NÃO — 1% substitui 0,5%</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Padrão SIM para Juliano; demais vendedores começam em NÃO.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>


            {vendedor && acerto && (
              <Card className={isClosed ? "border-success/40 bg-success/5" : "border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/10"}>
                <CardContent className="pt-4 pb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    {isClosed ? <Lock className="h-4 w-4 text-success" /> : <LockOpen className="h-4 w-4 text-amber-600" />}
                    <span className="font-medium">
                      {isClosed ? "Fechamento salvo" : "Fechamento em aberto"} — {vendedor} · {yearMonth}
                    </span>
                    {fechamento?.closed_at && (
                      <Badge variant="outline" className="text-[11px]">
                        salvo em {new Date(fechamento.closed_at).toLocaleString("pt-BR")}
                      </Badge>
                    )}
                    {isLocked && (
                      <span className="text-xs text-muted-foreground">
                        Campos bloqueados. Clique em "Editar Fechamento" para alterar.
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!isClosed && (
                      <Button size="sm" onClick={handleSalvarFechamento} disabled={saveFechamento.isPending}>
                        <Save className="h-4 w-4 mr-1" /> Salvar Fechamento do Mês
                      </Button>
                    )}
                    {isClosed && !editing && (
                      <Button size="sm" variant="outline" onClick={handleEditarFechamento}>
                        <LockOpen className="h-4 w-4 mr-1" /> Editar Fechamento
                      </Button>
                    )}
                    {isClosed && editing && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                        <Button size="sm" onClick={handleSalvarAlteracoes} disabled={saveFechamento.isPending}>
                          <Save className="h-4 w-4 mr-1" /> Salvar Alterações
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {vendedor && acerto && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* PARTE 1 — Detalhamento (bloqueado quando fechamento salvo) */}
                <fieldset disabled={isLocked} className="xl:col-span-2 space-y-6 border-0 p-0 m-0 min-w-0 disabled:opacity-90">

                  {/* Vendas */}
                  <Card>
                    <CardHeader><CardTitle className="text-base">Detalhamento de Vendas</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[420px] overflow-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Produto</TableHead>
                              <TableHead className="text-right">Qtd</TableHead>
                              <TableHead className="text-right">Preço</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead className="text-right">Com. %</TableHead>
                              <TableHead className="text-right">Valor Com.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {acerto.vendasRows.map((r) => {
                              const pct = r.pctComissao ?? pctPadrao;
                              return (
                                <TableRow key={r.id}>
                                  <TableCell className="text-xs">{r.data ?? "—"}</TableCell>
                                  <TableCell className="max-w-[180px] truncate">{r.cliente}</TableCell>
                                  <TableCell className="max-w-[180px] truncate text-xs">{r.produto ?? "—"}</TableCell>
                                  <TableCell className="text-right">{r.quantidade ?? "—"}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{r.precoUnit ? fmt(r.precoUnit) : "—"}</TableCell>
                                  <TableCell className="text-right font-mono">{fmt(r.valor)}</TableCell>
                                  <TableCell className="text-right">{pct}%</TableCell>
                                  <TableCell className="text-right font-mono">{fmt(r.valor * (pct / 100))}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="border-t px-4 py-3 flex justify-between text-sm bg-muted/40">
                        <span>Total faturado: <strong className="font-mono">{fmt(acerto.faturamentoBruto)}</strong></span>
                        <span>Comissão bruta (soma linhas): <strong className="font-mono">{fmt(totalComissaoLinha)}</strong></span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bonificações */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Bonificações</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Todas as bonificações do vendedor extraídas da planilha. Use os botões abaixo para escolher quais categorias descontar.
                      </p>
                    </CardHeader>
                    <CardContent className="p-0">
                      {acerto.bonificacoesRows.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">Sem bonificações para este vendedor.</p>
                      ) : (
                        <>
                          <div className="max-h-[300px] overflow-auto">
                            <Table>
                              <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                  <TableHead>Data</TableHead>
                                  <TableHead>Cliente</TableHead>
                                  <TableHead>Categoria</TableHead>
                                  <TableHead>Produto</TableHead>
                                  <TableHead className="text-right">Preço venda total</TableHead>
                                  <TableHead className="text-right">Valor calculado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {acerto.bonificacoesRows.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="text-xs">{r.data ?? "—"}</TableCell>
                                    <TableCell className="max-w-[160px] truncate">{r.cliente}</TableCell>
                                    <TableCell><Badge variant="outline">{bonifCategoria(r)}</Badge></TableCell>
                                    <TableCell className="max-w-[160px] truncate text-xs">{r.produto ?? "—"}</TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground line-through">{r.precoVendaTotal ? fmt(r.precoVendaTotal) : "—"}</TableCell>
                                    <TableCell className="text-right font-mono">{fmt(r.custo ?? 0)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Resumo por tipo */}
                          <div className="border-t bg-muted/40 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="text-xs font-semibold text-muted-foreground">RESUMO POR TIPO</div>
                              <Badge variant="secondary">Coluna usada: {BONIFICACAO_VALUE_COLUMN}</Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              {acerto.bonificacoesResumoPorTipo.map((b) => (
                                <div key={b.categoria} className="border-b border-border/50 py-1.5">
                                  <div className="flex justify-between gap-3">
                                    <span>
                                      {b.categoria}
                                      <span className="text-xs text-muted-foreground ml-2">({b.count})</span>
                                    </span>
                                    <span className="font-mono">{fmt(b.total)}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">Coluna usada: {b.colunaUsada}</div>
                                </div>
                              ))}
                            </div>
                            {edneiPrecoFinalValidation && (
                              <div className={`mt-3 rounded border px-3 py-2 text-xs ${edneiPrecoFinalValidation.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                                Validação Ednei + GR - Bonificação Preço Final: {fmt(edneiPrecoFinalValidation.total)} {edneiPrecoFinalValidation.ok ? "✓" : "— revisar, esperado R$ 6.824,42"}
                              </div>
                            )}
                          </div>

                          {/* Seletor principal — quais bonificações entram no desconto */}
                          <div className="border-t px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="sm" variant="secondary">
                                  <ListChecks className="h-4 w-4 mr-1" />
                                  Selecionar bonificações para desconto ({selecionadas.length})
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-96">
                                <div className="text-xs font-semibold mb-1">Bonificações consideradas no desconto</div>
                                <p className="text-[11px] text-muted-foreground mb-2">
                                  Somente as categorias marcadas entram no cálculo de desconto (faturamento e comissão).
                                </p>
                                <div className="flex gap-2 mb-2">
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelecao(availableBonusCategories)}>Selecionar todas</Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelecao([])}>Limpar seleção</Button>
                                </div>
                                <div className="space-y-1.5 max-h-72 overflow-auto">
                                  {availableBonusCategories.map((c) => {
                                    const total = totalCategoria(c);
                                    return (
                                      <label key={c} className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted rounded px-2 py-1">
                                        <span className="flex items-center gap-2 text-sm">
                                          <Checkbox checked={selecionadas.includes(c)} onCheckedChange={() => toggleSelecao(c)} />
                                          {c}
                                        </span>
                                        <span className="text-xs font-mono text-muted-foreground">{fmt(total)}</span>
                                      </label>
                                    );
                                  })}
                                  {availableBonusCategories.length === 0 && (
                                    <p className="text-xs text-muted-foreground">Sem categorias na base.</p>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>

                            <div className="text-xs text-right">
                              Total das bonificações selecionadas:{" "}
                              <strong className="font-mono">
                                {fmt(acerto.bonificacoesResumoPorTipo.filter((b) => selecionadas.includes(b.categoria)).reduce((s, b) => s + b.total, 0))}
                              </strong>
                            </div>
                          </div>

                          {/* Destino do desconto (apenas categorias selecionadas) */}
                          <div className="border-t px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex flex-wrap gap-2">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    <ListChecks className="h-4 w-4 mr-1" />
                                    Descontar do faturamento ({tiposFatEfetivos.length})
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-72">
                                  <div className="text-xs font-semibold mb-2">Categorias que reduzem o Faturamento Bruto</div>
                                  <div className="space-y-1.5">
                                    {availableBonusCategories.map((c) => {
                                      const total = totalCategoria(c);
                                      return (
                                        <label key={c} className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted rounded px-2 py-1">
                                          <span className="flex items-center gap-2 text-sm">
                                            <Checkbox checked={tiposFat.includes(c)} onCheckedChange={() => toggleTipo(tiposFat, setTiposFat, "tiposFat", c)} />
                                            {c}
                                          </span>
                                          <span className="text-xs font-mono text-muted-foreground">{fmt(total)}</span>
                                        </label>
                                      );
                                    })}
                                    {availableBonusCategories.length === 0 && (
                                      <p className="text-xs text-muted-foreground">Nenhuma categoria de bonificação na competência.</p>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>

                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    <ListChecks className="h-4 w-4 mr-1" />
                                    Descontar da comissão ({tiposComEfetivos.length})
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-72">
                                  <div className="text-xs font-semibold mb-2">Categorias que reduzem a Comissão Bruta (Cortesia)</div>
                                  <div className="space-y-1.5">
                                    {availableBonusCategories.map((c) => {
                                      const total = totalCategoria(c);
                                      return (
                                        <label key={c} className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted rounded px-2 py-1">
                                          <span className="flex items-center gap-2 text-sm">
                                            <Checkbox checked={tiposCom.includes(c)} onCheckedChange={() => toggleTipo(tiposCom, setTiposCom, "tiposCom", c)} />
                                            {c}
                                          </span>
                                          <span className="text-xs font-mono text-muted-foreground">{fmt(total)}</span>
                                        </label>
                                      );
                                    })}
                                    {availableBonusCategories.length === 0 && (
                                      <p className="text-xs text-muted-foreground">Nenhuma categoria de bonificação na competência.</p>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>

                            <div className="text-xs text-right space-y-0.5">
                              <div>Faturamento: <strong className="font-mono text-destructive">−{fmt(acerto.bonificacoesDescontadas)}</strong></div>
                              <div>Comissão: <strong className="font-mono text-destructive">−{fmt(acerto.cortesia)}</strong></div>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Descontos por cliente */}
                  <Card>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle className="text-base">Descontos de Comissão por Cliente</CardTitle>
                      <Button size="sm" variant="outline" onClick={addDesconto}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
                    </CardHeader>
                    <CardContent>
                      {descontos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum cliente com comissão diferenciada.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cliente</TableHead>
                              <TableHead className="text-right">Com. Normal</TableHead>
                              <TableHead className="text-right">Com. Aplicada</TableHead>
                              <TableHead className="text-right">Diferença</TableHead>
                              <TableHead className="text-right">Valor descontado</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {descontos.map((d, i) => {
                              const calc = acerto.descontosCliente.find((x) => x.cliente === d.cliente);
                              return (
                                <TableRow key={i} className="bg-amber-50 dark:bg-amber-950/20">
                                  <TableCell>
                                    <ClienteSmartSearch
                                      value={d.cliente}
                                      onChange={(v) => updateDesconto(i, { cliente: v })}
                                      clientesFaturamento={acerto.clientes}
                                      vendedorAtual={vendedor}
                                      className="min-w-[260px]"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">{pctPadrao}%</TableCell>
                                  <TableCell className="text-right">
                                    <Input type="number" step="0.1" className="h-8 w-20 ml-auto"
                                      value={d.pctAcordado}
                                      onChange={(e) => updateDesconto(i, { pctAcordado: Number(e.target.value) })} />
                                  </TableCell>
                                  <TableCell className="text-right">{calc ? `${calc.pctDesconto.toFixed(1)}%` : "—"}</TableCell>
                                  <TableCell className="text-right font-mono text-destructive font-semibold">
                                    {calc ? `−${fmt(calc.valorDescontado)}` : "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Button size="icon" variant="ghost" onClick={() => removeDesconto(i)}><Trash2 className="h-4 w-4" /></Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  {/* Descontos Manuais */}
                  <Card>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle className="text-base">Descontos Manuais</CardTitle>
                      <Button size="sm" variant="outline" onClick={addAjuste}><Plus className="h-4 w-4 mr-1" /> Adicionar desconto</Button>
                    </CardHeader>
                    <CardContent>
                      {ajustes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Ex.: "Meta não batida por 3 meses (-1%)". Valores positivos são descontados.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cliente (opcional)</TableHead>
                              <TableHead className="min-w-[240px] w-[26%]">Descrição</TableHead>
                              <TableHead className="w-56 min-w-[224px]">Valor (R$)</TableHead>
                              <TableHead className="w-36">Observação</TableHead>


                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ajustes.map((a, i) => (
                              <TableRow key={a.id} className="bg-destructive/5">
                                <TableCell>
                                  <ClienteSmartSearch
                                    value={a.cliente ?? ""}
                                    onChange={(v) => updateAjuste(i, { cliente: v })}
                                    clientesFaturamento={acerto.clientes}
                                    vendedorAtual={vendedor}
                                    placeholder="Cliente (opcional)"
                                    className="min-w-[220px]"
                                  />
                                </TableCell>
                                <TableCell className="min-w-[240px]"><Input className="h-8 w-full min-w-[220px]" placeholder="Ex.: Comissão Reduzida" value={a.descricao} onChange={(e) => updateAjuste(i, { descricao: e.target.value })} /></TableCell>
                                <TableCell className="min-w-[224px]"><Input type="number" step="0.01" className="h-8 font-mono w-full min-w-[210px] text-right" value={a.valor} onChange={(e) => updateAjuste(i, { valor: Number(e.target.value) })} /></TableCell>

                                <TableCell><Input className="h-8" placeholder="Observação" value={a.observacao ?? ""} onChange={(e) => updateAjuste(i, { observacao: e.target.value })} /></TableCell>
                                <TableCell><Button size="icon" variant="ghost" onClick={() => removeAjuste(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  {/* Ajuda de Custo + Outros Créditos */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Créditos Adicionais</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Valores que <strong>somam</strong> na comissão líquida (ex.: ajuda de custo, reembolsos).
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {comissaoEquipe && (
                        <div className="rounded-md border bg-muted/30 p-3">
                          <div className="flex items-center justify-between">
                            <Label>(+) Comissão Equipe ({comissaoEquipe.pct}%)</Label>
                            <span className="font-mono font-semibold text-success">{fmt(comissaoEquipe.valor)}</span>
                          </div>
                          <div className="mt-2 space-y-0.5">
                            {comissaoEquipe.membros.map((mb) => (
                              <div key={mb.vendedor} className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>↳ {mb.vendedor} — Faturamento líquido</span>
                                <span className="font-mono">{fmt(mb.faturamentoLiquido)}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t">
                              <span>Base total</span>
                              <span className="font-mono">{fmt(comissaoEquipe.base)}</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Calculado automaticamente a partir do faturamento líquido da equipe na competência.
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <Label className="w-40">(+) Ajuda de Custo</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-9 font-mono max-w-[200px]"
                          value={ajudaCusto}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setAjudaCusto(v);
                            savePrefs({ ajudaCusto: v });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">Soma direto na comissão líquida.</span>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label>(+) Outros Créditos</Label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const n = [...outrosCreditos, { id: crypto.randomUUID(), descricao: "", valor: 0 }];
                              setOutrosCreditos(n);
                              savePrefs({ outrosCreditos: n });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Adicionar crédito
                          </Button>
                        </div>
                        {outrosCreditos.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Ex.: "Reembolso viagem" — R$ 150,00.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-40">Valor (R$)</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {outrosCreditos.map((c, i) => (
                                <TableRow key={c.id} className="bg-success/5">
                                  <TableCell>
                                    <Input
                                      className="h-8"
                                      placeholder="Ex.: Reembolso viagem"
                                      value={c.descricao}
                                      onChange={(e) => {
                                        const n = outrosCreditos.map((x, idx) => idx === i ? { ...x, descricao: e.target.value } : x);
                                        setOutrosCreditos(n);
                                        savePrefs({ outrosCreditos: n });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-8 font-mono"
                                      value={c.valor}
                                      onChange={(e) => {
                                        const n = outrosCreditos.map((x, idx) => idx === i ? { ...x, valor: Number(e.target.value) } : x);
                                        setOutrosCreditos(n);
                                        savePrefs({ outrosCreditos: n });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => {
                                        const n = outrosCreditos.filter((_, idx) => idx !== i);
                                        setOutrosCreditos(n);
                                        savePrefs({ outrosCreditos: n });
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </fieldset>


                {/* PARTE 2 — Resumo DRE (mesmo componente da Visualização e do PDF) */}
                <div className="xl:col-span-1">
                  <div className="sticky top-4 space-y-3">
                    <AcertoResumoDocument
                      acerto={acerto}
                      yearMonth={yearMonth}
                      pctPadrao={pctPadrao}
                      metas={premData.metas}
                      realizadoMetas={metaVendedor?.faturamentoMes ?? 0}
                      participaPremiacao={participaPremiacao}
                      metasAcumulativas={metasAcumulativas}
                      ajudaCusto={ajudaCusto}
                      outrosCreditos={outrosCreditosVisiveis}
                      comissaoEquipe={comissaoEquipe}
                      tiposDescontoFaturamento={tiposFatEfetivos}
                      variant="screen"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setPreviewMode("resumo"); setPreviewOpen(true); }}>
                        <Eye className="h-4 w-4 mr-1" /> Visualizar Resumo
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setPreviewMode("completo"); setPreviewOpen(true); }}>
                        <Eye className="h-4 w-4 mr-1" /> Visualizar Completo
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => downloadPreviewPdf("resumo")}
                      >
                        <FileText className="h-4 w-4 mr-1" /> PDF Resumo
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => downloadPreviewPdf("completo")}
                      >
                        <FileText className="h-4 w-4 mr-1" /> PDF Completo
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportAcertoExcelResumo(acerto, yearMonth, excelOpts)}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel Resumo
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => exportAcertoExcelCompleto(acerto, yearMonth, excelOpts)}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel Completo
                      </Button>
                    </div>
                  </div>
                </div>
              </div>


            )}

            {/* Modal de Visualização — mesmo componente do PDF */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogContent className="max-w-[880px] max-h-[92vh] overflow-auto p-0">
                <DialogHeader className="px-6 pt-5 pb-3 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between">
                  <DialogTitle>
                    Visualização — {previewMode === "resumo" ? "PDF Resumo" : "PDF Completo"}
                  </DialogTitle>
                  {acerto && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={previewMode === "resumo" ? "default" : "outline"}
                        onClick={() => setPreviewMode("resumo")}
                      >
                        Resumo
                      </Button>
                      <Button
                        size="sm"
                        variant={previewMode === "completo" ? "default" : "outline"}
                        onClick={() => setPreviewMode("completo")}
                      >
                        Completo
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => downloadPreviewPdf(previewMode)}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Baixar PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadPreviewPdf(previewMode, "alta")}
                      >
                        Alta qualidade
                      </Button>
                    </div>
                  )}
                </DialogHeader>
                <div className="bg-muted/30 p-6 flex justify-center">
                  {acerto && previewMode === "resumo" && (
                    <AcertoResumoDocument
                      ref={previewDocRef}
                      acerto={acerto}
                      yearMonth={yearMonth}
                      pctPadrao={pctPadrao}
                      metas={premData.metas}
                      realizadoMetas={metaVendedor?.faturamentoMes ?? 0}
                      participaPremiacao={participaPremiacao}
                      metasAcumulativas={metasAcumulativas}
                      ajudaCusto={ajudaCusto}
                      outrosCreditos={outrosCreditosVisiveis}
                      comissaoEquipe={comissaoEquipe}
                      tiposDescontoFaturamento={tiposFatEfetivos}
                      variant="document"
                    />
                  )}
                  {acerto && previewMode === "completo" && (
                    <AcertoCompletoDocument
                      ref={completoDocRef}
                      acerto={acerto}
                      yearMonth={yearMonth}
                      pctPadrao={pctPadrao}
                      metas={premData.metas}
                      participaPremiacao={participaPremiacao}
                      metasAcumulativas={metasAcumulativas}
                      ajudaCusto={ajudaCusto}
                      outrosCreditos={outrosCreditosVisiveis}
                      comissaoEquipe={comissaoEquipe}
                      tiposDescontoFaturamento={tiposFatEfetivos}
                      tiposDescontoComissao={tiposComEfetivos}
                      variant="document"
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </AppLayout>
  );
}

