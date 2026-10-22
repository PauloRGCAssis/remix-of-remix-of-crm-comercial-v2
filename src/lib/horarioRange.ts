// Helpers para o campo "Horário" das degustações.
// Internamente trabalhamos com início/fim em formato "HH:MM".
// Para exibição usamos "09h às 13h" quando ambos têm 0 minutos, senão "09:00 às 13:00".

export interface HorarioRange {
  inicio: string; // "HH:MM"
  fim: string;    // "HH:MM"
}

const pad = (n: number) => String(n).padStart(2, "0");

export function parseHorarioRange(raw?: string | null): HorarioRange | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Aceita "09:00 às 13:00", "09h às 13h", "9h30 às 13h", "09 - 13", etc.
  const re = /(\d{1,2})\s*(?:[:h]\s*(\d{1,2}))?\s*h?\s*(?:às|as|a|-|–|—|to)\s*(\d{1,2})\s*(?:[:h]\s*(\d{1,2}))?\s*h?/i;
  const m = s.match(re);
  if (!m) return null;
  const h1 = Math.min(23, parseInt(m[1], 10));
  const m1 = m[2] ? Math.min(59, parseInt(m[2], 10)) : 0;
  const h2 = Math.min(23, parseInt(m[3], 10));
  const m2 = m[4] ? Math.min(59, parseInt(m[4], 10)) : 0;
  return { inicio: `${pad(h1)}:${pad(m1)}`, fim: `${pad(h2)}:${pad(m2)}` };
}

export function formatHorarioFriendly(range: HorarioRange | null | undefined): string {
  if (!range) return "";
  const { inicio, fim } = range;
  const [h1, m1] = inicio.split(":");
  const [h2, m2] = fim.split(":");
  const left = m1 === "00" ? `${h1}h` : `${h1}:${m1}`;
  const right = m2 === "00" ? `${h2}h` : `${h2}:${m2}`;
  return `${left} às ${right}`;
}

export function formatHorarioRaw(raw?: string | null): string {
  const parsed = parseHorarioRange(raw);
  if (parsed) return formatHorarioFriendly(parsed);
  return raw ?? "";
}

// Lista de opções a cada 30 minutos das 00:00 às 23:30
export const HORARIO_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) out.push(`${pad(h)}:${pad(m)}`);
  }
  return out;
})();

export function compareHHMM(a: string, b: string): number {
  return a.localeCompare(b);
}
