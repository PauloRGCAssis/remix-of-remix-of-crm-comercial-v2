import { repairCrmSnapshot } from "@/lib/crmSnapshotRepair";
import { Justificativa, Lead, LeadExcluido, Visita } from "@/types/crm";
import { normalizeVisitaLegacyFields } from "@/lib/visitaHorario";

export interface CrmSnapshot {
  leads: Lead[];
  visitas: Visita[];
  justificativas: Justificativa[];
  leadsExcluidos: LeadExcluido[];
  idCounter: number;
  savedAt: string;
}

const STORAGE = {
  snapshot: "crm_snapshot_v1",
  legacySnapshot: "crm_snapshot",
  backupSuffix: "__backup",
  split: {
    leads: ["crm_leads_v2", "crm_leads_v1", "crm_leads"],
    visitas: ["crm_visitas_v2", "crm_visitas_v1", "crm_visitas"],
    justificativas: ["crm_justificativas_v2", "crm_justificativas_v1", "crm_justificativas"],
    idCounter: ["crm_id_counter_v2", "crm_id_counter_v1", "crm_id_counter"],
  },
  indexedDb: {
    dbName: "crm_persistence_db",
    storeName: "key_value",
    key: "crm_snapshot_v1",
    version: 1,
  },
} as const;

function parseJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readFromLocalStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  return parseJsonSafe<T>(window.localStorage.getItem(key));
}

function writeToLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    const previousValue = window.localStorage.getItem(key);
    if (previousValue && previousValue !== value) {
      window.localStorage.setItem(`${key}${STORAGE.backupSuffix}`, previousValue);
    }
    window.localStorage.setItem(key, value);
  } catch {
    // ignore persistence errors
  }
}

function readLocalValueCandidates<T>(keys: readonly string[]): T[] {
  const values: T[] = [];

  for (const key of keys) {
    const value = readFromLocalStorage<T>(key);
    if (value !== null) values.push(value);

    const backupValue = readFromLocalStorage<T>(`${key}${STORAGE.backupSuffix}`);
    if (backupValue !== null) values.push(backupValue);
  }

  return values;
}

function readBestArrayLocalValue<T>(keys: readonly string[]): T[] | null {
  const candidates = readLocalValueCandidates<T[]>(keys).filter(Array.isArray);
  if (candidates.length === 0) return null;

  return candidates.find((items) => items.length > 0) ?? candidates[0];
}

