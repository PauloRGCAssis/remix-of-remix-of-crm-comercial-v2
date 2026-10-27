import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import InteligenciaComercialPage from '@/pages/InteligenciaComercialPage';

// Sub-abas da Inteligência: cada aba exige a própria permissão
// (inteligencia.<aba>). Dados e conteúdo pesado são simulados (fictícios).
const mocks = vi.hoisted(() => ({
  permitidas: new Set<string>(),
  podeUsarIA: false,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (m: string, a = 'acessar') => mocks.permitidas.has(`${m}:${a}`),
    podeUsarIA: mocks.podeUsarIA,
  }),
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: JSX.Element }) => <main>{children}</main> }));
vi.mock('@/hooks/useSalesData', async (original) => ({
  ...(await original<typeof import('@/hooks/useSalesData')>()),
  useSalesData: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useInteligenciaData', () => ({
  useInteligenciaData: () => ({ alertas: [], hasComp: false, comparisonAudit: {} }),
}));
vi.mock('@/components/inteligencia/CurvaAbcTab', () => ({ CurvaAbcTab: () => <p>conteúdo curva abc</p> }));
vi.mock('@/components/inteligencia/MetaClienteTab', () => ({ MetaClienteTab: () => <p>conteúdo meta cliente</p> }));
vi.mock('@/components/inteligencia/CentralAnaliseTab', () => ({ CentralAnaliseTab: () => <p>conteúdo IA</p> }));
vi.mock('@/components/clientes/DuplicatesBanner', () => ({ DuplicatesBanner: () => null }));

const libera = (...abas: string[]) => abas.forEach((a) => mocks.permitidas.add(`inteligencia.${a}:acessar`));

function tela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InteligenciaComercialPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  mocks.permitidas = new Set(['inteligencia:acessar']);
  mocks.podeUsarIA = false;
});

describe('Inteligência — sub-abas', () => {
  it('mostra só as abas concedidas e abre a primeira permitida', () => {
    libera('curva_abc', 'meta_cliente');
    tela();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Curva ABC', 'Meta Cliente']);
    expect(screen.getByText('conteúdo curva abc')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Resumo' })).not.toBeInTheDocument();
  });
  it('aba salva sem permissão não é aberta', () => {
    localStorage.setItem('inteligencia:activeTab', JSON.stringify('resumo'));
    libera('meta_cliente');
    tela();
    expect(screen.getByText('conteúdo meta cliente')).toBeInTheDocument();
  });
  it('sem nenhuma sub-aba: mensagem de permissão, nenhum conteúdo', () => {
    tela();
    expect(screen.getByText(/não possui permissão para nenhuma aba/)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
  it('IA aparece só com podeUsarIA', () => {
    libera('curva_abc', 'central_analise');
    tela();
    expect(screen.queryByRole('tab', { name: /Central de Análise/ })).not.toBeInTheDocument();
    cleanup();
    mocks.podeUsarIA = true;
    tela();
    expect(screen.getByRole('tab', { name: /Central de Análise/ })).toBeInTheDocument();
  });
});
