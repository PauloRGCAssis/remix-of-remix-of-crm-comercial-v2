/**
 * Catálogo único de módulos, sub-abas e permissões especiais do CRM.
 * Alimenta a matriz de permissões, o menu lateral e a proteção de rotas.
 * Sempre que uma aba nova for criada, basta registrá-la aqui.
 */

export type PermissionAction = "acessar" | "visualizar" | "criar" | "editar" | "excluir";

export const PERMISSION_ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: "acessar", label: "Acessar" },
  { key: "visualizar", label: "Visualizar" },
  { key: "criar", label: "Criar" },
  { key: "editar", label: "Editar" },
  { key: "excluir", label: "Excluir" },
];

export interface ModuleDef {
  /** Chave estável salva no banco. */
  key: string;
  label: string;
  /** Rota principal (apenas nos módulos de topo). */
  route?: string;
  /** Ações aplicáveis; padrão = todas. */
  acoes?: PermissionAction[];
  /** Valor da aba na tela do módulo pai (somente sub-abas). */
  aba?: string;
  children?: ModuleDef[];
}

const SOMENTE_ACESSO: PermissionAction[] = ["acessar"];

export const MODULE_CATALOG: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", route: "/dashboard", acoes: SOMENTE_ACESSO },
  { key: "prospeccao", label: "Prospecção", route: "/prospeccao" },
  { key: "ponto_venda", label: "Ponto de Venda", route: "/ponto-de-venda" },
  { key: "agenda_visitas", label: "Agenda de Visitas", route: "/agenda" },
  { key: "agenda_pedidos", label: "Agenda de Pedidos", route: "/agenda-pedidos" },
  { key: "cadastro_clientes", label: "Cadastro de Clientes", route: "/cadastro" },
  { key: "clientes_enderecos", label: "Clientes (Endereços)", route: "/clientes-enderecos" },
  { key: "analise_clientes", label: "Análise de Clientes", route: "/clientes", acoes: SOMENTE_ACESSO },
  { key: "clientes_duplicados", label: "Clientes Duplicados", route: "/clientes-duplicados" },
  { key: "vendedores", label: "Vendedores", route: "/vendedores" },
  { key: "estudo_vendas", label: "Estudo de Vendas", route: "/estudo-vendas", acoes: SOMENTE_ACESSO },
  {
    key: "inteligencia",
    label: "Inteligência Comercial",
    route: "/inteligencia",
    acoes: SOMENTE_ACESSO,
    children: [
      { key: "inteligencia.resumo", label: "Resumo", acoes: SOMENTE_ACESSO, aba: "resumo" },
      { key: "inteligencia.analise", label: "Análise", acoes: SOMENTE_ACESSO, aba: "analise" },
      { key: "inteligencia.clientes", label: "Clientes", acoes: SOMENTE_ACESSO, aba: "clientes" },
      { key: "inteligencia.produtos", label: "Produtos", acoes: SOMENTE_ACESSO, aba: "produtos" },
      { key: "inteligencia.vendedores", label: "Vendedores", acoes: SOMENTE_ACESSO, aba: "vendedores" },
      { key: "inteligencia.alertas", label: "Alertas", acoes: SOMENTE_ACESSO, aba: "alertas" },
      { key: "inteligencia.previsao", label: "Previsão", acoes: SOMENTE_ACESSO, aba: "previsao" },
      { key: "inteligencia.curva_abc", label: "Curva ABC", acoes: SOMENTE_ACESSO, aba: "curva-abc" },
      { key: "inteligencia.leitura", label: "Leitura Estratégica (Metas)", acoes: SOMENTE_ACESSO, aba: "leitura" },
      { key: "inteligencia.graficos", label: "Gráficos", acoes: SOMENTE_ACESSO, aba: "graficos" },
      { key: "inteligencia.meta_cliente", label: "Meta Cliente", acoes: SOMENTE_ACESSO, aba: "meta-cliente" },
      { key: "inteligencia.central_analise", label: "Central de Análise (IA)", acoes: SOMENTE_ACESSO, aba: "central-analise" },
    ],
  },
  { key: "metas", label: "Metas Comerciais", route: "/metas" },
  { key: "pagamento_vendedores", label: "Pagamento Vendedores", route: "/pagamento-vendedores" },
  { key: "relatorios", label: "Relatórios", route: "/relatorios", acoes: SOMENTE_ACESSO },
  { key: "acoes_comerciais", label: "Ações Comerciais", route: "/acoes-comerciais" },
  { key: "bonificacoes", label: "Controle de Bonificações", route: "/bonificacoes" },
  { key: "degustacoes", label: "Degustações", route: "/degustacoes" },
  { key: "importar", label: "Importar Planilha", route: "/importar" },
  { key: "administracao", label: "Administração", route: "/administracao" },
];

