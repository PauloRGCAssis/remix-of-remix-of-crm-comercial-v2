import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Configurações administrativas do sistema (tabela app_settings).
 * Fonte única de parâmetros configuráveis (ex.: dias sem compra para reativação).
 */
export function useAppSetting<T = unknown>(key: string, defaultValue: T) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["app_settings", key],
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data) return defaultValue;
      const v = (data as any).value;
      return (v as T) ?? defaultValue;
    },
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase
        .from("app_settings" as any)
        .upsert({ key, value: value as any, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(["app_settings", key], value);
      qc.invalidateQueries({ queryKey: ["app_settings", key] });
    },
  });

  return {
    value: (query.data ?? defaultValue) as T,
    isLoading: query.isLoading,
    setValue: mutation.mutate,
    isSaving: mutation.isPending,
  };
}

export const REATIVACAO_DIAS_DEFAULT = 60;
export const REATIVACAO_DIAS_KEY = "reativacao_dias_sem_compra";
export const REATIVACAO_DIAS_OPCOES = [30, 45, 60, 90, 120, 180] as const;
