import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { usePermissions } from '@/hooks/usePermissions';
import App from '@/App';

// Contrato de permissões (Problema 1): rotas reais do App, ProtectedRoute,
// AppSidebar, useUserRole e usePermissions. Só o Supabase, a sessão e o
// conteúdo das páginas são simulados (dados fictícios).
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
    roles: [] as { role: string }[],
    perfil: null as null | { nome: string; ativo: boolean },
    profilePerms: [] as Perm[],
    userPerms: [] as Perm[],
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
    if (table === 'user_access') return { data: db.access, error: null };
    if (table === 'profiles') return { data: { nome: 'Usuário Fictício', vendedor: 'VENDEDOR A', vendedores: ['VENDEDOR A'], must_change_password: false }, error: null };
    if (table === 'permission_profiles') return { data: db.perfil, error: null };
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
    const query = {
      select: () => query, eq: () => query, order: () => query, abortSignal: () => query,
      insert: () => query, upsert: () => query, update: () => query, delete: () => query,
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

const p = (modulo: string, acao: string, permitido = true): Perm => ({ modulo, acao, permitido });
const SEM_PERMISSAO = /não possui permissão/;

let version = 1;
function login(perfilPerms: Perm[], opcoes: { perfil?: null | { nome: string; ativo: boolean }; ativo?: boolean; admin?: boolean } = {}) {
  mocks.auth.session = { user: { id: 'usuario-ficticio', app_metadata: { provider: 'email' } } };
  mocks.auth.user = { id: 'usuario-ficticio' };
  mocks.auth.authorizationVersion = ++version;
  mocks.db.access = { ativo: opcoes.ativo ?? true, profile_id: 'perfil-ficticio', escopo: 'meus_dados' };
  mocks.db.perfil = opcoes.perfil === undefined ? { nome: 'Perfil Fictício', ativo: true } : opcoes.perfil;
  mocks.db.roles = opcoes.admin ? [{ role: 'admin' }] : [];
  mocks.db.profilePerms = perfilPerms;
}

function abrir(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}
async function liberada(path: string, titulo: string) {
  abrir(path);
  expect(await screen.findByRole('heading', { name: `página ${titulo}` })).toBeInTheDocument();
}
async function negada(path: string) {
  abrir(path);
  expect(await screen.findByText(SEM_PERMISSAO)).toBeInTheDocument();
}

function hook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => usePermissions(), { wrapper });
}
async function permissoes() {
  const view = hook();
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view.result.current;
}

beforeEach(() => {
  cleanup();
  Object.assign(mocks.auth, { session: null, user: null, loading: false });
  Object.assign(mocks.db, { access: null, roles: [], perfil: null, profilePerms: [], userPerms: [] });
});

describe('contrato — acessar e visualizar nas rotas', () => {
  it('perfil sem nenhuma permissão: módulo de dados e módulo só-acesso negados', async () => {
    login([]);
    await negada('/prospeccao');
    cleanup();
    await negada('/estudo-vendas');
  });
  it('somente acessar: módulo só-acesso liberado (acessar já autoriza a leitura)', async () => {
    login([p('estudo_vendas', 'acessar')]);
    await liberada('/estudo-vendas', 'estudo vendas');
  });
  it('somente acessar em módulo que oferece visualizar: negado', async () => {
    login([p('prospeccao', 'acessar')]);
    await negada('/prospeccao');
  });
  it('acessar + visualizar: liberado', async () => {
    login([p('prospeccao', 'acessar'), p('prospeccao', 'visualizar')]);
    await liberada('/prospeccao', 'prospecção');
  });
  it('visualizar sem acessar: negado', async () => {
    login([p('prospeccao', 'visualizar')]);
    await negada('/prospeccao');
  });
  it('criar/editar/excluir sem acessar e visualizar não abrem o módulo', async () => {
    login([p('prospeccao', 'criar'), p('prospeccao', 'editar'), p('prospeccao', 'excluir')]);
    await negada('/prospeccao');
  });
});

