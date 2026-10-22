import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVendorScope, vendorScopeKey } from "@/hooks/useVendorScope";
import type { PdvRowInput } from "@/lib/pdvImport";

const QK_ROWS = ["pdv_sales_rows"] as const;
const QK_STAGING = ["client_address_staging"] as const;

export interface PdvSalesRow {
  id: number;
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
  source_file: string | null;
}

/** Dados comerciais vindos da planilha "PDV Atuais". */
export function usePdvSalesRows() {
  const scope = useVendorScope();
  return useQuery({
    queryKey: [...QK_ROWS, vendorScopeKey(scope)],
    select: useCallback((rows: PdvSalesRow[]) => scope.filtrar(rows, (r) => r.vendedor), [scope]),
    queryFn: async (): Promise<PdvSalesRow[]> => {
      const all: PdvSalesRow[] = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await (supabase as any)
          .from("pdv_sales_rows")
          .select("*")
          .range(from, from + size - 1);
        if (error) throw error;
        all.push(...((data ?? []) as PdvSalesRow[]));
        if (!data || data.length < size) break;
      }
      return all;
    },
  });
}

export function useImportPdvSalesRows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: PdvRowInput[]) => {
      const size = 500;
      for (let i = 0; i < rows.length; i += size) {
        const { error } = await (supabase as any)
          .from("pdv_sales_rows")
          .upsert(rows.slice(i, i + size), { onConflict: "import_key" });
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_ROWS }),
  });
}

export interface AddressStagingRow {
  id: string;
  match_key: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj_cpf: string | null;
  codigo_cliente: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  vendedor: string | null;
  segmento: string | null;
  status: string;
  candidates: Array<{ id: string; nome: string }>;
  applied_profile_id: string | null;
  source_file: string | null;
  created_at: string;
}

/** Cadastros do Sige ainda não associados (pendentes ou ambíguos). */
export function useAddressStaging() {
  return useQuery({
    queryKey: QK_STAGING,
    queryFn: async (): Promise<AddressStagingRow[]> => {
      const { data, error } = await (supabase as any)
        .from("client_address_staging")
        .select("*")
        .neq("status", "aplicado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AddressStagingRow[];
    },
  });
}

export function useUpsertAddressStaging() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<Partial<AddressStagingRow>>) => {
      const size = 300;
      for (let i = 0; i < rows.length; i += size) {
        const { error } = await (supabase as any)
          .from("client_address_staging")
          .upsert(rows.slice(i, i + size), { onConflict: "match_key" });
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_STAGING }),
  });
}

export function useMarkStagingApplied() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ids: string[]; profileIdById?: Record<string, string> }) => {
      for (const id of payload.ids) {
        const { error } = await (supabase as any)
          .from("client_address_staging")
          .update({
            status: "aplicado",
            applied_profile_id: payload.profileIdById?.[id] ?? null,
          })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_STAGING }),
  });
}

export function useDeleteStaging() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_address_staging").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_STAGING }),
  });
}

/** Totais da fila de endereços (para a auditoria da tela Clientes (Endereços)). */
export function useAddressStagingStats() {
  return useQuery({
    queryKey: ["client_address_staging_stats"],
    queryFn: async () => {
      const total = await (supabase as any)
        .from("client_address_staging")
        .select("id", { count: "exact", head: true });
      const aplicados = await (supabase as any)
        .from("client_address_staging")
        .select("id", { count: "exact", head: true })
        .eq("status", "aplicado");
      if (total.error) throw total.error;
      if (aplicados.error) throw aplicados.error;
      return { total: total.count ?? 0, aplicados: aplicados.count ?? 0 };
    },
  });
}