function readBestNumberLocalValue(keys: readonly string[]): number | null {
  const candidates = readLocalValueCandidates<number>(keys).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function snapshotHasOperationalHistory(snapshot: CrmSnapshot): boolean {
  const hasVisits = snapshot.visitas.length > 0;
  const hasPipelineProgress = snapshot.leads.some(
    (lead) =>
      lead.status_pipeline !== "AGUARDANDO_AGENDAMENTO" ||
      Boolean(lead.proxima_visita_em) ||
      Boolean(lead.ultima_visita_status) ||
      Boolean(lead.negocio_status),
  );

  return hasVisits || hasPipelineProgress;
}

function parseIsoTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotReliabilityScore(snapshot: CrmSnapshot): number {
  const progressedLeads = snapshot.leads.filter(
    (lead) => lead.status_pipeline !== "AGUARDANDO_AGENDAMENTO",
  ).length;

  return (
    (snapshotHasOperationalHistory(snapshot) ? 1_000_000 : 0) +
    progressedLeads * 1_000 +
    snapshot.visitas.length * 100 +
    snapshot.justificativas.length * 10 +
    snapshot.leads.length
  );
}

function dedupeById<T extends { id: string }>(
  items: T[],
  getTimestamp: (item: T) => number,
): T[] {
  const itemsById = new Map<string, T>();

  for (const item of items) {
    const existing = itemsById.get(item.id);
    if (!existing) {
      itemsById.set(item.id, item);
      continue;
    }

    const existingTimestamp = getTimestamp(existing);
    const itemTimestamp = getTimestamp(item);

    if (itemTimestamp > existingTimestamp) {
      itemsById.set(item.id, item);
      continue;
    }

    if (itemTimestamp === existingTimestamp) {
      itemsById.set(item.id, item);
    }
  }

  return [...itemsById.values()];
}

export function chooseReliableSnapshot(
  candidates: Array<CrmSnapshot | null | undefined>,
): CrmSnapshot | null {
  const validSnapshots = candidates.filter(Boolean) as CrmSnapshot[];
  if (validSnapshots.length === 0) return null;

  return normalizeSnapshot({
    leads: validSnapshots.flatMap((snapshot) => snapshot.leads),
    visitas: dedupeById(
      validSnapshots.flatMap((snapshot) => snapshot.visitas),
      (item) => parseIsoTimestamp(item.atualizado_em || item.criado_em),
    ),
    justificativas: dedupeById(
      validSnapshots.flatMap((snapshot) => snapshot.justificativas),
      (item) => parseIsoTimestamp(item.atualizado_em || item.criado_em),
    ),
    leadsExcluidos: dedupeById(
      validSnapshots.flatMap((snapshot) => snapshot.leadsExcluidos),
      (item) => parseIsoTimestamp(item.excluido_em),
    ),
    idCounter: Math.max(...validSnapshots.map((snapshot) => snapshot.idCounter)),
    savedAt: latestIsoTimestamp(validSnapshots.map((snapshot) => snapshot.savedAt)),
  });
}

function latestIsoTimestamp(values: Array<string | null | undefined>): string {
  const valid = values.filter(Boolean) as string[];
  if (valid.length === 0) return new Date().toISOString();
  return valid.reduce((latest, current) => (current > latest ? current : latest), valid[0]);
}

export function extractMaxIdCounterFromEntities({
  leads,
  visitas,
  justificativas,
  fallback = 100,
}: {
  leads?: Lead[];
  visitas?: Visita[];
  justificativas?: Justificativa[];
  fallback?: number;
}): number {
  const ids = [
    ...(leads ?? []).map((item) => item.id),
    ...(visitas ?? []).map((item) => item.id),
    ...(justificativas ?? []).map((item) => item.id),
  ];

  let max = fallback;
  for (const id of ids) {
    const match = id?.match(/-(\d+)$/);
    if (!match) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      max = Math.max(max, parsed);
    }
  }

  return max;
}

function normalizeSnapshot(snapshot: Partial<CrmSnapshot>): CrmSnapshot {
  const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
  const visitas = (Array.isArray(snapshot.visitas) ? snapshot.visitas : []).map((visita) =>
    normalizeVisitaLegacyFields(visita as Visita & { horario?: string; horarioVisita?: string; hora_visita?: string }),
  );
  const justificativas = Array.isArray(snapshot.justificativas) ? snapshot.justificativas : [];

  const idCounter =
    typeof snapshot.idCounter === "number"
      ? snapshot.idCounter
      : extractMaxIdCounterFromEntities({ leads, visitas, justificativas });

  const savedAt =
    typeof snapshot.savedAt === "string" && snapshot.savedAt.length > 0
      ? snapshot.savedAt
      : latestIsoTimestamp([
          ...leads.map((item) => item.atualizado_em || item.criado_em),
          ...visitas.map((item) => item.atualizado_em || item.criado_em),
          ...justificativas.map((item) => item.atualizado_em || item.criado_em),
        ]);

  const leadsExcluidos = Array.isArray(snapshot.leadsExcluidos) ? snapshot.leadsExcluidos : [];

  return repairCrmSnapshot({ leads, visitas, justificativas, leadsExcluidos, idCounter, savedAt });
}

