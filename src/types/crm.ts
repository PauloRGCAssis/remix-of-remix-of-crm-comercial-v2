// Types for the Ti Delso CRM system

export type ClientStatus = 'novo' | 'ativo' | 'inativo' | 'perdido';
export type ClientType = 'revenda' | 'consumo';

export interface Client {
  id: string;
  nome: string;
  contato?: string;
  telefone?: string;
  cidade?: string;
  bairro?: string;
  estado?: string;
  endereco?: string;
  observacoes?: string;
  vendedor?: string;
  clientType?: ClientType;
  status: ClientStatus;
  dataPrimeiraCompra?: string;
  dataUltimaCompra?: string;
  diasSemComprar: number;
  totalCompras: number;
  valorTotal: number;
  ticketMedio: number;
  mediaKg?: number;
  novDecKg?: number;
  frequenciaMedia?: number;
  frequenciaLabel?: string;
}

export interface Sale {
  id: string;
  codigoVenda?: string;
  data: string;
  cliente: string;
  produto: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  vendedor: string;
}

export interface Product {
  id: string;
  nome: string;
  volumeTotal: number;
  valorTotal: number;
  ticketMedio: number;
  variacao: number;
}

export interface Seller {
  id: string;
  nome: string;
  clientesAtivos: number;
  clientesNovos: number;
  clientesPerdidos: number;
  volumeVendido: number;
  valorVendido: number;
  ticketMedio: number;
}

// ==================== PIPELINE / LEADS ====================

export type PipelineStatus =
  | 'AGUARDANDO_AGENDAMENTO'
  | 'AGENDADO'
  | 'VISITA_AGENDADA'
  | 'EM_NEGOCIACAO'
  | 'NEGOCIACAO_CONCRETIZADA'
  | 'NEGOCIACAO_ENCERRADA';

export const PIPELINE_STAGES: { key: PipelineStatus; label: string; color: string }[] = [
  { key: 'AGUARDANDO_AGENDAMENTO', label: 'Aguardando Agendamento', color: 'hsl(210, 70%, 50%)' },
  { key: 'AGENDADO', label: 'Agendados', color: 'hsl(38, 92%, 50%)' },
  { key: 'VISITA_AGENDADA', label: 'Visitas Realizadas', color: 'hsl(280, 60%, 50%)' },
  { key: 'EM_NEGOCIACAO', label: 'Em Negociação', color: 'hsl(200, 70%, 50%)' },
  { key: 'NEGOCIACAO_CONCRETIZADA', label: 'Negociação Concretizada', color: 'hsl(142, 60%, 40%)' },
  { key: 'NEGOCIACAO_ENCERRADA', label: 'Negociação Encerrada', color: 'hsl(0, 72%, 51%)' },
];

export type VisitaStatus = 'AGENDADA' | 'REALIZADA' | 'NAO_CONCLUIDA' | 'CONCLUIDA_SUCESSO' | 'CONCLUIDA_SEM_SUCESSO' | 'CANCELADA';

export type NegocioStatus = 'FECHADO' | 'NAO_FECHADO';

export type RegionalStatus = 'AUTO_OK' | 'AUTO_AMBIGUO' | 'AUTO_NAO_ENCONTRADO' | 'MANUAL';

export type TipoAtendimento = 'ligacao' | 'visita_externa' | 'reuniao_online';

export const TIPO_ATENDIMENTO_OPTIONS: { value: TipoAtendimento; label: string; icon: string }[] = [
  { value: 'ligacao', label: 'Ligação', icon: '📞' },
  { value: 'visita_externa', label: 'Visita Externa', icon: '🚗' },
  { value: 'reuniao_online', label: 'Reunião Online', icon: '💻' },
];

export type DemandaFrequencia = 'semanal' | 'quinzenal' | 'mensal';

export interface ProdutoConcorrente {
  trabalha: boolean;
  marca?: string;
  valorKg?: number;
}

// ==================== CATÁLOGO DE PRODUTOS ====================

export interface ProdutoCatalogo {
  id: string;
  nome: string;
  marca: string;
  ativo: boolean;
  /** código do produto na planilha oficial (usado na busca rápida) */
  codigo?: string;
}

