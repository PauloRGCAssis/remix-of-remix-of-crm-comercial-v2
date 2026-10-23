/**
 * Ativação gradual das verificações CRUD (criar/editar/excluir) por módulo.
 *
 * Enquanto um módulo estiver `false`, criar/editar/excluir continuam liberados
 * para quem acessa o módulo — exatamente como antes. Ativar um módulo somente
 * depois de conferir, no banco, que os perfis em uso já concedem essas ações;
 * caso contrário usuários existentes perderiam operações que hoje executam.
 */
export const CRUD_ATIVO: Record<string, boolean> = {
  acoes_comerciais: false,
  cadastro_clientes: false,
  bonificacoes: false,
  // Fase 2
  degustacoes: false,
  ponto_venda: false,
  clientes_enderecos: false,
  clientes_duplicados: false,
};

export function crudAtivo(modulo: string): boolean {
  return CRUD_ATIVO[modulo] === true;
}
