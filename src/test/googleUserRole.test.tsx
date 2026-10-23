import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'A' }, loading: false, authorizationVersion: 1 },
  row: { ativo: true } as { ativo: boolean } | null,
  error: null as null | { message: string },
  from: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
beforeEach(() => {
  cleanup();
  Object.assign(mocks.auth, { user: { id: 'A' }, loading: false, authorizationVersion: 1 });
  mocks.row = { ativo: true };
  mocks.error = null;
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) => {
    const result = table === 'user_access' ? { data: mocks.row, error: mocks.error }
      : { data: table === 'user_roles' ? [{ role: 'admin' }] : { nome: 'Fictício', must_change_password: true }, error: null };
    const query = { select: () => query, eq: vi.fn(() => query), abortSignal: () => query, maybeSingle: () => Promise.resolve(result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return query;
  });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useUserRole(), { wrapper }), client };
}
it('usa ID autenticado e mantém administrador ativo e troca obrigatória', async () => {
  const view = setup();
  await waitFor(() => expect(view.result.current.verified).toBe(true));
  expect(mocks.from.mock.results[0].value.eq).toHaveBeenCalledWith('user_id', 'A');
  expect(view.result.current.isGestor).toBe(true);
  expect(view.result.current.mustChangePassword).toBe(true);
});
it.each([['missing', null], ['inactive', { ativo: false }]] as const)('distingue %s sem consultar privilégios', async (reason, row) => {
  mocks.row = row;
  const view = setup();
  await waitFor(() => expect(view.result.current.deniedReason).toBe(reason));
  expect(view.result.current.verified).toBe(false);
  expect(view.result.current.isGestor).toBe(false);
  expect(mocks.from).toHaveBeenCalledTimes(1);
});
it('erro de rede não vira conta ausente', async () => {
  mocks.error = { message: 'network' };
  const view = setup();
  await waitFor(() => expect(view.result.current.error).toBe(true));
  expect(view.result.current.deniedReason).toBeNull();
  expect(view.result.current.verified).toBe(false);
});
it('nova sessão da mesma conta não reutiliza autorização antiga', async () => {
  const view = setup();
  await waitFor(() => expect(view.result.current.verified).toBe(true));
  mocks.row = { ativo: false };
  mocks.auth.authorizationVersion = 2;
  view.rerender();
  expect(view.result.current.verified).toBe(false);
  await waitFor(() => expect(view.result.current.deniedReason).toBe('inactive'));
});
it('troca de conta não reutiliza autorização da conta anterior', async () => {
  const view = setup();
  await waitFor(() => expect(view.result.current.verified).toBe(true));
  mocks.auth.user = { id: 'B' };
  mocks.row = null;
  view.rerender();
  expect(view.result.current.verified).toBe(false);
  await waitFor(() => expect(view.result.current.deniedReason).toBe('missing'));
});
