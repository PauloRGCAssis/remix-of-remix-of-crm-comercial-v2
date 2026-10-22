import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { useVendorScope } from '@/hooks/useVendorScope';
import { useUserRole } from '@/hooks/useUserRole';
import { Lead, Visita, Justificativa, LeadExcluido, PipelineStatus, VisitaStatus, NegocioStatus, ProdutoNegociado, SEED_JUSTIFICATIVAS } from '@/types/crm';
import { matchBairroRegional, addAuditLog } from '@/lib/bairroNormalization';
import { findDuplicates, DuplicateMatch } from '@/lib/duplicateDetection';
import { createImportedLeads } from '@/data/importedLeads';
import { repairCrmSnapshot } from '@/lib/crmSnapshotRepair';
import {
  chooseReliableSnapshot,
  createCrmSnapshot,
  extractMaxIdCounterFromEntities,
  loadIndexedSnapshot,
  loadInitialCrmSnapshot,
  saveIndexedSnapshot,
  saveLocalSnapshot,
} from '@/lib/crmPersistence';
import { loadCloudSnapshot, saveCloudSnapshot } from '@/lib/crmCloudSync';

const bootstrapSnapshot = loadInitialCrmSnapshot();

interface CrmContextType {
  leads: Lead[];
  visitas: Visita[];
  justificativas: Justificativa[];
  leadsExcluidos: LeadExcluido[];
  addLead: (data: Partial<Lead>) => Lead;
  updateLead: (id: string, data: Partial<Lead>) => void;
  deleteLead: (id: string, motivo?: string) => void;
  moverPipeline: (leadId: string, novoStatus: PipelineStatus, motivo_encerramento?: string) => void;
  agendarVisita: (leadId: string, dataVisita: string, horario?: string, notas?: string) => Visita;
  darFeedbackVisita: (visitaId: string, status: VisitaStatus, motivo?: string) => void;
  concluirVisitaComResultado: (visitaId: string, resultado: NegocioStatus, justificativaId?: string, motivo?: string, produtosNegociados?: ProdutoNegociado[]) => void;
  reagendarVisita: (leadId: string, novaData: string, horario?: string, notas?: string) => Visita;
  updateVisita: (visitaId: string, data: Partial<Pick<Visita, 'data_visita' | 'horario_visita' | 'notas'>>) => void;
  deleteVisita: (visitaId: string) => void;
  deleteVisitas: (visitaIds: string[]) => number;
  getVisitasByLead: (leadId: string) => Visita[];
  getLeadById: (id: string) => Lead | undefined;
  getJustificativaById: (id: string) => Justificativa | undefined;
  addJustificativa: (titulo: string) => Justificativa;
  checkDuplicates: (nome: string, endereco?: string, excludeId?: string) => DuplicateMatch[];
}

const CrmContext = createContext<CrmContextType | null>(null);

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm must be used within CrmProvider');
  return ctx;
}

function createInitialLeads(): Lead[] {
  return bootstrapSnapshot?.leads ?? createImportedLeads();
}

function createInitialVisitas(): Visita[] {
  return bootstrapSnapshot?.visitas ?? [];
}

function createInitialJustificativas(): Justificativa[] {
  if (bootstrapSnapshot?.justificativas?.length) {
    return bootstrapSnapshot.justificativas;
  }

  const now = new Date().toISOString();
  return SEED_JUSTIFICATIVAS.map((j, i) => ({
    ...j,
    id: `j-${i + 1}`,
    criado_em: now,
    atualizado_em: now,
  }));
}

let _idCounter = Math.max(
  bootstrapSnapshot?.idCounter ?? 0,
  extractMaxIdCounterFromEntities({
    leads: bootstrapSnapshot?.leads,
    visitas: bootstrapSnapshot?.visitas,
    justificativas: bootstrapSnapshot?.justificativas,
    fallback: 100,
  }),
);

// Live entity references injected by the provider so that nextId() can
// always guarantee uniqueness against the current in-memory state. This
// prevents ID collisions during cloud hydration races (which previously
// caused a brand new lead to inherit visit history from an old lead that
// happened to share the same numeric ID).
let _liveEntities: {
  leads: Lead[];
  visitas: Visita[];
  justificativas: Justificativa[];
  leadsExcluidos: LeadExcluido[];
} = { leads: [], visitas: [], justificativas: [], leadsExcluidos: [] };

