import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useDegustacoes } from '@/hooks/useDegustacoes';
import { useMateriais } from '@/hooks/useDegustacaoCatalogos';
import { useClientAliases } from '@/hooks/useClientAliases';
import { CatalogoManagerDialog } from '@/components/degustacoes/CatalogoManagerDialog';
import { QuickCreateSelect } from '@/components/QuickCreateSelect';

// Fase 2 (Degustações, Ponto de Venda, Endereços, Duplicados, Análise) com a
// chave de ativação ligada. Permissões simuladas via usePermissions; Supabase
// simulado registra cada gravação (dados fictícios, nada vai ao banco real).
const FASE2 = ['degustacoes', 'ponto_venda', 'clientes_enderecos', 'clientes_duplicados'];
const mocks = vi.hoisted(() => ({
  ativos: new Set<string>(),
  permitidas: new Set<string>(),
  writes: [] as string[],
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/crudEnforcement', () => ({ crudAtivo: (m: string) => mocks.ativos.has(m) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (m: string, a = 'acessar') => mocks.permitidas.has(`${m}:${a}`) }),
}));
vi.mock('@/hooks/useClientScope', () => ({ useClientScope: () => ({ filtrarPorCliente: (r: unknown[]) => r }) }));
vi.mock('@/hooks/useTaxonomies', () => ({
  useTaxonomies: () => ({ data: [{ id: 't1', nome: 'Item Fictício' }] }),
  useCreateTaxonomy: () => ({ mutateAsync: vi.fn(async ({ nome }: { nome: string }) => ({ nome })) }),
  useDeleteTaxonomy: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/integrations/supabase/client', () => {
  function from(table: string) {
    let op = 'select';
    const write = (nome: string) => () => { op = nome; mocks.writes.push(`${table}:${nome}`); return query; };
    const resultado = () => (op === 'insert' ? { data: { id: 'novo-id', nome: 'Fictício' }, error: null } : { data: [], error: null });
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query, single: () => query,
      insert: write('insert'), update: write('update'), upsert: write('upsert'), delete: write('delete'),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(resolve, reject),
    };
    return query;
  }
  return { supabase: { from } };
});

const libera = (modulo: string, ...acoes: string[]) => acoes.forEach((a) => mocks.permitidas.add(`${modulo}:${a}`));
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const SEM_PERMISSAO = /Sem permissão para/;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.ativos = new Set(FASE2);
  mocks.permitidas = new Set();
  mocks.writes = [];
});

describe('Degustações — gravações', () => {
  const nova = { cliente: 'CLIENTE FICTÍCIO', data: '2026-01-10', status: 'pendente' } as never;

  it('usuário autorizado consegue criar', async () => {
    libera('degustacoes', 'criar');
    const { result } = renderHook(() => useDegustacoes(), { wrapper });
    await act(() => result.current.create.mutateAsync(nova));
    expect(mocks.writes).toContain('degustacoes:insert');
    expect(mocks.toast.success).toHaveBeenCalledWith('Degustação cadastrada');
  });
  it('sem permissão de criar: não grava e não confirma sucesso', async () => {
    const { result } = renderHook(() => useDegustacoes(), { wrapper });
    await expect(result.current.create.mutateAsync(nova)).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Sem permissão para criar degustações.'));
  });
  it('duplicação em lote respeita a permissão de criar', async () => {
    libera('degustacoes', 'editar', 'excluir');
    const { result } = renderHook(() => useDegustacoes(), { wrapper });
    await expect(result.current.bulkInsert.mutateAsync([nova, nova])).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
  it('editar e status (individual e em lote) exigem editar', async () => {
    libera('degustacoes', 'criar', 'excluir');
    const { result } = renderHook(() => useDegustacoes(), { wrapper });
    await expect(result.current.update.mutateAsync({ id: 'd1', patch: { status: 'realizada' } })).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.bulkUpdateStatus.mutateAsync({ ids: ['d1', 'd2'], status: 'cancelada' })).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);

    libera('degustacoes', 'editar');
    const { result: liberado } = renderHook(() => useDegustacoes(), { wrapper });
    await act(() => liberado.current.bulkUpdateStatus.mutateAsync({ ids: ['d1', 'd2'], status: 'cancelada' }));
    expect(mocks.writes).toEqual(['degustacoes:update']);
  });
  it('excluir exige excluir', async () => {
    libera('degustacoes', 'criar', 'editar');
    const { result } = renderHook(() => useDegustacoes(), { wrapper });
    await expect(result.current.remove.mutateAsync('d1')).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);

    libera('degustacoes', 'excluir');
    const { result: liberado } = renderHook(() => useDegustacoes(), { wrapper });
    await act(() => liberado.current.remove.mutateAsync('d1'));
    expect(mocks.writes).toEqual(['degustacoes:delete']);
  });
  it('chave desligada: segue liberado como antes', async () => {
    mocks.ativos = new Set();
    const { result } = renderHook(() => useDegustacoes(), { wrapper });
    await act(() => result.current.remove.mutateAsync('d1'));
    expect(mocks.writes).toEqual(['degustacoes:delete']);
  });
  it('catálogos do formulário seguem o módulo', async () => {
    const { result } = renderHook(() => useMateriais(), { wrapper });
    await expect(result.current.create.mutateAsync('Avental')).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.remove.mutateAsync('m1')).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
});

