import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  COMMISSION_PROCESSING_VERSION,
  type CommissionBatch,
  type CommissionRow,
} from "@/lib/commissionImport";

/**
 * ARQUITETURA DE ARMAZENAMENTO
 *
 * A planilha importada (faturamento + bonificações) NUNCA é gravada no
 * localStorage — ela vive no banco (`commission_batches` + `commission_batch_rows`).
 * Exceção temporária: lotes legados são lidos e só removidos após migração
 * integral, validada e confirmada no banco.
 */

const CURRENT_KEY = "commission-batch-current-ym";
const LEGACY_PREFIX = "commission-batch-";

export type CommissionPersistenceStage = "leitura" | "linhas" | "validação" | "metadados" | "migração";

export class CommissionPersistenceError extends Error {
  constructor(
    public readonly stage: CommissionPersistenceStage,
    public readonly readCount: number,
    public readonly writtenCount: number,
    message: string,
  ) {
    super(message);
    this.name = "CommissionPersistenceError";
  }
}

/**
 * Traduz qualquer erro do banco (PostgrestError, erro de rede, exceção) em texto
 * legível. NUNCA devolve "[object Object]".
 */
export function describeSupabaseError(error: unknown): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  const e = error as Record<string, unknown>;
  const parts: string[] = [];
  const msg = typeof e.message === "string" && e.message ? e.message : null;
  if (msg) parts.push(msg);
  if (typeof e.details === "string" && e.details) parts.push(`Detalhes: ${e.details}`);
  if (typeof e.hint === "string" && e.hint) parts.push(`Sugestão: ${e.hint}`);
  if (e.code != null && String(e.code)) parts.push(`Código: ${String(e.code)}`);
  if (parts.length > 0) return parts.join(" · ");
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function legacyKey(yearMonth: string) {
  return `${LEGACY_PREFIX}${yearMonth}`;
}

function readLegacyBatch(yearMonth: string): CommissionBatch | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(legacyKey(yearMonth));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as CommissionBatch;
  if (parsed.yearMonth !== yearMonth || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    throw new CommissionPersistenceError("migração", 0, 0, "O lote antigo existe, mas seu formato é inválido.");
  }
  return parsed;
}

