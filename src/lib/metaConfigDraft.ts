// Rascunho automático da janela "Configuração de Metas".
//
// Regras de segurança:
// - O rascunho guarda SOMENTE os campos alterados pelo usuário (valor digitado +
//   valor salvo no banco no momento da edição). Campos não tocados nunca entram.
// - É separado por usuário + mês de referência.
// - Rascunhos antigos (sem registro do valor original) ou suspeitos (o mesmo valor
//   repetido em vários campos/vendedores) NUNCA são aplicados automaticamente:
//   vão para quarentena e o usuário decide se aplica ou remove.

export type VendorField = "gasolina" | "verde" | "aceleracao" | "azul";
export const VENDOR_FIELDS: VendorField[] = ["gasolina", "verde", "aceleracao", "azul"];
export const VENDOR_FIELD_LABEL: Record<VendorField, string> = {
  gasolina: "Meta Média",
  verde: "Meta Combustível",
  aceleracao: "Meta 0,5%",
  azul: "Meta 1%",
};

export type VendorDraftValues = Record<VendorField, string>;
export type VendorDraftMap = Record<string, VendorDraftValues>;
export type GlobalDraftValues = {
  pctGasolina: string; pctVerde: string; pctRoxa: string; pctAzul: string;
  fixoGasolina: string; fixoVerde: string; fixoAzul: string;
};
type GlobalKey = keyof GlobalDraftValues;

export type FieldChange = { value: string; base: string };
export type DraftChanges = {
  vendor: Record<string, Partial<Record<VendorField, FieldChange>>>;
  global: Partial<Record<GlobalKey, FieldChange>>;
};

export type MetaConfigDraftV2 = {
  version: 2;
  userId: string;
  yearMonth: string;
  savedAt: number;
  changes: DraftChanges;
};

export type DraftReview = {
  /** Motivo pelo qual o rascunho não foi aplicado automaticamente. */
  reason: "legacy" | "suspicious";
  changes: DraftChanges;
  savedAt: number;
  /** Valor repetido que tornou o rascunho suspeito. */
  repeatedValue?: string;
  /** Alterações que não usam o valor repetido (possivelmente legítimas). */
  individualChanges: DraftChanges;
};

export type LoadedDraft =
  | { kind: "none" }
  | { kind: "apply"; changes: DraftChanges; savedAt: number }
  | { kind: "review"; review: DraftReview };

const PREFIX = "ti-delso:meta-config-draft";

