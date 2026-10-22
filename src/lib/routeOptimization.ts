import { matchBairroRegional, normalizeBairro } from "@/lib/bairroNormalization";
import { resolveVisitaHorario } from "@/lib/visitaHorario";
import { Lead, Visita } from "@/types/crm";

export type RouteItem = Visita & { lead?: Lead };

const REGION_GROUP_PRIORITY: Record<string, number> = {
  ZONA_SUL: 0,
  CENTRO_SUL_E_OESTE: 1,
  INTERMEDIARIAS: 2,
  DISTANTES: 3,
  OUTRAS: 4,
};

const REGIONAL_GROUP: Record<string, keyof typeof REGION_GROUP_PRIORITY> = {
  "Centro-Sul": "CENTRO_SUL_E_OESTE",
  "Oeste": "CENTRO_SUL_E_OESTE",
  "Leste": "INTERMEDIARIAS",
  "Nordeste": "INTERMEDIARIAS",
  "Noroeste": "INTERMEDIARIAS",
  "Pampulha": "INTERMEDIARIAS",
  "Venda Nova": "DISTANTES",
  "Norte": "DISTANTES",
  "Barreiro": "DISTANTES",
};

const ZONA_SUL_BAIRROS = new Set([
  "ANCHIETA",
  "CRUZEIRO",
  "CARMO",
  "MANGABEIRAS",
  "SAO PEDRO",
  "SION",
  "SERRA",
  "COMITECO",
  "BELVEDERE",
  "SANTO ANTONIO",
  "SAVASSI",
  "FUNCIONARIOS",
  "LOURDES",
  "CIDADE JARDIM",
  "CORACAO DE JESUS",
  "BOA VIAGEM",
  "SANTO AGOSTINHO",
  "BARRO PRETO",
  "CENTRO",
]);

const BAIRRO_PRIORITY_FROM_ANCHIETA: Record<string, number> = {
  "ANCHIETA": 0,
  "CRUZEIRO": 1,
  "CARMO": 2,
  "MANGABEIRAS": 3,
  "SAO PEDRO": 4,
  "SION": 5,
  "SERRA": 6,
  "COMITECO": 7,
  "BELVEDERE": 8,
  "SANTO ANTONIO": 9,
  "CIDADE JARDIM": 10,
  "CORACAO DE JESUS": 11,
  "SAVASSI": 12,
  "FUNCIONARIOS": 13,
  "LOURDES": 14,
  "BOA VIAGEM": 15,
  "SANTO AGOSTINHO": 16,
  "BARRO PRETO": 17,
  "CENTRO": 18,
  "GUTIERREZ": 19,
  "GRAJAU": 20,
  "BARROCA": 21,
  "CALAFATE": 22,
  "NOVA SUISSA": 23,
  "NOVA SUICA": 23,
  "NOVA GRANADA": 24,
  "ESTORIL": 25,
  "BURITIS": 26,
  "CASTELO": 27,
  "PAMPULHA": 28,
};

const TERRITORY_DISTANCE_FROM_ANCHIETA: Record<string, number> = {
  "CS2": 0,
  "CS3": 1,
  "CS4": 2,
  "CS1": 3,
  "CS5": 4,
  "O1": 5,
  "O2": 6,
  "O3": 7,
  "O4": 8,
  "O5": 9,
  "L1": 10,
  "L3": 11,
  "L4": 12,
  "L2": 13,
  "NO4": 14,
  "NO1": 15,
  "NO2": 16,
  "NO3": 17,
  "NE5": 18,
  "NE4": 19,
  "NE2": 20,
  "NE3": 21,
  "NE1": 22,
  "P2": 23,
  "P3": 24,
  "P1": 25,
  "P4": 26,
  "N4": 27,
  "N3": 28,
  "N2": 29,
  "N1": 30,
  "VN1": 31,
  "VN2": 32,
  "VN3": 33,
  "VN4": 34,
  "B1": 35,
  "B2": 36,
  "B3": 37,
  "B4": 38,
  "B5": 39,
};

