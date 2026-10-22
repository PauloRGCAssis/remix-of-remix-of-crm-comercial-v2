import { normalizeClientName } from "@/lib/clientNameNormalization";
import { Justificativa, Lead, LeadExcluido, Segmento, Visita } from "@/types/crm";

const SEGMENTO_KEYWORDS: [RegExp, Segmento][] = [
  [/\bpadaria\b/i, 'Padaria'],
  [/\blanchonete\b/i, 'Lanchonete'],
  [/\bcafeteria\b|\bcaf[eé]\b|\bcoffee\b/i, 'Cafeteria'],
  [/\bemp[oó]rio\b/i, 'Empório'],
  [/\bsupermercado\b|\bsacolao\b|\bsacol[aã]o\b|\bhiper\b/i, 'Supermercado'],
  [/\bmercearia\b/i, 'Mercearia'],
  [/\bhotel\b|\bpousada\b|\bhostel\b/i, 'Hotel'],
  [/\brestaurante\b|\bchurrascaria\b|\bcantina\b/i, 'Restaurante'],
  [/\bconveni[eê]ncia\b|\bposto\b/i, 'Conveniência'],
  [/\bescola\b|\bcol[eé]gio\b|\bcantina\b|\bfaculdade\b/i, 'Escola/Cantina'],
  [/\bbuffet\b|\bbuf[eê]\b/i, 'Buffet'],
];

export function inferSegmento(nomeFantasia: string): Segmento | undefined {
  const nome = nomeFantasia.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [regex, segmento] of SEGMENTO_KEYWORDS) {
    if (regex.test(nome)) return segmento;
  }
  return undefined;
}

interface CrmSnapshotLike {
  leads: Lead[];
  visitas: Visita[];
  justificativas: Justificativa[];
  leadsExcluidos: LeadExcluido[];
  idCounter: number;
  savedAt: string;
}

const LEAD_STATE_FIELDS = new Set<keyof Lead>([
  "status_pipeline",
  "proxima_visita_em",
  "ultima_visita_status",
  "negocio_status",
  "negocio_justificativa_id",
  "negocio_valor_estimado",
  "motivo_encerramento",
  "horario",
]);

