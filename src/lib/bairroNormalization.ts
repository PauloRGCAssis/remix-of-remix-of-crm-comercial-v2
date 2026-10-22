// Normalização e matching de bairros para regionais de BH
// Implementa: normalização de texto, match exato, match fuzzy (Levenshtein)

import { BH_BAIRROS_REGIONAIS, type RegionalBH, type BairroRegionalEntry } from '@/data/bhBairrosRegionais';

// ==================== TIPOS ====================

export type RegionalStatus = 'AUTO_OK' | 'AUTO_AMBIGUO' | 'AUTO_NAO_ENCONTRADO' | 'MANUAL';

export interface RegionalMatchResult {
  regional?: RegionalBH;
  regional_status: RegionalStatus;
  regional_confianca: number;
  regional_fonte: string;
  matches: BairroRegionalEntry[];
  bairro_normalizado: string;
}

// ==================== ABREVIAÇÕES ====================

const ABREVIACOES: [RegExp, string][] = [
  [/\bJD\b/g, 'JARDIM'],
  [/\bSTA\b/g, 'SANTA'],
  [/\bSTO\b/g, 'SANTO'],
  [/\bPCA\b/g, 'PRACA'],
  [/\bVL\b/g, 'VILA'],
  [/\bCJ\b/g, 'CONJUNTO'],
  [/\bCONJ\b/g, 'CONJUNTO'],
  [/\bN\.\s*S(RA)?\.?\b/g, 'NOSSA SENHORA'],
  [/\bAV\b/g, 'AVENIDA'],
  [/\bR\b/g, 'RUA'],
  [/\bPQ\b/g, 'PARQUE'],
];

// ==================== NORMALIZAÇÃO ====================

/**
 * Remove diacríticos (acentos) de uma string
 */
function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza um nome de bairro para busca.
 * Regras:
 * 1. Remove acentos/diacríticos
 * 2. Trim e colapsa espaços múltiplos
 * 3. UPPERCASE
 * 4. Padroniza hífens e underscores
 * 5. Remove pontuação
 * 6. Expande abreviações comuns
 */
