import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClientScope } from "@/hooks/useClientScope";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalizePromotoras, type PromotoraItem } from "@/lib/degustacaoPromotoras";

export type DegustacaoStatus = "pendente" | "realizada" | "cancelada";

export interface DegustacaoProduto {
  produto_id: string;
  nome: string;
  quantidade: number;
}

export interface Degustacao {
  id: string;
  cliente: string;
  contato_cliente: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  data: string; // YYYY-MM-DD
  data_entrega_materiais: string | null;
  horario: string | null;
  promotora: string | null;
  promotoras: PromotoraItem[];
  horas_evento: number;
  status: DegustacaoStatus;
  observacoes: string | null;
  materiais: string[];
  equipamentos: string[];
  produtos: DegustacaoProduto[];
  created_at: string;
  updated_at: string;
}

export type DegustacaoInput = Omit<Degustacao, "id" | "created_at" | "updated_at">;

const QK = ["degustacoes"] as const;

function normalize(row: any): Degustacao {
  return {
    ...row,
    materiais: Array.isArray(row.materiais) ? row.materiais : [],
    equipamentos: Array.isArray(row.equipamentos) ? row.equipamentos : [],
    produtos: Array.isArray(row.produtos) ? row.produtos : [],
    contato_cliente: row.contato_cliente ?? null,
    data_entrega_materiais: row.data_entrega_materiais ?? null,
    promotoras: normalizePromotoras(row.promotoras),
    horas_evento: Number(row.horas_evento ?? 4) || 4,
  } as Degustacao;
}

export function useDegustacoes() {
  const qc = useQueryClient();
  const clientScope = useClientScope();
  const { exigir } = useModuleCrud("degustacoes", "degustações");

  const list = useQuery({
    queryKey: QK,
    select: useCallback(
      (rows: Degustacao[]) => clientScope.filtrarPorCliente(rows, (r) => r.cliente),
      [clientScope],
    ),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("degustacoes")
        .select("*")
        // Padrão: última alteração primeiro (criação ou edição sobem ao topo).
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
  });

  const create = useMutation({
    mutationFn: async (input: DegustacaoInput) => {
      exigir("criar");
      const { data, error } = await supabase
        .from("degustacoes")
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return normalize(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Degustação cadastrada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao cadastrar"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DegustacaoInput> }) => {
      exigir("editar"); // inclui status e confirmação
      const { error } = await supabase.from("degustacoes").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Degustação atualizada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      exigir("excluir");
      const { error } = await supabase.from("degustacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Degustação excluída");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  const bulkInsert = useMutation({
    mutationFn: async (rows: DegustacaoInput[]) => {
      exigir("criar"); // duplicação em lote
      if (!rows.length) return [] as Degustacao[];
      const { data, error } = await supabase.from("degustacoes").insert(rows as any).select();
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success(`${vars.length} degustações duplicadas`);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao duplicar"),
  });

  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: DegustacaoStatus }) => {
      exigir("editar");
      if (!ids.length) return 0;
      const { error } = await supabase.from("degustacoes").update({ status }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: QK });
      if (count) toast.success(`${count} degustações atualizadas`);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar em massa"),
  });

  return { list, create, update, remove, bulkInsert, bulkUpdateStatus };
}
