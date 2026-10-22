/**
 * Custo de produtos (R$/kg) derivado da base oficial de bonificações/remessas
 * (`bonificacao_rows`: produto + quantidade + custo + data).
 *
 * Regras:
 *  - A busca é feita pelo CÓDIGO do produto quando ele existe (ex.: "111 - Pao de Queijo ...").
 *    O nome normalizado é apenas o vínculo entre o catálogo interno e o código da planilha.
 *  - Havendo histórico, usa-se o custo vigente na DATA da degustação (último dia <= data).
 *    Não havendo histórico anterior, usa-se o custo mais recente disponível.
 *  - Produto sem custo cadastrado NUNCA vira zero silencioso: retorna `null`.
 */

import { CATALOGO_PRODUTOS } from "@/types/crm";

export interface CustoProdutoLookup {
  custoKg: number | null;
  codigo: string | null;
  dataCusto: string | null;
}

export interface CustoProdutoIndex {
  buscar: (nomeOuId: string, dataISO?: string | null) => CustoProdutoLookup;
}

interface Ponto {
  data: string; // YYYY-MM-DD
  quantidade: number;
  custo: number;
}

export function normalizarNomeProduto(valor: unknown): string {
  return String(valor ?? "")
    .replace(/^\s*\d+\s*[-–]\s*/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function extrairCodigoProduto(valor: unknown): string | null {
  const m = String(valor ?? "").match(/^\s*(\d+)\s*[-–]/);
  return m ? m[1] : null;
}

/** id do catálogo (p-1) -> nome normalizado */
const CATALOGO_POR_ID = new Map(
  CATALOGO_PRODUTOS.map((p) => [p.id, normalizarNomeProduto(p.nome)] as const),
);

export interface CustoSourceRow {
  produto: string;
  quantidade: number;
  custo: number;
  data: string | null;
}

export function buildCustoProdutoIndex(rows: CustoSourceRow[]): CustoProdutoIndex {
  // chave normalizada -> código preferencial
  const codigoPorNome = new Map<string, string>();
  // chave (código || nome) -> dia -> acumulado
  const series = new Map<string, Map<string, Ponto>>();

  for (const r of rows) {
    const q = Number(r.quantidade) || 0;
    const c = Number(r.custo) || 0;
    if (q <= 0 || c <= 0) continue;
    const nome = normalizarNomeProduto(r.produto);
    if (!nome) continue;
    const codigo = extrairCodigoProduto(r.produto);
    if (codigo && !codigoPorNome.has(nome)) codigoPorNome.set(nome, codigo);
    const chave = codigo ?? nome;
    const dia = String(r.data ?? "").slice(0, 10) || "0000-00-00";
    let porDia = series.get(chave);
    if (!porDia) series.set(chave, (porDia = new Map()));
    const atual = porDia.get(dia) ?? { data: dia, quantidade: 0, custo: 0 };
    atual.quantidade += q;
    atual.custo += c;
    porDia.set(dia, atual);
  }

  const ordenadas = new Map<string, Ponto[]>();
  for (const [chave, porDia] of series) {
    ordenadas.set(chave, [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)));
  }

  return {
    buscar(nomeOuId, dataISO) {
      const nome = CATALOGO_POR_ID.get(nomeOuId) ?? normalizarNomeProduto(nomeOuId);
      const codigo = codigoPorNome.get(nome) ?? extrairCodigoProduto(nomeOuId);
      const pontos = ordenadas.get(codigo ?? nome) ?? ordenadas.get(nome);
      if (!pontos || pontos.length === 0) return { custoKg: null, codigo: codigo ?? null, dataCusto: null };
      const alvo = String(dataISO ?? "").slice(0, 10);
      let escolhido: Ponto | undefined;
      if (alvo) {
        for (const p of pontos) {
          if (p.data <= alvo) escolhido = p;
          else break;
        }
      }
      escolhido = escolhido ?? pontos[pontos.length - 1];
      const custoKg = escolhido.quantidade > 0 ? escolhido.custo / escolhido.quantidade : null;
      return { custoKg, codigo: codigo ?? null, dataCusto: escolhido.data };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Cálculo do custo das degustações                                    */
/* ------------------------------------------------------------------ */

export interface DegustacaoProdutoEntrada {
  produto_id?: string;
  nome: string;
  quantidade: number;
}

export interface DegustacaoEntrada {
  id: string;
  data: string;
  produtos: DegustacaoProdutoEntrada[];
}

export interface ItemCusto {
  nome: string;
  quantidade: number;
  custoKg: number | null;
  total: number;
  semCusto: boolean;
}

export interface CustoDegustacaoDetalhe {
  id: string;
  kg: number;
  custoProdutos: number;
  itens: ItemCusto[];
  produtosSemCusto: string[];
  incompleto: boolean;
}

export interface CustoDegustacoesResumo {
  porDegustacao: Map<string, CustoDegustacaoDetalhe>;
  kgTotal: number;
  custoTotal: number;
  /** custo médio ponderado por kg (somente informativo) */
  custoMedioKg: number | null;
  produtosSemCusto: string[];
  incompleto: boolean;
}

export function calcularCustoDegustacoes(
  degustacoes: DegustacaoEntrada[],
  index: CustoProdutoIndex,
): CustoDegustacoesResumo {
  const porDegustacao = new Map<string, CustoDegustacaoDetalhe>();
  const semCusto = new Set<string>();
  let kgTotal = 0;
  let custoTotal = 0;

  for (const d of degustacoes) {
    const itens: ItemCusto[] = [];
    let kg = 0;
    let custo = 0;
    const faltando: string[] = [];
    for (const p of d.produtos ?? []) {
      const quantidade = Number(p.quantidade) || 0;
      if (quantidade <= 0) continue;
      const { custoKg } = index.buscar(p.produto_id || p.nome, d.data);
      const item: ItemCusto = {
        nome: p.nome,
        quantidade,
        custoKg,
        total: custoKg == null ? 0 : custoKg * quantidade,
        semCusto: custoKg == null,
      };
      if (item.semCusto) {
        faltando.push(p.nome);
        semCusto.add(p.nome);
      }
      kg += quantidade;
      custo += item.total;
      itens.push(item);
    }
    porDegustacao.set(d.id, {
      id: d.id,
      kg,
      custoProdutos: custo,
      itens,
      produtosSemCusto: faltando,
      incompleto: faltando.length > 0,
    });
    kgTotal += kg;
    custoTotal += custo;
  }

  return {
    porDegustacao,
    kgTotal,
    custoTotal,
    custoMedioKg: kgTotal > 0 ? custoTotal / kgTotal : null,
    produtosSemCusto: [...semCusto],
    incompleto: semCusto.size > 0,
  };
}
