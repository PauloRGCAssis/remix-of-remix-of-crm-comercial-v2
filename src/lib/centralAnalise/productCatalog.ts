/**
 * Catálogo de produtos da Central de Análise.
 *
 * - Nome COMPLETO sempre (código + descrição integral). Nunca abreviar.
 * - Produtos descontinuados são apenas os cadastrados aqui (nunca inferidos).
 * - Substituições de produto (migração) ficam configuráveis para uso futuro.
 */

import { cleanProductName, extractProductCode } from "@/hooks/useSalesData";

export interface MigracaoProdutos {
  id: string;
  nome: string;
  /** códigos de origem (produtos descontinuados / substituídos) */
  origem: string[];
  /** códigos substitutos */
  substitutos: string[];
}

/** Produtos descontinuados oficialmente informados. Não inferir outros. */
export const PRODUTOS_DESCONTINUADOS_PADRAO: string[] = ["101", "104"];

export const MIGRACOES_PADRAO: MigracaoProdutos[] = [
  {
    id: "lanche-para-premium",
    nome: "Lanches Recheados 101/104 → Premium Empanado 1531/1858",
    origem: ["101", "104"],
    substitutos: ["1531", "1858"],
  },
];

const LS_DESCONTINUADOS = "central-analise:produtos-descontinuados";
const LS_MIGRACOES = "central-analise:migracoes-produtos";

function lerLS<T>(chave: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(chave);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function getProdutosDescontinuados(): string[] {
  return lerLS<string[]>(LS_DESCONTINUADOS, PRODUTOS_DESCONTINUADOS_PADRAO);
}

export function setProdutosDescontinuados(codigos: string[]) {
  localStorage.setItem(LS_DESCONTINUADOS, JSON.stringify(codigos));
}

export function getMigracoesProdutos(): MigracaoProdutos[] {
  return lerLS<MigracaoProdutos[]>(LS_MIGRACOES, MIGRACOES_PADRAO);
}

export function setMigracoesProdutos(lista: MigracaoProdutos[]) {
  localStorage.setItem(LS_MIGRACOES, JSON.stringify(lista));
}

/** Código do produto ("101") a partir da descrição da planilha. */
export function codigoProduto(descricao: string | null | undefined): string {
  return extractProductCode(descricao);
}

/** Chave canônica de produto: código quando existir, senão nome limpo. */
export function chaveProduto(descricao: string | null | undefined): string {
  const cod = codigoProduto(descricao);
  return cod || cleanProductName(String(descricao ?? ""));
}

/** Nome COMPLETO para exibição: "101 – Pão de Queijo Lanche Frango Ti Delso". */
export function nomeCompletoProduto(descricao: string | null | undefined): string {
  const cod = codigoProduto(descricao);
  const nome = cleanProductName(String(descricao ?? "")).trim();
  return cod ? `${cod} – ${nome}` : nome;
}

/** Família comercial (usada só depois da leitura individual por código/sabor). */
export function familiaProduto(descricao: string | null | undefined): string {
  const n = cleanProductName(String(descricao ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/isopor|frete|papelao/.test(n)) return "Não comercial";
  if (/premium/.test(n)) return "Premium Empanado";
  if (/super lanche/.test(n)) return "Super Lanche";
  if (/lanchinho/.test(n)) return "Lanchinho";
  if (/lanche/.test(n)) return "Lanches Recheados";
  if (/recheado|requeijao|goiabada|frango|lombinho|chocolate|doce de leite|catupiry/.test(n)) return "Tradicional Recheado";
  if (/mini|coquetel|biscoito/.test(n)) return "Mini / Coquetel";
  if (/tradicional/.test(n)) return "Tradicional";
  return "Outros";
}

/** Produto recheado? (para exigir sabor explícito na leitura) */
export function ehRecheado(descricao: string | null | undefined): boolean {
  const f = familiaProduto(descricao);
  return f === "Lanches Recheados" || f === "Tradicional Recheado" || f === "Premium Empanado" || f === "Super Lanche";
}
