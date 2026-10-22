import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TaxonomyTipo = "segmento" | "ramo" | "indicado" | "pdv_tipo";

export interface TaxonomyOption {
  id: string;
  tipo: TaxonomyTipo;
  nome: string;
}

const QK = ["client_taxonomies"] as const;

export function useTaxonomies(tipo?: TaxonomyTipo) {
  return useQuery({
    queryKey: [...QK, tipo ?? "all"],
    queryFn: async (): Promise<TaxonomyOption[]> => {
      let q = (supabase as any).from("client_taxonomies").select("*").order("nome", { ascending: true });
      if (tipo) q = q.eq("tipo", tipo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TaxonomyOption[];
    },
    staleTime: 30_000,
  });
}

export function useCreateTaxonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, nome }: { tipo: TaxonomyTipo; nome: string }) => {
      const clean = nome.trim();
      if (!clean) throw new Error("Nome obrigatório");
      const { data, error } = await (supabase as any)
        .from("client_taxonomies")
        .insert({ tipo, nome: clean })
        .select()
        .single();
      if (error) {
        if (String(error.message ?? "").toLowerCase().includes("duplicate")) {
          throw new Error("Já existe uma opção com esse nome.");
        }
        throw error;
      }
      return data as TaxonomyOption;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteTaxonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_taxonomies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
