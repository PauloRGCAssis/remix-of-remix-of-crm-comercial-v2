import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import App from '@/App';

// Hierarquia Administrador × Gestor × Vendedor usando as rotas reais do App,
// ProtectedRoute, useUserRole, usePermissions e AppSidebar. Só o Supabase,
// a sessão e o conteúdo das páginas são simulados (dados fictícios).
type Perm = { modulo: string; acao: string; permitido: boolean };
const mocks = vi.hoisted(() => ({
  auth: {
    session: null as null | { user: { id: string; app_metadata: { provider: string } } },
    user: null as null | { id: string },
    loading: false,
    authorizationVersion: 1,
    signOut: vi.fn(),
  },
  db: {
    access: null as null | { ativo: boolean; profile_id: string | null; escopo: string },
    accessError: false,
    roles: [] as { role: string }[],
    perfilNome: null as string | null,
    profilePerms: [] as { modulo: string; acao: string; permitido: boolean }[],
    userPerms: [] as { modulo: string; acao: string; permitido: boolean }[],
    writes: [] as string[],
  },
  page: (nome: string) => ({ default: () => <h1>página {nome}</h1> }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.auth,
  AuthProvider: ({ children }: { children: JSX.Element }) => children,
}));
vi.mock('@/contexts/CrmContext', () => ({ CrmProvider: ({ children }: { children: JSX.Element }) => children }));
vi.mock('@/hooks/useClientAliases', () => ({ useClientAliases: () => undefined }));
vi.mock('@/hooks/useIosSafariPersistence', () => ({ useIosSafariPersistence: () => undefined }));
vi.mock('@/integrations/supabase/client', () => {
  function single(table: string) {
    const { db } = mocks;
    if (table === 'user_access') return db.accessError ? { data: null, error: { message: 'network' } } : { data: db.access, error: null };
    if (table === 'profiles') return { data: { nome: 'Usuário Fictício', vendedor: 'VENDEDOR A', vendedores: ['VENDEDOR A'], must_change_password: false }, error: null };
    if (table === 'permission_profiles') return { data: { nome: db.perfilNome, ativo: true }, error: null };
    return { data: null, error: null };
  }
  function list(table: string) {
    const { db } = mocks;
    if (table === 'user_roles') return { data: db.roles, error: null };
    if (table === 'user_permissions') return { data: db.userPerms, error: null };
    if (table === 'profile_permissions') return { data: db.profilePerms, error: null };
    return { data: [], error: null };
  }
  function from(table: string) {
    const write = (op: string) => () => {
      if (table !== 'access_audit_log') mocks.db.writes.push(`${table}:${op}`);
      return query;
    };
    const query = {
      select: () => query, eq: () => query, order: () => query, abortSignal: () => query,
      insert: write('insert'), upsert: write('upsert'), update: write('update'), delete: write('delete'),
      maybeSingle: () => Promise.resolve(single(table)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(list(table)).then(resolve, reject),
    };
    return query;
  }
  return { supabase: { from, functions: { invoke: vi.fn() } } };
});
vi.mock('@/pages/Index', () => mocks.page('dashboard'));
vi.mock('@/pages/NotFound', () => mocks.page('não encontrada'));
vi.mock('@/pages/ProspeccaoPage', () => mocks.page('prospecção'));
vi.mock('@/pages/ClientesPage', () => mocks.page('clientes'));
vi.mock('@/pages/ImportarPage', () => mocks.page('importação'));
vi.mock('@/pages/VendedoresPage', () => mocks.page('vendedores'));
vi.mock('@/pages/AgendaPage', () => mocks.page('agenda'));
vi.mock('@/pages/AgendaPedidosPage', () => mocks.page('agenda pedidos'));
vi.mock('@/pages/RelatoriosPage', () => mocks.page('relatórios'));
vi.mock('@/pages/EstudoVendasPage', () => mocks.page('estudo vendas'));
vi.mock('@/pages/MetasPage', () => mocks.page('metas'));
vi.mock('@/pages/InteligenciaComercialPage', () => mocks.page('inteligência'));
vi.mock('@/pages/CadastroClientesPage', () => mocks.page('cadastro'));
vi.mock('@/pages/PontoVendaPage', () => mocks.page('ponto de venda'));
vi.mock('@/pages/ClientesEnderecosPage', () => mocks.page('endereços'));
vi.mock('@/pages/DegustacoesPage', () => mocks.page('degustações'));
vi.mock('@/pages/AcoesComerciaisPage', () => mocks.page('ações comerciais'));
vi.mock('@/pages/BonificacoesPage', () => mocks.page('bonificações'));
vi.mock('@/pages/ClientesDuplicadosPage', () => mocks.page('duplicados'));
vi.mock('@/pages/PagamentoVendedoresPage', () => mocks.page('pagamento'));
vi.mock('@/pages/AdministracaoPage', () => mocks.page('administração'));
vi.mock('@/pages/AuthPage', () => mocks.page('login'));
vi.mock('@/pages/ResetPasswordPage', () => mocks.page('reset'));
vi.mock('@/pages/NovaSenhaPage', () => mocks.page('nova senha'));
vi.mock('@/pages/PrimeiroAcessoPage', () => mocks.page('primeiro acesso'));

const ACOES = ['acessar', 'visualizar', 'criar', 'editar', 'excluir'];
const libera = (...modulos: string[]): Perm[] =>
  modulos.flatMap((modulo) => ACOES.map((acao) => ({ modulo, acao, permitido: true })));
const COMERCIAIS_GESTOR = ['dashboard', 'prospeccao', 'vendedores', 'importar', 'clientes_duplicados', 'pagamento_vendedores', 'acoes_comerciais', 'bonificacoes'];

let version = 1;
function login(provider = 'email') {
  mocks.auth.session = { user: { id: 'usuario-ficticio', app_metadata: { provider } } };
  mocks.auth.user = { id: 'usuario-ficticio' };
  // Nova versão = cache de autorização isolado entre cenários (o App usa um QueryClient único).
  mocks.auth.authorizationVersion = ++version;
}
function comoAdministrador() {
  login();
  mocks.db.access = { ativo: true, profile_id: 'perfil-admin', escopo: 'empresa' };
  mocks.db.roles = [{ role: 'admin' }];
  mocks.db.perfilNome = 'Administrador';
}
function comoGestor() {
  login();
  mocks.db.access = { ativo: true, profile_id: 'perfil-gestor', escopo: 'empresa' };
  mocks.db.perfilNome = 'Gestor';
  // Mesmo com a permissão "administracao" cadastrada por engano, sem role não entra.
  mocks.db.profilePerms = libera(...COMERCIAIS_GESTOR, 'administracao');
}
function comoVendedor() {
  login();
  mocks.db.access = { ativo: true, profile_id: 'perfil-vendedor', escopo: 'meus_dados' };
  mocks.db.perfilNome = 'Vendedor';
  mocks.db.profilePerms = libera('dashboard', 'prospeccao');
}

function abrir(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

beforeEach(() => {
  cleanup();
  Object.assign(mocks.auth, { session: null, user: null, loading: false });
  Object.assign(mocks.db, { access: null, accessError: false, roles: [], perfilNome: null, profilePerms: [], userPerms: [], writes: [] });
});

describe('rotas — Administrador', () => {
  it('administrador ativo com role admin acessa Administração', async () => {
    comoAdministrador();
    abrir('/administracao');
    expect(await screen.findByText('página administração')).toBeInTheDocument();
  });
  it.each(['/vendedores', '/importar', '/bonificacoes', '/prospeccao'])('administrador acessa o módulo comercial %s', async (rota) => {
    comoAdministrador();
    abrir(rota);
    expect(await screen.findByRole('heading', { name: /^página / })).toBeInTheDocument();
    expect(screen.queryByText(/não possui permissão/)).not.toBeInTheDocument();
  });
  it('administrador inativo com role admin é bloqueado', async () => {
    comoAdministrador();
    mocks.db.access = { ativo: false, profile_id: 'perfil-admin', escopo: 'empresa' };
    abrir('/administracao');
    expect(await screen.findByText(/não possui permissão/)).toBeInTheDocument();
    expect(screen.queryByText('página administração')).not.toBeInTheDocument();
  });
});

describe('rotas — Gestor sem role admin', () => {
  it.each([
    ['/vendedores', 'página vendedores'],
    ['/importar', 'página importação'],
    ['/clientes-duplicados', 'página duplicados'],
    ['/pagamento-vendedores', 'página pagamento'],
    ['/acoes-comerciais', 'página ações comerciais'],
    ['/bonificacoes', 'página bonificações'],
  ])('gestor autorizado acessa %s', async (rota, pagina) => {
    comoGestor();
    abrir(rota);
    expect(await screen.findByText(pagina)).toBeInTheDocument();
  });
  it('gestor é redirecionado ao tentar acessar Administração', async () => {
    comoGestor();
    abrir('/administracao');
    expect(await screen.findByText('página dashboard')).toBeInTheDocument();
    expect(screen.queryByText('página administração')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });
  it('perfil chamado Administrador sem role admin não recebe privilégio administrativo', async () => {
    login();
    mocks.db.access = { ativo: true, profile_id: 'perfil-admin', escopo: 'empresa' };
    mocks.db.perfilNome = 'Administrador';
    mocks.db.profilePerms = libera('dashboard', 'administracao');
    abrir('/administracao');
    expect(await screen.findByText('página dashboard')).toBeInTheDocument();
    expect(screen.queryByText('página administração')).not.toBeInTheDocument();
  });
  it('gestor sem a permissão de um módulo continua bloqueado nele', async () => {
    comoGestor();
    mocks.db.profilePerms = libera('dashboard', 'vendedores');
    abrir('/importar');
    expect(await screen.findByText(/não possui permissão/)).toBeInTheDocument();
  });
});

describe('rotas — Vendedor e falhas', () => {
  it.each(['/importar', '/vendedores', '/bonificacoes', '/administracao'])('vendedor sem permissão é bloqueado em %s', async (rota) => {
    comoVendedor();
    abrir(rota);
    await waitFor(() => expect(screen.queryByText(/página (importação|vendedores|bonificações|administração)/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/não possui permissão|página dashboard/)).toBeInTheDocument());
  });
  it('vendedor com exceção comercial individual acessa o módulo autorizado', async () => {
    comoVendedor();
    mocks.db.userPerms = [
      { modulo: 'bonificacoes', acao: 'acessar', permitido: true },
      { modulo: 'bonificacoes', acao: 'visualizar', permitido: true },
    ];
    abrir('/bonificacoes');
    expect(await screen.findByText('página bonificações')).toBeInTheDocument();
  });
  it('exceção individual só de "acessar" não abre módulo que exige "visualizar"', async () => {
    comoVendedor();
    mocks.db.userPerms = [{ modulo: 'bonificacoes', acao: 'acessar', permitido: true }];
    abrir('/bonificacoes');
    expect(await screen.findByText(/não possui permissão/)).toBeInTheDocument();
  });
  it('exceção individual negativa prevalece sobre o perfil', async () => {
    comoGestor();
    mocks.db.userPerms = [{ modulo: 'importar', acao: 'acessar', permitido: false }];
    abrir('/importar');
    expect(await screen.findByText(/não possui permissão/)).toBeInTheDocument();
  });
  it('exceção individual não abre Administração para quem não é admin', async () => {
    comoVendedor();
    mocks.db.userPerms = [{ modulo: 'administracao', acao: 'acessar', permitido: true }];
    abrir('/administracao');
    expect(await screen.findByText('página dashboard')).toBeInTheDocument();
    expect(screen.queryByText('página administração')).not.toBeInTheDocument();
  });
  it('vendedor continua acessando o que já tinha', async () => {
    comoVendedor();
    abrir('/prospeccao');
    expect(await screen.findByText('página prospecção')).toBeInTheDocument();
  });
  it('usuário sem sessão é redirecionado ao login', async () => {
    abrir('/vendedores');
    expect(await screen.findByText('página login')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/auth');
  });
  it('falha na consulta de autorização não concede acesso', async () => {
    comoAdministrador();
    mocks.db.accessError = true;
    abrir('/administracao');
    await waitFor(() => expect(screen.getByText(/não possui permissão/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText('página administração')).not.toBeInTheDocument();
  });
  it('login Google ativo continua liberado pelo GoogleAccessGate', async () => {
    comoGestor();
    login('google');
    abrir('/vendedores');
    expect(await screen.findByText('página vendedores')).toBeInTheDocument();
  });
  it('login Google sem cadastro de acesso continua bloqueado e desconectado', async () => {
    login('google');
    mocks.auth.signOut.mockResolvedValue(undefined);
    abrir('/vendedores');
    await waitFor(() => expect(mocks.auth.signOut).toHaveBeenCalled());
    expect(screen.queryByText('página vendedores')).not.toBeInTheDocument();
  });
  it('nenhuma navegação grava roles, acessos ou permissões', async () => {
    comoGestor();
    abrir('/vendedores');
    await screen.findByText('página vendedores');
    expect(mocks.db.writes).toEqual([]);
  });
});

describe('menu lateral segue as mesmas regras das rotas', () => {
  function menu() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }
  it('administrador vê Administração e módulos comerciais', async () => {
    comoAdministrador();
    menu();
    expect(await screen.findByText('Administração')).toBeInTheDocument();
    expect(screen.getByText('Vendedores')).toBeInTheDocument();
    expect(screen.getByText('Importar Planilha')).toBeInTheDocument();
  });
  it('gestor vê os módulos comerciais autorizados, mas não Administração', async () => {
    comoGestor();
    menu();
    expect(await screen.findByText('Vendedores')).toBeInTheDocument();
    for (const item of ['Importar Planilha', 'Clientes Duplicados', 'Pagamento Vendedores', 'Ações Comerciais', 'Controle de Bonificações']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.queryByText('Administração')).not.toBeInTheDocument();
  });
  it('vendedor vê apenas o que o perfil libera', async () => {
    comoVendedor();
    menu();
    expect(await screen.findByText('Prospecção')).toBeInTheDocument();
    for (const item of ['Vendedores', 'Importar Planilha', 'Controle de Bonificações', 'Administração']) {
      expect(screen.queryByText(item)).not.toBeInTheDocument();
    }
  });
});
