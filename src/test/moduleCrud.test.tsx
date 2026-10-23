import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { PermissionDeniedError, useModuleCrud } from '@/hooks/useModuleCrud';

// useModuleCrud com os hooks reais de permissão (useUserRole + usePermissions);
// só o Supabase, a sessão e a chave de ativação são simulados (dados fictícios).
type Perm = { modulo: string; acao: string; permitido: boolean };
const mocks = vi.hoisted(() => ({
  ativos: new Set<string>(['acoes_comerciais']),
  auth: { user: { id: 'usuario-ficticio' } as { id: string } | null, loading: false, authorizationVersion: 1 },
  db: {
    access: { ativo: true, profile_id: 'perfil-a', escopo: 'meus_dados', vendedores_autorizados: [], scope_id: null } as Record<string, unknown> | null,
    roles: [] as { role: string }[],
    profilePerms: [] as Perm[],
    userPerms: [] as Perm[],
  },
}));
vi.mock('@/lib/crudEnforcement', () => ({ crudAtivo: (m: string) => mocks.ativos.has(m) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => {
  function from(table: string) {
    const resultado = () => {
      const { db } = mocks;
      if (table === 'user_access') return { data: db.access, error: null };
      if (table === 'profiles') return { data: { nome: 'Fictício', vendedor: 'VENDEDOR A', must_change_password: false }, error: null };
      if (table === 'user_roles') return { data: db.roles, error: null };
      if (table === 'user_permissions') return { data: db.userPerms, error: null };
      if (table === 'permission_profiles') return { data: { nome: 'Perfil Fictício' }, error: null };
      if (table === 'profile_permissions') return { data: db.profilePerms, error: null };
      return { data: null, error: null };
    };
    const query = {
      select: () => query, eq: () => query, abortSignal: () => query,
      maybeSingle: () => Promise.resolve(resultado()),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultado()).then(resolve),
    };
    return query;
  }
  return { supabase: { from } };
});

const perm = (acao: string, permitido = true): Perm => ({ modulo: 'acoes_comerciais', acao, permitido });

function setup(modulo = 'acoes_comerciais') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useModuleCrud(modulo, 'ações comerciais'), { wrapper });
}

beforeEach(() => {
  cleanup();
  mocks.ativos = new Set(['acoes_comerciais']);
  Object.assign(mocks.auth, { user: { id: 'usuario-ficticio' }, loading: false });
  mocks.db.access = { ativo: true, profile_id: 'perfil-a', escopo: 'meus_dados', vendedores_autorizados: [], scope_id: null };
  mocks.db.roles = [];
  mocks.db.profilePerms = [perm('acessar'), perm('criar'), perm('editar'), perm('excluir')];
  mocks.db.userPerms = [];
});

describe('useModuleCrud — módulo ativado', () => {
  it('permissões herdadas do perfil liberam criar, editar e excluir', async () => {
    const view = setup();
    await waitFor(() => expect(view.result.current.podeCriar).toBe(true));
    expect(view.result.current.podeEditar).toBe(true);
    expect(view.result.current.podeExcluir).toBe(true);
  });
  it('ação ausente no perfil é negada', async () => {
    mocks.db.profilePerms = [perm('acessar'), perm('criar')];
    const view = setup();
    await waitFor(() => expect(view.result.current.podeCriar).toBe(true));
    expect(view.result.current.podeEditar).toBe(false);
    expect(view.result.current.podeExcluir).toBe(false);
  });
  it('bloqueio individual prevalece sobre o perfil', async () => {
    mocks.db.userPerms = [perm('excluir', false)];
    const view = setup();
    await waitFor(() => expect(view.result.current.podeCriar).toBe(true));
    expect(view.result.current.podeExcluir).toBe(false);
  });
  it('liberação individual concede ação que o perfil não tem', async () => {
    mocks.db.profilePerms = [perm('acessar')];
    mocks.db.userPerms = [perm('editar')];
    const view = setup();
    await waitFor(() => expect(view.result.current.podeEditar).toBe(true));
    expect(view.result.current.podeCriar).toBe(false);
  });
  it('administrador técnico ativo mantém todos os privilégios', async () => {
    mocks.db.roles = [{ role: 'admin' }];
    mocks.db.profilePerms = [];
    mocks.db.userPerms = [perm('excluir', false)];
    const view = setup();
    await waitFor(() => expect(view.result.current.podeExcluir).toBe(true));
    expect(view.result.current.podeCriar).toBe(true);
  });
  it('carregamento não libera operações', () => {
    const view = setup();
    expect(view.result.current.podeCriar).toBe(false);
    expect(() => view.result.current.exigir('criar')).toThrow(PermissionDeniedError);
  });
  it('usuário inativo não recebe operações', async () => {
    mocks.db.access = { ...mocks.db.access, ativo: false };
    const view = setup();
    await new Promise((r) => setTimeout(r, 50));
    expect(view.result.current.podeCriar).toBe(false);
  });
  it('exigir recusa com mensagem clara', async () => {
    mocks.db.profilePerms = [perm('acessar')];
    const view = setup();
    await new Promise((r) => setTimeout(r, 50));
    expect(() => view.result.current.exigir('excluir')).toThrow('Sem permissão para excluir ações comerciais.');
  });
});

describe('useModuleCrud — módulo desativado (compatibilidade)', () => {
  it('mantém o comportamento anterior: tudo liberado, mesmo sem a ação no perfil', () => {
    mocks.ativos = new Set();
    mocks.db.profilePerms = [perm('acessar')];
    const view = setup();
    expect(view.result.current.podeCriar).toBe(true);
    expect(view.result.current.podeEditar).toBe(true);
    expect(view.result.current.podeExcluir).toBe(true);
    expect(() => view.result.current.exigir('excluir')).not.toThrow();
  });
});
