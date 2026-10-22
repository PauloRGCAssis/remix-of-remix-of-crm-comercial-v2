import { Lead, Visita } from "@/types/crm";

type VisitaLike = Partial<Visita> & {
  data_visita?: string;
  horario_visita?: string;
  horario?: string | number;
  horarioVisita?: string | number;
  hora_visita?: string | number;
  notas?: string;
  lead?: Lead & { horario?: string | number; proxima_visita_em?: string | null; observacoes?: string };
};

const HH_MM_REGEX = /(?:^|\b|T)([01]?\d|2[0-3])[:hH\.]([0-5]\d)\b/;
const FOUR_DIGIT_TIME_REGEX = /^\s*([01]\d|2[0-3])([0-5]\d)\s*$/;
const HOUR_ONLY_REGEX = /^\s*([01]?\d|2[0-3])\s*h?\s*$/;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function numberToHorario(value: number): string | undefined {
  if (!Number.isFinite(value)) return undefined;

  if (value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  if (value >= 0 && value <= 2359) {
    const hours = Math.floor(value / 100);
    const minutes = Math.round(value % 100);
    if (hours <= 23 && minutes <= 59) {
      return `${pad2(hours)}:${pad2(minutes)}`;
    }
  }

  return undefined;
}

function normalizeHorario(value?: string | number | null): string | undefined {
  if (typeof value === "number") {
    return numberToHorario(value);
  }

  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numericValue = Number(trimmed);
  if (!Number.isNaN(numericValue) && /^\d+(\.\d+)?$/.test(trimmed)) {
    const fromNumber = numberToHorario(numericValue);
    if (fromNumber) return fromNumber;
  }

  const hhmmMatch = trimmed.match(HH_MM_REGEX);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2]);
    return `${pad2(hours)}:${pad2(minutes)}`;
  }

  const fourDigitsMatch = trimmed.match(FOUR_DIGIT_TIME_REGEX);
  if (fourDigitsMatch) {
    return `${fourDigitsMatch[1]}:${fourDigitsMatch[2]}`;
  }

  const hourOnlyMatch = trimmed.match(HOUR_ONLY_REGEX);
  if (hourOnlyMatch) {
    return `${pad2(Number(hourOnlyMatch[1]))}:00`;
  }

  return undefined;
}

export function resolveVisitaHorario(visita?: VisitaLike | null, fallback = "—"): string {
  const candidates: Array<string | number | null | undefined> = [
    visita?.horario_visita,
    visita?.horario,
    visita?.horarioVisita,
    visita?.hora_visita,
    visita?.lead?.horario,
    visita?.notas,
    visita?.lead?.observacoes,
    visita?.data_visita,
    visita?.lead?.proxima_visita_em,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeHorario(candidate);
    if (normalized) return normalized;
  }

  return fallback;
}

export function normalizeVisitaLegacyFields(visita: VisitaLike): Visita {
  const horario = resolveVisitaHorario(visita, "");
  const dataVisita = typeof visita.data_visita === "string" ? visita.data_visita.slice(0, 10) : (visita.data_visita ?? "");

  return {
    ...(visita as Visita),
    data_visita: dataVisita,
    horario_visita: horario || undefined,
  };
}