export const CATALOGO_PRODUTOS: ProdutoCatalogo[] = [
  { id: 'p-1', nome: 'Pão de Queijo Coquetel Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '92' },
  { id: 'p-2', nome: 'Pão de Queijo Tradicional Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '93' },
  { id: 'p-3', nome: 'Pão de Queijo Super Lanche Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '95' },
  { id: 'p-4', nome: 'Palito de Queijo Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '96' },
  { id: 'p-5', nome: 'Palito de Queijo Mini Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '97' },
  { id: 'p-6', nome: 'Pão de Queijo Tradicional Recheado Frango Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '99' },
  { id: 'p-7', nome: 'Pão de Queijo Lanche Frango Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '101' },
  { id: 'p-8', nome: 'Pão de Queijo Tradicional Recheado Requeijão Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '102' },
  { id: 'p-9', nome: 'Pão de Queijo Lanche Requeijão Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '104' },
  { id: 'p-10', nome: 'Pão de Queijo Tradicional Recheado Goiabada Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '105' },
  { id: 'p-11', nome: 'Pão de Queijo Tradicional Vó Lozinha 1 kg', marca: 'Vó Lozinha', ativo: true, codigo: '111' },
  { id: 'p-12', nome: 'Pão de Queijo Super Lanche Vó Lozinha 1 kg', marca: 'Vó Lozinha', ativo: true, codigo: '112' },
  { id: 'p-13', nome: 'Pão de Queijo Coquetel Vó Lozinha 1 kg', marca: 'Vó Lozinha', ativo: true, codigo: '867' },
  { id: 'p-14', nome: 'Pão de Queijo Big Lanche Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '991' },
  { id: 'p-15', nome: 'Pão de Queijo Premium Empanado Recheado de Requeijão Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '1530' },
  { id: 'p-16', nome: 'Pão de Queijo Premium Empanado Recheado de Frango Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '1531' },
  { id: 'p-17', nome: 'Pão de Queijo Premium Empanado Lanche Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '1794' },
  { id: 'p-18', nome: 'Pão de Queijo Premium Empanado Big Recheado de Requeijão Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '1858' },
  { id: 'p-19', nome: 'Pão de Queijo Premium Empanado Tradicional Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '2349' },
  { id: 'p-20', nome: 'Pão de Queijo Premium Empanado Big Lanche Ti Delso 1 kg', marca: 'Ti Delso', ativo: true, codigo: '2660' },
];

/** Texto pesquisável de um produto do catálogo (nome + código + marca). */
export function produtoSearchText(p: ProdutoCatalogo): string {
  return [p.codigo, p.nome, p.marca].filter(Boolean).join(" ");
}


export interface ProdutoNegociado {
  produto_id: string;
  produto_nome: string;
  preco: number;
  quantidade?: number;
}

// ==================== JUSTIFICATIVAS ====================

export type JustificativaTipo = 'OBJECAO' | 'MOTIVO';

export interface Justificativa {
  id: string;
  tipo: JustificativaTipo;
  titulo: string;
  descricao?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export const SEED_JUSTIFICATIVAS: Omit<Justificativa, 'id' | 'criado_em' | 'atualizado_em'>[] = [
  { tipo: 'OBJECAO', titulo: 'Preço', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Opção pelo concorrente', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Contrato com concorrente', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Logística não atende', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Qualidade / sabor não aprovado', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Não tem demanda / baixo giro', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Margem apertada / sem espaço para novo fornecedor', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Condições comerciais (prazo/pagamento) não atenderam', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Sem espaço de freezer / armazenamento', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Decisor ausente / depende de aprovação', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Preferência por produção própria', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Cardápio não comporta / não é prioridade agora', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Momento ruim (reforma, mudança, sazonalidade)', ativo: true },
  { tipo: 'OBJECAO', titulo: 'Problema com entregas anteriores / experiência passada', ativo: true },
];

// ==================== SEGMENTOS ====================

export const SEGMENTOS = [
  'Lanchonete',
  'Cafeteria',
  'Empório',
  'Supermercado',
  'Padaria',
  'Mercearia',
  'Hotel',
  'Restaurante',
  'Conveniência',
  'Escola/Cantina',
  'Buffet',
  'Outros',
] as const;

export type Segmento = (typeof SEGMENTOS)[number];

// ==================== LEAD ====================

export type LeadOrigem = 'PROSPECCAO' | 'BASE';

export interface Lead {
  id: string;
  nome_fantasia: string;
  origem?: LeadOrigem;
  agendado_por?: string;
  /** Usuário que criou o registro (dono para efeito de visibilidade). */
  criado_por?: string;
  tipo_atendimento?: TipoAtendimento;
  contato_nome?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  cidade?: string;
  estado?: string;
  bairro?: string;
  vendedor?: string;
  dia_semana?: string;
  horario?: string;
  regional?: string;
  regional_status?: RegionalStatus;
  regional_confianca?: number;
  regional_fonte?: string;
  endereco?: string;
  complemento?: string;
  numero?: string;
  cep?: string;
  latitude?: number | null;
  longitude?: number | null;
  geo_status?: 'OK' | 'FAILED' | 'PENDING';
  geo_atualizado_em?: string;
  demanda?: string;
  demandaQuantidade?: number;
  demandaFrequencia?: DemandaFrequencia;
  paoQueijo?: ProdutoConcorrente;
  recheado?: ProdutoConcorrente;
  empanado?: ProdutoConcorrente;
  biscoito?: ProdutoConcorrente;
  concorrente?: string;
  valorConcorrente?: number;
  produtosInteresse?: string[];
  produtosInteresseTexto?: string;
  observacoes?: string;
  segmento?: Segmento;
  status_pipeline: PipelineStatus;
  proxima_visita_em?: string | null;
  ultima_visita_status?: VisitaStatus | null;
  negocio_status?: NegocioStatus | null;
  negocio_justificativa_id?: string | null;
  negocio_valor_estimado?: number | null;
  motivo_encerramento?: string | null;
  criado_em: string;
  atualizado_em: string;
}

// ==================== HISTÓRICO DE EXCLUSÕES ====================

export interface LeadExcluido {
  id: string;
  nome_fantasia: string;
  motivo: string;
  excluido_em: string;
  lead_snapshot: Partial<Lead>;
}

// ==================== VISITA ====================

export interface Visita {
  id: string;
  lead_id: string;
  data_visita: string;
  horario_visita?: string;
  status: VisitaStatus;
  resultado?: NegocioStatus | null;
  justificativa_id?: string | null;
  produtos_negociados?: ProdutoNegociado[];
  motivo?: string;
  notas?: string;
  criado_em: string;
  atualizado_em: string;
}

// ==================== LEGACY (keep for compatibility) ====================

export type ProspectStage = 
  | 'lead_novo'
  | 'pre_qualificado'
  | 'qualificado'
  | 'amostra_entregue'
  | 'negociacao'
  | 'convertido'
  | 'perdido';

export interface Prospect {
  id: string;
  empresa: string;
  tipo_atendimento?: TipoAtendimento;
  contato?: string;
  telefone?: string;
  cidade?: string;
  bairro?: string;
  regional?: string;
  regional_status?: RegionalStatus;
  regional_confianca?: number;
  regional_fonte?: string;
  endereco?: string;
  complemento?: string;
  demanda?: string;
  demandaQuantidade?: number;
  demandaFrequencia?: DemandaFrequencia;
  paoQueijo?: ProdutoConcorrente;
  recheado?: ProdutoConcorrente;
  empanado?: ProdutoConcorrente;
  biscoito?: ProdutoConcorrente;
  concorrente?: string;
  valorConcorrente?: number;
  produtosInteresse?: string[];
  observacoes?: string;
  etapa: ProspectStage;
  dataUltimaVisita?: string;
  motivoPerda?: string;
  historicoPerdas?: { data: string; motivo: string }[];
  createdAt: string;
}

export type VisitStatus = 'agendado' | 'concluida_sucesso' | 'concluida_sem_sucesso' | 'cancelada';

export interface Visit {
  id: string;
  cliente: string;
  vendedor?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  diaSemana: string;
  horario?: string;
  contato?: string;
  observacoes?: string;
  status: VisitStatus;
  motivoInsucesso?: string;
  amostraEntregue: boolean;
  data?: string;
}

export const PROSPECT_STAGES: { key: ProspectStage; label: string; color: string }[] = [
  { key: 'lead_novo', label: 'Lead Novo', color: 'hsl(210, 70%, 50%)' },
  { key: 'pre_qualificado', label: 'Pré-qualificado', color: 'hsl(280, 60%, 50%)' },
  { key: 'qualificado', label: 'Qualificado', color: 'hsl(32, 90%, 50%)' },
  { key: 'amostra_entregue', label: 'Amostra Entregue', color: 'hsl(38, 92%, 50%)' },
  { key: 'negociacao', label: 'Negociação', color: 'hsl(200, 70%, 50%)' },
  { key: 'convertido', label: 'Convertido', color: 'hsl(142, 60%, 40%)' },
  { key: 'perdido', label: 'Perdido', color: 'hsl(0, 72%, 51%)' },
];

export interface DashboardMetrics {
  totalClientesAtivos: number;
  totalClientesNovos: number;
  totalClientesPerdidos: number;
  totalClientesInativos: number;
  faturamentoMensal: number;
  crescimentoMensal: number;
  crescimentoAnual: number;
  ticketMedioGeral: number;
}

export const DAYS_OF_WEEK = [
  'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'
];