export function metaDraftKey(userId: string, yearMonth: string): string {
  return `${PREFIX}:${userId || "anon"}:${yearMonth}`;
}
export function quarantineDraftKey(userId: string, yearMonth: string): string {
  return `${PREFIX}:quarentena:${userId || "anon"}:${yearMonth}`;
}
/** Chave antiga (sem usuário), usada antes do salvamento automático. */
export function legacyMetaDraftKey(yearMonth: string): string {
  return `${PREFIX}:${yearMonth}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const normalize = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export function emptyChanges(): DraftChanges {
  return { vendor: {}, global: {} };
}

export function countChanges(c: DraftChanges): number {
  let n = Object.keys(c.global).length;
  for (const v of Object.values(c.vendor)) n += Object.keys(v).length;
  return n;
}

/** Calcula somente os campos que diferem dos valores salvos. */
export function diffChanges(
  baseVendor: VendorDraftMap,
  vendor: VendorDraftMap,
  baseGlobal: GlobalDraftValues,
  global: GlobalDraftValues,
): DraftChanges {
  const out = emptyChanges();
  for (const [v, vals] of Object.entries(vendor)) {
    for (const f of VENDOR_FIELDS) {
      const value = vals?.[f] ?? "";
      const base = baseVendor[v]?.[f] ?? "";
      if (value !== base) (out.vendor[v] ??= {})[f] = { value, base };
    }
  }
  for (const k of Object.keys(global) as GlobalKey[]) {
    const value = global[k] ?? "";
    const base = baseGlobal[k] ?? "";
    if (value !== base) out.global[k] = { value, base };
  }
  return out;
}

/** Aplica alterações sobre os valores atuais do banco; campos não alterados ficam intactos. */
export function applyChanges(
  freshVendor: VendorDraftMap,
  freshGlobal: GlobalDraftValues,
  changes: DraftChanges,
): { vendor: VendorDraftMap; global: GlobalDraftValues } {
  const vendor: VendorDraftMap = {};
  for (const [v, vals] of Object.entries(freshVendor)) {
    const ch = changes.vendor[v];
    vendor[v] = { ...vals };
    if (!ch) continue;
    for (const f of VENDOR_FIELDS) if (ch[f]) vendor[v][f] = ch[f]!.value;
  }
  const global = { ...freshGlobal };
  for (const k of Object.keys(changes.global) as GlobalKey[]) {
    if (changes.global[k]) global[k] = changes.global[k]!.value;
  }
  return { vendor, global };
}

/**
 * Atualiza a base quando os valores do banco mudam com a janela aberta:
 * mantém o que o usuário digitou e usa os novos valores do banco no resto.
 */
export function rebaseValues(
  oldBase: VendorDraftMap,
  current: VendorDraftMap,
  fresh: VendorDraftMap,
): VendorDraftMap {
  const ch = diffChanges(oldBase, current, {} as GlobalDraftValues, {} as GlobalDraftValues);
  return applyChanges(fresh, {} as GlobalDraftValues, ch).vendor;
}

/** Detecta o mesmo valor repetido em vários campos de vendedores diferentes. */
export function detectRepeatedValue(c: DraftChanges): string | null {
  const byValue = new Map<string, { count: number; vendors: Set<string> }>();
  for (const [v, fields] of Object.entries(c.vendor)) {
    for (const f of VENDOR_FIELDS) {
      const ch = fields[f];
      if (!ch) continue;
      const val = normalize(ch.value);
      if (!val) continue;
      const e = byValue.get(val) ?? { count: 0, vendors: new Set<string>() };
      e.count += 1;
      e.vendors.add(v);
      byValue.set(val, e);
    }
  }
  for (const [val, e] of byValue) {
    if (e.count >= 3 && e.vendors.size >= 2) return val;
  }
  return null;
}

function withoutValue(c: DraftChanges, value: string): DraftChanges {
  const out = emptyChanges();
  out.global = { ...c.global };
  for (const [v, fields] of Object.entries(c.vendor)) {
    for (const f of VENDOR_FIELDS) {
      const ch = fields[f];
      if (ch && normalize(ch.value) !== value) (out.vendor[v] ??= {})[f] = ch;
    }
  }
  return out;
}

/** Remove alterações que já coincidem com o banco ou de vendedores que não existem mais. */
function pruneChanges(c: DraftChanges, freshVendor: VendorDraftMap, freshGlobal: GlobalDraftValues): DraftChanges {
  const out = emptyChanges();
  for (const [v, fields] of Object.entries(c.vendor)) {
    if (!freshVendor[v]) continue;
    for (const f of VENDOR_FIELDS) {
      const ch = fields?.[f];
      if (ch && ch.value !== (freshVendor[v][f] ?? "")) (out.vendor[v] ??= {})[f] = ch;
    }
  }
  for (const k of Object.keys(c.global ?? {}) as GlobalKey[]) {
    const ch = c.global[k];
    if (ch && ch.value !== (freshGlobal[k] ?? "")) out.global[k] = ch;
  }
  return out;
}

type AnyStoredDraft = Partial<MetaConfigDraftV2> & {
  vendor?: VendorDraftMap;
  global?: GlobalDraftValues;
  baseVendor?: VendorDraftMap;
  baseGlobal?: GlobalDraftValues;
};

/** Converte qualquer formato salvo em alterações; diz se é um formato confiável. */
function toChanges(
  raw: AnyStoredDraft,
  freshVendor: VendorDraftMap,
  freshGlobal: GlobalDraftValues,
): { changes: DraftChanges; trusted: boolean } {
  if (raw.version === 2 && raw.changes) return { changes: raw.changes, trusted: true };
  if (raw.vendor && raw.baseVendor) {
    // Formato intermediário (mapa completo + base): só o que difere da base.
    return {
      changes: diffChanges(raw.baseVendor, raw.vendor, raw.baseGlobal ?? freshGlobal, raw.global ?? freshGlobal),
      trusted: true,
    };
  }
  // Formato antigo, sem valor original: não dá para saber o que foi digitado.
  return {
    changes: diffChanges(freshVendor, raw.vendor ?? {}, freshGlobal, raw.global ?? freshGlobal),
    trusted: false,
  };
}

/**
 * Lê o rascunho do usuário/mês e decide se pode ser aplicado automaticamente.
 * Rascunhos que precisam de revisão são movidos para a quarentena (nunca apagados).
 */
export function loadMetaDraft(
  userId: string,
  yearMonth: string,
  freshVendor: VendorDraftMap,
  freshGlobal: GlobalDraftValues,
): LoadedDraft {
  const ls = storage();
  if (!ls) return { kind: "none" };
  const sources: Array<{ key: string; raw: string | null }> = [
    { key: quarantineDraftKey(userId, yearMonth), raw: ls.getItem(quarantineDraftKey(userId, yearMonth)) },
    { key: metaDraftKey(userId, yearMonth), raw: ls.getItem(metaDraftKey(userId, yearMonth)) },
    { key: legacyMetaDraftKey(yearMonth), raw: ls.getItem(legacyMetaDraftKey(yearMonth)) },
  ];
  for (const { key, raw } of sources) {
    if (!raw) continue;
    let parsed: AnyStoredDraft | null = null;
    try { parsed = JSON.parse(raw) as AnyStoredDraft; } catch { parsed = null; }
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.yearMonth && parsed.yearMonth !== yearMonth) continue;
    if (parsed.userId && parsed.userId !== userId) continue;

    const { changes: rawChanges, trusted } = toChanges(parsed, freshVendor, freshGlobal);
    const changes = pruneChanges(rawChanges, freshVendor, freshGlobal);
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now();
    const isQuarantine = key === quarantineDraftKey(userId, yearMonth);

    if (countChanges(changes) === 0) {
      if (!isQuarantine) { try { ls.removeItem(key); } catch { /* noop */ } }
      continue;
    }
    const repeated = detectRepeatedValue(changes);
    if (trusted && !repeated && !isQuarantine) {
      if (key !== metaDraftKey(userId, yearMonth)) {
        try { ls.removeItem(key); } catch { /* noop */ }
      }
      return { kind: "apply", changes, savedAt };
    }
    // Precisa de revisão: guarda em quarentena e tira da chave ativa.
    const review: DraftReview = {
      reason: trusted ? "suspicious" : "legacy",
      changes,
      savedAt,
      repeatedValue: repeated ?? undefined,
      individualChanges: repeated ? withoutValue(changes, repeated) : changes,
    };
    if (repeated && review.reason === "legacy") review.reason = "suspicious";
    try {
      ls.setItem(
        quarantineDraftKey(userId, yearMonth),
        JSON.stringify({ version: 2, userId, yearMonth, savedAt, changes } satisfies MetaConfigDraftV2),
      );
      if (!isQuarantine) ls.removeItem(key);
    } catch { /* noop */ }
    return { kind: "review", review };
  }
  return { kind: "none" };
}

export function writeMetaDraft(userId: string, yearMonth: string, changes: DraftChanges): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    if (countChanges(changes) === 0) {
      ls.removeItem(metaDraftKey(userId, yearMonth));
      return true;
    }
    const draft: MetaConfigDraftV2 = { version: 2, userId, yearMonth, savedAt: Date.now(), changes };
    ls.setItem(metaDraftKey(userId, yearMonth), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearMetaDraft(userId: string, yearMonth: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(metaDraftKey(userId, yearMonth));
    ls.removeItem(legacyMetaDraftKey(yearMonth));
  } catch { /* noop */ }
}

export function clearQuarantineDraft(userId: string, yearMonth: string): void {
  const ls = storage();
  if (!ls) return;
  try { ls.removeItem(quarantineDraftKey(userId, yearMonth)); } catch { /* noop */ }
}

/** Campos que tinham meta salva e ficariam vazios (informação incompleta). */
export function findClearedFields(
  baseVendor: VendorDraftMap,
  vendor: VendorDraftMap,
): Array<{ vendedor: string; field: VendorField }> {
  const out: Array<{ vendedor: string; field: VendorField }> = [];
  for (const [v, vals] of Object.entries(vendor)) {
    for (const f of VENDOR_FIELDS) {
      if ((baseVendor[v]?.[f] ?? "").trim() !== "" && (vals?.[f] ?? "").trim() === "") {
        out.push({ vendedor: v, field: f });
      }
    }
  }
  return out;
}

/** Vendedores com alguma meta alterada — só esses são gravados no banco. */
export function changedVendors(baseVendor: VendorDraftMap, vendor: VendorDraftMap): string[] {
  return Object.keys(vendor).filter((v) =>
    VENDOR_FIELDS.some((f) => (vendor[v]?.[f] ?? "") !== (baseVendor[v]?.[f] ?? "")),
  );
}
