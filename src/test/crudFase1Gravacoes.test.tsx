import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useCommercialActions, useCommercialActionTypes } from '@/hooks/useCommercialActions';
import { useBonificacaoMutations, useBonificacaoVinculoMutations } from '@/hooks/useBonificacoes';
import { useDeleteClientProfile } from '@/hooks/useClientProfiles';
import { CreatableSelect } from '@/components/cadastro/CreatableSelect';
import { ClientProfileViewer } from '@/components/cadastro/ClientProfileViewer';
import { ImportarBonificacoesDialog } from '@/components/bonificacoes/ImportarBonificacoesDialog';
import type { ClientProfile } from '@/types/clientProfile';

// Fase 1 (Ações Comerciais, Bonificações, Cadastro de Clientes) com a chave
// de ativação ligada. Permissões simuladas via usePermissions; Supabase
// simulado registra cada gravação (dados fictícios, nada vai ao banco real).
const mocks = vi.hoisted(() => ({
  ativos: new Set<string>(['acoes_comerciais', 'bonificacoes', 'cadastro_clientes']),
  permitidas: new Set<string>(),
  writes: [] as string[],
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/crudEnforcement', () => ({ crudAtivo: (m: string) => mocks.ativos.has(m) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (m: string, a = 'acessar') => mocks.permitidas.has(`${m}:${a}`) }),
}));
// Escopo de empresa (sem restrição): o foco destes testes é a permissão CRUD.
vi.mock('@/hooks/useClientScope', () => ({ useClientScope: () => ({ todos: true, filtrarRegistros: (r: unknown[]) => r, podeVerRegistro: () => true, podeVerCliente: () => true }) }));
vi.mock('@/hooks/useVendorScope', () => ({ useVendorScope: () => ({ todos: true, semRestricao: true, filtrar: (r: unknown[]) => r, exigirEscopo: () => undefined }), vendorScopeKey: () => 'todos', ForaDoEscopoError: class extends Error {} }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/commissionImport', async (original) => ({
  ...(await original<typeof import('@/lib/commissionImport')>()),
  parseCommissionFile: async () => ({ rows: [] }),
}));
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
  return { supabase: { from, auth: { getUser: async () => ({ data: { user: { email: 'ficticio@exemplo.invalid' } } }) } } };
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
  mocks.ativos = new Set(['acoes_comerciais', 'bonificacoes', 'cadastro_clientes']);
  mocks.permitidas = new Set();
  mocks.writes = [];
});

