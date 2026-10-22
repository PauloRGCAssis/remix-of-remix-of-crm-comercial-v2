import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { startOfWeek, format } from "date-fns";
import { useClientScope } from "@/hooks/useClientScope";
import { useVendorScope } from "@/hooks/useVendorScope";
import { useUserRole } from "@/hooks/useUserRole";

export interface OrderClient {
  id: string;
  nome: string;
  telefone: string;
  dias_semana: string[];
  ativo: boolean;
  modo: "mensagem" | "automatico";
  modo_por_dia: Record<string, "mensagem" | "automatico">;
  vendedor?: string | null;
  criado_por?: string | null;
  observacoes: string;
}

export interface WeeklyLog {
  id: string;
  cliente_id: string;
  dia_semana: string;
  semana_date: string;
  mensagem_enviada: boolean;
  data_envio: string | null;
  respondeu: boolean;
  status_resposta: string;
  observacao: string;
}

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;

export function useAgendaPedidos(selectedWeekMonday?: string) {
  const [clients, setClients] = useState<OrderClient[]>([]);
  // Escopo global: só clientes das carteiras autorizadas ao login.
  const clientScope = useClientScope();
  const vendorScope = useVendorScope();
  const { userId } = useUserRole();
  const donoRef = useRef<{ vendedor: string | null; criador: string | null }>({ vendedor: null, criador: null });
  donoRef.current = {
    vendedor: vendorScope.vendedorPadrao,
    criador: userId,
  };
  const scopeRef = useRef(clientScope);
  scopeRef.current = clientScope;
  const [logs, setLogs] = useState<WeeklyLog[]>([]);
  const [loading, setLoading] = useState(true);

  const currentWeekMonday = useMemo(() => {
    if (selectedWeekMonday) return selectedWeekMonday;
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(d, "yyyy-MM-dd");
  }, [selectedWeekMonday]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [cRes, lRes] = await Promise.all([
      supabase.from("order_schedule_clients").select("*").order("nome"),
      supabase.from("order_schedule_weekly_log").select("*"),
    ]);
    const rows = (cRes.data ?? []) as unknown as OrderClient[];
    setClients(scopeRef.current.filtrarPorCliente(rows, (c) => c.nome));
    if (lRes.data) setLogs(lRes.data as unknown as WeeklyLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll, clientScope]);

  const upsertClient = useCallback(async (client: Partial<OrderClient> & { nome: string }) => {
    if (client.id) {
      await supabase.from("order_schedule_clients").update({
        nome: client.nome,
        telefone: client.telefone || null,
        dias_semana: client.dias_semana || [],
        ativo: client.ativo ?? true,
        modo: client.modo || "mensagem",
        observacoes: client.observacoes || null,
        updated_at: new Date().toISOString(),
      }).eq("id", client.id);
    } else {
      await supabase.from("order_schedule_clients").insert({
        nome: client.nome,
        telefone: client.telefone || null,
        dias_semana: client.dias_semana || [],
        ativo: client.ativo ?? true,
        modo: client.modo || "mensagem",
        observacoes: client.observacoes || null,
        // Proprietário do registro: sempre o vendedor/usuário logado.
        vendedor: donoRef.current.vendedor,
        criado_por_id: donoRef.current.criador,
      } as never);
    }
    await fetchAll();
  }, [fetchAll]);

  const toggleModo = useCallback(async (id: string, dia?: string) => {
    const c = clients.find(x => x.id === id);
    if (!c) return;

    if (dia) {
      // Per-day toggle
      const currentDayModo = c.modo_por_dia[dia] || c.modo;
      const newDayModo = currentDayModo === "mensagem" ? "automatico" : "mensagem";
      const newModoPorDia: Record<string, "mensagem" | "automatico"> = { ...c.modo_por_dia, [dia]: newDayModo };
      await supabase.from("order_schedule_clients").update({ modo_por_dia: newModoPorDia, updated_at: new Date().toISOString() }).eq("id", id);
      setClients(prev => prev.map(x => x.id === id ? { ...x, modo_por_dia: newModoPorDia } : x));
    } else {
      // Global toggle (fallback)
      const newModo = c.modo === "mensagem" ? "automatico" : "mensagem";
      await supabase.from("order_schedule_clients").update({ modo: newModo, updated_at: new Date().toISOString() }).eq("id", id);
      setClients(prev => prev.map(x => x.id === id ? { ...x, modo: newModo as "mensagem" | "automatico" } : x));
    }
  }, [clients]);

  const toggleAtivo = useCallback(async (id: string) => {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    await supabase.from("order_schedule_clients").update({ ativo: !c.ativo, updated_at: new Date().toISOString() }).eq("id", id);
    setClients(prev => prev.map(x => x.id === id ? { ...x, ativo: !x.ativo } : x));
  }, [clients]);

  const getOrCreateLog = useCallback(async (clienteId: string, diaSemana: string, semanaDate?: string) => {
    const week = semanaDate || currentWeekMonday;
    const existing = logs.find(l => l.cliente_id === clienteId && l.dia_semana === diaSemana && l.semana_date === week);
    if (existing) return existing;
    const { data } = await supabase.from("order_schedule_weekly_log").insert({
      cliente_id: clienteId,
      dia_semana: diaSemana,
      semana_date: week,
    }).select().single();
    if (data) {
      const newLog = data as unknown as WeeklyLog;
      setLogs(prev => [...prev, newLog]);
      return newLog;
    }
    return null;
  }, [logs, currentWeekMonday]);

  const markEnviada = useCallback(async (clienteId: string, diaSemana: string) => {
    const log = await getOrCreateLog(clienteId, diaSemana);
    if (!log) return;
    const now = new Date().toISOString();
    await supabase.from("order_schedule_weekly_log").update({
      mensagem_enviada: true,
      data_envio: now,
      updated_at: now,
    }).eq("id", log.id);
    setLogs(prev => prev.map(l => l.id === log.id ? { ...l, mensagem_enviada: true, data_envio: now } : l));
  }, [getOrCreateLog]);

  const updateResposta = useCallback(async (clienteId: string, diaSemana: string, respondeu: boolean, status: string, obs?: string) => {
    const log = await getOrCreateLog(clienteId, diaSemana);
    if (!log) return;
    await supabase.from("order_schedule_weekly_log").update({
      respondeu,
      status_resposta: status,
      observacao: obs || null,
      updated_at: new Date().toISOString(),
    }).eq("id", log.id);
    setLogs(prev => prev.map(l => l.id === log.id ? { ...l, respondeu, status_resposta: status, observacao: obs || "" } : l));
  }, [getOrCreateLog]);

  // Helper: check if client is in automatic mode for a given day
  const isAutomaticForDay = useCallback((cliente: OrderClient, dia: string): boolean => {
    const modo = cliente.modo_por_dia?.[dia] || cliente.modo;
    return modo === "automatico";
  }, []);

  // Derive effective status: automatic clients are auto-confirmed
  const getEffectiveStatus = useCallback((cliente: OrderClient, dia: string, log?: WeeklyLog | null): {
    status: string;
    label: string;
    isAuto: boolean;
    respondeu: boolean;
    mensagem_enviada: boolean;
  } => {
    const isAuto = isAutomaticForDay(cliente, dia);
    if (isAuto) {
      // Manual override wins (if user explicitly set sem_pedido for an automatic client)
      if (log && log.status_resposta && log.status_resposta !== "nao_respondeu") {
        return {
          status: log.status_resposta,
          label: log.status_resposta === "pedido_confirmado" ? "Pedido confirmado" :
                 log.status_resposta === "sem_pedido" ? "Sem pedido hoje" : "Respondeu",
          isAuto: true,
          respondeu: true,
          mensagem_enviada: true,
        };
      }
      // Default for automatic: pedido confirmado
      return {
        status: "pedido_confirmado",
        label: "Pedido confirmado",
        isAuto: true,
        respondeu: true,
        mensagem_enviada: true,
      };
    }
    // Normal flow
    return {
      status: log?.status_resposta || "nao_respondeu",
      label: log?.status_resposta ? (log.status_resposta === "pedido_confirmado" ? "Pedido confirmado" :
             log.status_resposta === "sem_pedido" ? "Sem pedido hoje" :
             log.status_resposta === "respondeu" ? "Respondeu" : "Não respondeu") : "Aguardando",
      isAuto: false,
      respondeu: log?.respondeu ?? false,
      mensagem_enviada: log?.mensagem_enviada ?? false,
    };
  }, [isAutomaticForDay]);

  // Alert: count consecutive weeks without confirmed order per day
  const getAlertForClientDay = useCallback((clienteId: string, diaSemana: string): number => {
    const clientLogs = logs
      .filter(l => l.cliente_id === clienteId && l.dia_semana === diaSemana)
      .sort((a, b) => b.semana_date.localeCompare(a.semana_date));
    let count = 0;
    for (const l of clientLogs) {
      if (l.status_resposta === "pedido_confirmado") break;
      count++;
    }
    return count;
  }, [logs]);

  const importFromSheet = useCallback(async (data: Record<string, string[]>) => {
    let created = 0;
    let updated = 0;
    const currentClients = [...clients];

    for (const dia of DIAS) {
      const names = data[dia] || [];
      for (const rawName of names) {
        if (!rawName.trim()) continue;
        const norm = normalizeClientName(rawName);
        const existing = currentClients.find(c => normalizeClientName(c.nome) === norm);
        if (existing) {
          if (!existing.dias_semana.includes(dia)) {
            const newDias = [...existing.dias_semana, dia];
            await supabase.from("order_schedule_clients").update({ dias_semana: newDias, updated_at: new Date().toISOString() }).eq("id", existing.id);
            existing.dias_semana = newDias;
            updated++;
          }
        } else {
          const { data: inserted } = await supabase.from("order_schedule_clients").insert({
            nome: rawName.trim(),
            dias_semana: [dia],
            vendedor: donoRef.current.vendedor,
            criado_por_id: donoRef.current.criador,
          }).select().single();
          if (inserted) {
            currentClients.push(inserted as unknown as OrderClient);
            created++;
          }
        }
      }
    }

    await fetchAll();
    toast({ title: "Importação concluída", description: `${created} novos, ${updated} atualizados.` });
    return { created, updated };
  }, [clients, fetchAll]);

  const activeClients = useMemo(() => clients.filter(c => c.ativo), [clients]);

  return {
    clients,
    activeClients,
    logs,
    loading,
    currentWeekMonday,
    upsertClient,
    toggleModo,
    toggleAtivo,
    markEnviada,
    updateResposta,
    getAlertForClientDay,
    importFromSheet,
    fetchAll,
    isAutomaticForDay,
    getEffectiveStatus,
  };
}