describe('Degustações — tela de catálogo', () => {
  const props = {
    open: true, onOpenChange: () => {}, title: 'Gerenciar Materiais',
    items: [{ id: 'm1', nome: 'Avental' }], onCreate: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(),
  };
  it('sem permissões: só consulta', () => {
    render(<CatalogoManagerDialog {...props} />, { wrapper });
    expect(screen.getByText('Avental')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Novo item...')).toBeNull();
    expect(screen.getByRole('dialog').querySelectorAll('button').length).toBe(2); // Fechar + X do diálogo
  });
  it('com criar: exibe o campo de novo item', () => {
    libera('degustacoes', 'criar');
    render(<CatalogoManagerDialog {...props} />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText('Novo item...'), { target: { value: 'Toalha' } });
    expect(screen.getByPlaceholderText('Novo item...')).toBeTruthy();
  });
});

describe('Clientes Duplicados — gravações', () => {
  it('agrupar, separar e restaurar exigem editar', async () => {
    libera('clientes_duplicados', 'excluir');
    const { result } = renderHook(() => useClientAliases(), { wrapper });
    await expect(result.current.addAlias.mutateAsync({ canonical: 'A', alias: 'B' })).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.setDecision.mutateAsync({ a: 'A', b: 'B', decisao: 'manter_separados' })).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.restoreClient.mutateAsync('B')).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
  it('remover alias e excluir das análises exigem excluir', async () => {
    libera('clientes_duplicados', 'editar');
    const { result } = renderHook(() => useClientAliases(), { wrapper });
    await expect(result.current.removeAlias.mutateAsync('al1')).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.excludeClient.mutateAsync({ nome: 'B' })).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
  it('usuário autorizado consegue agrupar e excluir das análises', async () => {
    libera('clientes_duplicados', 'editar', 'excluir');
    const { result } = renderHook(() => useClientAliases(), { wrapper });
    await act(() => result.current.addAlias.mutateAsync({ canonical: 'A', alias: 'B' }));
    await act(() => result.current.excludeClient.mutateAsync({ nome: 'C' }));
    expect(mocks.writes).toEqual(['client_aliases:upsert', 'client_aliases:upsert']);
  });
});

describe('QuickCreateSelect — itens de cadastro seguem o módulo do formulário', () => {
  const abrir = () => fireEvent.click(screen.getByRole('combobox'));
  it('sem criar: não oferece cadastrar novo', () => {
    render(<QuickCreateSelect modulo="ponto_venda" tipo="pdv_tipo" value="" onChange={() => {}} createLabel="Cadastrar nova classificação" />, { wrapper });
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/buscar|pesquisar/i), { target: { value: 'Novo tipo' } });
    expect(screen.queryByText(/Cadastrar nova classificação/)).toBeNull();
  });
  it('com criar: oferece cadastrar novo', () => {
    libera('ponto_venda', 'criar');
    render(<QuickCreateSelect modulo="ponto_venda" tipo="pdv_tipo" value="" onChange={() => {}} createLabel="Cadastrar nova classificação" />, { wrapper });
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/buscar|pesquisar/i), { target: { value: 'Novo tipo' } });
    expect(screen.getByText(/Cadastrar nova classificação/)).toBeTruthy();
  });
});