describe('Ações Comerciais — gravações', () => {
  const nova = { cliente: 'CLIENTE FICTÍCIO', nome: 'Ação', tipo: 'Tipo', data_inicio: '2026-01-01', data_fim: '2026-01-31' } as never;

  it('usuário autorizado consegue criar', async () => {
    libera('acoes_comerciais', 'criar');
    const { result } = renderHook(() => useCommercialActions(), { wrapper });
    await act(() => result.current.create.mutateAsync(nova));
    expect(mocks.writes).toContain('commercial_actions:insert');
    expect(mocks.toast.success).toHaveBeenCalledWith('Ação comercial cadastrada');
  });
  it('sem permissão de criar: não grava e não confirma sucesso', async () => {
    const { result } = renderHook(() => useCommercialActions(), { wrapper });
    await expect(result.current.create.mutateAsync(nova)).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Sem permissão para criar ações comerciais.'));
  });
  it('duplicação respeita a permissão de criar', async () => {
    libera('acoes_comerciais', 'editar', 'excluir');
    const { result } = renderHook(() => useCommercialActions(), { wrapper });
    await expect(
      result.current.create.mutateAsync({ ...(nova as object), copiadaDe: { id: 'a1', nome: 'Ação', cliente: 'X' } } as never),
    ).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
  it('editar e mudar status exigem editar', async () => {
    libera('acoes_comerciais', 'criar', 'excluir');
    const { result } = renderHook(() => useCommercialActions(), { wrapper });
    await expect(result.current.update.mutateAsync({ id: 'a1', patch: { status: 'Encerrada' } })).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
    libera('acoes_comerciais', 'editar');
    await act(() => result.current.update.mutateAsync({ id: 'a1', patch: { status: 'Encerrada' } }));
    expect(mocks.writes).toContain('commercial_actions:update');
  });
  it('excluir exige excluir', async () => {
    libera('acoes_comerciais', 'criar', 'editar');
    const { result } = renderHook(() => useCommercialActions(), { wrapper });
    await expect(result.current.remove.mutateAsync('a1')).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
    libera('acoes_comerciais', 'excluir');
    await act(() => result.current.remove.mutateAsync('a1'));
    expect(mocks.writes).toEqual(['commercial_actions:delete']);
  });
  it('catálogo de tipos: criar exige criar, remover exige excluir', async () => {
    const { result } = renderHook(() => useCommercialActionTypes(), { wrapper });
    await expect(result.current.create.mutateAsync('Novo tipo')).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.remove.mutateAsync('t1')).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
});

describe('Bonificações — gravações', () => {
  it('nova bonificação exige criar', async () => {
    const { result } = renderHook(() => useBonificacaoMutations(), { wrapper });
    await expect(result.current.salvarCadastro.mutateAsync({ cliente: 'C', produto: 'P' })).rejects.toThrow(SEM_PERMISSAO);
    libera('bonificacoes', 'criar');
    await act(() => result.current.salvarCadastro.mutateAsync({ cliente: 'C', produto: 'P' }));
    expect(mocks.writes).toEqual(['bonificacao_cadastro:upsert']);
  });
  it('exclusão lógica em lote exige excluir', async () => {
    libera('bonificacoes', 'criar', 'editar');
    const { result } = renderHook(() => useBonificacaoMutations(), { wrapper });
    await expect(result.current.excluirCliente.mutateAsync(['b1', 'b2'])).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
  it('negociação em lote exige editar', async () => {
    libera('bonificacoes', 'criar', 'excluir');
    const { result } = renderHook(() => useBonificacaoMutations(), { wrapper });
    await expect(result.current.salvarNegociacao.mutateAsync({ ids: ['b1', 'b2'], pct_negociacao: 5 })).rejects.toThrow(SEM_PERMISSAO);
    libera('bonificacoes', 'editar');
    await act(() => result.current.salvarNegociacao.mutateAsync({ ids: ['b1', 'b2'], pct_negociacao: 5 }));
    expect(mocks.writes).toEqual(['bonificacao_cadastro:update']);
  });
  it('vínculos manuais exigem editar', async () => {
    const { result } = renderHook(() => useBonificacaoVinculoMutations(), { wrapper });
    await expect(result.current.vincular.mutateAsync({ rowId: 1, codigoVenda: '123' })).rejects.toThrow(SEM_PERMISSAO);
    await expect(result.current.limparVinculo.mutateAsync(1)).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
  });
  it('importação de planilha exige criar e não confirma sucesso quando recusada', async () => {
    render(<ImportarBonificacoesDialog open onOpenChange={() => {}} onImported={() => {}} />, { wrapper });
    const arquivo = new File(['x'], 'bonificacoes.xlsx');
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(SEM_PERMISSAO)));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });
});

describe('Cadastro de Clientes — gravações e componentes compartilhados', () => {
  it('excluir ficha (individual ou em lote) exige excluir', async () => {
    const { result } = renderHook(() => useDeleteClientProfile(), { wrapper });
    await expect(Promise.all(['c1', 'c2'].map((id) => result.current.mutateAsync(id)))).rejects.toThrow(SEM_PERMISSAO);
    expect(mocks.writes).toEqual([]);
    libera('cadastro_clientes', 'excluir');
    await act(() => result.current.mutateAsync('c1'));
    expect(mocks.writes).toEqual(['client_profiles:delete']);
  });
  it('visualizador da ficha só mostra "Editar" com permissão de editar', () => {
    const ficha = { id: 'c1', nome: 'CLIENTE FICTÍCIO', contatos: [], produtos_negociados: [] } as unknown as ClientProfile;
    const view = render(<ClientProfileViewer open onOpenChange={() => {}} profile={ficha} onEdit={() => {}} />, { wrapper });
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    libera('cadastro_clientes', 'editar');
    view.rerender(<ClientProfileViewer open onOpenChange={() => {}} profile={{ ...ficha }} onEdit={() => {}} />);
    expect(screen.getByRole('button', { name: /Editar/ })).toBeInTheDocument();
  });
});

describe('CreatableSelect — opções de catálogo', () => {
  const abrir = (props: { podeCriar?: boolean; removable?: boolean }) => {
    render(
      <CreatableSelect
        value=""
        onChange={() => {}}
        options={[{ value: 'A', label: 'Opção A', removable: props.removable, onRemove: () => {} }]}
        onCreate={async (n) => n}
        createLabel="Cadastrar novo"
        podeCriar={props.podeCriar}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Buscar ou digitar nova...'), { target: { value: 'Nova opção' } });
  };
  it('padrão continua oferecendo "Cadastrar novo" (compatibilidade)', () => {
    abrir({ removable: true });
    expect(screen.getByText(/Cadastrar novo: "Nova opção"/)).toBeInTheDocument();
  });
  it('sem permissão de criar, não oferece cadastro', () => {
    abrir({ podeCriar: false });
    expect(screen.queryByText(/Cadastrar novo/)).not.toBeInTheDocument();
  });
});

describe('módulos desativados preservam o comportamento atual', () => {
  it('sem a chave ligada, gravações seguem liberadas mesmo sem a ação no perfil', async () => {
    mocks.ativos = new Set();
    const acoes = renderHook(() => useCommercialActions(), { wrapper });
    await act(() => acoes.result.current.remove.mutateAsync('a1'));
    const bonif = renderHook(() => useBonificacaoMutations(), { wrapper });
    await act(() => bonif.result.current.excluirCliente.mutateAsync(['b1']));
    const ficha = renderHook(() => useDeleteClientProfile(), { wrapper });
    await act(() => ficha.result.current.mutateAsync('c1'));
    expect(mocks.writes).toEqual(['commercial_actions:delete', 'bonificacao_cadastro:update', 'client_profiles:delete']);
  });
});
