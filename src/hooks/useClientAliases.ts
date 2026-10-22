import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setDynamicAliases, EXCLUDED_CANONICAL } from "@/lib/clientNameNormalization";

export interface ClientAlias {
  id: string;
  canonical_name: string;
  alias_name: string;
  motivo: string | null;
}

export interface DuplicateDecision {
  id: string;
  cliente_a: string;
  cliente_b: string;
  decisao: "unificar" | "manter_separados" | "perguntar_depois";
}

const ALIASES_KEY = ["client-aliases"];
const DECISIONS_KEY = ["client-duplicate-decisions"];

export function useClientAliases() {
  const qc = useQueryClient();

  const aliasesQ = useQuery({
    queryKey: ALIASES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_aliases" as any)
        .select("id, canonical_name, alias_name, motivo");
      if (error) throw error;
      return (data ?? []) as unknown as ClientAlias[];
    },
    staleTime: 60_000,
  });

  const decisionsQ = useQuery({
    queryKey: DECISIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_duplicate_decisions" as any)
        .select("id, cliente_a, cliente_b, decisao");
      if (error) throw error;
      return (data ?? []) as unknown as DuplicateDecision[];
    },
    staleTime: 60_000,
  });

  // Sincroniza aliases dinâmicos com o normalizador global sempre que mudar
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const a of aliasesQ.data ?? []) {
      map[a.alias_name] = a.canonical_name;
    }
    setDynamicAliases(map);
    // invalida queries de vendas para recomputar agrupamentos
    qc.invalidateQueries({ queryKey: ["sales-data"] });
    qc.invalidateQueries({ queryKey: ["client_profiles"] });
  }, [aliasesQ.data, qc]);

  const addAlias = useMutation({
    mutationFn: async (payload: { canonical: string; alias: string; motivo?: string }) => {
      const { error } = await supabase
        .from("client_aliases" as any)
        .upsert(
          {
            canonical_name: payload.canonical,
            alias_name: payload.alias,
            motivo: payload.motivo ?? "manual",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "alias_name" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALIASES_KEY });
      qc.invalidateQueries({ queryKey: ["sales-data"] });
      qc.invalidateQueries({ queryKey: ["client_profiles"] });
    },
  });

  const removeAlias = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_aliases" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALIASES_KEY });
      qc.invalidateQueries({ queryKey: ["sales-data"] });
      qc.invalidateQueries({ queryKey: ["client_profiles"] });
    },
  });

  const setDecision = useMutation({
    mutationFn: async (payload: { a: string; b: string; decisao: DuplicateDecision["decisao"] }) => {
      const [cliente_a, cliente_b] = [payload.a, payload.b].sort();
      const { error } = await supabase
        .from("client_duplicate_decisions" as any)
        .upsert(
          { cliente_a, cliente_b, decisao: payload.decisao, updated_at: new Date().toISOString() },
          { onConflict: "cliente_a,cliente_b" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DECISIONS_KEY }),
  });

  const excludeClient = useMutation({
    mutationFn: async (payload: { nome: string; motivo?: string }) => {
      const { error } = await supabase
        .from("client_aliases" as any)
        .upsert(
          {
            canonical_name: EXCLUDED_CANONICAL,
            alias_name: payload.nome,
            motivo: payload.motivo ?? "excluído manualmente pelo usuário",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "alias_name" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
  });

  const restoreClient = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase
        .from("client_aliases" as any)
        .delete()
        .eq("alias_name", nome)
        .eq("canonical_name", EXCLUDED_CANONICAL);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ALIASES_KEY }),
  });

  const excludedClients = (aliasesQ.data ?? []).filter(
    (a) => a.canonical_name === EXCLUDED_CANONICAL,
  );

  return {
    aliases: aliasesQ.data ?? [],
    decisions: decisionsQ.data ?? [],
    isLoading: aliasesQ.isLoading || decisionsQ.isLoading,
    addAlias,
    removeAlias,
    setDecision,
    excludeClient,
    restoreClient,
    excludedClients,
  };
}
