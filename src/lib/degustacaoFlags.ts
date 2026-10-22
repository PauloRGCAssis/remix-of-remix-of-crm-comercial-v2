// Sentinels used to mark "Não precisa" in degustação sections.
import type { DegustacaoProduto } from "@/hooks/useDegustacoes";

export const NAO_PRECISA = "__NAO_PRECISA__";
export const NAO_PRECISA_PRODUTOS_ID = "__nao_precisa_produtos__";

export const LABEL_SEM_MATERIAIS = "Não precisa enviar materiais";
export const LABEL_SEM_EQUIPAMENTOS = "Não precisa de equipamento";
export const LABEL_SEM_PRODUTOS = "Não precisa enviar produtos";

export const isSemMateriais = (arr?: string[] | null) =>
  Array.isArray(arr) && arr.length === 1 && arr[0] === NAO_PRECISA;

export const isSemEquipamentos = (arr?: string[] | null) =>
  Array.isArray(arr) && arr.length === 1 && arr[0] === NAO_PRECISA;

export const isSemProdutos = (arr?: DegustacaoProduto[] | null) =>
  Array.isArray(arr) && arr.length === 1 && arr[0]?.produto_id === NAO_PRECISA_PRODUTOS_ID;

export const materiaisVisiveis = (arr?: string[] | null) =>
  isSemMateriais(arr) ? [] : (arr ?? []).filter((m) => m !== NAO_PRECISA);

export const equipamentosVisiveis = (arr?: string[] | null) =>
  isSemEquipamentos(arr) ? [] : (arr ?? []).filter((m) => m !== NAO_PRECISA);

export const produtosVisiveis = (arr?: DegustacaoProduto[] | null) =>
  isSemProdutos(arr) ? [] : (arr ?? []).filter((p) => p.produto_id !== NAO_PRECISA_PRODUTOS_ID);

export const produtoNaoPrecisaItem: DegustacaoProduto = {
  produto_id: NAO_PRECISA_PRODUTOS_ID,
  nome: LABEL_SEM_PRODUTOS,
  quantidade: 0,
};
