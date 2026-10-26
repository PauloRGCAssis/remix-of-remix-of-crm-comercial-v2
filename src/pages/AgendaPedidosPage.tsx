import { PodeCriar } from "@/components/PodeCriar";
import { useState, useMemo, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAgendaPedidos, OrderClient } from "@/hooks/useAgendaPedidos";
import { getCommercialWeeks, getMonthOptions, getCurrentYearMonth, getCurrentWeekMonday, CommercialWeek } from "@/lib/commercialWeeks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Upload, Search, MessageCircle, AlertTriangle, Users, Send,
  CheckCircle, Clock, X, Plus, Trash2, Pencil, Ban, ChevronLeft, ChevronRight, CalendarDays
} from "lucide-react";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import * as XLSX from "xlsx";
import { usePersistentState } from "@/hooks/usePersistentState";
import { EscopoUsuarioBar } from "@/components/EscopoUsuarioBar";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;

const STATUS_LABELS: Record<string, string> = {
  nao_respondeu: "Não respondeu",
  respondeu: "Respondeu",
  pedido_confirmado: "Pedido confirmado",
  sem_pedido: "Sem pedido hoje",
};

export default function AgendaPedidosPage() {
  // Month/Week navigation
  const [selectedMonth, setSelectedMonth] = usePersistentState("agenda-pedidos:selectedMonth", getCurrentYearMonth());
  const weeks = useMemo(() => getCommercialWeeks(selectedMonth), [selectedMonth]);
  const todayMonday = useMemo(() => getCurrentWeekMonday(), []);

  const [selectedWeekMonday, setSelectedWeekMonday] = usePersistentState<string>("agenda-pedidos:selectedWeekMonday", () => {
    const initialMonth = getCurrentYearMonth();
    const initialWeeks = getCommercialWeeks(initialMonth);
    const today = getCurrentWeekMonday();

    return initialWeeks.find((week) => week.monday === today)?.monday ?? initialWeeks[0]?.monday ?? today;
  });

  useEffect(() => {
    if (weeks.some((week) => week.monday === selectedWeekMonday)) {
      return;
    }

    const todayWeek = weeks.find((week) => week.monday === todayMonday);
    setSelectedWeekMonday(todayWeek?.monday ?? weeks[0]?.monday ?? todayMonday);
  }, [weeks, selectedWeekMonday, todayMonday]);

  const selectedWeek = useMemo(() => weeks.find((week) => week.monday === selectedWeekMonday), [weeks, selectedWeekMonday]);
  const selectedWeekIndex = useMemo(() => weeks.findIndex((week) => week.monday === selectedWeekMonday), [weeks, selectedWeekMonday]);

  const {
    activeClients: _allActiveClients, clients, logs, loading, currentWeekMonday,
    upsertClient, toggleModo, toggleAtivo, markEnviada, updateResposta,
    getAlertForClientDay, importFromSheet, isAutomaticForDay, getEffectiveStatus,
  } = useAgendaPedidos(selectedWeekMonday);

  const [statusFilter, setStatusFilter] = usePersistentState<string>("agenda-pedidos:statusFilter", "ativos");

  // `activeClients` here follows the status filter: default shows only active clients (preserving
  // previous behavior — inactive clients don't generate pending items / alerts / batch actions).
  // When the user picks "Inativos" or "Todos", inactive rows are surfaced so the ATIVO button
  // can be used to reactivate them without losing history/config.
  const activeClients = useMemo(() => {
    if (statusFilter === "inativos") return clients.filter(c => !c.ativo);
    if (statusFilter === "todos") return clients;
    return clients.filter(c => c.ativo);
  }, [clients, statusFilter]);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const goToPrevWeek = useCallback(() => {
    if (selectedWeekIndex > 0) {
      setSelectedWeekMonday(weeks[selectedWeekIndex - 1].monday);
    } else {
      // Go to previous month's last week
      const [y, m] = selectedMonth.split("-").map(Number);
      const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
      const prevWeeks = getCommercialWeeks(prevMonth);
      if (prevWeeks.length > 0) {
        setSelectedMonth(prevMonth);
        setSelectedWeekMonday(prevWeeks[prevWeeks.length - 1].monday);
      }
    }
  }, [selectedWeekIndex, weeks, selectedMonth]);

  const goToNextWeek = useCallback(() => {
    if (selectedWeekIndex < weeks.length - 1) {
      setSelectedWeekMonday(weeks[selectedWeekIndex + 1].monday);
    } else {
      // Go to next month's first week
      const [y, m] = selectedMonth.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const nextWeeks = getCommercialWeeks(nextMonth);
      if (nextWeeks.length > 0) {
        setSelectedMonth(nextMonth);
        setSelectedWeekMonday(nextWeeks[0].monday);
      }
    }
  }, [selectedWeekIndex, weeks, selectedMonth]);

  const goToCurrentWeek = useCallback(() => {
    const currentMonth = getCurrentYearMonth();
    setSelectedMonth(currentMonth);
    setSelectedWeekMonday(getCurrentWeekMonday());
  }, []);

  const [diaFilter, setDiaFilter] = usePersistentState<string>("agenda-pedidos:diaFilter", "todos");
  const [modoFilter, setModoFilter] = usePersistentState<string>("agenda-pedidos:modoFilter", "todos");
  const [respostaFilter, setRespostaFilter] = usePersistentState<string>("agenda-pedidos:respostaFilter", "todos");
  const [searchTerm, setSearchTerm] = usePersistentState("agenda-pedidos:searchTerm", "");
  const [selectedKeys, setSelectedKeys] = usePersistentState<string[]>("agenda-pedidos:selectedKeys", []);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const setSelected = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelectedKeys((prevKeys) => {
      const prevSet = new Set(prevKeys);
      const nextSet = typeof updater === "function" ? updater(prevSet) : updater;
      return Array.from(nextSet);
    });
  }, [setSelectedKeys]);
  const [editClient, setEditClient] = useState<OrderClient | null>(null);
  const [editDias, setEditDias] = useState<string[]>([]);
  const [editTelefone, setEditTelefone] = useState("");
  const [editObs, setEditObs] = useState("");
  const [msgTemplate, setMsgTemplate] = usePersistentState("agenda-pedidos:msgTemplate", "Olá {cliente}, tudo bem? Estou passando para confirmar seu pedido da rota de {dia_semana}. Pode me informar, por favor?");
  const [showTemplateDialog, setShowTemplateDialog] = usePersistentState("agenda-pedidos:showTemplateDialog", false);
  const [respDialog, setRespDialog] = useState<{ clientId: string; dia: string } | null>(null);
  const [respStatus, setRespStatus] = usePersistentState("agenda-pedidos:respStatus", "nao_respondeu");
  const [respObs, setRespObs] = usePersistentState("agenda-pedidos:respObs", "");
  const [showNewClient, setShowNewClient] = usePersistentState("agenda-pedidos:showNewClient", false);
  const [newNome, setNewNome] = usePersistentState("agenda-pedidos:newNome", "");
  const [newTelefone, setNewTelefone] = usePersistentState("agenda-pedidos:newTelefone", "");
  const [newDias, setNewDias] = usePersistentState<string[]>("agenda-pedidos:newDias", []);
  const [newObs, setNewObs] = usePersistentState("agenda-pedidos:newObs", "");
  const [batchRespDialog, setBatchRespDialog] = useState<string[] | null>(null);
  const [batchRespStatus, setBatchRespStatus] = usePersistentState("agenda-pedidos:batchRespStatus", "respondeu");
  const [batchRespObs, setBatchRespObs] = usePersistentState("agenda-pedidos:batchRespObs", "");

  // Drag-and-drop action dialog
  const [dndDialog, setDndDialog] = useState<{ client: OrderClient; fromDia: string; toDia: string } | null>(null);

  const clearSelectedKeys = useCallback((keys?: string[]) => {
    if (!keys) {
      setSelected(new Set());
      return;
    }

    setSelected(prev => {
      const next = new Set(prev);
      keys.forEach(key => next.delete(key));
      return next;
    });
  }, []);

  // Batch actions - extract dia from selection key (id|dia). Skip automatic clients.
  const batchMarkEnviada = useCallback(async (selectionKeys?: string[]) => {
    const keys = selectionKeys ?? Array.from(selected);
    if (!keys.length) return;

    let skipped = 0;
    for (const key of keys) {
      const [id, dia] = key.split("|");
      const client = activeClients.find(c => c.id === id);
      const targetDia = dia || (diaFilter !== "todos" ? diaFilter : "Segunda");
      if (client && isAutomaticForDay(client, targetDia)) {
        skipped++;
        continue;
      }
      await markEnviada(id, targetDia);
    }
    const sent = keys.length - skipped;
    toast({ title: `${sent} marcados como enviados${skipped ? ` • ${skipped} automáticos ignorados` : ""}` });
    clearSelectedKeys(keys);
  }, [selected, diaFilter, markEnviada, clearSelectedKeys, activeClients, isAutomaticForDay]);

  const batchUpdateResposta = useCallback(async (status: string, obs = "", selectionKeys?: string[]) => {
    const keys = selectionKeys ?? Array.from(selected);
    if (!keys.length) return;

    for (const key of keys) {
      const [id, dia] = key.split("|");
      const d = dia || (diaFilter !== "todos" ? diaFilter : "Segunda");
      await updateResposta(id, d, status !== "nao_respondeu", status, obs);
    }
    toast({ title: `${keys.length} clientes atualizados` });
    clearSelectedKeys(keys);
  }, [selected, diaFilter, updateResposta, clearSelectedKeys]);

  const batchRemoveFromDay = useCallback(async (selectionKeys?: string[]) => {
    const keys = selectionKeys ?? Array.from(selected);
    if (!keys.length) return;

    for (const key of keys) {
      const [id, dia] = key.split("|");
      const client = activeClients.find(c => c.id === id);
      if (!client || !dia) continue;
      await removeClientFromDay(client, dia, { silent: true });
    }
    toast({ title: `${keys.length} clientes removidos` });
    clearSelectedKeys(keys);
  }, [selected, activeClients, clearSelectedKeys]);

  const openBatchResponseDialog = useCallback((selectionKeys?: string[]) => {
    const keys = selectionKeys ?? Array.from(selected);
    if (!keys.length) return;

    setBatchRespStatus("respondeu");
    setBatchRespObs("");
    setBatchRespDialog(keys);
  }, [selected, activeClients]);

  const getClientRespostaStatus = useCallback((clientId: string) => {
    const client = activeClients.find(c => c.id === clientId);
    const clientLogs = logs.filter(l => l.cliente_id === clientId && l.semana_date === currentWeekMonday);

    // For each day the client is in, check effective status (automatic = confirmed)
    if (client) {
      const hasAutoDay = client.dias_semana.some(d => isAutomaticForDay(client, d));
      // Manual override on any day wins
      const hasOverride = clientLogs.some(l => l.status_resposta === "sem_pedido");
      if (hasAutoDay && !hasOverride && clientLogs.every(l => !l.status_resposta || l.status_resposta === "nao_respondeu" || l.status_resposta === "pedido_confirmado")) {
        return "pedido_confirmado";
      }
    }

    if (clientLogs.length === 0) return "sem_registro";
    if (clientLogs.some(l => l.status_resposta === "pedido_confirmado")) return "pedido_confirmado";
    if (clientLogs.some(l => l.status_resposta === "sem_pedido")) return "sem_pedido";
    if (clientLogs.some(l => l.respondeu)) return "respondeu";
    if (clientLogs.some(l => l.mensagem_enviada && !l.respondeu)) return "pendente";
    return "sem_registro";
  }, [logs, currentWeekMonday, activeClients, isAutomaticForDay]);

  // Filter clients
  const filteredClients = useMemo(() => {
    let list = [...activeClients];
    if (searchTerm) {
      const needle = searchTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      list = list.filter(c => {
        const haystack = c.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return haystack.includes(needle);
      });
    }
    if (diaFilter !== "todos") {
      list = list.filter(c => c.dias_semana.includes(diaFilter));
    }
    if (modoFilter !== "todos") {
      list = list.filter(c => c.modo === modoFilter);
    }
    if (respostaFilter !== "todos") {
      list = list.filter(c => {
        const status = getClientRespostaStatus(c.id);
        return status === respostaFilter;
      });
    }
    return list;
  }, [activeClients, diaFilter, modoFilter, searchTerm, respostaFilter, getClientRespostaStatus]);

  // Stats
  const stats = useMemo(() => {
    const shown = filteredClients.length;
    const auto = filteredClients.filter(c => c.modo === "automatico").length;
    const msg = shown - auto;
    const currentLogs = logs.filter(l => l.semana_date === currentWeekMonday);
    const enviadas = filteredClients.filter(c => currentLogs.some(l => l.cliente_id === c.id && l.mensagem_enviada)).length;
    const responderam = filteredClients.filter(c => currentLogs.some(l => l.cliente_id === c.id && l.respondeu)).length;
    return { shown, auto, msg, enviadas, responderam, pendentes: enviadas - responderam };
  }, [filteredClients, logs, currentWeekMonday]);

  // Import handler
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { header: 1, raw: false }) as unknown as string[][];
    if (!json.length) return;

    let headerRowIdx = -1;
    const dayMap: Record<string, number> = {};
    for (let r = 0; r < Math.min(json.length, 10); r++) {
      const row = json[r];
      if (!row) continue;
      let foundDays = 0;
      const tempMap: Record<string, number> = {};
      row.forEach((h: string, i: number) => {
        if (!h) return;
        const normalized = h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        for (const dia of DIAS) {
          const diaNorm = dia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (normalized.includes(diaNorm)) { tempMap[dia] = i; foundDays++; }
        }
      });
      if (foundDays >= 3) { headerRowIdx = r; Object.assign(dayMap, tempMap); break; }
    }
    if (headerRowIdx === -1) { toast({ title: "❌ Não encontrei os dias da semana na planilha", variant: "destructive" }); return; }

    const data: Record<string, string[]> = {};
    for (const dia of DIAS) {
      data[dia] = [];
      const col = dayMap[dia];
      if (col === undefined) continue;
      for (let r = headerRowIdx + 1; r < json.length; r++) {
        const val = json[r]?.[col];
        if (val && val.trim()) data[dia].push(val.trim());
      }
    }
    await importFromSheet(data);
    e.target.value = "";
  }, [importFromSheet]);

  // WhatsApp
  const openWhatsApp = useCallback((client: OrderClient, dia: string) => {
    const phone = (client.telefone || "").replace(/\D/g, "");
    const msg = msgTemplate
      .replace("{cliente}", client.nome)
      .replace("{dia_semana}", dia.toLowerCase())
      .replace("{dias_semana}", client.dias_semana.join(", ").toLowerCase());
    const url = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    markEnviada(client.id, dia);
  }, [msgTemplate, markEnviada]);

  const openSelectedWhatsApp = useCallback((selectionKeys?: string[]) => {
    const keys = selectionKeys ?? Array.from(selected);
    if (!keys.length) return;

    keys.forEach(key => {
      const [id, dia] = key.split("|");
      const client = activeClients.find(x => x.id === id);
      const targetDia = dia || (diaFilter !== "todos" ? diaFilter : DIAS[new Date().getDay() - 1] || "Segunda");
      if (client) openWhatsApp(client, targetDia);
    });

    clearSelectedKeys(keys);
  }, [selected, activeClients, diaFilter, openWhatsApp, clearSelectedKeys]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = (dia: string) => {
    const dayClients = getClientsForDay(dia);
    const allSelected = dayClients.every(c => selected.has(`${c.id}|${dia}`));
    setSelected(prev => {
      const n = new Set(prev);
      dayClients.forEach(c => {
        const key = `${c.id}|${dia}`;
        if (allSelected) n.delete(key); else n.add(key);
      });
      return n;
    });
  };

  const openEdit = (c: OrderClient) => {
    setEditClient(c);
    setEditDias([...c.dias_semana]);
    setEditTelefone(c.telefone || "");
    setEditObs(c.observacoes || "");
  };

  const saveEdit = async () => {
    if (!editClient) return;
    if (!editClient.nome.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    await upsertClient({ ...editClient, nome: editClient.nome.trim(), dias_semana: editDias, telefone: editTelefone, observacoes: editObs });
    setEditClient(null);
    toast({ title: "Cliente atualizado!" });
  };

  const saveNewClient = async () => {
    if (!newNome.trim()) { toast({ title: "Informe o nome do cliente", variant: "destructive" }); return; }
    if (newDias.length === 0) { toast({ title: "Selecione ao menos um dia", variant: "destructive" }); return; }
    await upsertClient({ nome: newNome.trim(), dias_semana: newDias, telefone: newTelefone, observacoes: newObs });
    setShowNewClient(false);
    setNewNome(""); setNewTelefone(""); setNewDias([]); setNewObs("");
    toast({ title: "Cliente cadastrado!" });
  };

  const removeClientFromDay = async (client: OrderClient, dia: string, options?: { silent?: boolean }) => {
    const remaining = client.dias_semana.filter(d => d !== dia);
    if (remaining.length === 0) {
      await toggleAtivo(client.id);
      if (!options?.silent) {
        toast({ title: `${client.nome} desativado` });
      }
    } else {
      await upsertClient({ ...client, dias_semana: remaining });
      if (!options?.silent) {
        toast({ title: `${client.nome} removido de ${dia}` });
      }
    }
  };

  const getLogForClient = (clientId: string, dia: string) =>
    logs.find(l => l.cliente_id === clientId && l.dia_semana === dia && l.semana_date === currentWeekMonday);

  const getClientsForDay = (dia: string) => {
    let list = activeClients.filter(c => c.dias_semana.includes(dia));
    if (searchTerm) {
      const needle = searchTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      list = list.filter(c => {
        const haystack = c.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return haystack.includes(needle);
      });
    }
    if (modoFilter !== "todos") {
      list = list.filter(c => c.modo === modoFilter);
    }
    if (respostaFilter !== "todos") {
      list = list.filter(c => {
        const status = getClientRespostaStatus(c.id);
        return status === respostaFilter;
      });
    }
    return list;
  };

  // Drag and drop handler
  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const fromDia = result.source.droppableId;
    const toDia = result.destination.droppableId;
    if (fromDia === toDia) return;

    const clientId = result.draggableId.split("|")[0];
    const client = activeClients.find(c => c.id === clientId);
    if (!client) return;

    setDndDialog({ client, fromDia, toDia });
  }, [activeClients]);

  const handleDndAction = async (action: "move" | "add" | "replace") => {
    if (!dndDialog) return;
    const { client, fromDia, toDia } = dndDialog;

    if (action === "move") {
      const newDias = client.dias_semana.filter(d => d !== fromDia);
      if (!newDias.includes(toDia)) newDias.push(toDia);
      await upsertClient({ ...client, dias_semana: newDias });
      toast({ title: `${client.nome}: ${fromDia} → ${toDia}` });
    } else if (action === "add") {
      const newDias = [...client.dias_semana];
      if (!newDias.includes(toDia)) newDias.push(toDia);
      await upsertClient({ ...client, dias_semana: newDias });
      toast({ title: `${client.nome}: adicionado em ${toDia}` });
    } else if (action === "replace") {
      await upsertClient({ ...client, dias_semana: [toDia] });
      toast({ title: `${client.nome}: somente ${toDia}` });
    }
    setDndDialog(null);
  };

  // --- Render ---

  const renderClientCard = (c: OrderClient, dia: string, index: number) => {
    const log = getLogForClient(c.id, dia);
    const alertCount = getAlertForClientDay(c.id, dia);
    const selKey = `${c.id}|${dia}`;
    const isAuto = isAutomaticForDay(c, dia);
    const effective = getEffectiveStatus(c, dia, log);

    return (
      <Draggable draggableId={selKey} index={index} key={selKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`rounded-lg border bg-card p-3 mb-2 transition-shadow ${
              snapshot.isDragging ? "shadow-lg ring-2 ring-primary/40" : "shadow-sm hover:shadow-md"
            } ${isAuto ? "border-info/40" : ""}`}
          >
            {/* Area 1: Checkbox + Name */}
            <div className="flex items-start gap-2 mb-2">
              <Checkbox
                checked={selected.has(selKey)}
                onCheckedChange={() => toggleSelect(selKey)}
                className="mt-0.5 flex-shrink-0"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-semibold text-sm leading-tight line-clamp-2 cursor-default">
                    {c.nome}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-sm">{c.nome}</p>
                  {c.dias_semana.length > 1 && (
                    <p className="text-xs text-muted-foreground mt-1">Dias: {c.dias_semana.join(", ")}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Area 2: Tags */}
            <div className="flex flex-wrap gap-1 mb-2">
              <Badge
                variant={isAuto ? "secondary" : "default"}
                className="text-[10px] h-5 px-1.5 cursor-pointer"
                onClick={() => toggleModo(c.id, dia)}
              >
                {isAuto ? "Automático" : "Mensagem"}
              </Badge>

              {/* Automatic clients always show "Pedido confirmado" by default */}
              {isAuto && effective.status === "pedido_confirmado" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 px-1.5 border-blue-300 text-blue-700 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setRespDialog({ clientId: c.id, dia }); setRespStatus(log?.status_resposta || "pedido_confirmado"); setRespObs(log?.observacao || ""); }}
                    >
                      <CheckCircle className="h-3 w-3 mr-0.5" />Pedido confirmado
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Cliente automático — confirmado por padrão. Clique para alterar.
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Manual flow badges (only for non-automatic) */}
              {!isAuto && log?.mensagem_enviada && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-green-300 text-green-700 bg-green-50">
                  <Send className="h-3 w-3 mr-0.5" />Enviada
                </Badge>
              )}
              {!isAuto && log?.respondeu && (() => {
                const statusColor = log.status_resposta === "sem_pedido"
                  ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                  : log.status_resposta === "pedido_confirmado"
                  ? "border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100"
                  : "border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100";
                return (
                  <Badge
                    variant="outline"
                    className={`text-[10px] h-5 px-1.5 cursor-pointer transition-colors ${statusColor}`}
                    onClick={(e) => { e.stopPropagation(); setRespDialog({ clientId: c.id, dia }); setRespStatus(log.status_resposta || "nao_respondeu"); setRespObs(log.observacao || ""); }}
                  >
                    <CheckCircle className="h-3 w-3 mr-0.5" />
                    {STATUS_LABELS[log.status_resposta] || log.status_resposta}
                  </Badge>
                );
              })()}
              {!isAuto && log?.mensagem_enviada && !log?.respondeu && log?.status_resposta === "nao_respondeu" && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 border-amber-300 text-amber-700 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setRespDialog({ clientId: c.id, dia }); setRespStatus("nao_respondeu"); setRespObs(log.observacao || ""); }}
                >
                  <Clock className="h-3 w-3 mr-0.5" />Não respondeu
                </Badge>
              )}
              {/* Override status for automatic clients (when manually changed to sem_pedido or respondeu) */}
              {isAuto && log?.status_resposta && log.status_resposta !== "pedido_confirmado" && log.status_resposta !== "nao_respondeu" && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 border-amber-300 text-amber-700 bg-amber-50 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setRespDialog({ clientId: c.id, dia }); setRespStatus(log.status_resposta || "nao_respondeu"); setRespObs(log.observacao || ""); }}
                >
                  Override: {STATUS_LABELS[log.status_resposta] || log.status_resposta}
                </Badge>
              )}
              {alertCount >= 2 && !isAuto && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5 cursor-help">
                      <AlertTriangle className="h-3 w-3 mr-0.5" />{alertCount}x
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p>Há <strong>{alertCount}</strong> {dia}(s)-feira sem pedido confirmado.</p>
                    {c.dias_semana.length > 1 && (
                      <p className="mt-1">Ativo em: {c.dias_semana.filter(d => d !== dia).join(", ")}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Area 3: Actions */}
            <div className="flex items-center gap-1 border-t pt-2">
              {!isAuto && !log?.mensagem_enviada && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openWhatsApp(c, dia)}>
                      <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Enviar WhatsApp</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={effective.respondeu ? "ghost" : "outline"}
                    className="h-7 w-7"
                    onClick={() => {
                      setRespDialog({ clientId: c.id, dia });
                      setRespStatus(log?.status_resposta || (isAuto ? "pedido_confirmado" : "nao_respondeu"));
                      setRespObs(log?.observacao || "");
                    }}
                  >
                    {effective.respondeu
                      ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      : <Clock className="h-3.5 w-3.5 text-amber-500" />
                    }
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isAuto ? "Alterar status (override)" : "Registrar resposta"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeClientFromDay(c, dia)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remover de {dia}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={c.ativo ? "default" : "outline"}
                    className={`h-7 ml-auto px-2 text-[10px] font-semibold ${
                      c.ativo
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "text-muted-foreground border-muted-foreground/30"
                    }`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      await toggleAtivo(c.id);
                      toast({ title: c.ativo ? `${c.nome} marcado como INATIVO` : `${c.nome} reativado` });
                    }}
                  >
                    {c.ativo ? "ATIVO" : "INATIVO"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {c.ativo
                    ? "Clique para marcar como INATIVO (histórico e configurações são preservados)"
                    : "Clique para reativar o cliente no fluxo da agenda"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  const diasToShow = diaFilter === "todos" ? [...DIAS] : [diaFilter as typeof DIAS[number]];

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading">Agenda de Pedidos</h1>
            <EscopoUsuarioBar className="mt-3" />
            <p className="text-sm text-muted-foreground mt-1">Controle de envio de pedidos via WhatsApp por dia da semana</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <PodeCriar modulo={'agenda_pedidos'}><Button size="sm" onClick={() => { setShowNewClient(true); if (diaFilter !== "todos") setNewDias([diaFilter]); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Cliente
            </Button></PodeCriar>
            <Button variant="outline" size="sm" onClick={() => setShowTemplateDialog(true)}>
              <MessageCircle className="h-4 w-4 mr-1" /> Mensagem
            </Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="h-4 w-4 mr-1" /> Importar Planilha</span>
              </Button>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            </label>
          </div>
        </div>

        {/* Month & Week Selector */}
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <Label className="text-xs font-medium">Mês de referência</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[250px]">
                <Label className="text-xs font-medium">Semana comercial</Label>
                <Select value={selectedWeekMonday} onValueChange={setSelectedWeekMonday}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {weeks.map(w => <SelectItem key={w.monday} value={w.monday}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-1">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToPrevWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={goToCurrentWeek}>
                  <CalendarDays className="h-4 w-4 mr-1" /> Hoje
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {selectedWeek && (
              <div className="mt-2 text-sm font-semibold text-primary">
                {monthOptions.find(o => o.value === selectedMonth)?.label} — {selectedWeek.label}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-44">
                <Label className="text-xs font-medium">Dia da semana</Label>
                <Select value={diaFilter} onValueChange={setDiaFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os dias</SelectItem>
                    {DIAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44">
                <Label className="text-xs font-medium">Modo</Label>
                <Select value={modoFilter} onValueChange={setModoFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="mensagem">Mandar mensagem</SelectItem>
                    <SelectItem value="automatico">Automático</SelectItem>
                  </SelectContent>
                </Select>
               </div>
               <div className="w-44">
                 <Label className="text-xs font-medium">Situação</Label>
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                   <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="todos">Todos</SelectItem>
                     <SelectItem value="ativos">Ativos</SelectItem>
                     <SelectItem value="inativos">Inativos</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="w-48">
                 <Label className="text-xs font-medium">Status resposta</Label>
                 <Select value={respostaFilter} onValueChange={setRespostaFilter}>
                   <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="todos">Todos os status</SelectItem>
                     <SelectItem value="pedido_confirmado">Pedido confirmado</SelectItem>
                     <SelectItem value="sem_pedido">Sem pedido hoje</SelectItem>
                     <SelectItem value="respondeu">Respondeu</SelectItem>
                     <SelectItem value="pendente">Pendentes (enviado, sem resposta)</SelectItem>
                     <SelectItem value="sem_registro">Sem registro</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="flex-1 min-w-[200px]">
                <Label className="text-xs font-medium">Buscar cliente</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="h-9 pl-9" placeholder="Nome do cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  {searchTerm && (
                    <button className="absolute right-2 top-2" onClick={() => setSearchTerm("")}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Batch Actions Bar */}
        {selected.size > 0 && diaFilter === "todos" && (
          <Card className="shadow-card border-primary/30 bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold">{selected.size} cliente(s) selecionado(s)</span>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openSelectedWhatsApp()}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Mandar mensagem
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openBatchResponseDialog()}>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> Registrar resposta
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => batchRemoveFromDay()}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir selecionados
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    <X className="h-3.5 w-3.5 mr-1" /> Limpar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Exibidos", value: stats.shown, icon: Users, color: "text-foreground", filterValue: "todos" },
            { label: "Mandar msg", value: stats.msg, icon: MessageCircle, color: "text-orange-600", filterValue: "_modo_mensagem" },
            { label: "Automáticos", value: stats.auto, icon: CheckCircle, color: "text-blue-600", filterValue: "_modo_automatico" },
            { label: "Enviadas", value: stats.enviadas, icon: Send, color: "text-green-600", filterValue: "_enviadas" },
            { label: "Responderam", value: stats.responderam, icon: CheckCircle, color: "text-green-600", filterValue: "respondeu" },
            { label: "Pendentes", value: stats.pendentes, icon: Clock, color: "text-amber-600", filterValue: "pendente" },
          ].map(s => (
            <Card
              key={s.label}
              className={`shadow-card cursor-pointer transition-colors hover:border-primary/40 ${
                (respostaFilter === s.filterValue || 
                 (s.filterValue === "_modo_mensagem" && modoFilter === "mensagem" && respostaFilter === "todos") ||
                 (s.filterValue === "_modo_automatico" && modoFilter === "automatico" && respostaFilter === "todos"))
                  ? "border-primary/50 bg-primary/5" : ""
              }`}
              onClick={() => {
                if (s.filterValue === "todos") {
                  setRespostaFilter("todos");
                  setModoFilter("todos");
                } else if (s.filterValue === "_modo_mensagem") {
                  setModoFilter(modoFilter === "mensagem" ? "todos" : "mensagem");
                  setRespostaFilter("todos");
                } else if (s.filterValue === "_modo_automatico") {
                  setModoFilter(modoFilter === "automatico" ? "todos" : "automatico");
                  setRespostaFilter("todos");
                } else if (s.filterValue === "_enviadas") {
                  // No direct filter for "enviadas", skip
                } else {
                  setRespostaFilter(respostaFilter === s.filterValue ? "todos" : s.filterValue);
                  setModoFilter("todos");
                }
              }}
            >
              <CardContent className="p-4 text-center">
                <s.icon className={`h-5 w-5 mx-auto mb-1.5 ${s.color}`} />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Column Board */}
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : filteredClients.length === 0 && !searchTerm ? (
          <Card className="shadow-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum cliente cadastrado. Importe uma planilha para começar.</p>
            </CardContent>
          </Card>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4" style={{ minWidth: diasToShow.length > 1 ? `${diasToShow.length * 280}px` : undefined }}>
                {diasToShow.map(dia => {
                  const dayClients = getClientsForDay(dia);
                  const daySelectedKeys = dayClients
                    .map(client => `${client.id}|${dia}`)
                    .filter(key => selected.has(key));
                  const allVisibleSelected = dayClients.length > 0 && dayClients.every(client => selected.has(`${client.id}|${dia}`));

                  return (
                    <div key={dia} className="flex-1 min-w-[260px]">
                      <Card className="shadow-card h-full">
                        <CardHeader className="pb-2 bg-muted/30 px-3 py-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-heading flex items-center gap-2">
                              {dia}
                              <Badge variant="secondary" className="text-xs">{dayClients.length}</Badge>
                            </CardTitle>
                          </div>

                          {diaFilter === "todos" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-fit text-xs px-2"
                              onClick={() => selectAll(dia)}
                            >
                              {allVisibleSelected ? "Desmarcar todos" : "Selecionar todos"}
                            </Button>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={allVisibleSelected ? "secondary" : "outline"}
                                className="h-7 text-xs px-2.5"
                                onClick={() => selectAll(dia)}
                              >
                                {allVisibleSelected ? "Desmarcar todos" : "Selecionar todos"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2.5"
                                disabled={daySelectedKeys.length === 0}
                                onClick={() => openSelectedWhatsApp(daySelectedKeys)}
                              >
                                <MessageCircle className="h-3.5 w-3.5 mr-1" /> Mandar mensagem
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2.5"
                                disabled={daySelectedKeys.length === 0}
                                onClick={() => openBatchResponseDialog(daySelectedKeys)}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Registrar resposta
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2.5 text-destructive border-destructive/30"
                                disabled={daySelectedKeys.length === 0}
                                onClick={() => batchRemoveFromDay(daySelectedKeys)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir selecionados
                              </Button>
                            </div>
                          )}
                        </CardHeader>
                        <Droppable droppableId={dia}>
                          {(provided, snapshot) => (
                            <CardContent
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`p-2 min-h-[200px] max-h-[65vh] overflow-y-auto transition-colors ${
                                snapshot.isDraggingOver ? "bg-primary/5" : ""
                              }`}
                            >
                              {dayClients.map((c, i) => renderClientCard(c, dia, i))}
                              {provided.placeholder}
                              {dayClients.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-6">Nenhum cliente</p>
                              )}
                            </CardContent>
                          )}
                        </Droppable>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </DragDropContext>
        )}
      </div>

      {/* Drag-and-Drop Action Dialog */}
      <Dialog open={!!dndDialog} onOpenChange={v => { if (!v) setDndDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mover cliente</DialogTitle>
          </DialogHeader>
          {dndDialog && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{dndDialog.client.nome}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                De <strong>{dndDialog.fromDia}</strong> para <strong>{dndDialog.toDia}</strong>
              </p>
              {dndDialog.client.dias_semana.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Dias atuais: {dndDialog.client.dias_semana.join(", ")}
                </p>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <Button variant="default" className="justify-start" onClick={() => handleDndAction("move")}>
                  Mover de {dndDialog.fromDia} para {dndDialog.toDia}
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => handleDndAction("add")}>
                  Adicionar {dndDialog.toDia} (manter dias atuais)
                </Button>
                <Button variant="outline" className="justify-start text-destructive" onClick={() => handleDndAction("replace")}>
                  Somente {dndDialog.toDia} (substituir tudo)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={!!editClient} onOpenChange={v => { if (!v) setEditClient(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          {editClient && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={editClient.nome} onChange={e => setEditClient({ ...editClient, nome: e.target.value })} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Telefone / WhatsApp</Label>
                <Input value={editTelefone} onChange={e => setEditTelefone(e.target.value)} className="h-9" placeholder="31999999999" />
              </div>
              <div>
                <Label className="text-xs">Dias da semana</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {DIAS.map(d => (
                    <label key={d} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={editDias.includes(d)} onCheckedChange={checked => {
                        setEditDias(prev => checked ? [...prev, d] : prev.filter(x => x !== d));
                      }} />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Ativo</Label>
                <Switch checked={editClient.ativo} onCheckedChange={() => toggleAtivo(editClient.id)} />
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea value={editObs} onChange={e => setEditObs(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClient(null)}>Cancelar</Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Response Dialog */}
      <Dialog open={!!respDialog} onOpenChange={v => { if (!v) setRespDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Resposta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={respStatus} onValueChange={setRespStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="respondeu">Respondeu</SelectItem>
                  <SelectItem value="pedido_confirmado">Pedido confirmado</SelectItem>
                  <SelectItem value="sem_pedido">Sem pedido hoje</SelectItem>
                  <SelectItem value="nao_respondeu">Não respondeu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea value={respObs} onChange={e => setRespObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespDialog(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (respDialog) {
                await updateResposta(respDialog.clientId, respDialog.dia, respStatus !== "nao_respondeu", respStatus, respObs);
                toast({ title: "Resposta registrada!" });
                setRespDialog(null);
              }
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!batchRespDialog} onOpenChange={v => { if (!v) setBatchRespDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar resposta em lote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Aplicar a mesma resposta para <strong>{batchRespDialog?.length || 0}</strong> cliente(s).
            </p>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={batchRespStatus} onValueChange={setBatchRespStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="respondeu">Respondeu</SelectItem>
                  <SelectItem value="pedido_confirmado">Pedido confirmado</SelectItem>
                  <SelectItem value="sem_pedido">Sem pedido hoje</SelectItem>
                  <SelectItem value="nao_respondeu">Não respondeu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea value={batchRespObs} onChange={e => setBatchRespObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchRespDialog(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!batchRespDialog) return;
              await batchUpdateResposta(batchRespStatus, batchRespObs, batchRespDialog);
              setBatchRespDialog(null);
              setBatchRespObs("");
            }}>
              Salvar em lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mensagem Padrão</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Modelo da mensagem (variáveis: {"{cliente}"}, {"{dia_semana}"}, {"{dias_semana}"})</Label>
            <Textarea value={msgTemplate} onChange={e => setMsgTemplate(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTemplateDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Client Dialog */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar Novo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do cliente *</Label>
              <Input value={newNome} onChange={e => setNewNome(e.target.value)} className="h-9" placeholder="Nome do cliente" />
            </div>
            <div>
              <Label className="text-xs">Telefone / WhatsApp</Label>
              <Input value={newTelefone} onChange={e => setNewTelefone(e.target.value)} className="h-9" placeholder="31999999999" />
            </div>
            <div>
              <Label className="text-xs">Dias da semana *</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {DIAS.map(d => (
                  <label key={d} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={newDias.includes(d)} onCheckedChange={checked => {
                      setNewDias(prev => checked ? [...prev, d] : prev.filter(x => x !== d));
                    }} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={newObs} onChange={e => setNewObs(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClient(false)}>Cancelar</Button>
            <Button onClick={saveNewClient}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
