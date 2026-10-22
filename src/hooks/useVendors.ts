import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVendorScope, vendorScopeKey } from "@/hooks/useVendorScope";

export interface Vendor {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  data_entrada: string | null;
  ativo: boolean;
  is_team: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorInput {
  id?: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  observacoes?: string | null;
  data_entrada?: string | null;
  ativo?: boolean;
  is_team?: boolean;
}

const QUERY_KEY = ["vendors"];

/** Lista completa (uso administrativo). */
export function useAllVendors() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors" as any)
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Vendor[];
    },
    staleTime: 30_000,
  });
}

export function useActiveVendorNames(): string[] {
  const { data } = useVendors();
  return (data ?? []).filter(v => v.ativo).map(v => v.nome);
}

export function useTeamVendorNames(): string[] {
  const { data } = useVendors();
  return (data ?? []).filter(v => v.ativo && v.is_team).map(v => v.nome);
}

export function useUpsertVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VendorInput) => {
      // Duplicate name check on active
      const { data: existing } = await supabase
        .from("vendors" as any)
        .select("id, nome, ativo")
        .eq("ativo", true);
      const dup = (existing as any[] | null)?.find(
        (v) => v.nome.trim().toLowerCase() === input.nome.trim().toLowerCase() && v.id !== input.id,
      );
      if (dup && (input.ativo ?? true)) {
        throw new Error("Já existe um vendedor ativo com esse nome.");
      }

      if (input.id) {
        const { error } = await supabase
          .from("vendors" as any)
          .update({
            nome: input.nome,
            email: input.email ?? null,
            telefone: input.telefone ?? null,
            observacoes: input.observacoes ?? null,
            data_entrada: input.data_entrada ?? null,
            ativo: input.ativo ?? true,
            is_team: input.is_team ?? false,
          })
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      } else {
        const { data, error } = await supabase
          .from("vendors" as any)
          .insert({
            nome: input.nome,
            email: input.email ?? null,
            telefone: input.telefone ?? null,
            observacoes: input.observacoes ?? null,
            data_entrada: input.data_entrada ?? null,
            ativo: input.ativo ?? true,
            is_team: input.is_team ?? false,
          })
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id as string;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useToggleVendorActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("vendors" as any).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Lista de vendedores VISÍVEL para o login atual (escopo global).
 * Telas administrativas devem usar `useAllVendors`.
 */
export function useVendors() {
  const scope = useVendorScope();
  const all = useAllVendors();
  const data = useMemo(() => scope.filtrar(all.data ?? [], (v) => v.nome), [all.data, scope]);
  return { ...all, data } as typeof all;
}