describe('contrato — exceções individuais', () => {
  it('exceção positiva completa libera módulo que o perfil não concede', async () => {
    login([]);
    mocks.db.userPerms = [p('metas', 'acessar'), p('metas', 'visualizar')];
    await liberada('/metas', 'metas');
  });
  it('exceção negativa em visualizar prevalece sobre o perfil', async () => {
    login([p('metas', 'acessar'), p('metas', 'visualizar')]);
    mocks.db.userPerms = [p('metas', 'visualizar', false)];
    await negada('/metas');
  });
  it('exceção negativa em acessar prevalece sobre o perfil', async () => {
    login([p('estudo_vendas', 'acessar')]);
    mocks.db.userPerms = [p('estudo_vendas', 'acessar', false)];
    await negada('/estudo-vendas');
  });
});

describe('contrato — perfil e cadastro de acesso', () => {
  it('perfil inexistente: tudo negado', async () => {
    login([p('estudo_vendas', 'acessar')], { perfil: null });
    await negada('/estudo-vendas');
  });
  it('perfil inativo: as permissões dele deixam de valer', async () => {
    login([p('estudo_vendas', 'acessar')], { perfil: { nome: 'Perfil Fictício', ativo: false } });
    await negada('/estudo-vendas');
  });
  it('perfil inativo: exceção individual também não vale (perfil desligado bloqueia o usuário)', async () => {
    login([], { perfil: { nome: 'Perfil Fictício', ativo: false } });
    mocks.db.userPerms = [p('estudo_vendas', 'acessar')];
    await negada('/estudo-vendas');
  });
  it('usuário sem cadastro de acesso: negado', async () => {
    login([p('estudo_vendas', 'acessar')]);
    mocks.db.access = null;
    await negada('/estudo-vendas');
  });
  it('administrador técnico ativo: liberado mesmo com perfil inativo', async () => {
    login([], { admin: true, perfil: { nome: 'Perfil Fictício', ativo: false } });
    await liberada('/prospeccao', 'prospecção');
  });
  it('administrador técnico inativo: negado', async () => {
    login([], { admin: true, ativo: false });
    await negada('/prospeccao');
  });
});

describe('contrato — menu lateral', () => {
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
  it('Dashboard só aparece com a permissão do módulo', async () => {
    login([p('estudo_vendas', 'acessar')]);
    menu();
    expect(await screen.findByText('Estudo de Vendas')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
  it('módulo com acessar sem visualizar não aparece no menu', async () => {
    login([p('estudo_vendas', 'acessar'), p('prospeccao', 'acessar')]);
    menu();
    expect(await screen.findByText('Estudo de Vendas')).toBeInTheDocument();
    expect(screen.queryByText('Prospecção')).not.toBeInTheDocument();
  });
});

describe('contrato — subabas e IA', () => {
  it('subaba só vale com a permissão dela', async () => {
    login([p('inteligencia', 'acessar'), p('inteligencia.resumo', 'acessar')]);
    const perms = await permissoes();
    expect(perms.can('inteligencia.resumo')).toBe(true);
    expect(perms.can('inteligencia.vendedores')).toBe(false);
  });
  it('nome de perfil "Gestor" não libera a IA', async () => {
    login([p('inteligencia', 'acessar')], { perfil: { nome: 'Gestor', ativo: true } });
    expect((await permissoes()).podeUsarIA).toBe(false);
  });
  it('IA liberada pela matriz, independentemente do nome do perfil', async () => {
    login([p('inteligencia', 'acessar'), p('inteligencia.central_analise', 'acessar')], { perfil: { nome: 'Comercial', ativo: true } });
    expect((await permissoes()).podeUsarIA).toBe(true);
  });
  it('IA exige também o acesso ao módulo Inteligência', async () => {
    login([p('inteligencia.central_analise', 'acessar')]);
    expect((await permissoes()).podeUsarIA).toBe(false);
  });
  it('administrador técnico ativo usa a IA', async () => {
    login([], { admin: true });
    expect((await permissoes()).podeUsarIA).toBe(true);
  });
});
