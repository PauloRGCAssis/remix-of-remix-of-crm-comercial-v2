import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClientScope } from "@/hooks/useClientScope";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const ACAO_STATUS = ["Planejada", "Em andamento", "Encerrada", "Cancelada"] as const;
export type AcaoStatus = (typeof ACAO_STATUS)[number];

export const FORMAS_INVESTIMENTO = [
  "Dinheiro",
  "Bonificação em produtos",
  "Desconto",
  "Misto",
] as const;
export type FormaInvestimento = (typeof FORMAS_INVESTIMENTO)[number];

export const BONIFICACAO_UNIDADES = ["R$", "kg", "%"] as const;
export type BonificacaoUnidade = (typeof BONIFICACAO_UNIDADES)[number];

export interface CommercialAction {
  id: string;
  client_profile_id: string | null;
  cliente: string;
  nome: string;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  status: AcaoStatus;
  forma_investimento: FormaInvestimento;
  valor_investimento: number;
  /** Valor da bonificação (em R$, em kg ou em % do volume vendido) */
  quantidade_bonificada: number | null;
  bonificacao_unidade: BonificacaoUnidade;
  /** Produtos usados na entrega da bonificação (vazio = mix vendido) */
  bonificacao_produtos: string[];
  responsavel: string | null;
  objetivo: string | null;
  regras: string | null;
  observacoes: string | null;
  /** Integração com Degustações */
  possui_degustacoes: boolean;
  degustacao_ids: string[];
  custo_kg_degustacao: number;
  valor_promotora: number;
  outros_custos: number;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}


export type CommercialActionInput = Omit<
  CommercialAction,
  "id" | "created_at" | "updated_at" | "criado_por" | "atualizado_por"
>;

export interface CommercialActionHistory {
  id: string;
  action_id: string;
  evento: string;
  autor: string | null;
  alteracoes: { campo: string; de: string; para: string }[];
  created_at: string;
}

const QK = ["commercial_actions"] as const;
const QK_TYPES = ["commercial_action_types"] as const;
const QK_HISTORY = ["commercial_action_history"] as const;

const FIELD_LABELS: Record<string, string> = {
  cliente: "Cliente",
  nome: "Nome da ação",
  tipo: "Tipo",
  data_inicio: "Data inicial",
  data_fim: "Data final",
  status: "Status",
  forma_investimento: "Forma do investimento",
  valor_investimento: "Valor do investimento",
  quantidade_bonificada: "Valor da bonificação",
  bonificacao_unidade: "Unidade da bonificação",
  bonificacao_produtos: "Produtos da bonificação",
  responsavel: "Responsável",
  objetivo: "Objetivo",
  regras: "Regras",
  observacoes: "Observações",
  possui_degustacoes: "Possui degustações",
  custo_kg_degustacao: "Custo por kg degustado",
  valor_promotora: "Valor da promotora",
  outros_custos: "Outros custos",
};


function diffFields(before: any, after: any) {
  const out: { campo: string; de: string; para: string }[] = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    if (!(key in after)) continue;
    const a = before?.[key] ?? "";
    const b = after?.[key] ?? "";
    if (String(a) !== String(b)) {
      out.push({ campo: FIELD_LABELS[key], de: String(a || "—"), para: String(b || "—") });
    }
  }
  return out;
}

function normalize(row: any): CommercialAction {
  return {
    ...row,
    valor_investimento: Number(row.valor_investimento ?? 0),
    quantidade_bonificada:
      row.quantidade_bonificada == null ? null : Number(row.quantidade_bonificada),
    possui_degustacoes: row.possui_degustacoes === true,
    degustacao_ids: Array.isArray(row.degustacao_ids) ? row.degustacao_ids : [],
    bonificacao_produtos: Array.isArray(row.bonificacao_produtos) ? row.bonificacao_produtos : [],
    custo_kg_degustacao: Number(row.custo_kg_degustacao ?? 0),
    valor_promotora: Number(row.valor_promotora ?? 100),
    outros_custos: Number(row.outros_custos ?? 0),
  } as CommercialAction;
}


async function currentUserLabel(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? "Sistema";
  } catch {
    return "Sistema";
  }
}

