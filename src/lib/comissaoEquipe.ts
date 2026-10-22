import { bonifCategoria } from "./commissionCalc";
import type { CommissionRow } from "./commissionImport";

/** Vendedores cuja soma de faturamento LÍQUIDO forma a base da Comissão Equipe do Juliano. */
export const EQUIPE_COMISSAO_JULIANO = ["Ednei", "Henrique", "João Paulo", "Vinícius"] as const;

/** Percentual pago ao Juliano sobre a base da equipe. */
export const PCT_COMISSAO_EQUIPE = 1;

export const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const isJulianoVendedor = (v: string) => norm(v).includes("juliano");

export interface ComissaoEquipeMembro {
  vendedor: string;
  faturamentoBruto: number;
  bonificacoesDescontadas: number;
  faturamentoLiquido: number;
  categorias: string[];
  encontrado: boolean;
}

export interface ComissaoEquipeResult {
  membros: ComissaoEquipeMembro[];
  base: number;
  pct: number;
  /** Arredondado apenas no final (2 casas). */
  valor: number;
}

/** Categorias padrão de desconto quando o vendedor ainda não tem fechamento configurado. */
function categoriasPadrao(categorias: string[]): string[] {
  return categorias.filter((c) => {
    const n = norm(c);
    return (n.includes("preco") && n.includes("final")) || n.includes("introducao");
  });
}

/**
 * Comissão Equipe (1%) do Juliano.
 * Base = soma do FATURAMENTO LÍQUIDO (bruto − bonificações descontadas do faturamento,
 * conforme a configuração salva de CADA vendedor) de Ednei + Henrique + João Paulo + Vinícius.
 * Nunca inclui Juliano, Ti Delso ou qualquer outro vendedor.
 */
export function calcularComissaoEquipe(params: {
  rows: CommissionRow[];
  /** Categorias descontadas do faturamento, por vendedor (chave = nome exato do vendedor). */
  descontosFaturamentoPorVendedor: Record<string, string[] | undefined>;
  pct?: number;
}): ComissaoEquipeResult {
  const pct = params.pct ?? PCT_COMISSAO_EQUIPE;
  const alvo = new Map(EQUIPE_COMISSAO_JULIANO.map((n) => [norm(n), n as string]));

  const cfgNorm = new Map<string, string[]>();
  for (const [k, v] of Object.entries(params.descontosFaturamentoPorVendedor)) {
    if (v) cfgNorm.set(norm(k), v.map((c) => c.replace(/\s+/g, " ").trim()));
  }

  const acc = new Map<
    string,
    { vendedor: string; bruto: number; bonifPorCat: Map<string, number>; encontrado: boolean }
  >();
  for (const [k, label] of alvo) {
    acc.set(k, { vendedor: label, bruto: 0, bonifPorCat: new Map(), encontrado: false });
  }

  for (const r of params.rows) {
    const k = norm(r.vendedor ?? "");
    const entry = acc.get(k);
    if (!entry) continue;
    entry.encontrado = true;
    entry.vendedor = r.vendedor;
    if (r.tipo === "VENDA") {
      entry.bruto += Number(r.valor) || 0;
    } else {
      const cat = bonifCategoria(r).replace(/\s+/g, " ").trim();
      if (cat) entry.bonifPorCat.set(cat, (entry.bonifPorCat.get(cat) ?? 0) + (Number(r.custo) || 0));
    }
  }

  const membros: ComissaoEquipeMembro[] = [];
  for (const [k, e] of acc) {
    const todasCategorias = [...e.bonifPorCat.keys()];
    const configuradas = cfgNorm.get(k);
    const categorias = (configuradas ?? categoriasPadrao(todasCategorias)).map((c) =>
      c.replace(/\s+/g, " ").trim(),
    );
    const set = new Set(categorias.map(norm));
    let bonificacoes = 0;
    for (const [cat, total] of e.bonifPorCat) if (set.has(norm(cat))) bonificacoes += total;
    membros.push({
      vendedor: e.vendedor,
      faturamentoBruto: e.bruto,
      bonificacoesDescontadas: bonificacoes,
      faturamentoLiquido: e.bruto - bonificacoes,
      categorias,
      encontrado: e.encontrado,
    });
  }

  // Soma primeiro; aplica o percentual sobre o total; arredonda somente no fim.
  const base = membros.reduce((s, m) => s + m.faturamentoLiquido, 0);
  const valor = Math.round(base * (pct / 100) * 100) / 100;

  return { membros, base, pct, valor };
}
