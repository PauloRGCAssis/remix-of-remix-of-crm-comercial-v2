import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AcoesComerciaisPage from '@/pages/AcoesComerciaisPage';
import BonificacoesPage from '@/pages/BonificacoesPage';
import CadastroClientesPage from '@/pages/CadastroClientesPage';

// Telas reais da Fase 1 com a chave de ativação ligada: botões e menus
// seguem as permissões CRUD. Dados e diálogos simulados (fictícios).
const mocks = vi.hoisted(() => ({
  ativos: new Set<string>(),
  permitidas: new Set<string>(),
}));
vi.mock('@/lib/crudEnforcement', () => ({ crudAtivo: (m: string) => mocks.ativos.has(m) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (m: string, a = 'acessar') => mocks.permitidas.has(`${m}:${a}`) }),
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: JSX.Element }) => <main>{children}</main> }));
vi.mock('@/components/EscopoUsuarioBar', () => ({ EscopoUsuarioBar: () => null }));
vi.mock('@/components/acoes/AcaoComercialDialog', () => ({ AcaoComercialDialog: () => null }));
vi.mock('@/components/acoes/CopiarAcaoVariosDialog', () => ({ CopiarAcaoVariosDialog: () => null }));
vi.mock('@/components/acoes/AcaoHistoricoSheet', () => ({ AcaoHistoricoSheet: () => null }));
vi.mock('@/components/acoes/AcaoResultadoSheet', () => ({ AcaoResultadoSheet: () => null }));
vi.mock('@/components/cadastro/ClientProfileDialog', () => ({ ClientProfileDialog: () => null }));
vi.mock('@/hooks/useCommercialActions', async (original) => ({
  ...(await original<typeof import('@/hooks/useCommercialActions')>()),
  useCommercialActions: () => ({
    list: {
      isLoading: false,
      data: [{ id: 'a1', cliente: 'CLIENTE FICTÍCIO', nome: 'Ação fictícia', tipo: 'Tipo', status: 'Planejada', data_inicio: '2026-01-01', data_fim: '2026-12-31', degustacao_ids: [], bonificacao_produtos: [] }],
    },
    remove: { mutateAsync: vi.fn() },
    update: { mutate: vi.fn() },
  }),
  useCommercialActionTypes: () => ({ list: { data: [] } }),
}));
vi.mock('@/hooks/useSalesData', async (original) => ({
  ...(await original<typeof import('@/hooks/useSalesData')>()),
  useSalesData: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useClientProfiles', async (original) => ({
  ...(await original<typeof import('@/hooks/useClientProfiles')>()),
  useClientProfiles: () => ({
    isLoading: false,
    data: [{ id: 'c1', nome: 'CLIENTE FICTÍCIO', cidade: 'Cidade', contatos: [], produtos_negociados: [], created_at: '2026-01-01' }],
  }),
  useDeleteClientProfile: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useDegustacoes', () => ({ useDegustacoes: () => ({ list: { data: [] } }) }));
vi.mock('@/hooks/useCustoProdutos', () => ({ useCustoProdutos: () => ({ index: new Map() }) }));
vi.mock('@/hooks/useVendors', async (original) => ({
  ...(await original<typeof import('@/hooks/useVendors')>()),
  useActiveVendorNames: () => [],
}));
vi.mock('@/hooks/useBonificacoes', async (original) => ({
  ...(await original<typeof import('@/hooks/useBonificacoes')>()),
  useBonificacaoCadastro: () => ({ data: [], isLoading: false }),
  useBonificacaoRows: () => ({ data: [], isLoading: false }),
  useBonificacaoCategorias: () => ({ data: [] }),
  useBonificacaoVinculos: () => ({ data: new Map() }),
}));

const libera = (modulo: string, ...acoes: string[]) => acoes.forEach((a) => mocks.permitidas.add(`${modulo}:${a}`));
const tela = (el: JSX.Element) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
};

beforeEach(() => {
  cleanup();
  mocks.ativos = new Set(['acoes_comerciais', 'bonificacoes', 'cadastro_clientes']);
  mocks.permitidas = new Set();
});

describe('Ações Comerciais — tela', () => {
  it('somente acesso: sem criar, editar, duplicar, excluir nem mudar status', () => {
    libera('acoes_comerciais', 'acessar');
    tela(<AcoesComerciaisPage />);
    expect(screen.getByText('Ação fictícia')).toBeInTheDocument(); // conteúdo continua visível
    expect(screen.queryByRole('button', { name: /Nova Ação/ })).not.toBeInTheDocument();
    for (const t of ['Editar', 'Duplicar', 'Copiar para clientes', 'Excluir']) expect(screen.queryByTitle(t)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Clique para alterar o status')).not.toBeInTheDocument();
    expect(screen.getByText('Planejada')).toBeInTheDocument();
  });
  it('cada ação aparece somente com a sua permissão', () => {
    libera('acoes_comerciais', 'acessar', 'editar');
    tela(<AcoesComerciaisPage />);
    expect(screen.getByTitle('Editar')).toBeInTheDocument();
    expect(screen.getByTitle('Clique para alterar o status')).toBeInTheDocument();
    expect(screen.queryByTitle('Duplicar')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Excluir')).not.toBeInTheDocument();
  });
  it('permissão completa mostra todas as ações', () => {
    libera('acoes_comerciais', 'acessar', 'criar', 'editar', 'excluir');
    tela(<AcoesComerciaisPage />);
    expect(screen.getByRole('button', { name: /Nova Ação/ })).toBeInTheDocument();
    for (const t of ['Editar', 'Duplicar', 'Copiar para clientes', 'Excluir']) expect(screen.getByTitle(t)).toBeInTheDocument();
  });
  it('módulo desativado: editar/excluir como antes, mas "Nova Ação" segue o PodeCriar', () => {
    mocks.ativos = new Set();
    tela(<AcoesComerciaisPage />);
    // PodeCriar (commit "Restringiu criação sem permissão") vale mesmo com o módulo desligado.
    expect(screen.queryByRole('button', { name: /Nova Ação/ })).not.toBeInTheDocument();
    expect(screen.getByTitle('Excluir')).toBeInTheDocument();
  });
  it('módulo desativado com criar: oferece "Nova Ação"', () => {
    mocks.ativos = new Set();
    libera('acoes_comerciais', 'acessar', 'criar');
    tela(<AcoesComerciaisPage />);
    expect(screen.getByRole('button', { name: /Nova Ação/ })).toBeInTheDocument();
  });
});

describe('Bonificações — tela', () => {
  it('sem criar: não oferece nova bonificação nem importação', () => {
    libera('bonificacoes', 'acessar', 'editar', 'excluir');
    tela(<BonificacoesPage />);
    expect(screen.getByText('Controle de Bonificações')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nova bonificação/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Importar bonificações/ })).not.toBeInTheDocument();
  });
  it('com criar: oferece nova bonificação e importação', () => {
    libera('bonificacoes', 'acessar', 'criar');
    tela(<BonificacoesPage />);
    expect(screen.getByRole('button', { name: /Nova bonificação/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importar bonificações/ })).toBeInTheDocument();
  });
});

describe('Cadastro de Clientes — tela', () => {
  it('sem criar e sem excluir: ficha visível, sem "Nova ficha" e sem lixeira', () => {
    libera('cadastro_clientes', 'acessar');
    const view = tela(<CadastroClientesPage />);
    expect(screen.getByText('CLIENTE FICTÍCIO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nova ficha/ })).not.toBeInTheDocument();
    expect(view.container.querySelector('.lucide-trash2, .lucide-trash-2')).toBeNull();
  });
  it('com criar e excluir: mostra "Nova ficha" e lixeira', () => {
    libera('cadastro_clientes', 'acessar', 'criar', 'excluir');
    const view = tela(<CadastroClientesPage />);
    expect(screen.getByRole('button', { name: /Nova ficha/ })).toBeInTheDocument();
    expect(view.container.querySelector('.lucide-trash2, .lucide-trash-2')).not.toBeNull();
  });
});
