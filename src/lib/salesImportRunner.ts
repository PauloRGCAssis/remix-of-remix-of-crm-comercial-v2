// Processo ÚNICO e central de importação de planilhas comerciais.
//
// Tanto a aba geral "Importar Planilha" quanto o botão "Importar planilha" da aba
// "Ponto de Venda" chamam estas funções. Mesma leitura, mesmas validações, mesma
// normalização e mesma base (sales_raw_rows via edge function import-sales).
//
// A importação NUNCA transforma clientes comuns em ponto de venda: a aba PDV é
// apenas uma visão filtrada dos clientes já marcados como `is_ponto_venda`.

import { supabase } from "@/integrations/supabase/client";
import {
  parseFilesToImportBatch,
  type ParsedImportBatch,
} from "@/lib/importSpreadsheet";
import { buildMatchIndex, matchProfile } from "@/lib/pdvImport";
import type { ClientProfile } from "@/types/clientProfile";

export const IMPORT_CHUNK_SIZE = 300;

export interface ImportProgress {
  current: number;
  total: number;
  phase: string;
}

export interface SalesImportCounts {
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  errors: string[];
}

/** Envia as linhas já lidas para a edge function, em blocos. Núcleo compartilhado. */
export async function executeSalesImport(
  batch: ParsedImportBatch,
  onProgress?: (p: ImportProgress) => void,
): Promise<SalesImportCounts> {
  const rows = batch.rows;
  const out: SalesImportCounts = { inserted: 0, updated: 0, unchanged: 0, deactivated: 0, errors: [] };

  // Só uma planilha cujo totalizador confere com a soma das linhas é tratada
  // como espelho oficial. Arquivos parciais preservam pedidos ausentes.
  onProgress?.({ current: 1, total: 1, phase: batch.isCompleteReport ? "Espelhando planilha oficial" : "Importando vendas" });
  const { data, error } = await supabase.functions.invoke("import-sales", {
    body: { rows, mode: "chunk", syncFullReport: batch.isCompleteReport },
  });
  if (error) throw error;
  const r = data as Partial<SalesImportCounts> & { errors?: string[] };
  out.inserted = r.inserted ?? 0;
  out.updated = r.updated ?? 0;
  out.unchanged = r.unchanged ?? 0;
  out.deactivated = r.deactivated ?? 0;
  if (r.errors?.length) out.errors.push(...r.errors);
  return out;
}

export interface SalesImportReport extends SalesImportCounts {
  arquivos: string[];
  linhas: number;
  pedidos: number;
  itens: number;
  duplicadasIgnoradas: number;
  clientesPlanilha: number;
  clientesEncontrados: number;
  clientesNaoEncontrados: number;
  clientesRevisao: number;
  pdvAtualizados: number;
  clientesComuns: number;
  periodo: string;
  duracaoMs: number;
}

function formatBr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Importação completa a partir dos arquivos: lê, envia, grava histórico e
 * devolve o relatório detalhado (inclusive quantos pontos de venda foram afetados).
 */
export async function runSalesImport(
  files: File[],
  options: {
    profiles?: ClientProfile[];
    onProgress?: (p: ImportProgress) => void;
    importedBy?: string;
  } = {},
): Promise<SalesImportReport> {
  const t0 = performance.now();
  options.onProgress?.({ current: 0, total: 0, phase: "Lendo planilha" });
  const batch = await parseFilesToImportBatch(files);

  const counts = await executeSalesImport(batch, options.onProgress);

  // Estatísticas da planilha (pedido != item: um pedido tem várias linhas)
  const pedidos = new Set<string>();
  const clientesPlanilha = new Map<string, { nome: string; cnpj: string }>();
  let minData: string | null = null;
  let maxData: string | null = null;
  for (const row of batch.rows) {
    const dia = String(row.data ?? "").slice(0, 10);
    pedidos.add(`${row.codigo_venda}|${dia}`);
    const nome = String(row.cliente ?? "").trim();
    const key = nome.toLowerCase();
    if (key && !clientesPlanilha.has(key)) clientesPlanilha.set(key, { nome, cnpj: String(row.cnpj_cpf ?? "") });
    const iso = String(row.data ?? "");
    if (iso) {
      if (!minData || iso < minData) minData = iso;
      if (!maxData || iso > maxData) maxData = iso;
    }
  }

  const profiles = options.profiles ?? [];
  const index = buildMatchIndex(profiles);
  let encontrados = 0;
  let revisao = 0;
  let pdvAtualizados = 0;
  for (const info of clientesPlanilha.values()) {
    const res = matchProfile({ cnpj_cpf: info.cnpj, nome_fantasia: info.nome, razao_social: info.nome }, index);
    if (res.status === "ambiguo") {
      revisao += 1;
      continue;
    }
    if (res.status === "match") {
      encontrados += 1;
      if (res.profile.is_ponto_venda) pdvAtualizados += 1;
    }
  }

  const report: SalesImportReport = {
    ...counts,
    arquivos: batch.fileSummaries.map((f) => f.name),
    linhas: batch.rows.length,
    pedidos: pedidos.size,
    itens: batch.rows.length,
    duplicadasIgnoradas: counts.unchanged,
    clientesPlanilha: clientesPlanilha.size,
    clientesEncontrados: encontrados,
    clientesNaoEncontrados: clientesPlanilha.size - encontrados - revisao,
    clientesRevisao: revisao,
    pdvAtualizados,
    clientesComuns: Math.max(clientesPlanilha.size - pdvAtualizados, 0),
    periodo: `${formatBr(minData)} a ${formatBr(maxData)}`,
    duracaoMs: performance.now() - t0,
  };

  // Histórico da importação (best-effort — nunca derruba o fluxo)
  try {
    await (supabase as any).from("import_history").insert({
      import_type: "incremental",
      file_names: report.arquivos,
      file_count: report.arquivos.length,
      range_start: minData,
      range_end: maxData,
      total_rows: report.linhas,
      inserted_count: report.inserted,
      updated_count: report.updated,
      unchanged_count: report.unchanged,
      deleted_count: report.deactivated,
      integrity_snapshot: {},
      debug_sample: batch.previewRows ?? [],
      imported_by: options.importedBy ?? "Lovable Cloud",
    });
  } catch (e) {
    console.warn("Histórico de importação não registrado:", e);
  }

  return report;
}

/** Chaves de cache que dependem dos dados comerciais. */
export const SALES_DEPENDENT_KEYS = [
  ["sales-data"],
  ["client_profiles"],
  ["pdv_sales_rows"],
] as const;

/**
 * Sincroniza TODAS as telas comerciais após uma importação: remove o cache
 * antigo e força um refetch imediato (não basta invalidar — telas montadas
 * depois continuavam servindo o cache).
 */
export async function refreshSalesCaches(qc: {
  invalidateQueries: (f: any) => any;
  refetchQueries: (f: any) => Promise<any>;
}): Promise<void> {
  for (const key of SALES_DEPENDENT_KEYS) qc.invalidateQueries({ queryKey: [...key] });
  await qc.refetchQueries({ type: "active" });
}
