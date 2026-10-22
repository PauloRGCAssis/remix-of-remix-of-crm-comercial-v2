import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScopeBase = "meus_dados" | "vendedores_selecionados" | "empresa";

export interface DataScopeRow {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  base: ScopeBase;
  vendedores: string[];
  clientes: string[];
  grupos_economicos: string[];
  regioes: string[];
  created_at: string;
  updated_at: string;
}

export interface DataScopeInput {
  id?: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
  base: ScopeBase;
  vendedores: string[];
  clientes: string[];
  grupos_economicos: string[];
  regioes: string[];
}

export const DATA_SCOPES_KEY = ["data-scopes"];

/** Escopos personalizados criados pelo administrador (Administração → Escopos de Dados). */
export function useDataScopes() {
  return useQuery({
    queryKey: DATA_SCOPES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_scopes" as never)
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as DataScopeRow[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertDataScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DataScopeInput) => {
      const payload = {
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() || null,
        ativo: input.ativo ?? true,
        base: input.base,
        vendedores: input.vendedores,
        clientes: input.clientes,
        grupos_economicos: input.grupos_economicos,
        regioes: input.regioes,
      };
      if (input.id) {
        const { error } = await supabase
          .from("data_scopes" as never)
          .update(payload as never)
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("data_scopes" as never)
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DATA_SCOPES_KEY }),
  });
}

export function useToggleDataScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("data_scopes" as never)
        .update({ ativo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DATA_SCOPES_KEY }),
  });
}

export function useDeleteDataScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("data_scopes" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DATA_SCOPES_KEY }),
  });
}

/** Quantidade de usuários vinculados a cada escopo personalizado. */
export function useDataScopeUsage() {
  return useQuery({
    queryKey: ["data-scopes-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_access").select("scope_id");
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data ?? []) as { scope_id: string | null }[]) {
        if (r.scope_id) m.set(r.scope_id, (m.get(r.scope_id) ?? 0) + 1);
      }
      return m;
    },
  });
}