function normalizePriorityKey(value?: string): string {
  return normalizeBairro(value ?? "").replace(/\s+/g, " ").trim();
}

function getTerritoryRank(territory?: string): number {
  if (!territory) return 999;
  return TERRITORY_DISTANCE_FROM_ANCHIETA[territory] ?? 999;
}

function getBairroRank(bairro?: string): number {
  if (!bairro) return 999;
  return BAIRRO_PRIORITY_FROM_ANCHIETA[normalizePriorityKey(bairro)] ?? 999;
}

function getExplicitTimeMinutes(item: RouteItem): number | null {
  const explicit = resolveVisitaHorario(
    {
      horario_visita: item.horario_visita,
      lead: item.lead ? { ...item.lead, observacoes: undefined, proxima_visita_em: undefined } : undefined,
    },
    "",
  );

  if (!/^\d{2}:\d{2}$/.test(explicit)) return null;
  const [hours, minutes] = explicit.split(":").map(Number);
  return hours * 60 + minutes;
}

function resolveRouteMetadata(lead?: Lead) {
  const bairroKey = normalizePriorityKey(lead?.bairro);
  const match = lead?.bairro ? matchBairroRegional(lead.bairro) : null;
  const matchedEntry = match?.matches.find((entry) => entry.regional === lead?.regional) ?? match?.matches[0];
  const regional = matchedEntry?.regional ?? lead?.regional ?? "";
  const group = ZONA_SUL_BAIRROS.has(bairroKey)
    ? "ZONA_SUL"
    : (REGIONAL_GROUP[regional] ?? "OUTRAS");

  return {
    bairroKey,
    bairroRank: getBairroRank(lead?.bairro),
    groupRank: REGION_GROUP_PRIORITY[group],
    territoryRank: getTerritoryRank(matchedEntry?.territorio),
    regional,
  };
}

function normalizeCityKey(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function compareRouteOrder(a: RouteItem, b: RouteItem): number {
  const metaA = resolveRouteMetadata(a.lead);
  const metaB = resolveRouteMetadata(b.lead);

  // Separa cidades/UFs distintas — bairros homônimos (ex.: Cruzeiro/BH vs Cruzeiro/Contagem)
  // nunca devem ser agrupados.
  const ufA = (a.lead?.estado ?? "").toUpperCase();
  const ufB = (b.lead?.estado ?? "").toUpperCase();
  const cidadeA = normalizeCityKey(a.lead?.cidade);
  const cidadeB = normalizeCityKey(b.lead?.cidade);
  // BH primeiro, depois alfabético por UF/cidade
  const isBhA = cidadeA === "BELO HORIZONTE" && (ufA === "MG" || ufA === "");
  const isBhB = cidadeB === "BELO HORIZONTE" && (ufB === "MG" || ufB === "");
  if (isBhA !== isBhB) return isBhA ? -1 : 1;
  if (ufA !== ufB) return ufA.localeCompare(ufB);
  if (cidadeA !== cidadeB) return cidadeA.localeCompare(cidadeB);

  if (metaA.groupRank !== metaB.groupRank) {
    return metaA.groupRank - metaB.groupRank;
  }

  if (metaA.bairroRank !== metaB.bairroRank) {
    return metaA.bairroRank - metaB.bairroRank;
  }

  if (metaA.territoryRank !== metaB.territoryRank) {
    return metaA.territoryRank - metaB.territoryRank;
  }

  const timeA = getExplicitTimeMinutes(a);
  const timeB = getExplicitTimeMinutes(b);
  if (timeA !== null && timeB !== null && timeA !== timeB) {
    return timeA - timeB;
  }

  const bairroCompare = metaA.bairroKey.localeCompare(metaB.bairroKey, "pt-BR");
  if (bairroCompare !== 0) return bairroCompare;

  return (a.lead?.nome_fantasia ?? "").localeCompare(b.lead?.nome_fantasia ?? "", "pt-BR");
}

export function optimizeRoute(items: RouteItem[]): RouteItem[] {
  return [...items].sort(compareRouteOrder);
}