/** Permissões especiais — sempre avaliadas na ação "acessar". */
export const SPECIAL_PERMISSIONS: { key: string; label: string }[] = [
  { key: "especial.importar_dados", label: "Importar dados" },
  { key: "especial.exportar_excel", label: "Exportar Excel" },
  { key: "especial.exportar_pdf", label: "Exportar PDF" },
  { key: "especial.ver_valores_financeiros", label: "Ver valores financeiros" },
  { key: "especial.ver_comissoes", label: "Ver comissões" },
  { key: "especial.ver_metas", label: "Ver metas" },
  { key: "especial.editar_metas", label: "Editar metas" },
  { key: "especial.ver_outros_vendedores", label: "Ver dados de outros vendedores" },
  { key: "especial.ver_empresa_inteira", label: "Ver empresa inteira" },
  { key: "especial.editar_clientes", label: "Editar clientes" },
  { key: "especial.excluir_clientes", label: "Excluir clientes" },
  { key: "especial.editar_bonificacoes", label: "Editar bonificações" },
  { key: "especial.editar_acoes_comerciais", label: "Editar ações comerciais" },
  { key: "especial.administrar_usuarios", label: "Administrar usuários" },
  { key: "especial.alterar_permissoes", label: "Alterar permissões" },
  { key: "especial.comparar_vendedores", label: "Ver comparação entre vendedores" },
];

export function flattenModules(list: ModuleDef[] = MODULE_CATALOG): ModuleDef[] {
  const out: ModuleDef[] = [];
  for (const m of list) {
    out.push(m);
    if (m.children?.length) out.push(...flattenModules(m.children));
  }
  return out;
}

export function moduleActions(m: ModuleDef): PermissionAction[] {
  return m.acoes ?? PERMISSION_ACTIONS.map((a) => a.key);
}

const ROUTE_TO_MODULE = new Map<string, string>(
  flattenModules()
    .filter((m) => !!m.route)
    .map((m) => [m.route as string, m.key]),
);

export function moduleKeyForRoute(pathname: string): string | null {
  return ROUTE_TO_MODULE.get(pathname) ?? null;
}

/**
 * Contrato de leitura: o módulo que oferece "visualizar" na matriz exige
 * "acessar" E "visualizar" para ser aberto (menu e rota). Módulos e sub-abas
 * que só oferecem "acessar" (Dashboard, Análise de Clientes, Estudo de Vendas,
 * Inteligência e sub-abas, Relatórios) e as permissões especiais não exigem
 * "visualizar": neles, "acessar" já autoriza a leitura.
 */
export function exigeVisualizar(modulo: string): boolean {
  const def = flattenModules().find((m) => m.key === modulo);
  return !!def && moduleActions(def).includes("visualizar");
}

/** Sub-abas do módulo pai, na ordem da tela, com a chave de permissão de cada uma. */
export function subAbas(modulo: string): { aba: string; key: string }[] {
  const def = MODULE_CATALOG.find((m) => m.key === modulo);
  return (def?.children ?? []).filter((c) => !!c.aba).map((c) => ({ aba: c.aba as string, key: c.key }));
}

/** Módulos liberados por padrão em cada perfil de sistema. */
export const DEFAULT_PROFILE_MODULES: Record<string, "all" | string[]> = {
  Administrador: "all",
  Gestor: flattenModules()
    .map((m) => m.key)
    .filter((k) => k !== "administracao"),
  Vendedor: [
    "dashboard",
    "prospeccao",
    "ponto_venda",
    "agenda_visitas",
    "agenda_pedidos",
    "cadastro_clientes",
    "clientes_enderecos",
    "analise_clientes",
    "estudo_vendas",
    "inteligencia",
    "inteligencia.resumo",
    "inteligencia.clientes",
    "inteligencia.produtos",
    "inteligencia.alertas",
    "inteligencia.previsao",
    "inteligencia.curva_abc",
    "inteligencia.leitura",
    "inteligencia.graficos",
    "metas",
    "relatorios",
    "degustacoes",
  ],
  Personalizado: [],
};

export const DEFAULT_PROFILE_SPECIALS: Record<string, string[]> = {
  Administrador: SPECIAL_PERMISSIONS.map((s) => s.key),
  Gestor: SPECIAL_PERMISSIONS.map((s) => s.key).filter(
    (k) => k !== "especial.administrar_usuarios" && k !== "especial.alterar_permissoes",
  ),
  Vendedor: [
    "especial.exportar_pdf",
    "especial.ver_valores_financeiros",
    "especial.ver_metas",
  ],
  Personalizado: [],
};