export function normalizeBairro(bairro: string): string {
  if (!bairro) return '';

  let normalized = bairro;

  // 1. Remove acentos
  normalized = removeDiacritics(normalized);

  // 2. Uppercase
  normalized = normalized.toUpperCase();

  // 3. Trocar – (en dash), — (em dash), _ por espaço
  normalized = normalized.replace(/[–—_]/g, ' ');

  // 4. Remove pontuação (mas mantém apóstrofos para D'AGUA etc, tratados depois)
  normalized = normalized.replace(/[.,;:\/|()[\]{}!?@#$%^&*+=~`"<>\\]/g, '');

  // 5. Tratar apóstrofos: "D'AGUA" -> "DAGUA", "OLHOS D'AGUA" -> "OLHOS DAGUA"
  normalized = normalized.replace(/'/g, '');

  // 6. Remover hífens (padronizar)
  normalized = normalized.replace(/-/g, ' ');

  // 7. Colapsar espaços múltiplos e trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // 8. Expandir abreviações
  for (const [pattern, replacement] of ABREVIACOES) {
    normalized = normalized.replace(pattern, replacement);
  }

  // 9. Colapsar espaços novamente após expansão
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

// ==================== ÍNDICE PRÉ-COMPUTADO ====================

interface IndexEntry {
  bairro_normalizado: string;
  entries: BairroRegionalEntry[];
  regionais: RegionalBH[];
}

let _index: Map<string, IndexEntry> | null = null;

function getIndex(): Map<string, IndexEntry> {
  if (_index) return _index;

  _index = new Map();

  for (const entry of BH_BAIRROS_REGIONAIS) {
    const normalized = normalizeBairro(entry.bairro_oficial);
    const existing = _index.get(normalized);

    if (existing) {
      // Evitar duplicatas (mesmo bairro_normalizado + regional)
      if (!existing.regionais.includes(entry.regional)) {
        existing.entries.push(entry);
        existing.regionais.push(entry.regional);
      }
    } else {
      _index.set(normalized, {
        bairro_normalizado: normalized,
        entries: [entry],
        regionais: [entry.regional],
      });
    }
  }

  return _index;
}

// ==================== LEVENSHTEIN ====================

/**
 * Calcula a distância de Levenshtein entre duas strings
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calcula similaridade entre 0 e 1 baseada na distância de Levenshtein
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ==================== MATCHING ====================

const FUZZY_THRESHOLD = 0.92;

/**
 * Busca regional(is) para um bairro digitado.
 * Fluxo:
 * A) Match exato → AUTO_OK (confiança 1.0) ou AUTO_AMBIGUO se compartilhado
 * B) Match fuzzy (≥ 0.92) → AUTO_OK ou AUTO_AMBIGUO
 * C) Não encontrado → AUTO_NAO_ENCONTRADO
 */
export function matchBairroRegional(bairroInput: string): RegionalMatchResult {
  const bairroNorm = normalizeBairro(bairroInput);

  if (!bairroNorm) {
    return {
      regional_status: 'AUTO_NAO_ENCONTRADO',
      regional_confianca: 0,
      regional_fonte: 'BH_BAIRROS_REGIONAIS',
      matches: [],
      bairro_normalizado: '',
    };
  }

  const index = getIndex();

  // Passo A: Match exato
  const exactMatch = index.get(bairroNorm);
  if (exactMatch) {
    if (exactMatch.regionais.length === 1) {
      return {
        regional: exactMatch.regionais[0],
        regional_status: 'AUTO_OK',
        regional_confianca: 1.0,
        regional_fonte: 'BH_BAIRROS_REGIONAIS',
        matches: exactMatch.entries,
        bairro_normalizado: bairroNorm,
      };
    } else {
      // Bairro compartilhado entre regionais
      return {
        regional_status: 'AUTO_AMBIGUO',
        regional_confianca: 1.0,
        regional_fonte: 'BH_BAIRROS_REGIONAIS',
        matches: exactMatch.entries,
        bairro_normalizado: bairroNorm,
      };
    }
  }

  // Passo B: Match fuzzy
  const fuzzyResults: { entry: IndexEntry; sim: number }[] = [];

  for (const [key, entry] of index) {
    const sim = similarity(bairroNorm, key);
    if (sim >= FUZZY_THRESHOLD) {
      fuzzyResults.push({ entry, sim });
    }
  }

  if (fuzzyResults.length > 0) {
    // Ordenar por similaridade decrescente
    fuzzyResults.sort((a, b) => b.sim - a.sim);

    const bestSim = fuzzyResults[0].sim;
    const bestMatches = fuzzyResults.filter(r => r.sim === bestSim);

    if (bestMatches.length === 1) {
      const best = bestMatches[0].entry;
      if (best.regionais.length === 1) {
        return {
          regional: best.regionais[0],
          regional_status: 'AUTO_OK',
          regional_confianca: Math.round(bestSim * 100) / 100,
          regional_fonte: 'BH_BAIRROS_REGIONAIS',
          matches: best.entries,
          bairro_normalizado: bairroNorm,
        };
      } else {
        return {
          regional_status: 'AUTO_AMBIGUO',
          regional_confianca: Math.round(bestSim * 100) / 100,
          regional_fonte: 'BH_BAIRROS_REGIONAIS',
          matches: best.entries,
          bairro_normalizado: bairroNorm,
        };
      }
    } else {
      // Múltiplos matches fuzzy com mesma similaridade
      const allEntries = bestMatches.flatMap(m => m.entry.entries);
      return {
        regional_status: 'AUTO_AMBIGUO',
        regional_confianca: Math.round(bestSim * 100) / 100,
        regional_fonte: 'BH_BAIRROS_REGIONAIS',
        matches: allEntries,
        bairro_normalizado: bairroNorm,
      };
    }
  }

  // Passo D: Não encontrado
  return {
    regional_status: 'AUTO_NAO_ENCONTRADO',
    regional_confianca: 0,
    regional_fonte: 'BH_BAIRROS_REGIONAIS',
    matches: [],
    bairro_normalizado: bairroNorm,
  };
}

/**
 * Retorna a lista de todas as entradas do índice para busca/autocomplete
 */
export function getAllBairrosNormalizados(): string[] {
  return Array.from(getIndex().keys()).sort();
}

/**
 * Retorna sugestões de bairros que começam com o prefixo digitado
 */
export function suggestBairros(input: string, limit = 10): BairroRegionalEntry[] {
  const norm = normalizeBairro(input);
  if (!norm) return [];

  const index = getIndex();
  const results: BairroRegionalEntry[] = [];

  for (const [key, entry] of index) {
    if (key.startsWith(norm) || key.includes(norm)) {
      results.push(...entry.entries);
      if (results.length >= limit) break;
    }
  }

  return results.slice(0, limit);
}

// ==================== AUDITORIA ====================

export interface AuditLogEntry {
  timestamp: string;
  bairro_digitado: string;
  bairro_normalizado: string;
  regional_status: RegionalStatus;
  regional_resultado?: RegionalBH;
  regionais_possiveis?: RegionalBH[];
  acao: string;
}

const _auditLog: AuditLogEntry[] = [];

export function addAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  _auditLog.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

export function getAuditLog(): AuditLogEntry[] {
  return [..._auditLog];
}

export function getAuditStats() {
  const log = getAuditLog();
  const byStatus: Record<RegionalStatus, number> = {
    AUTO_OK: 0,
    AUTO_AMBIGUO: 0,
    AUTO_NAO_ENCONTRADO: 0,
    MANUAL: 0,
  };

  const naoEncontrados: Record<string, number> = {};
  const ambiguos: Record<string, number> = {};

  for (const entry of log) {
    byStatus[entry.regional_status]++;

    if (entry.regional_status === 'AUTO_NAO_ENCONTRADO') {
      naoEncontrados[entry.bairro_digitado] = (naoEncontrados[entry.bairro_digitado] || 0) + 1;
    }
    if (entry.regional_status === 'AUTO_AMBIGUO') {
      ambiguos[entry.bairro_digitado] = (ambiguos[entry.bairro_digitado] || 0) + 1;
    }
  }

  const topNaoEncontrados = Object.entries(naoEncontrados)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  const topAmbiguos = Object.entries(ambiguos)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  return { byStatus, topNaoEncontrados, topAmbiguos, total: log.length };
}
