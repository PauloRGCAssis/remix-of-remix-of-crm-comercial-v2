import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClientStatusRow {
  id: string;
  nome_cliente: string;
  ativo: boolean;
}

const CLIENT_STATUS_QUERY_KEY = ["client-status"] as const;

export function useClientStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: CLIENT_STATUS_QUERY_KEY,
    queryFn: async () => {
      const allRows: ClientStatusRow[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("client_status")
          .select("id, nome_cliente, ativo")
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      const map = new Map<string, boolean>();
      allRows.forEach((row) => map.set(row.nome_cliente, row.ativo));
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ nome, ativo }: { nome: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("client_status")
        .upsert({ nome_cliente: nome, ativo }, { onConflict: "nome_cliente" });

      if (error) throw error;
    },
    onMutate: async ({ nome, ativo }) => {
      await queryClient.cancelQueries({ queryKey: CLIENT_STATUS_QUERY_KEY });

      const previousStatusMap = queryClient.getQueryData<Map<string, boolean>>(CLIENT_STATUS_QUERY_KEY);

      queryClient.setQueryData<Map<string, boolean>>(CLIENT_STATUS_QUERY_KEY, (current) => {
        const next = new Map(current ?? []);
        next.set(nome, ativo);
        return next;
      });

      return { previousStatusMap };
    },
    onSuccess: (_, { ativo }) => {
      toast.success(ativo ? "Cliente marcado como ativo" : "Cliente marcado como inativo");
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(CLIENT_STATUS_QUERY_KEY, context?.previousStatusMap ?? new Map<string, boolean>());
      toast.error("Erro ao atualizar status do cliente");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENT_STATUS_QUERY_KEY });
    },
  });

  return {
    statusMap: query.data ?? new Map<string, boolean>(),
    isLoading: query.isLoading,
    toggleStatus: (nome: string, ativo: boolean) => toggleMutation.mutate({ nome, ativo }),
  };
}