function parseTimestamp(value?: string | null): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLeadKey(name: string): string {
  return normalizeClientName(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function chooseCanonicalLead(first: Lead, second: Lead): Lead {
  const firstUpdatedAt = parseTimestamp(first.atualizado_em || first.criado_em);
  const secondUpdatedAt = parseTimestamp(second.atualizado_em || second.criado_em);

  if (firstUpdatedAt !== secondUpdatedAt) {
    return firstUpdatedAt > secondUpdatedAt ? first : second;
  }

  return second;
}

function chooseCanonicalVisita(first: Visita, second: Visita): Visita {
  const firstUpdatedAt = parseTimestamp(first.atualizado_em || first.criado_em);
  const secondUpdatedAt = parseTimestamp(second.atualizado_em || second.criado_em);

  if (firstUpdatedAt !== secondUpdatedAt) {
    return firstUpdatedAt > secondUpdatedAt ? first : second;
  }

  return second;
}

function mergeEntityData<T>(primary: T, secondary: T): T {
  const merged = { ...primary } as any;

  for (const [key, value] of Object.entries(secondary as any)) {
    const current = merged[key];
    const currentIsEmptyArray = Array.isArray(current) && current.length === 0;
    const currentIsEmptyValue = current == null || current === "" || currentIsEmptyArray;

    if (currentIsEmptyValue && value != null && value !== "") {
      merged[key] = value;
    }
  }

  return merged as T;
}

function mergeLeadData(primary: Lead, secondary: Lead): Lead {
  const merged = { ...primary } as any;

  for (const [key, value] of Object.entries(secondary as any)) {
    if (LEAD_STATE_FIELDS.has(key as keyof Lead)) continue;

    const current = merged[key];
    const currentIsEmptyArray = Array.isArray(current) && current.length === 0;
    const currentIsEmptyValue = current == null || current === "" || currentIsEmptyArray;

    if (currentIsEmptyValue && value != null && value !== "") {
      merged[key] = value;
    }
  }

  return merged as Lead;
}

function buildVisitaKey(visita: Visita): string {
  return [
    visita.lead_id,
    visita.data_visita,
    visita.horario_visita ?? "",
    visita.status,
    visita.resultado ?? "",
  ].join("|");
}

function dedupeById<T extends { id: string }>(
  items: T[],
  getTimestamp: (item: T) => number,
): { changed: boolean; items: T[] } {
  const itemsById = new Map<string, T>();
  let changed = false;

  for (const item of items) {
    const existing = itemsById.get(item.id);
    if (!existing) {
      itemsById.set(item.id, item);
      continue;
    }

    changed = true;
    const existingTimestamp = getTimestamp(existing);
    const itemTimestamp = getTimestamp(item);

    if (itemTimestamp >= existingTimestamp) {
      itemsById.set(item.id, item);
    }
  }

  return { changed, items: [...itemsById.values()] };
}

export function repairCrmSnapshot<T extends CrmSnapshotLike>(snapshot: T): T {
  const now = new Date().toISOString();
  const leadIdRemap = new Map<string, string>();
  let changed = false;

  const leadsById = new Map<string, Lead>();
  for (const lead of snapshot.leads) {
    const existing = leadsById.get(lead.id);

    if (!existing) {
      leadsById.set(lead.id, lead);
      leadIdRemap.set(lead.id, lead.id);
      continue;
    }

    changed = true;
    const canonical = chooseCanonicalLead(existing, lead);
    const duplicate = canonical === existing ? lead : existing;
    const merged = mergeLeadData(canonical, duplicate);

    leadsById.set(lead.id, merged);
    leadIdRemap.set(existing.id, merged.id);
    leadIdRemap.set(lead.id, merged.id);
  }

  const deduplicatedById = [...leadsById.values()];
  const leadsByName = new Map<string, Lead>();

  for (const lead of deduplicatedById) {
    const key = normalizeLeadKey(lead.nome_fantasia) || lead.id;
    const existing = leadsByName.get(key);

    if (!existing) {
      leadsByName.set(key, lead);
      leadIdRemap.set(lead.id, lead.id);
      continue;
    }

    changed = true;
    const canonical = chooseCanonicalLead(existing, lead);
    const duplicate = canonical === existing ? lead : existing;
    const merged = mergeLeadData(canonical, duplicate);

    leadsByName.set(key, merged);
    leadIdRemap.set(existing.id, merged.id);
    leadIdRemap.set(lead.id, merged.id);
  }

  // Auto-classify segmento for leads without one
  const leads = [...leadsByName.values()].map(lead => {
    if (!lead.segmento) {
      const inferred = inferSegmento(lead.nome_fantasia);
      if (inferred) {
        changed = true;
        return { ...lead, segmento: inferred };
      }
    }
    return lead;
  });
  const leadById = new Map<string, Lead>(leads.map((lead) => [lead.id, lead]));
  const visitasById = new Map<string, Visita>();

  for (const visita of snapshot.visitas) {
    let nextVisita = visita;
    const canonicalLeadId = leadIdRemap.get(visita.lead_id) ?? visita.lead_id;

    if (canonicalLeadId !== visita.lead_id) {
      nextVisita = {
        ...nextVisita,
        lead_id: canonicalLeadId,
        atualizado_em: now,
      };
      changed = true;
    }

    if (!leadById.has(nextVisita.lead_id)) {
      changed = true;
      continue;
    }

    const existing = visitasById.get(nextVisita.id);
    if (!existing) {
      visitasById.set(nextVisita.id, nextVisita);
      continue;
    }

    changed = true;
    const canonical = chooseCanonicalVisita(existing, nextVisita);
    const duplicate = canonical === existing ? nextVisita : existing;
    visitasById.set(nextVisita.id, mergeEntityData(canonical, duplicate));
  }

  const visitas: Visita[] = [];
  const seenVisitas = new Set<string>();

  for (const visita of visitasById.values()) {
    const visitaKey = buildVisitaKey(visita);

    if (seenVisitas.has(visitaKey)) {
      changed = true;
      continue;
    }

    seenVisitas.add(visitaKey);
    visitas.push(visita);
  }

  const dedupedJustificativas = dedupeById(
    snapshot.justificativas,
    (item) => parseTimestamp(item.atualizado_em || item.criado_em),
  );
  const dedupedLeadsExcluidos = dedupeById(
    snapshot.leadsExcluidos,
    (item) => parseTimestamp(item.excluido_em),
  );

  changed = changed || dedupedJustificativas.changed || dedupedLeadsExcluidos.changed;

  if (!changed) return snapshot;

  return {
    ...snapshot,
    leads,
    visitas,
    justificativas: dedupedJustificativas.items,
    leadsExcluidos: dedupedLeadsExcluidos.items,
    savedAt: now,
  };
}