export function getCurrentYearMonth(): string {
  try {
    return localStorage.getItem(CURRENT_KEY) || new Date().toISOString().slice(0, 7);
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}

function rememberYearMonth(yearMonth: string) {
  try {
    localStorage.setItem(CURRENT_KEY, yearMonth);
  } catch {
    /* noop */
  }
}

export const commissionBatchKey = (yearMonth: string) => ["commission-batch", yearMonth] as const;

/** Lê do banco o lote vigente da competência. */
export async function fetchBatch(yearMonth: string): Promise<CommissionBatch | null> {
  const { data: meta, error } = await (supabase as any)
    .from("commission_batches")
    .select("*")
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (error) throw error;
  if (!meta) {
    let legacy: CommissionBatch | null = null;
    try {
      legacy = readLegacyBatch(yearMonth);
    } catch (error) {
      console.error("[Comissão][migração] Falha ao ler lote legado", { yearMonth, error });
      throw error;
    }
    if (!legacy) return null;

    console.info("[Comissão][migração] Lote legado encontrado", { yearMonth, readCount: legacy.rows.length });
    await persistBatch(legacy);
    const migrated = await fetchBatchFromDatabase(yearMonth);
    if (!migrated || migrated.rows.length !== legacy.rows.length) {
      throw new CommissionPersistenceError(
        "validação",
        legacy.rows.length,
        migrated?.rows.length ?? 0,
        "A validação do lote migrado não confirmou todas as linhas. O dado antigo foi preservado.",
      );
    }
    localStorage.removeItem(legacyKey(yearMonth));
    console.info("[Comissão][migração] Migração confirmada; chave antiga removida", {
      yearMonth,
      writtenCount: migrated.rows.length,
    });
    return migrated;
  }

  return fetchBatchFromDatabase(yearMonth, meta);
}

async function fetchBatchFromDatabase(yearMonth: string, knownMeta?: any): Promise<CommissionBatch | null> {
  let meta = knownMeta;
  if (!meta) {
    const result = await (supabase as any)
      .from("commission_batches")
      .select("*")
      .eq("year_month", yearMonth)
      .maybeSingle();
    if (result.error) throw result.error;
    meta = result.data;
  }
  if (!meta) return null;

  const rows: CommissionRow[] = [];
  for (let page = 0; page < 200; page++) {
    const { data, error: rowsError } = await (supabase as any)
      .from("commission_batch_rows")
      .select("payload")
      .eq("batch_uid", meta.batch_uid)
      .order("seq", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (rowsError) throw rowsError;
    const slice = (data ?? []) as { payload: CommissionRow }[];
    rows.push(...slice.map((r) => r.payload));
    if (slice.length < 1000) break;
  }

  if (rows.length !== Number(meta.row_count)) {
    throw new CommissionPersistenceError(
      "validação",
      Number(meta.row_count),
      rows.length,
      `Lote incompleto no banco: esperado ${meta.row_count}, encontrado ${rows.length}.`,
    );
  }

  return {
    yearMonth: meta.year_month,
    fileName: meta.file_name,
    importedAt: meta.imported_at,
    processingVersion: meta.processing_version ?? undefined,
    bonificacaoValueColumn: (meta.bonificacao_value_column ?? undefined) as CommissionBatch["bonificacaoValueColumn"],
    rows,
  };
}

/**
 * Grava o lote no banco de forma atômica do ponto de vista da leitura:
 * as linhas novas entram sob um `batch_uid` inédito e só depois o ponteiro da
 * competência é atualizado. Se algo falhar no meio, as linhas parciais são
 * removidas e o lote anterior continua íntegro.
 */
export async function persistBatch(batch: CommissionBatch, bonificacaoRows: Record<string, unknown>[] = []): Promise<number> {
  const readCount = batch.rows.length;
  console.info("[Comissão][gravação] Iniciando lote transacional", { yearMonth: batch.yearMonth, readCount });
  try {
    const { data, error } = await (supabase as any).rpc("replace_commission_batch_with_bonificacoes", {
      _year_month: batch.yearMonth,
      _file_name: batch.fileName,
      _imported_at: batch.importedAt,
      _processing_version: batch.processingVersion ?? COMMISSION_PROCESSING_VERSION,
      _bonificacao_value_column: batch.bonificacaoValueColumn ?? null,
      _rows: batch.rows,
      _expected_row_count: readCount,
      _bonificacao_rows: bonificacaoRows,
    });
    if (error) throw error;
    const writtenCount = Number(data?.writtenCount ?? data?.writtencount ?? 0);
    if (writtenCount !== readCount) {
      throw new CommissionPersistenceError("validação", readCount, writtenCount, "O banco não confirmou todas as linhas.");
    }
    console.info("[Comissão][gravação] Lote confirmado", { yearMonth: batch.yearMonth, readCount, writtenCount });
    return Number(data?.bonificacaoWrittenCount ?? data?.bonificacaowrittencount ?? 0);
  } catch (error) {
    const message = describeSupabaseError(error);
    console.error("[Comissão][gravação] Falha transacional", {
      yearMonth: batch.yearMonth,
      readCount,
      writtenCount: 0,
      erro: message,
      bruto: error,
    });
    if (error instanceof CommissionPersistenceError) throw error;
    throw new CommissionPersistenceError("linhas", readCount, 0, message);
  }
}

export async function deleteBatch(yearMonth: string): Promise<void> {
  const { error } = await (supabase as any).from("commission_batches").delete().eq("year_month", yearMonth);
  if (error) throw error;
  await (supabase as any).from("commission_batch_rows").delete().eq("year_month", yearMonth);
}

export function useCommissionImport(yearMonth: string) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(yearMonth)) rememberYearMonth(yearMonth);
  }, [yearMonth]);

  const query = useQuery({
    queryKey: commissionBatchKey(yearMonth),
    enabled: /^\d{4}-\d{2}$/.test(yearMonth),
    queryFn: () => fetchBatch(yearMonth),
    staleTime: 30_000,
  });

  const setBatch = useCallback(
    async (b: CommissionBatch, bonificacaoRows: Record<string, unknown>[] = []) => {
      setSaving(true);
      try {
        const bonificacoesGravadas = await persistBatch(b, bonificacaoRows);
        qc.setQueryData(commissionBatchKey(b.yearMonth), b);
        await qc.invalidateQueries({ queryKey: commissionBatchKey(b.yearMonth) });
        return bonificacoesGravadas;
      } finally {
        setSaving(false);
      }
    },
    [qc],
  );

  const clear = useCallback(async () => {
    await deleteBatch(yearMonth);
    qc.setQueryData(commissionBatchKey(yearMonth), null);
    await qc.invalidateQueries({ queryKey: commissionBatchKey(yearMonth) });
  }, [qc, yearMonth]);

  return {
    batch: query.data ?? null,
    loading: query.isLoading,
    saving,
    error: query.error as Error | null,
    setBatch,
    clear,
  };
}
