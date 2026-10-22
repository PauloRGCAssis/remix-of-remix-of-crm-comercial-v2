// Detecção de candidatos a duplicata entre nomes de clientes.
//
// Estratégia:
//  - Compara nomes "core" (após remover sigla parentética final e normalizar
//    acentos/case/pontuação).
//  - Mesma chave core → "Diferença apenas por sigla" ou "Nome muito parecido".
//  - Levenshtein normalizado ≥ 0.82 com tamanhos parecidos → "Nome muito parecido".
//  - Reforço de confiança quando houver mesmo vendedor, mesma cidade/bairro,
//    mesmo telefone/CNPJ, ou quando um dos lados estiver "abandonado" e o
//    outro tiver compra recente (provável atualização do mesmo cliente).
//
// Recebe pares já decididos para evitar reapresentar "manter_separados".

export interface ClienteMeta {
  vendedor?: string;
  bairro?: string;
  cidade?: string;
  telefone?: string;
  cnpj?: string;
  ultimaCompra?: string | Date | null;
  faturamento?: number;
}

export interface DuplicateCandidate {
  clienteA: string;
  clienteB: string;
  similarity: number;       // similaridade textual 0–1
  confidence: number;       // confiança global 0–1 (combina sinais)
  motivos: string[];
  canonicalSuggested?: string;
  autoSuggested?: boolean;  // true quando o sistema recomenda agrupar
  possibleBranch?: boolean; // true quando nomes parecem filiais/unidades distintas
}

