// Tipos do módulo "Ficha de Cadastro" (client_profiles)

export interface Contato {
  id: string;
  nome: string;
  cargo?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
}

export interface ProdutoNegociadoFicha {
  id: string;
  produto_id: string;
  produto_nome: string;
  preco?: number;
  observacao?: string;
}

export interface ClientProfile {
  id: string;
  nome: string;
  nome_fantasia?: string;
  /** Documento do cliente (CNPJ de pessoa jurídica ou CPF de pessoa física) */
  cnpj?: string;
  tipo_documento: "CNPJ" | "CPF";
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  segmento?: string;
  ramo_atividade?: string;
  empresa?: string;
  vendedor?: string;

  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  regiao?: string;

  entrega_mesmo_endereco: boolean;
  entrega_cep?: string;
  entrega_rua?: string;
  entrega_numero?: string;
  entrega_complemento?: string;
  entrega_bairro?: string;
  entrega_cidade?: string;
  entrega_estado?: string;

  horario_manha_inicio?: string;
  horario_manha_fim?: string;
  horario_tarde_inicio?: string;
  horario_tarde_fim?: string;

  dias_rota: string[];

  formas_pagamento: string[];
  prazo_pagamento?: string;

  contatos: Contato[];
  produtos_negociados: ProdutoNegociadoFicha[];
  observacoes?: string;

  // Contato principal (usado na tela Ponto de Venda e na importação de endereços)
  telefone?: string;
  whatsapp?: string;
  codigo_cliente?: string;

  // Ponto de venda
  is_ponto_venda: boolean;
  pdv_ativo: boolean;
  pdv_tipo?: string;

  // Auditoria do ponto de venda
  pdv_atualizado_por?: string;
  pdv_atualizado_em?: string;
  pdv_removido_por?: string;
  pdv_removido_em?: string;

  created_at: string;
  updated_at: string;
}

export type ClientProfileInput = Omit<ClientProfile, "id" | "created_at" | "updated_at">;

// Segmentos do cliente (pequeno, com possibilidade de extensão futura)
export const SEGMENTOS = [
  "Padaria",
  "Lanchonete",
  "Cafeteria",
  "Empório",
  "Supermercado",
  "Mercearia",
  "Hotel",
  "Restaurante",
  "Conveniência",
  "Escola/Cantina",
  "Buffet",
  "Distribuidor",
  "Outros",
] as const;

// Ramo de atividade (modelo de negócio operacional)
export const RAMOS_ATIVIDADE = [
  "Food Service (vende assado)",
  "Auto Serviço (supermercado)",
  "Venda direta (serve o produto para clientes)",
  "Ponto de venda (vende congelado, empório)",
  "Distribuidor",
] as const;

export const EMPRESAS_FICHA = ["GR", "IM"] as const;

export const DIAS_ROTA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;

export const FORMAS_PAGAMENTO = [
  "Dinheiro",
  "Pix",
  "Boleto",
  "Cartão de crédito",
  "Cartão de débito",
  "Cheque",
] as const;

export const PRAZOS_PAGAMENTO = ["7 dias", "14 dias", "21 dias", "28 dias"] as const;

// Formas que exigem prazo de pagamento
export const FORMAS_COM_PRAZO = ["Boleto", "Cheque"];
