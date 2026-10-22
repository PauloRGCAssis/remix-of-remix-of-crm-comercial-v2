import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Recorte salvo junto com a análise, para reabrir/duplicar sem consumir IA. */
export interface AnalysisFiltros {
  modo?: string;
  modoLabel?: string;
  periodoAtual?: { inicio: string; fim: string };
  periodoComparacao?: { inicio: string; fim: string } | null;
  descricaoComparacao?: string;
  vendedores?: string[];
  clientes?: string[];
  produtos?: string[];
  grupos?: string[];
  pergunta?: string;
  /** Como a resposta foi produzida: consulta local (sem IA) ou análise com IA. */
  origem?: "consulta" | "ia";
}

export interface AnalysisSession {
  id: string;
  titulo: string;
  status: "em_construcao" | "aprovada" | "pdf_gerado";
  periodo_inicio: string | null;
  periodo_fim: string | null;
  versao_aprovada: number | null;
  filtros: AnalysisFiltros | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  payload: AnaliseEstruturada | null;
  versao: number | null;
  created_at: string;
}

export interface AnaliseKpi {
  label: string;
  valor: string;
  sub?: string;
  variacao?: string;
  sentido?: "positivo" | "negativo" | "neutro";
}

export interface AnaliseBloco {
  tipo: "texto" | "kpis" | "tabela" | "grafico" | "alerta" | "destaque";
  titulo: string;
  texto?: string;
  kpis?: AnaliseKpi[];
  tabela?: { colunas: string[]; linhas: string[][] };
  grafico?: { tipo: "linha" | "barra"; categorias: string[]; series: { nome: string; valores: number[] }[]; unidade?: string };
  detalhes?: { titulo?: string; colunas: string[]; linhas: string[][] };
}

export interface AnaliseSlide {
  tipo: "capa" | "resumo" | "kpis" | "tabela" | "grafico" | "lista" | "texto" | "perguntas";
  titulo: string;
  subtitulo?: string;
  texto?: string;
  bullets?: string[];
  kpis?: AnaliseKpi[];
  tabela?: { colunas: string[]; linhas: string[][] };
  grafico?: { tipo: "linha" | "barra"; categorias: string[]; series: { nome: string; valores: number[] }[]; unidade?: string };
  perguntas?: { pergunta: string; resposta: string }[];
}

export interface AnaliseEstruturada {
  titulo: string;
  resumo_executivo: string;
  periodo_descricao?: string;
  comparacao_descricao?: string;
  blocos: AnaliseBloco[];
  fatos?: string[];
  indicios?: string[];
  hipoteses?: string[];
  riscos?: string[];
  oportunidades?: string[];
  recomendacoes?: string[];
  plano_acao?: string[];
  perguntas_diretoria?: { pergunta: string; resposta: string }[];
  apresentacao?: { slides: AnaliseSlide[] };
  leitura_gerencial?: string;
  alertas_dados?: string[];
  /** Como a resposta foi produzida: consulta local (sem IA) ou análise com IA. */
  origem?: "consulta" | "ia";
}


const db = supabase as any;

export function useAnalysisSessions() {
  return useQuery({
    queryKey: ["analysis-sessions"],
    queryFn: async (): Promise<AnalysisSession[]> => {
      const { data, error } = await db
        .from("analysis_sessions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AnalysisSession[];
    },
  });
}

export function useAnalysisMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ["analysis-messages", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<AnalysisMessage[]> => {
      const { data, error } = await db
        .from("analysis_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AnalysisMessage[];
    },
  });
}

export function useCentralAnaliseActions() {
  const qc = useQueryClient();

  const invalidate = (sessionId?: string | null) => {
    qc.invalidateQueries({ queryKey: ["analysis-sessions"] });
    if (sessionId) qc.invalidateQueries({ queryKey: ["analysis-messages", sessionId] });
  };

  const criarSessao = useMutation({
    mutationFn: async (input: { titulo: string; periodoInicio: string; periodoFim: string; filtros?: AnalysisFiltros }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("analysis_sessions")
        .insert({
          titulo: input.titulo.slice(0, 120),
          periodo_inicio: input.periodoInicio,
          periodo_fim: input.periodoFim,
          filtros: input.filtros ?? {},
          user_id: userData.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AnalysisSession;
    },
    onSuccess: () => invalidate(),
  });

  const salvarMensagem = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      role: "user" | "assistant";
      content: string;
      payload?: AnaliseEstruturada | null;
      versao?: number | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("analysis_messages")
        .insert({
          session_id: input.sessionId,
          role: input.role,
          content: input.content,
          payload: input.payload ?? null,
          versao: input.versao ?? null,
          user_id: userData.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AnalysisMessage;
    },
    onSuccess: (_d, vars) => invalidate(vars.sessionId),
  });

  const atualizarSessao = useMutation({
    mutationFn: async (input: { sessionId: string; patch: Partial<AnalysisSession> & { pdf_gerado_em?: string } }) => {
      const { error } = await db.from("analysis_sessions").update(input.patch).eq("id", input.sessionId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidate(vars.sessionId),
  });

  const excluirSessao = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await db.from("analysis_sessions").delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  return { criarSessao, salvarMensagem, atualizarSessao, excluirSessao };
}

export async function chamarCentralAnalise(input: {
  pergunta: string;
  analysisContext: unknown;
  historico: { role: "user" | "assistant"; content: string }[];
}): Promise<AnaliseEstruturada> {
  const { data, error } = await supabase.functions.invoke("central-analise", { body: input });
  if (error) {
    const msg = (error as any)?.context?.status === 429
      ? "Limite de uso da IA atingido. Tente novamente em instantes."
      : error.message || "Falha ao consultar a Central de Análise.";
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).analise as AnaliseEstruturada;
}

