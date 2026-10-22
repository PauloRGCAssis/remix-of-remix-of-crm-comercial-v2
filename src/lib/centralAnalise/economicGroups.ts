/**
 * Consolidação de matriz / filiais / unidades em GRUPOS ECONÔMICOS.
 *
 * Regra: nomes como
 *   "Cafeteria Cheirin Bao - Savassi", "Cafeteria Cheirin Bao - Centro (IM)",
 *   "Cafeteria Cheirin Bom - Funcionarios"
 * pertencem ao MESMO grupo econômico.
 *
 * Duas etapas:
 *  1) extração da "base" do nome (removendo unidade/filial/localidade/tags);
 *  2) fusão de bases equivalentes (acentos, grafia, raiz de CNPJ compartilhada).
 *
 * A fusão NUNCA é feita só por "nomes parecidos": exige
 *   • raiz de CNPJ compartilhada entre as bases, OU
 *   • similaridade muito alta (≥ 0.92) com mesma quantidade de palavras.
 * Casos intermediários (0.84 – 0.92) são devolvidos em `revisao` para
 * conferência manual — nunca unidos automaticamente.
 *
 * IMPORTANTE: o grupo é uma CAMADA ADICIONAL de análise. As unidades continuam
 * existindo individualmente (ver clientConsolidation.ts).
 */

import { normalizeClientName } from "@/lib/clientNameNormalization";

const SEPARADORES = /\s+[-–—/]\s+/;

const SUFIXOS_UNIDADE =
  /^(matriz|filial|unidade|loja|shopping|shop|bh|belo horizonte|brasilia|brasília|contagem|betim|nova lima|sete lagoas|centro|savassi|i|ii|iii|iv|v|vi|1|2|3|4|5|6)\b/i;

const PALAVRAS_GENERICAS = new Set([
  "padaria", "posto", "lanchonete", "cafe", "café", "cafeteria", "restaurante", "escola",
  "colegio", "colégio", "hotel", "mercado", "supermercado", "emporio", "empório", "bar",
  "conveniencia", "conveniência", "sacolao", "sacolão", "buffet", "loja", "casa", "clube",
]);

