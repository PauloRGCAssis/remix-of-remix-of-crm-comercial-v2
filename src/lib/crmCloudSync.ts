import { supabase } from "@/integrations/supabase/client";
import {
  CrmSnapshot,
  extractMaxIdCounterFromEntities,
} from "@/lib/crmPersistence";
import { repairCrmSnapshot } from "@/lib/crmSnapshotRepair";
import { normalizeVisitaLegacyFields } from "@/lib/visitaHorario";
import { Justificativa, Lead, LeadExcluido, Visita } from "@/types/crm";

type LegacyVisita = Visita & {
  horario?: string;
  horarioVisita?: string;
  hora_visita?: string;
};

type RawSnapshot = Partial<CrmSnapshot> & {
  leads?: Lead[];
  visitas?: LegacyVisita[];
  justificativas?: Justificativa[];
};

function normalizeSnapshot(payload?: RawSnapshot | null, updatedAt?: string): CrmSnapshot | null {
  if (!payload || typeof payload !== "object") return null;

  const leads = Array.isArray(payload.leads) ? payload.leads : [];
  const visitas = (Array.isArray(payload.visitas) ? payload.visitas : []).map((visita) =>
    normalizeVisitaLegacyFields(visita),
  );
  const justificativas = Array.isArray(payload.justificativas) ? payload.justificativas : [];
  const leadsExcluidos = Array.isArray((payload as any).leadsExcluidos) ? (payload as any).leadsExcluidos : [];

  const idCounter =
    typeof payload.idCounter === "number"
      ? payload.idCounter
      : extractMaxIdCounterFromEntities({ leads, visitas, justificativas, fallback: 100 });

  const savedAt =
    typeof payload.savedAt === "string" && payload.savedAt.length > 0
      ? payload.savedAt
      : updatedAt || new Date().toISOString();

  return repairCrmSnapshot({
    leads,
    visitas,
    justificativas,
    leadsExcluidos,
    idCounter,
    savedAt,
  });
}

let latestQueuedSnapshot: CrmSnapshot | null = null;
let cloudSaveQueue: Promise<void> = Promise.resolve();

export async function loadCloudSnapshot(): Promise<CrmSnapshot | null> {
  try {
    const [leadsResult, visitasResult] = await Promise.all([
      supabase.from("crm_leads").select("payload,updated_at:atualizado_em"),
      supabase.from("crm_visitas").select("payload,updated_at:atualizado_em"),
    ]);
    if (leadsResult.error) throw leadsResult.error;
    if (visitasResult.error) throw visitasResult.error;

    const leads = (leadsResult.data ?? []).map((row) => row.payload as unknown as Lead);
    const visitas = (visitasResult.data ?? []).map((row) =>
      normalizeVisitaLegacyFields(row.payload as unknown as LegacyVisita),
    );
    const updatedAt = [...(leadsResult.data ?? []), ...(visitasResult.data ?? [])]
      .map((row) => row.updated_at)
      .sort()
      .at(-1);

    return normalizeSnapshot({ leads, visitas, justificativas: [], leadsExcluidos: [] }, updatedAt);
  } catch {
    return null;
  }
}

async function flushLatestCloudSnapshot(): Promise<void> {
  while (latestQueuedSnapshot) {
    const snapshotToSave = latestQueuedSnapshot;
    latestQueuedSnapshot = null;

    const incomingSnapshot = normalizeSnapshot(snapshotToSave, snapshotToSave.savedAt);
    if (!incomingSnapshot) continue;

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) continue;

      const { data: existingLeadRows, error: existingLeadsError } = await supabase
        .from("crm_leads")
        .select("id");
      if (existingLeadsError) throw existingLeadsError;
      const existingLeadIds = new Set((existingLeadRows ?? []).map((row) => row.id));

      const leadRows = incomingSnapshot.leads.map((lead) => ({
        id: lead.id,
        vendedor: lead.vendedor ?? null,
        agendado_por: lead.agendado_por ?? null,
        payload: lead as any,
        criado_em: lead.criado_em,
        atualizado_em: lead.atualizado_em,
      }));
      const newLeadRows = leadRows
        .filter((row) => !existingLeadIds.has(row.id))
        .map((row) => ({ ...row, criado_por: userId }));
      const currentLeadRows = leadRows.filter((row) => existingLeadIds.has(row.id));
      if (newLeadRows.length) {
        const { error } = await supabase.from("crm_leads").insert(newLeadRows);
        if (error) throw error;
      }
      if (currentLeadRows.length) {
        const updates = await Promise.all(
          currentLeadRows.map(({ id, ...changes }) =>
            supabase.from("crm_leads").update(changes).eq("id", id),
          ),
        );
        const failed = updates.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }

      const { data: existingVisitaRows, error: existingVisitasError } = await supabase
        .from("crm_visitas")
        .select("id");
      if (existingVisitasError) throw existingVisitasError;
      const existingVisitaIds = new Set((existingVisitaRows ?? []).map((row) => row.id));
      const vendedorPorLead = new Map(incomingSnapshot.leads.map((lead) => [lead.id, lead.vendedor ?? null]));
      const visitaRows = incomingSnapshot.visitas.map((visita) => ({
        id: visita.id,
        lead_id: visita.lead_id,
        vendedor: vendedorPorLead.get(visita.lead_id) ?? null,
        payload: visita as any,
        criado_em: visita.criado_em,
        atualizado_em: visita.atualizado_em,
      }));
      const newVisitaRows = visitaRows
        .filter((row) => !existingVisitaIds.has(row.id))
        .map((row) => ({ ...row, criado_por: userId }));
      const currentVisitaRows = visitaRows.filter((row) => existingVisitaIds.has(row.id));
      if (newVisitaRows.length) {
        const { error } = await supabase.from("crm_visitas").insert(newVisitaRows);
        if (error) throw error;
      }
      if (currentVisitaRows.length) {
        const updates = await Promise.all(
          currentVisitaRows.map(({ id, ...changes }) =>
            supabase.from("crm_visitas").update(changes).eq("id", id),
          ),
        );
        const failed = updates.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }
    } catch {
      // Keep local persistence working even if backend sync fails
    }
  }
}

export function saveCloudSnapshot(snapshot: CrmSnapshot): Promise<void> {
  latestQueuedSnapshot = snapshot;
  cloudSaveQueue = cloudSaveQueue.then(flushLatestCloudSnapshot, flushLatestCloudSnapshot);
  return cloudSaveQueue;
}
