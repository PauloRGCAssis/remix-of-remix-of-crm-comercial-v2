// Geocodificação via Nominatim (OpenStreetMap) com cache em localStorage.
// Respeita o limite público de ~1 req/s.

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface AddressParts {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}

const CACHE_KEY = "geocode_cache_v1";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;

type CacheShape = Record<string, GeoPoint | null>;

function loadCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: CacheShape) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

export function buildFullAddress(parts: AddressParts): string {
  const segs: string[] = [];
  const ruaNumero = [parts.rua, parts.numero].filter(Boolean).join(", ");
  if (ruaNumero) segs.push(ruaNumero);
  if (parts.bairro) segs.push(parts.bairro);
  const cidadeUf = [parts.cidade, parts.estado].filter(Boolean).join(" - ");
  if (cidadeUf) segs.push(cidadeUf);
  if (parts.cep) segs.push(`CEP ${parts.cep}`);
  segs.push("Brasil");
  return segs.join(", ");
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function fetchNominatim(query: string): Promise<GeoPoint | null> {
  await rateLimit();
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (err) {
    console.error("Nominatim error:", err);
    return null;
  }
}

export async function geocodeAddress(parts: AddressParts): Promise<GeoPoint | null> {
  const full = buildFullAddress(parts);
  const cache = loadCache();
  if (full in cache) return cache[full];

  let result = await fetchNominatim(full);
  if (!result && parts.cep) {
    result = await fetchNominatim(`${parts.cep}, Brasil`);
  }
  if (!result && parts.bairro) {
    const fallback = [parts.bairro, parts.cidade, parts.estado, "Brasil"].filter(Boolean).join(", ");
    result = await fetchNominatim(fallback);
  }

  cache[full] = result;
  saveCache(cache);
  return result;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestNeighborOrder<T extends { coords: GeoPoint }>(
  base: GeoPoint,
  items: T[],
): T[] {
  const remaining = [...items];
  const ordered: T[] = [];
  let current = base;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i].coords);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next.coords;
  }
  return ordered;
}
