import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';

// Herança do perfil × exceções individuais com os hooks reais (useUserRole +
// usePermissions). Só o Supabase e a sessão são simulados (dados fictícios).
type Perm = { modulo: string; acao: string; permitido: boolean };
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'usuario-ficticio' } as { id: string } | null, loading: false, authorizationVersion: 1 },
  db: {
    access: { ativo: true, profile_id: 'perfil-a', escopo: 'meus_dados', vendedores_autorizados: [], scope_id: null } as Record<string, unknown> | null,
    roles: [] as { role: string }[],
    perfis: {} as Record<string, Perm[]>,
    userPerms: [] as Perm[],
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => {
  function from(table: string) {
    const filtros: Record<string, unknown> = {};
    const resultado = () => {
      const { db } = mocks;
      if (table === 'user_access') return { data: db.access, error: null };
      if (table === 'profiles') return { data: { nome: 'Fictício', vendedor: 'VENDEDOR A', must_change_password: false }, error: null };
      if (table === 'user_roles') return { data: db.roles, error: null };
      if (table === 'user_permissions') return { data: db.userPerms, error: null };
      if (table === 'permission_profiles') return { data: { nome: String(filtros.id), ativo: true }, error: null };
      if (table === 'profile_permissions') return { data: db.perfis[String(filtros.profile_id)] ?? [], error: null };
      return { data: null, error: null };
    };
    const query = {
      select: () => query,
      eq: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return query; },
      abortSignal: () => query,
      maybeSingle: () => Promise.resolve(resultado()),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultado()).then(resolve),
    };
    return query;
  }
  return { supabase: { from } };
});

const permite = (modulo: string, acao = 'acessar'): Perm => ({ modulo, acao, permitido: true });
const bloqueia = (modulo: string, acao = 'acessar'): Perm => ({ modulo, acao, permitido: false });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => usePermissions(), { wrapper });
  // Mesma invalidação feita pelo editor após gravar (prefixo "user-permissions").
  const recarregar = async () => {
    await client.invalidateQueries({ queryKey: ['user-permissions'] });
    await client.invalidateQueries({ queryKey: ['user-access'] });
  };
  return { view, recarregar };
}
async function pronto(view: ReturnType<typeof setup>['view']) {
  await waitFor(() => expect(view.result.current.loading).toBe(false));
}

beforeEach(() => {
  cleanup();
  Object.assign(mocks.auth, { user: { id: 'usuario-ficticio' }, loading: false, authorizationVersion: 1 });
  mocks.db.access = { ativo: true, profile_id: 'perfil-a', escopo: 'meus_dados', vendedores_autorizados: [], scope_id: null };
  mocks.db.roles = [];
  mocks.db.perfis = { 'perfil-a': [permite('prospeccao')], 'perfil-b': [permite('metas')] };
  mocks.db.userPerms = [];
});

describe('permissões efetivas — herança e exceções individuais', () => {
  it('perfil permite e usuário herda: acesso permitido', async () => {
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('prospeccao')).toBe(true);
  });
  it('perfil não concede e usuário herda: acesso negado', async () => {
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('importar')).toBe(false);
  });
  it('perfil com permitido = false e usuário herda: acesso negado', async () => {
    mocks.db.perfis['perfil-a'] = [bloqueia('prospeccao')];
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('prospeccao')).toBe(false);
  });
  it('perfil permite e usuário bloqueia: acesso negado', async () => {
    mocks.db.userPerms = [bloqueia('prospeccao')];
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('prospeccao')).toBe(false);
  });
  it('perfil bloqueia e usuário permite: acesso permitido', async () => {
    mocks.db.userPerms = [permite('importar')];
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('importar')).toBe(true);
  });
  it('exceção vale só para a ação indicada', async () => {
    mocks.db.userPerms = [permite('importar', 'acessar')];
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('importar', 'excluir')).toBe(false);
  });
  it('remover bloqueio individual retorna à regra do perfil', async () => {
    mocks.db.userPerms = [bloqueia('prospeccao')];
    const { view, recarregar } = setup();
    await pronto(view);
    expect(view.result.current.can('prospeccao')).toBe(false);
    mocks.db.userPerms = [];
    await recarregar();
    await waitFor(() => expect(view.result.current.can('prospeccao')).toBe(true));
  });
  it('remover liberação individual retorna à regra do perfil', async () => {
    mocks.db.userPerms = [permite('importar')];
    const { view, recarregar } = setup();
    await pronto(view);
    expect(view.result.current.can('importar')).toBe(true);
    mocks.db.userPerms = [];
    await recarregar();
    await waitFor(() => expect(view.result.current.can('importar')).toBe(false));
  });
  it('trocar o perfil recalcula a herança e preserva as exceções', async () => {
    mocks.db.userPerms = [bloqueia('metas'), permite('importar')];
    const { view, recarregar } = setup();
    await pronto(view);
    expect(view.result.current.can('prospeccao')).toBe(true);
    mocks.db.access = { ...mocks.db.access, profile_id: 'perfil-b' };
    await recarregar();
    await waitFor(() => expect(view.result.current.can('prospeccao')).toBe(false));
    expect(view.result.current.can('metas')).toBe(false); // bloqueio individual continua valendo
    expect(view.result.current.can('importar')).toBe(true);
  });
});

describe('permissões efetivas — hierarquia preservada', () => {
  it('administrador técnico ativo mantém acesso total, mesmo com bloqueio individual', async () => {
    mocks.db.roles = [{ role: 'admin' }];
    mocks.db.userPerms = [bloqueia('prospeccao')];
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('prospeccao')).toBe(true);
    expect(view.result.current.can('administracao')).toBe(true);
  });
  it('vendedor sem permissão permanece bloqueado', async () => {
    const { view } = setup();
    await pronto(view);
    expect(view.result.current.can('bonificacoes')).toBe(false);
    expect(view.result.current.can('administracao')).toBe(false);
  });
  it('usuário inativo permanece bloqueado, mesmo com liberação individual e role admin', async () => {
    mocks.db.access = { ...mocks.db.access, ativo: false };
    mocks.db.roles = [{ role: 'admin' }];
    mocks.db.userPerms = [permite('prospeccao')];
    const { view } = setup();
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.can('prospeccao')).toBe(false);
  });
  it('usuário sem cadastro de acesso permanece bloqueado', async () => {
    mocks.db.access = null;
    mocks.db.userPerms = [permite('prospeccao')];
    const { view } = setup();
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.can('prospeccao')).toBe(false);
  });
  it('usuário sem sessão permanece bloqueado', async () => {
    mocks.auth.user = null;
    const { view } = setup();
    expect(view.result.current.can('prospeccao')).toBe(false);
  });
});

describe('permissões efetivas — alteração de carteira na sessão', () => {
  it('carteira alterada pelo administrador vale na releitura automática (5 min), sem recarregar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.db.access = { ativo: true, profile_id: 'perfil-a', escopo: 'vendedores_selecionados', vendedores_autorizados: ['VENDEDOR B'], scope_id: null };
      const { view } = setup();
      await waitFor(() => expect(view.result.current.loading).toBe(false));
      expect(view.result.current.canSee('VENDEDOR B')).toBe(true);
      expect(view.result.current.canSee('VENDEDOR C')).toBe(false);

      mocks.db.access = { ...mocks.db.access, vendedores_autorizados: ['VENDEDOR C'] };
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      await waitFor(() => expect(view.result.current.canSee('VENDEDOR C')).toBe(true));
      expect(view.result.current.canSee('VENDEDOR B')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
