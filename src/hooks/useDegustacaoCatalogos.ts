import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useModuleCrud } from "@/hooks/useModuleCrud";

export interface CatalogoItem {
  id: string;
  nome: string;
}

type TableName = "degustacao_materiais" | "degustacao_equipamentos";

function useCatalogo(table: TableName, labelSingular: string) {
  const qc = useQueryClient();
  const QK = [table] as const;
  // Catálogos do formulário de degustação seguem as permissões do módulo.
  const { exigir } = useModuleCrud("degustacoes", "catálogos de degustação");

  const list = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("id, nome")
        .order("nome", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as CatalogoItem[];
    },
  });

  const create = useMutation({
    mutationFn: async (nome: string) => {
      exigir("criar");
      const trimmed = nome.trim();
      if (!trimmed) throw new Error("Informe um nome");
      const { data, error } = await supabase
        .from(table as any)
        .insert({ nome: trimmed } as any)
        .select()
        .single();
      if (error) {
        if (error.code === "23505") throw new Error(`Já existe um ${labelSingular} com este nome`);
        throw error;
      }
      return (data as unknown) as CatalogoItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success(`${labelSingular} cadastrado`);
    },
    onError: (e: any) => toast.error(e.message ?? `Erro ao cadastrar ${labelSingular}`),
  });

  const update = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      exigir("editar");
      const { error } = await supabase
        .from(table as any)
        .update({ nome: nome.trim() } as any)
        .eq("id", id);
      if (error) {
        if (error.code === "23505") throw new Error(`Já existe um ${labelSingular} com este nome`);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success(`${labelSingular} atualizado`);
    },
    onError: (e: any) => toast.error(e.message ?? `Erro ao atualizar ${labelSingular}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      exigir("excluir");
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success(`${labelSingular} removido`);
    },
    onError: (e: any) => toast.error(e.message ?? `Erro ao remover ${labelSingular}`),
  });

  return { list, create, update, remove };
}

export const useMateriais = () => useCatalogo("degustacao_materiais", "material");
export const useEquipamentos = () => useCatalogo("degustacao_equipamentos", "equipamento");