function limpaTags(nome: string): string {
  let s = String(nome ?? "").trim();
  while (true) {
    const next = s.replace(/\s*\([^()]{0,14}\)\s*$/u, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function normalizaChave(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Candidato a "nome do grupo" para um cliente (primeiro segmento significativo). */
function candidatoGrupo(nomeLimpo: string): { base: string; unidade: string | null } | null {
  const partes = nomeLimpo.split(SEPARADORES).map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1) {
    return { base: partes[0], unidade: partes.slice(1).join(" - ") };
  }
  // sem separador: tenta sufixo de unidade nas últimas palavras (ex.: "Empada de Minas Matriz")
  const palavras = nomeLimpo.split(/\s+/);
  for (let corte = palavras.length - 1; corte >= 2; corte--) {
    const resto = palavras.slice(corte).join(" ");
    if (SUFIXOS_UNIDADE.test(resto)) {
      return { base: palavras.slice(0, corte).join(" "), unidade: resto };
    }
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

function similaridade(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

function raizCnpj(v: string | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 14 ? d.slice(0, 8) : null;
}

export interface UnidadeGrupo {
  clienteKey: string;
  nomeExibicao: string;
  unidade: string | null;
}

export interface GrupoEconomico {
  grupoKey: string;
  /** Ex.: "GRUPO CAFETERIA CHEIRIN BAO" */
  nome: string;
  unidades: UnidadeGrupo[];
}

export interface RevisaoGrupo {
  grupoA: string;
  grupoB: string;
  similaridade: number;
  motivo: string;
}

export interface GruposResult {
  /** clienteKey → grupoKey (apenas clientes que pertencem a algum grupo com 2+ unidades) */
  clienteParaGrupo: Map<string, string>;
  grupos: Map<string, GrupoEconomico>;
  /** pares possivelmente do mesmo grupo — NÃO unidos automaticamente */
  revisao: RevisaoGrupo[];
}

export type EntradaCliente = string | { nome: string; cnpj?: string | null };

interface BaseEntry {
  baseKey: string;
  exibicaoContagem: Map<string, number>;
  unidades: Map<string, UnidadeGrupo>;
  raizes: Set<string>;
}

/**
 * Detecta grupos econômicos a partir dos nomes reais existentes na base.
 * Só cria grupo quando existem 2 ou mais unidades distintas.
 */
export function detectarGruposEconomicos(entradas: Iterable<EntradaCliente>): GruposResult {
  const porBase = new Map<string, BaseEntry>();

  for (const entrada of entradas) {
    const nomeExibicao = String((typeof entrada === "string" ? entrada : entrada?.nome) ?? "").trim();
    if (!nomeExibicao) continue;
    const cnpj = typeof entrada === "string" ? null : entrada?.cnpj ?? null;
    const clienteKey = normalizeClientName(nomeExibicao);
    const limpo = limpaTags(normalizeClientName(nomeExibicao) || nomeExibicao);
    const cand = candidatoGrupo(limpo);
    if (!cand) continue;

    const baseKey = normalizaChave(cand.base);
    const palavras = baseKey.split(" ").filter(Boolean);
    // evita agrupar por palavra genérica solta ("Padaria", "Posto")
    if (palavras.length < 2 && PALAVRAS_GENERICAS.has(palavras[0] ?? "")) continue;
    if (baseKey.length < 6) continue;

    const entry: BaseEntry =
      porBase.get(baseKey) ?? { baseKey, exibicaoContagem: new Map(), unidades: new Map(), raizes: new Set() };
    entry.exibicaoContagem.set(cand.base, (entry.exibicaoContagem.get(cand.base) ?? 0) + 1);
    entry.unidades.set(clienteKey, { clienteKey, nomeExibicao, unidade: cand.unidade });
    const raiz = raizCnpj(cnpj);
    if (raiz) entry.raizes.add(raiz);
    porBase.set(baseKey, entry);
  }

  // ------------------------------------------------ fusão de bases equivalentes
  const bases = Array.from(porBase.values());
  const pai = new Map<string, string>(bases.map((b) => [b.baseKey, b.baseKey]));
  const find = (k: string): string => {
    let cur = k;
    while (pai.get(cur) !== cur) cur = pai.get(cur)!;
    let walk = k;
    while (pai.get(walk) !== cur) {
      const next = pai.get(walk)!;
      pai.set(walk, cur);
      walk = next;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) pai.set(rb, ra);
  };

  const revisao: RevisaoGrupo[] = [];

  for (let i = 0; i < bases.length; i++) {
    for (let j = i + 1; j < bases.length; j++) {
      const a = bases[i];
      const b = bases[j];

      const raizComum = Array.from(a.raizes).some((r) => b.raizes.has(r));
      const sim = similaridade(a.baseKey, b.baseKey);
      const palavrasA = a.baseKey.split(" ");
      const palavrasB = b.baseKey.split(" ");
      const mesmaContagem = palavrasA.length === palavrasB.length;
      const prefixoForte =
        palavrasA.length >= 2 &&
        mesmaContagem &&
        palavrasA.slice(0, -1).join(" ") === palavrasB.slice(0, -1).join(" ");

      if (raizComum) {
        union(a.baseKey, b.baseKey);
        continue;
      }
      // fusão segura: mesma estrutura de nome + grafia praticamente idêntica
      if (mesmaContagem && (sim >= 0.92 || (prefixoForte && sim >= 0.88))) {
        union(a.baseKey, b.baseKey);
        continue;
      }
      if (sim >= 0.84) {
        revisao.push({
          grupoA: a.baseKey,
          grupoB: b.baseKey,
          similaridade: Math.round(sim * 100) / 100,
          motivo: "Nomes semelhantes sem CNPJ em comum — confirmar manualmente",
        });
      }
    }
  }

  // ------------------------------------------------ montagem final
  const agregado = new Map<string, BaseEntry>();
  for (const b of bases) {
    const raiz = find(b.baseKey);
    const alvo =
      agregado.get(raiz) ??
      ({ baseKey: raiz, exibicaoContagem: new Map(), unidades: new Map(), raizes: new Set() } as BaseEntry);
    for (const [nome, qtd] of b.exibicaoContagem) {
      alvo.exibicaoContagem.set(nome, (alvo.exibicaoContagem.get(nome) ?? 0) + qtd);
    }
    for (const [k, u] of b.unidades) alvo.unidades.set(k, u);
    for (const r of b.raizes) alvo.raizes.add(r);
    agregado.set(raiz, alvo);
  }

  const clienteParaGrupo = new Map<string, string>();
  const grupos = new Map<string, GrupoEconomico>();

  for (const [baseKey, entry] of agregado) {
    if (entry.unidades.size < 2) continue;
    const baseExibicao =
      Array.from(entry.exibicaoContagem.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
      baseKey;
    const grupoKey = `grupo:${baseKey}`;
    const grupo: GrupoEconomico = {
      grupoKey,
      nome: `GRUPO ${baseExibicao.toUpperCase()}`,
      unidades: Array.from(entry.unidades.values()).sort((a, b) =>
        a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"),
      ),
    };
    grupos.set(grupoKey, grupo);
    for (const u of grupo.unidades) clienteParaGrupo.set(u.clienteKey, grupoKey);
  }

  const gruposAtivos = new Set(Array.from(grupos.keys()).map((k) => k.replace(/^grupo:/, "")));
  const revisaoFiltrada = revisao.filter(
    (r) => find(r.grupoA) !== find(r.grupoB) && (gruposAtivos.has(find(r.grupoA)) || gruposAtivos.has(find(r.grupoB))),
  );

  return { clienteParaGrupo, grupos, revisao: revisaoFiltrada };
}
