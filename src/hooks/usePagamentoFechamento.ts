import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClienteDesconto, AjusteManual } from "@/lib/commissionCalc";
import type { OutroCredito } from "@/components/pagamento/AcertoResumoDocument";

export interface FechamentoConfig {
  pctPadrao: number;
  tiposFat: string[];
  tiposCom: string[];
  /** Categorias de bonificação elegíveis ao desconto (faturamento/comissão). */
  tiposDesconto?: string[];
  descontos: ClienteDesconto[];
  ajustes: AjusteManual[];
  participaPremiacao: boolean;
  metasAcumulativas: boolean;
  ajudaCusto: number;
  outrosCreditos: OutroCredito[];
}

export interface FechamentoRow {
  id: string;
  year_month: string;
  vendedor: string;
  config: FechamentoConfig;
  status: "open" | "closed";
  closed_at: string | null;
  updated_at: string;
}

const key = (yearMonth: string, vendedor: string) => ["pagamento-fechamento", yearMonth, vendedor] as const;

export function usePagamentoFechamento(yearMonth: string, vendedor: string) {
  return useQuery({
    queryKey: key(yearMonth, vendedor),
    enabled: !!yearMonth && !!vendedor,
    queryFn: async (): Promise<FechamentoRow | null> => {
      const { data, error } = await supabase
        .from("pagamento_fechamentos" as any)
        .select("*")
        .eq("year_month", yearMonth)
        .eq("vendedor", vendedor)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
    staleTime: 5_000,
  });
}

/** Todos os fechamentos salvos da competência (usado para bases que dependem de outros vendedores). */
export function usePagamentoFechamentosMes(yearMonth: string) {
  return useQuery({
    queryKey: ["pagamento-fechamentos-mes", yearMonth] as const,
    enabled: !!yearMonth,
    queryFn: async (): Promise<FechamentoRow[]> => {
      const { data, error } = await supabase
        .from("pagamento_fechamentos" as any)
        .select("*")
        .eq("year_month", yearMonth);
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: 5_000,
  });
}


export function useSavePagamentoFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      yearMonth: string;
      vendedor: string;
      config: FechamentoConfig;
      status: "open" | "closed";
    }) => {
      const payload = {
        year_month: params.yearMonth,
        vendedor: params.vendedor,
        config: params.config as any,
        status: params.status,
        closed_at: params.status === "closed" ? new Date().toISOString() : null,
      };
      const { data, error } = await supabase
        .from("pagamento_fechamentos" as any)
        .upsert(payload, { onConflict: "year_month,vendedor" })
        .select()
        .single();
      if (error) throw error;
      return data as any as FechamentoRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: key(row.year_month, row.vendedor) });
    },
  });
}