function maxIdNumberFromArray(arr: Array<{ id?: string }>): number {
  let max = 0;
  for (const item of arr) {
    const m = item?.id?.match(/-(\d+)$/);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

function nextId(prefix: string) {
  // Always advance past the highest existing numeric suffix across ALL
  // entity types so a fresh lead can never reuse an old lead_id.
  const liveMax = Math.max(
    maxIdNumberFromArray(_liveEntities.leads),
    maxIdNumberFromArray(_liveEntities.visitas),
    maxIdNumberFromArray(_liveEntities.justificativas),
    maxIdNumberFromArray(_liveEntities.leadsExcluidos),
  );
  if (liveMax >= _idCounter) {
    _idCounter = liveMax;
  }
  _idCounter++;
  return `${prefix}-${_idCounter}`;
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(createInitialLeads);
  const [visitas, setVisitas] = useState<Visita[]>(createInitialVisitas);
  const [justificativas, setJustificativas] = useState<Justificativa[]>(createInitialJustificativas);
  const [leadsExcluidos, setLeadsExcluidos] = useState<LeadExcluido[]>(bootstrapSnapshot?.leadsExcluidos ?? []);
  const [isHydrating, setIsHydrating] = useState(true);

  // Keep the live entity reference in sync with current React state so
  // nextId() can compute IDs that are guaranteed unique against everything
  // currently loaded (post hydration / cloud merge). Prevents new leads
  // from inheriting visit history of an old lead with the same numeric ID.
  useEffect(() => {
    _liveEntities = { leads, visitas, justificativas, leadsExcluidos };
  }, [leads, visitas, justificativas, leadsExcluidos]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromStorage = async () => {
      const [indexedSnapshot, cloudSnapshot] = await Promise.all([
        loadIndexedSnapshot(),
        loadCloudSnapshot(),
      ]);

      if (cancelled) return;

      // Segurança: a sessão nunca hidrata dados comerciais de caches locais,
      // pois o navegador pode ter sido usado antes por outro vendedor.
      const preferredSnapshot = cloudSnapshot;

      if (preferredSnapshot) {
        setLeads(preferredSnapshot.leads);
        setVisitas(preferredSnapshot.visitas);
        setJustificativas(preferredSnapshot.justificativas);
        setLeadsExcluidos(preferredSnapshot.leadsExcluidos || []);
      }

      if (preferredSnapshot) {
        saveLocalSnapshot(preferredSnapshot);
        void saveIndexedSnapshot(preferredSnapshot);
      }

      _idCounter = Math.max(
        _idCounter,
        100,
        100,
        cloudSnapshot?.idCounter ?? 100,
        preferredSnapshot?.idCounter ?? 100,
      );

      setIsHydrating(false);
    };

    void hydrateFromStorage();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistSnapshot = useCallback(() => {
    const snapshot = createCrmSnapshot({
      leads,
      visitas,
      justificativas,
      leadsExcluidos,
      idCounter: _idCounter,
    });

    saveLocalSnapshot(snapshot);
    void saveIndexedSnapshot(snapshot);
    void saveCloudSnapshot(snapshot);
  }, [leads, visitas, justificativas, leadsExcluidos]);

  useEffect(() => {
    if (isHydrating) return;
    persistSnapshot();
  }, [isHydrating, persistSnapshot]);

  useEffect(() => {
    if (isHydrating) return;

    const repaired = repairCrmSnapshot({
      leads,
      visitas,
      justificativas,
      leadsExcluidos,
      idCounter: _idCounter,
      savedAt: new Date().toISOString(),
    });

    if (repaired.leads !== leads) {
      setLeads(repaired.leads);
    }

    if (repaired.visitas !== visitas) {
      setVisitas(repaired.visitas);
    }

    if (repaired.justificativas !== justificativas) {
      setJustificativas(repaired.justificativas);
    }

    if (repaired.leadsExcluidos !== leadsExcluidos) {
      setLeadsExcluidos(repaired.leadsExcluidos);
    }

    _idCounter = Math.max(_idCounter, repaired.idCounter);
  }, [isHydrating, leads, visitas, justificativas, leadsExcluidos]);

  useEffect(() => {
    if (isHydrating) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistSnapshot();
      }
    };

    window.addEventListener('beforeunload', persistSnapshot);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', persistSnapshot);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isHydrating, persistSnapshot]);

  const getLeadById = useCallback((id: string) => leads.find(l => l.id === id), [leads]);
  const getJustificativaById = useCallback((id: string) => justificativas.find(j => j.id === id), [justificativas]);

  const addJustificativa = useCallback((titulo: string): Justificativa => {
    const now = new Date().toISOString();
    const j: Justificativa = {
      id: nextId('j'),
      tipo: 'OBJECAO',
      titulo,
      ativo: true,
      criado_em: now,
      atualizado_em: now,
    };
    setJustificativas(prev => [...prev, j]);
    return j;
  }, []);

  const addLead = useCallback((data: Partial<Lead>): Lead => {
    const now = new Date().toISOString();
    let regional = data.regional;
    let regional_status = data.regional_status;
    let regional_confianca = data.regional_confianca;
    
    // For non-BH cities, set regional = city name
    const cidadeUpper = (data.cidade || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isBH = !cidadeUpper || cidadeUpper === 'BELO HORIZONTE' || cidadeUpper === 'BH';
    
    if (!regional) {
      if (isBH && data.bairro) {
        const match = matchBairroRegional(data.bairro);
        regional = match.regional;
        regional_status = match.regional_status;
        regional_confianca = match.regional_confianca;
      } else if (!isBH && data.cidade?.trim()) {
        regional = data.cidade.trim();
        regional_status = 'AUTO_OK';
        regional_confianca = 1.0;
      }
    }

    const lead: Lead = {
      id: nextId('l'),
      nome_fantasia: data.nome_fantasia || '',
      origem: data.origem || 'PROSPECCAO',
      segmento: data.segmento,
      contato_nome: data.contato_nome,
      telefone: data.telefone,
      whatsapp: data.whatsapp,
      email: data.email,
      cidade: data.cidade,
      estado: data.estado,
      bairro: data.bairro,
      vendedor: data.vendedor,
      criado_por: data.criado_por,
      dia_semana: data.dia_semana,
      horario: data.horario,
      regional,
      regional_status,
      regional_confianca,
      regional_fonte: 'BH_BAIRROS_REGIONAIS',
      endereco: data.endereco,
      numero: data.numero,
      complemento: data.complemento,
      cep: data.cep,
      tipo_atendimento: data.tipo_atendimento,
      demanda: data.demanda,
      demandaQuantidade: data.demandaQuantidade,
      demandaFrequencia: data.demandaFrequencia,
      paoQueijo: data.paoQueijo,
      recheado: data.recheado,
      empanado: data.empanado,
      biscoito: data.biscoito,
      concorrente: data.concorrente,
      valorConcorrente: data.valorConcorrente,
      produtosInteresse: data.produtosInteresse,
      observacoes: data.observacoes,
      status_pipeline: 'AGUARDANDO_AGENDAMENTO',
      proxima_visita_em: null,
      ultima_visita_status: null,
      negocio_status: null,
      negocio_justificativa_id: null,
      negocio_valor_estimado: null,
      criado_em: now,
      atualizado_em: now,
    };

    setLeads(prev => [...prev, lead]);
    return lead;
  }, []);

  const moverPipeline = useCallback((leadId: string, novoStatus: PipelineStatus, motivo_encerramento?: string) => {
    const now = new Date().toISOString();
    const isVisitCompletedStage = novoStatus === 'VISITA_AGENDADA' || novoStatus === 'EM_NEGOCIACAO';
    const isFinalStage = novoStatus === 'NEGOCIACAO_CONCRETIZADA' || novoStatus === 'NEGOCIACAO_ENCERRADA';

    // For AGENDADO, we need to find the visita to reactivate BEFORE updating state
    let reactivatedVisitaData: { data_visita: string; horario_visita?: string } | null = null;
    if (novoStatus === 'AGENDADO') {
      // Read current visitas to find which one to reactivate
      setVisitas(prev => {
        const leadVisitas = prev
          .filter(v => v.lead_id === leadId && v.status !== 'CANCELADA')
          .sort((a, b) => `${b.data_visita}${b.horario_visita || ''}`.localeCompare(`${a.data_visita}${a.horario_visita || ''}`));
        if (leadVisitas.length > 0) {
          const mostRecent = leadVisitas[0];
          reactivatedVisitaData = { data_visita: mostRecent.data_visita, horario_visita: mostRecent.horario_visita };
          return prev.map(v => v.id === mostRecent.id ? { ...v, status: 'AGENDADA' as VisitaStatus, atualizado_em: now } : v);
        }
        return prev;
      });
    }

    if (novoStatus === 'AGUARDANDO_AGENDAMENTO') {
      setVisitas(prev => prev.map(v =>
        v.lead_id === leadId && v.status === 'AGENDADA'
          ? { ...v, status: 'CANCELADA' as VisitaStatus, atualizado_em: now }
          : v
      ));
    }

    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;

      const updated: Lead = {
        ...l,
        status_pipeline: novoStatus,
        horario: novoStatus === 'AGUARDANDO_AGENDAMENTO' ? undefined : l.horario,
        ultima_visita_status:
          novoStatus === 'AGENDADO' ? 'AGENDADA' :
          isVisitCompletedStage ? 'REALIZADA' :
          novoStatus === 'NEGOCIACAO_CONCRETIZADA' ? 'CONCLUIDA_SUCESSO' :
          novoStatus === 'NEGOCIACAO_ENCERRADA' ? 'CONCLUIDA_SEM_SUCESSO' :
          novoStatus === 'AGUARDANDO_AGENDAMENTO' ? null :
          l.ultima_visita_status,
        proxima_visita_em:
          novoStatus === 'AGENDADO'
            ? (reactivatedVisitaData?.data_visita ?? l.proxima_visita_em)
            : (novoStatus === 'AGUARDANDO_AGENDAMENTO' || isVisitCompletedStage || isFinalStage)
              ? null
              : l.proxima_visita_em,
        negocio_status: novoStatus === 'NEGOCIACAO_CONCRETIZADA' ? 'FECHADO' as NegocioStatus :
                        novoStatus === 'NEGOCIACAO_ENCERRADA' ? 'NAO_FECHADO' as NegocioStatus : l.negocio_status,
        motivo_encerramento: novoStatus === 'NEGOCIACAO_ENCERRADA' ? (motivo_encerramento || null) : l.motivo_encerramento,
        atualizado_em: now,
      };

      // Restore horario from visita if moving back to AGENDADO
      if (novoStatus === 'AGENDADO' && reactivatedVisitaData?.horario_visita) {
        updated.horario = reactivatedVisitaData.horario_visita;
      }

      return updated;
    }));

    if (isVisitCompletedStage || isFinalStage) {
      const syncedVisitaStatus: VisitaStatus =
        novoStatus === 'NEGOCIACAO_CONCRETIZADA'
          ? 'CONCLUIDA_SUCESSO'
          : novoStatus === 'NEGOCIACAO_ENCERRADA'
            ? 'CONCLUIDA_SEM_SUCESSO'
            : 'REALIZADA';

      setVisitas(prev => prev.map(v =>
        v.lead_id === leadId && v.status === 'AGENDADA'
          ? {
              ...v,
              status: syncedVisitaStatus,
              motivo: novoStatus === 'NEGOCIACAO_ENCERRADA' ? (motivo_encerramento || v.motivo) : v.motivo,
              atualizado_em: now,
            }
          : v
      ));
    }
  }, []);

  const updateLead = useCallback((id: string, data: Partial<Lead>) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...data, atualizado_em: new Date().toISOString() } : l));
  }, []);

  const deleteLead = useCallback((id: string, motivo?: string) => {
    const lead = leads.find(l => l.id === id);
    if (lead && motivo) {
      const excluido: LeadExcluido = {
        id: nextId('ex'),
        nome_fantasia: lead.nome_fantasia,
        motivo,
        excluido_em: new Date().toISOString(),
        lead_snapshot: { ...lead },
      };
      setLeadsExcluidos(prev => [excluido, ...prev]);
    }
    setLeads(prev => prev.filter(l => l.id !== id));
    setVisitas(prev => prev.filter(v => v.lead_id !== id));
  }, [leads]);

  const agendarVisita = useCallback((leadId: string, dataVisita: string, horario?: string, notas?: string): Visita => {
    const now = new Date().toISOString();
    const dataVisitaNormalizada = dataVisita.slice(0, 10);
    const horarioFromDateTime = dataVisita.match(/(?:^|T|\s)([01]\d|2[0-3]):([0-5]\d)/);
    const horarioNormalizado = (typeof horario === 'string' && horario.trim().length > 0)
      ? horario.trim()
      : (horarioFromDateTime ? `${horarioFromDateTime[1]}:${horarioFromDateTime[2]}` : undefined);

    const visita: Visita = {
      id: nextId('v'),
      lead_id: leadId,
      data_visita: dataVisitaNormalizada,
      horario_visita: horarioNormalizado,
      status: 'AGENDADA',
      notas,
      criado_em: now,
      atualizado_em: now,
    };

    setVisitas(prev => [...prev, visita]);
    setLeads(prev => prev.map(l => l.id === leadId ? {
      ...l,
      status_pipeline: 'AGENDADO',
      proxima_visita_em: dataVisitaNormalizada,
      horario: horarioNormalizado || l.horario,
      ultima_visita_status: 'AGENDADA',
      atualizado_em: now,
    } : l));

    return visita;
  }, []);

  // Simple feedback (NAO_CONCLUIDA only — for the first step)
  const darFeedbackVisita = useCallback((visitaId: string, status: VisitaStatus, motivo?: string) => {
    const now = new Date().toISOString();
    
    setVisitas(prev => prev.map(v => v.id === visitaId ? {
      ...v,
      status,
      motivo: motivo || v.motivo,
      atualizado_em: now,
    } : v));

    const visita = visitas.find(v => v.id === visitaId) || { lead_id: '' };
    const leadId = visita.lead_id;
    if (!leadId) return;

    // REALIZADA -> VISITA_AGENDADA (visit done, awaiting negotiation feedback)
    if (status === 'REALIZADA') {
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        status_pipeline: 'VISITA_AGENDADA',
        ultima_visita_status: 'REALIZADA',
        proxima_visita_em: null,
        atualizado_em: now,
      } : l));
    }

    // NAO_CONCLUIDA -> VISITA_AGENDADA (waiting for reschedule)
    if (status === 'NAO_CONCLUIDA') {
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        status_pipeline: 'VISITA_AGENDADA',
        ultima_visita_status: 'NAO_CONCLUIDA',
        proxima_visita_em: null,
        atualizado_em: now,
      } : l));
    }
  }, [visitas]);

  // Conclude visit with business result (FECHADO / NAO_FECHADO)
  const concluirVisitaComResultado = useCallback((visitaId: string, resultado: NegocioStatus, justificativaId?: string, motivo?: string, produtosNegociados?: ProdutoNegociado[]) => {
    const now = new Date().toISOString();

    const visitaStatus: VisitaStatus = resultado === 'FECHADO' ? 'CONCLUIDA_SUCESSO' : 'CONCLUIDA_SEM_SUCESSO';
    
    setVisitas(prev => prev.map(v => v.id === visitaId ? {
      ...v,
      status: visitaStatus,
      resultado,
      justificativa_id: justificativaId || null,
      produtos_negociados: produtosNegociados || v.produtos_negociados,
      motivo: motivo || v.motivo,
      atualizado_em: now,
    } : v));

    const visita = visitas.find(v => v.id === visitaId) || { lead_id: '' };
    const leadId = visita.lead_id;
    if (!leadId) return;

    if (resultado === 'FECHADO') {
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        status_pipeline: 'NEGOCIACAO_CONCRETIZADA',
        ultima_visita_status: 'CONCLUIDA_SUCESSO',
        negocio_status: 'FECHADO',
        negocio_justificativa_id: null,
        proxima_visita_em: null,
        atualizado_em: now,
      } : l));
    } else {
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        status_pipeline: 'NEGOCIACAO_ENCERRADA',
        ultima_visita_status: 'CONCLUIDA_SEM_SUCESSO',
        negocio_status: 'NAO_FECHADO',
        negocio_justificativa_id: justificativaId || null,
        proxima_visita_em: null,
        atualizado_em: now,
      } : l));
    }
  }, [visitas]);

  const reagendarVisita = useCallback((leadId: string, novaData: string, horario?: string, notas?: string): Visita => {
    // Cancel all existing AGENDADA visits for this lead before creating a new one
    const now = new Date().toISOString();
    const horarioPreservado =
      horario ??
      visitas.find(v => v.lead_id === leadId && v.status === 'AGENDADA')?.horario_visita ??
      leads.find(l => l.id === leadId)?.horario;

    setVisitas(prev => prev.map(v => 
      v.lead_id === leadId && v.status === 'AGENDADA' 
        ? { ...v, status: 'CANCELADA' as VisitaStatus, atualizado_em: now } 
        : v
    ));
    return agendarVisita(leadId, novaData, horarioPreservado, notas);
  }, [agendarVisita, visitas, leads]);

  const updateVisita = useCallback((visitaId: string, data: Partial<Pick<Visita, 'data_visita' | 'horario_visita' | 'notas'>>) => {
    const now = new Date().toISOString();
    const normalized: Partial<Visita> = { ...data };
    if (typeof normalized.data_visita === 'string') {
      normalized.data_visita = normalized.data_visita.slice(0, 10);
    }
    setVisitas(prev => prev.map(v => v.id === visitaId ? { ...v, ...normalized, atualizado_em: now } : v));
    const visita = visitas.find(v => v.id === visitaId);
    if (visita && (normalized.data_visita || normalized.horario_visita)) {
      setLeads(prev => prev.map(l => l.id === visita.lead_id ? {
        ...l,
        proxima_visita_em: normalized.data_visita ?? l.proxima_visita_em,
        horario: typeof normalized.horario_visita === 'string' ? normalized.horario_visita : l.horario,
        atualizado_em: now,
      } : l));
    }
  }, [visitas]);

  const deleteVisitas = useCallback((visitaIds: string[]): number => {
    if (!visitaIds || visitaIds.length === 0) return 0;
    const idSet = new Set(visitaIds);
    const now = new Date().toISOString();
    const affectedLeadIds = new Set<string>();
    visitas.forEach(v => { if (idSet.has(v.id)) affectedLeadIds.add(v.lead_id); });

    setVisitas(prev => prev.filter(v => !idSet.has(v.id)));

    // For each affected lead, if no more AGENDADA visits remain, revert pipeline & clear proxima_visita_em
    setLeads(prev => prev.map(l => {
      if (!affectedLeadIds.has(l.id)) return l;
      const stillScheduled = visitas.some(v => !idSet.has(v.id) && v.lead_id === l.id && v.status === 'AGENDADA');
      if (stillScheduled) return l;
      return {
        ...l,
        proxima_visita_em: undefined,
        horario: undefined,
        status_pipeline: l.status_pipeline === 'AGENDADO' ? 'AGUARDANDO_AGENDAMENTO' : l.status_pipeline,
        atualizado_em: now,
      };
    }));
    return idSet.size;
  }, [visitas]);

  const deleteVisita = useCallback((visitaId: string) => {
    deleteVisitas([visitaId]);
  }, [deleteVisitas]);

  const getVisitasByLead = useCallback((leadId: string) => {
    return visitas.filter(v => v.lead_id === leadId).sort((a, b) => b.data_visita.localeCompare(a.data_visita));
  }, [visitas]);

  const checkDuplicates = useCallback((nome: string, endereco?: string, excludeId?: string) => {
    const existing = leads
      .filter(l => l.id !== excludeId)
      .map(l => ({ id: l.id, nome_fantasia: l.nome_fantasia, endereco: l.endereco }));
    return findDuplicates(nome, endereco, existing);
  }, [leads]);

  // ---- Escopo por usuário -------------------------------------------------
  // Regra global: o login só enxerga os vendedores autorizados pelo
  // administrador (Administração → Usuários). Nada é apagado da base: os
  // registros dos demais vendedores continuam existindo, apenas invisíveis.
  const scope = useVendorScope();
  const { nome: usuarioNome } = useUserRole();
  const autorAtual = scope.vendedorPadrao ?? usuarioNome ?? null;

  const addLeadScoped = useCallback(
    (data: Partial<Lead>) =>
      addLead({
        ...data,
        // Vendedor responsável e usuário criador são sempre do login atual
        // quando o escopo é travado em um único vendedor.
        vendedor: scope.travado && scope.vendedorPadrao ? scope.vendedorPadrao : (data.vendedor || scope.vendedorPadrao || undefined),
        criado_por: data.criado_por || autorAtual || undefined,
      }),
    [addLead, scope.vendedorPadrao, scope.travado, autorAtual],
  );


  return (
    <CrmContext.Provider value={{
      // `crm_leads` e `crm_visitas` já chegam filtrados no banco pela RLS de
      // seller_id. Não reaplicar filtros textuais no cliente.
      leads, visitas, justificativas, leadsExcluidos,
      addLead: addLeadScoped, updateLead, deleteLead, moverPipeline, agendarVisita, darFeedbackVisita,
      concluirVisitaComResultado, reagendarVisita, updateVisita, deleteVisita, deleteVisitas,
      getVisitasByLead, getLeadById, getJustificativaById, addJustificativa, checkDuplicates,
    }}>
      {children}
    </CrmContext.Provider>
  );
}

