/**
 * Utilitários da cópia/duplicação de Ações Comerciais.
 * A cópia sempre gera uma NOVA ação independente; a original permanece intacta.
 */
import type { CommercialAction } from "@/hooks/useCommercialActions";

export const normTexto = (v: string) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export interface AcaoChave {
  cliente: string;
  tipo: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
}

/** Já existe ação com mesmo cliente + tipo + período + nome? */
export function encontrarAcaoSemelhante(
  acoes: CommercialAction[],
  chave: AcaoChave,
  ignorarId?: string,
): CommercialAction | null {
  return (
    acoes.find(
      (a) =>
        a.id !== ignorarId &&
        normTexto(a.cliente) === normTexto(chave.cliente) &&
        normTexto(a.tipo) === normTexto(chave.tipo) &&
        normTexto(a.nome) === normTexto(chave.nome) &&
        a.data_inicio === chave.data_inicio &&
        a.data_fim === chave.data_fim,
    ) ?? null
  );
}

interface DegustacaoLike {
  id: string;
  cliente: string;
  data: string;
}

/**
 * Degustações pertencentes ao cliente informado dentro do período da ação.
 * Usado ao copiar: nunca reaproveitar degustação do cliente original.
 */
export function degustacoesDoClienteNoPeriodo<T extends DegustacaoLike>(
  degustacoes: T[],
  cliente: string,
  dataInicio: string,
  dataFim: string,
): T[] {
  const alvo = normTexto(cliente);
  if (!alvo) return [];
  return degustacoes.filter((d) => {
    const nome = normTexto(d.cliente);
    if (!(nome.includes(alvo) || alvo.includes(nome))) return false;
    if (dataInicio && d.data < dataInicio) return false;
    if (dataFim && d.data > dataFim) return false;
    return true;
  });
}