function stripSiglaParenteses(value: string): string {
  let s = value.trim();
  while (true) {
    const next = s.replace(/\s*\([^()]{1,6}\)\s*$/u, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function stripTrailingDescriptor(value: string): string {
  // Remove sufixos tipo " - Faculdade Una Contagem", " - Unidade Centro",
  // mantendo o "core" do nome principal antes do hífen.
  const idx = value.search(/\s[-–—/|]\s/);
  if (idx > 3) return value.slice(0, idx).trim();
  return value;
}

function extractDescriptor(value: string): string {
  const stripped = stripSiglaParenteses(String(value || ""));
  const m = stripped.match(/\s[-–—/|]\s+(.+)$/);
  if (!m) return "";
  return m[1]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palavras complementares que não diferenciam unidades ("BH Outlet" x
// "BH Outlet Shopping"). Se a única diferença entre os descritores forem
// estas palavras, trata-se do MESMO cliente.
const COMPLEMENT_WORDS = new Set([
  "shopping", "shoping", "mall", "outlet", "center", "centre", "plaza",
  "loja", "lj", "unid", "ltda", "me", "epp", "eireli", "cia", "e", "de",
  "da", "do", "dos", "das", "the", "sa", "s a",
]);

function descriptorTokens(desc: string): string[] {
  return desc.split(/\s+/).filter(Boolean);
}

/**
 * Dois descritores são equivalentes quando:
 *  - são iguais;
 *  - um é prefixo do outro e as palavras extras são apenas complementares
 *    (ex.: "bh outlet" x "bh outlet shopping");
 *  - após remover complementos, ficam idênticos;
 *  - similaridade textual muito alta (erro de digitação).
 */
function descriptorsEquivalent(da: string, db: string): boolean {
  if (!da || !db) return false;
  if (da === db) return true;

  const ta = descriptorTokens(da);
  const tb = descriptorTokens(db);
  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const isPrefix = shortT.every((t, i) => longT[i] === t);
  if (isPrefix && longT.slice(shortT.length).every((t) => COMPLEMENT_WORDS.has(t))) {
    return true;
  }

  const cleanA = ta.filter((t) => !COMPLEMENT_WORDS.has(t)).join(" ");
  const cleanB = tb.filter((t) => !COMPLEMENT_WORDS.has(t)).join(" ");
  if (cleanA && cleanA === cleanB) return true;

  return similarityScore(da, db) >= 0.9;
}

/**
 * Mesma unidade escrita de formas diferentes: os nomes completos ficam
 * idênticos após normalização e remoção de palavras complementares.
 * Ex.: "Cafeteria Cheirin Bao - BH Outlet" x
 *      "Cafeteria Cheirin Bao - BH Outlet Shopping"
 */
function sameUnitName(a: string, b: string): boolean {
  const ka = coreKey(a);
  const kb = coreKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Se há numeração diferente, são unidades distintas.
  const numsA = (ka.match(NUMERIC_RX) || []).join(",");
  const numsB = (kb.match(NUMERIC_RX) || []).join(",");
  if (numsA !== numsB) return false;
  const cleanA = ka.split(/\s+/).filter((t) => !COMPLEMENT_WORDS.has(t)).join(" ");
  const cleanB = kb.split(/\s+/).filter((t) => !COMPLEMENT_WORDS.has(t)).join(" ");
  return !!cleanA && cleanA === cleanB;
}



/**
 * Detecta conflito de localização/filial entre dois nomes.
 * Quando os descritores após hífen/barra são diferentes (cidades, bairros,
 * lojas, unidades, filiais etc.), os clientes NÃO devem ser sugeridos como
 * duplicata automaticamente — provavelmente são unidades distintas.
 */
function descriptorsConflict(a: string, b: string): boolean {
  const da = extractDescriptor(a);
  const db = extractDescriptor(b);
  if (!da && !db) return false;
  if (descriptorsEquivalent(da, db)) return false;
  // Um dos lados tem descritor e o outro não: provável matriz vs filial.
  if (!da || !db) return true;
  // Ambos têm descritores diferentes: provável cidades/lojas/unidades distintas.
  return true;
}


// Tokens fortes que indicam diferentes unidades/lojas/filiais.
const BRANCH_TOKEN_RX = /\b(loja|lj|unidade|und|un|filial|matriz|fil)\b/i;
const ROMAN_RX = /\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/i;
const NUMERIC_RX = /\b\d{1,4}\b/g;

// Palavras geográficas / de unidade que indicam filiais/redes (NÃO duplicados).
const LOCATION_KEYWORDS = [
  "nova lima", "sagrada familia", "ouro preto", "oriente", "lourdes",
  "buritis", "castelo", "savassi", "pampulha", "centro", "barreiro",
  "venda nova", "contagem", "betim", "ipatinga", "uberlandia", "uberaba",
  "juiz de fora", "divinopolis", "sete lagoas", "jardim canada",
  "belo horizonte", "bh", "sao paulo", "rio de janeiro", "brasilia", "df",
  "estoril", "anchieta", "funcionarios", "santa tereza", "santo agostinho",
  "cidade nova", "prado", "gutierrez", "sion", "serra", "carmo",
  "horto", "floresta", "santa efigenia", "santa monica", "santa amelia",
  "jardim america", "jardim atlantico", "padre eustaquio", "calafate",
  "loja", "lojas", "unidade", "und", "un", "filial", "matriz", "fil",
];
const LOCATION_KEYWORDS_RX = new RegExp(
  "\\b(" + LOCATION_KEYWORDS.map((k) => k.replace(/\s+/g, "\\s+")).join("|") + ")\\b",
  "i",
);

function hasLocationKeyword(name: string): boolean {
  const n = normLower(name);
  if (LOCATION_KEYWORDS_RX.test(n)) return true;
  // Numerais romanos isolados após o nome (Brasília I, Maximus II)
  if (/\s(i{1,3}|iv|v|vi{0,3}|ix|x)\s*$/i.test(n)) return true;
  // Numerais finais (Loja 11, Unidade 2)
  if (/\s\d{1,4}\s*$/.test(n)) return true;
  return false;
}

function normLower(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Heurística para identificar quando dois nomes representam filiais/unidades
 * diferentes da mesma rede (NÃO duplicados). Exemplos:
 *  - "Coelho Diniz Loja 11" vs "Coelho Diniz Loja 12"
 *  - "Empada Brasília I" vs "Empada Brasília II"
 *  - "Padaria X Matriz" vs "Padaria X Filial"
 *  - "Padaria X - Buritis" vs "Padaria X - Estoril"
 */
function looksLikeDifferentBranches(a: string, b: string): boolean {
  const na = normLower(a);
  const nb = normLower(b);
  if (na === nb) return false;

  // 1) Ambos com tokens de unidade/loja/filial, mas números diferentes
  const aHasTok = BRANCH_TOKEN_RX.test(na);
  const bHasTok = BRANCH_TOKEN_RX.test(nb);
  if (aHasTok && bHasTok) {
    const nra = (na.match(NUMERIC_RX) || []).join(",");
    const nrb = (nb.match(NUMERIC_RX) || []).join(",");
    if (nra && nrb && nra !== nrb) return true;
    // Matriz x Filial
    if (/matriz/.test(na) !== /matriz/.test(nb)) return true;
    // Romanos diferentes (Unidade I vs II)
    const ra = (na.match(ROMAN_RX) || [])[0];
    const rb = (nb.match(ROMAN_RX) || [])[0];
    if (ra && rb && ra !== rb) return true;
  }

  // 2) Mesmo prefixo + numeração trailing diferente sem token explícito
  //    ex.: "Padaria X 1" vs "Padaria X 2"
  const stripNum = (s: string) => s.replace(/\s+\d{1,4}\s*$/, "").trim();
  if (stripNum(na) === stripNum(nb) && stripNum(na).length > 4) {
    const na2 = (na.match(/\d{1,4}\s*$/) || [])[0];
    const nb2 = (nb.match(/\d{1,4}\s*$/) || [])[0];
    if (na2 && nb2 && na2 !== nb2) return true;
  }

  // 3) Descritor após " - " com palavras geográficas/operacionais diferentes
  const da = extractDescriptor(a);
  const db = extractDescriptor(b);
  if (da && db && !descriptorsEquivalent(da, db)) {
    // se ambos descritores existem e diferem, provável filial
    return true;
  }


  return false;
}


function coreKey(value: string, opts: { stripDescriptor?: boolean } = {}): string {
  let stripped = stripSiglaParenteses(String(value || ""));
  if (opts.stripDescriptor) stripped = stripTrailingDescriptor(stripped);
  return stripped
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("||");
}

function daysSince(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function normText(s?: string | null): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normPhone(s?: string | null): string {
  return String(s || "").replace(/\D+/g, "");
}

interface BuildOptions {
  decidedPairs?: Set<string>;
  minSimilarity?: number;
  metas?: Map<string, ClienteMeta>;
}

function buildCandidate(
  a: string,
  b: string,
  similarity: number,
  motivosBase: string[],
  metas?: Map<string, ClienteMeta>,
): DuplicateCandidate {
  const motivos = [...motivosBase];
  const mA = metas?.get(a);
  const mB = metas?.get(b);

  let confidence = similarity; // base
  if (mA && mB) {
    if (mA.vendedor && mB.vendedor && normText(mA.vendedor) === normText(mB.vendedor)) {
      motivos.push("Mesmo vendedor");
      confidence += 0.05;
    }
    if (mA.cidade && mB.cidade && normText(mA.cidade) === normText(mB.cidade)) {
      motivos.push("Mesma cidade");
      confidence += 0.03;
    }
    if (mA.bairro && mB.bairro && normText(mA.bairro) === normText(mB.bairro)) {
      motivos.push("Mesmo bairro");
      confidence += 0.04;
    }
    if (mA.telefone && mB.telefone && normPhone(mA.telefone) && normPhone(mA.telefone) === normPhone(mB.telefone)) {
      motivos.push("Mesmo telefone");
      confidence += 0.15;
    }
    if (mA.cnpj && mB.cnpj && normPhone(mA.cnpj) && normPhone(mA.cnpj) === normPhone(mB.cnpj)) {
      motivos.push("Mesmo CNPJ");
      confidence += 0.2;
    }
    const dA = daysSince(mA.ultimaCompra);
    const dB = daysSince(mB.ultimaCompra);
    if (dA !== null && dB !== null) {
      const ativo = Math.min(dA, dB);
      const abandonado = Math.max(dA, dB);
      if (ativo <= 30 && abandonado >= 60) {
        motivos.push("Provável atualização do mesmo cliente");
        confidence += 0.08;
      }
    }
  }

  // Sugerir canônico: o registro com compra mais recente; fallback: nome mais longo.
  let canonical = a.length >= b.length ? a : b;
  if (mA && mB) {
    const dA = daysSince(mA.ultimaCompra);
    const dB = daysSince(mB.ultimaCompra);
    if (dA !== null && dB !== null && dA !== dB) {
      canonical = dA < dB ? a : b;
    } else if (dA !== null && dB === null) {
      canonical = a;
    } else if (dB !== null && dA === null) {
      canonical = b;
    }
  }

  confidence = Math.max(0, Math.min(1, confidence));
  const autoSuggested = confidence >= 0.9 || motivos.includes("Mesmo CNPJ") || motivos.includes("Mesmo telefone");

  return {
    clienteA: a,
    clienteB: b,
    similarity,
    confidence,
    motivos,
    canonicalSuggested: canonical,
    autoSuggested,
  };
}

export function detectDuplicateCandidates(
  clientes: string[],
  options: BuildOptions = {},
): DuplicateCandidate[] {
  const decided = options.decidedPairs ?? new Set<string>();
  const minSim = options.minSimilarity ?? 0.82;
  const metas = options.metas;

  const unique = Array.from(new Set(clientes.filter(Boolean)));
  const coreOf = new Map<string, string>();
  const coreLooseOf = new Map<string, string>();
  for (const c of unique) {
    coreOf.set(c, coreKey(c));
    coreLooseOf.set(c, coreKey(c, { stripDescriptor: true }));
  }

  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  function tryAdd(a: string, b: string, sim: number, motivos: string[]) {
    const key = pairKey(a, b);
    if (decided.has(key) || seen.has(key)) return;

    // Quando o descritor após " - " indicar unidades/filiais/cidades diferentes,
    // NÃO sugere unificação automática — mas o par continua aparecendo na lista
    // para validação manual (regras 4 e 5). Sinal forte (mesmo CNPJ/telefone)
    // pode reativar a sugestão automática.
    let forceManual = false;
    let possibleBranch = false;
    const mA = metas?.get(a);
    const mB = metas?.get(b);
    const sameCnpj = !!(mA?.cnpj && mB?.cnpj && normPhone(mA.cnpj) && normPhone(mA.cnpj) === normPhone(mB.cnpj));
    const samePhone = !!(mA?.telefone && mB?.telefone && normPhone(mA.telefone) && normPhone(mA.telefone) === normPhone(mB.telefone));
    const strongSignal = sameCnpj || samePhone;

    // Mesma unidade escrita de formas diferentes ("BH Outlet" x "BH Outlet Shopping")
    const sameUnit = sameUnitName(a, b);
    if (sameUnit) {
      motivos = [...motivos, "Mesma unidade — diferença apenas de complemento no nome"];
    }

    if (!sameUnit && looksLikeDifferentBranches(a, b) && !strongSignal) {
      possibleBranch = true;
      forceManual = true;
      motivos = [...motivos, "Possível filial/unidade — confirmar manualmente"];
    } else if (!sameUnit && descriptorsConflict(a, b) && !strongSignal) {
      forceManual = true;
      possibleBranch = true;
      motivos = [...motivos, "Possível filial/unidade — confirmar manualmente"];
    } else if (!sameUnit && (hasLocationKeyword(a) || hasLocationKeyword(b)) && !strongSignal) {
      // Qualquer indicador geográfico/de unidade num dos nomes → tratar como rede/filial
      possibleBranch = true;
      forceManual = true;
      motivos = [...motivos, "Indicador de localização/unidade — provável rede/filial"];
    }


    seen.add(key);
    const cand = buildCandidate(a, b, sim, motivos, metas);
    if (forceManual) {
      cand.autoSuggested = false;
      cand.confidence = Math.min(cand.confidence, 0.6);
    }
    cand.possibleBranch = possibleBranch;
    candidates.push(cand);
  }



  // 1. Mesmo core key (sigla diferente ou acentuação)
  const byCore = new Map<string, string[]>();
  for (const c of unique) {
    const k = coreOf.get(c)!;
    if (!k) continue;
    const arr = byCore.get(k) ?? [];
    arr.push(c);
    byCore.set(k, arr);
  }
  for (const group of byCore.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const aHasSigla = /\([^()]{1,6}\)\s*$/.test(a);
        const bHasSigla = /\([^()]{1,6}\)\s*$/.test(b);
        const motivos = aHasSigla !== bHasSigla || (aHasSigla && bHasSigla)
          ? ["Diferença apenas por sigla"]
          : ["Nome muito parecido"];
        tryAdd(a, b, 1, motivos);
      }
    }
  }

  // 2. Mesmo core "loose" (um lado tem descritor extra após " - ")
  const byCoreLoose = new Map<string, string[]>();
  for (const c of unique) {
    const k = coreLooseOf.get(c)!;
    if (!k) continue;
    const arr = byCoreLoose.get(k) ?? [];
    arr.push(c);
    byCoreLoose.set(k, arr);
  }
  for (const group of byCoreLoose.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const ka = coreOf.get(a)!, kb = coreOf.get(b)!;
        if (ka === kb) continue; // já coberto acima
        tryAdd(a, b, 0.95, ["Possível filial/unidade do mesmo cliente"]);
      }
    }
  }

  // 3. Comparar cores distintos por similaridade — com blocking por prefixo
  //    para evitar O(N²) Levenshtein em bases grandes (trava a UI).
  const cores = Array.from(byCore.keys());
  const buckets = new Map<string, string[]>();
  for (const k of cores) {
    const prefix = k.slice(0, 2);
    if (!prefix) continue;
    const arr = buckets.get(prefix) ?? [];
    arr.push(k);
    buckets.set(prefix, arr);
  }
  const maxLevLen = 60; // ignora nomes muito longos no passo de similaridade
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      const ka = group[i];
      if (ka.length > maxLevLen) continue;
      for (let j = i + 1; j < group.length; j++) {
        const kb = group[j];
        if (kb.length > maxLevLen) continue;
        const maxLen = Math.max(ka.length, kb.length);
        if (Math.abs(ka.length - kb.length) > maxLen * 0.2) continue;
        const sim = similarityScore(ka, kb);
        if (sim < minSim) continue;
        const a = byCore.get(ka)![0];
        const b = byCore.get(kb)![0];
        tryAdd(a, b, sim, ["Nome muito parecido"]);
      }
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence || b.similarity - a.similarity);
}

export function confidenceLabel(confidence: number): "Alta" | "Média" | "Baixa" {
  if (confidence >= 0.9) return "Alta";
  if (confidence >= 0.75) return "Média";
  return "Baixa";
}

export { coreKey, similarityScore, pairKey };