function readSnapshotFromLegacySplitKeys(): CrmSnapshot | null {
  const leadsRaw = readBestArrayLocalValue<Lead>(STORAGE.split.leads);
  const visitasRaw = readBestArrayLocalValue<Visita>(STORAGE.split.visitas);
  const justificativasRaw = readBestArrayLocalValue<Justificativa>(STORAGE.split.justificativas);
  const idCounter = readBestNumberLocalValue(STORAGE.split.idCounter);

  const hasAnyStoredValue =
    leadsRaw !== null || visitasRaw !== null || justificativasRaw !== null || typeof idCounter === "number";

  if (!hasAnyStoredValue) return null;

  const leads = Array.isArray(leadsRaw) ? leadsRaw : [];
  const visitas = Array.isArray(visitasRaw) ? visitasRaw : [];
  const justificativas = Array.isArray(justificativasRaw) ? justificativasRaw : [];

  return normalizeSnapshot({
    leads,
    visitas,
    justificativas,
    idCounter: typeof idCounter === "number" ? idCounter : undefined,
  });
}

function persistLegacySplitKeys(snapshot: CrmSnapshot, serialized: string) {
  writeToLocalStorage(STORAGE.split.leads[0], JSON.stringify(snapshot.leads));
  writeToLocalStorage(STORAGE.split.visitas[0], JSON.stringify(snapshot.visitas));
  writeToLocalStorage(STORAGE.split.justificativas[0], JSON.stringify(snapshot.justificativas));
  writeToLocalStorage(STORAGE.split.idCounter[0], JSON.stringify(snapshot.idCounter));

  writeToLocalStorage(STORAGE.split.leads[2], JSON.stringify(snapshot.leads));
  writeToLocalStorage(STORAGE.split.visitas[2], JSON.stringify(snapshot.visitas));
  writeToLocalStorage(STORAGE.split.justificativas[2], JSON.stringify(snapshot.justificativas));
  writeToLocalStorage(STORAGE.split.idCounter[2], JSON.stringify(snapshot.idCounter));

  writeToLocalStorage(STORAGE.snapshot, serialized);
  writeToLocalStorage(STORAGE.legacySnapshot, serialized);
}

export function createCrmSnapshot(snapshot: Omit<CrmSnapshot, "savedAt">): CrmSnapshot {
  return normalizeSnapshot({ ...snapshot, savedAt: new Date().toISOString() });
}

function readSnapshotFromPrimaryKeys(): CrmSnapshot | null {
  const candidates = readLocalValueCandidates<Partial<CrmSnapshot>>([
    STORAGE.snapshot,
    STORAGE.legacySnapshot,
  ])
    .filter((payload): payload is Partial<CrmSnapshot> => Boolean(payload) && typeof payload === "object")
    .map((payload) => normalizeSnapshot(payload));

  return chooseReliableSnapshot(candidates);
}

export function loadInitialCrmSnapshot(): CrmSnapshot | null {
  const preferredSnapshot = chooseReliableSnapshot([
    readSnapshotFromPrimaryKeys(),
    readSnapshotFromLegacySplitKeys(),
  ]);

  if (preferredSnapshot) {
    saveLocalSnapshot(preferredSnapshot);
    return preferredSnapshot;
  }

  return null;
}

export function saveLocalSnapshot(snapshot: CrmSnapshot) {
  const normalized = normalizeSnapshot(snapshot);
  const serialized = JSON.stringify(normalized);
  persistLegacySplitKeys(normalized, serialized);
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(STORAGE.indexedDb.dbName, STORAGE.indexedDb.version);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE.indexedDb.storeName)) {
        db.createObjectStore(STORAGE.indexedDb.storeName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function loadIndexedSnapshot(): Promise<CrmSnapshot | null> {
  const db = await openIndexedDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const transaction = db.transaction(STORAGE.indexedDb.storeName, "readonly");
    const store = transaction.objectStore(STORAGE.indexedDb.storeName);
    const request = store.get(STORAGE.indexedDb.key);

    request.onsuccess = () => {
      const payload = request.result as Partial<CrmSnapshot> | undefined;
      if (!payload || typeof payload !== "object") {
        resolve(null);
      } else {
        resolve(normalizeSnapshot(payload));
      }
    };

    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

export async function saveIndexedSnapshot(snapshot: CrmSnapshot): Promise<void> {
  const db = await openIndexedDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORAGE.indexedDb.storeName, "readwrite");
    const store = transaction.objectStore(STORAGE.indexedDb.storeName);
    store.put(normalizeSnapshot(snapshot), STORAGE.indexedDb.key);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}
