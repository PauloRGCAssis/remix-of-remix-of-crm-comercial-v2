import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissoesMatrixTab } from '@/components/admin/PermissoesMatrixTab';

// "Aplicar padrão do perfil" só vale para perfis do sistema: o nome de um
// perfil personalizado não concede privilégios (dados fictícios).
const mocks = vi.hoisted(() => ({
  perfil: { id: 'perfil-ficticio', nome: 'Gestor', is_system: false, ativo: true, escopo_padrao: 'meus_dados', descricao: null },
  writes: [] as string[],
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => {
  function from(table: string) {
    const write = (op: string) => () => { mocks.writes.push(`${table}:${op}`); return query; };
    const data = table === 'permission_profiles' ? [mocks.perfil] : [];
    const query = {
      select: () => query, eq: () => query, order: () => query,
      insert: write('insert'), upsert: write('upsert'), update: write('update'), delete: write('delete'),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return query;
  }
  return { supabase: { from } };
});

function tela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PermissoesMatrixTab /></QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  mocks.writes = [];
});

describe('matriz — aplicar padrão do perfil', () => {
  it('perfil personalizado chamado "Gestor" não recebe o padrão do sistema', async () => {
    mocks.perfil = { ...mocks.perfil, nome: 'Gestor', is_system: false };
    tela();
    await screen.findAllByText('Gestor');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar padrão do perfil' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.writes).toEqual([]);
  });
  it('perfil do sistema "Gestor" recebe o padrão', async () => {
    mocks.perfil = { ...mocks.perfil, nome: 'Gestor', is_system: true };
    tela();
    await screen.findAllByText('Gestor');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar padrão do perfil' }));
    await waitFor(() => expect(mocks.writes).toContain('profile_permissions:upsert'));
  });
});