export function useCommercialActionTypes() {
  const qc = useQueryClient();
  const { exigir } = useModuleCrud("acoes_comerciais", "tipos de ação comercial");
  const list = useQuery({
    queryKey: QK_TYPES,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("commercial_action_types")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (nome: string) => {
      exigir("criar");
      const clean = nome.trim();
      if (!clean) throw new Error("Informe o nome do tipo");
      const { data, error } = await (supabase as any)
        .from("commercial_action_types")
        .insert({ nome: clean })
        .select()
        .single();
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate"))
          throw new Error("Esse tipo já existe.");
        throw error;
      }
      return data as { id: string; nome: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_TYPES }),
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar tipo"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      exigir("excluir");
      const { error } = await (supabase as any)
        .from("commercial_action_types")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_TYPES }),
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir tipo"),
  });

  return { list, create, remove };
}

export function useCommercialActionHistory(actionId?: string) {
  return useQuery({
    queryKey: [...QK_HISTORY, actionId ?? "none"],
    enabled: !!actionId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("commercial_action_history")
        .select("*")
        .eq("action_id", actionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        alteracoes: Array.isArray(r.alteracoes) ? r.alteracoes : [],
      })) as CommercialActionHistory[];
    },
  });
}

export function useCommercialActions() {
  const qc = useQueryClient();
  const clientScope = useClientScope();
  const { exigir } = useModuleCrud("acoes_comerciais", "ações comerciais");

  const list = useQuery({
    queryKey: QK,
    select: useCallback(
      (rows: CommercialAction[]) => clientScope.filtrarPorCliente(rows, (r) => r.cliente),
      [clientScope],
    ),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("commercial_actions")
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: async (
      input: CommercialActionInput & { copiadaDe?: { id: string; nome: string; cliente: string } | null },
    ) => {
      exigir("criar"); // inclui duplicar e copiar para vários clientes
      const { copiadaDe, ...payload } = input as any;
      const autor = await currentUserLabel();
      const { data, error } = await (supabase as any)
        .from("commercial_actions")
        .insert({ ...payload, criado_por: autor, atualizado_por: autor })
        .select()
        .single();
      if (error) throw error;
      const alteracoes = diffFields({}, payload);
      if (copiadaDe) {
        alteracoes.unshift(
          { campo: "Origem da cópia (ID)", de: "—", para: String(copiadaDe.id) },
          { campo: "Origem da cópia (ação)", de: "—", para: `${copiadaDe.nome} — ${copiadaDe.cliente}` },
          { campo: "Nova ação (ID)", de: "—", para: String(data.id) },
          { campo: "Data da cópia", de: "—", para: new Date().toISOString() },
        );
      }
      await (supabase as any).from("commercial_action_history").insert({
        action_id: data.id,
        evento: copiadaDe ? "Cópia" : "Criação",
        autor,
        alteracoes,
      });
      return normalize(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: QK_HISTORY });
      toast.success("Ação comercial cadastrada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao cadastrar ação"),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
      before,
    }: {
      id: string;
      patch: Partial<CommercialActionInput>;
      before?: CommercialAction;
    }) => {
      exigir("editar"); // inclui alteração de status
      const autor = await currentUserLabel();
      const { error } = await (supabase as any)
        .from("commercial_actions")
        .update({ ...patch, atualizado_por: autor })
        .eq("id", id);
      if (error) throw error;
      const alteracoes = diffFields(before ?? {}, patch);
      if (alteracoes.length) {
        await (supabase as any).from("commercial_action_history").insert({
          action_id: id,
          evento: "Edição",
          autor,
          alteracoes,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: QK_HISTORY });
      toast.success("Ação comercial atualizada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar ação"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      exigir("excluir");
      const { error } = await (supabase as any).from("commercial_actions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Ação comercial excluída");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir ação"),
  });

  return { list, create, update, remove };
}

/** Dias restantes até o fim da ação (negativo quando já encerrou). */
export function diasRestantes(dataFim: string, hoje = new Date()): number {
  const fim = new Date(`${dataFim}T00:00:00`);
  const ref = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim.getTime() - ref.getTime()) / 86_400_000);
}

export const ALERTA_MARCOS = [30, 15, 7, 1];

export function marcoAlerta(dias: number): number | null {
  if (dias < 0) return null;
  return ALERTA_MARCOS.includes(dias) ? dias : null;
}
