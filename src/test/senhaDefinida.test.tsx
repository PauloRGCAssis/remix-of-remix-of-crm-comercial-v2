import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'A', app_metadata: { provider: 'email' } } as Record<string, unknown>, loading: false, authorizationVersion: 1 },
  profile: {} as Record<string, unknown>,
  from: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
beforeEach(() => {
  cleanup();
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) => {
    const result = table === 'user_access' ? { data: { ativo: true }, error: null }
      : { data: table === 'user_roles' ? [] : mocks.profile, error: null };
    const query = { select: () => query, eq: () => query, abortSignal: () => query, maybeSingle: () => Promise.resolve(result), then: (r: (v: typeof result) => unknown) => Promise.resolve(result).then(r) };
    return query;
  });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useUserRole(), { wrapper });
}
it('login por e-mail sem senha criada é obrigado a criar senha', async () => {
  mocks.auth.user = { id: 'A', app_metadata: { provider: 'email' } };
  mocks.profile = { nome: 'X', must_change_password: false, senha_definida: false };
  const view = setup();
  await waitFor(() => expect(view.result.current.verified).toBe(true));
  expect(view.result.current.mustChangePassword).toBe(true);
});
it('login por e-mail com senha já criada entra direto', async () => {
  mocks.auth.user = { id: 'A', app_metadata: { provider: 'email' } };
  mocks.profile = { nome: 'X', must_change_password: false, senha_definida: true };
  const view = setup();
  await waitFor(() => expect(view.result.current.verified).toBe(true));
  expect(view.result.current.mustChangePassword).toBe(false);
});
it('login Google sem senha não é obrigado a criar senha', async () => {
  mocks.auth.user = { id: 'A', app_metadata: { provider: 'google' } };
  mocks.profile = { nome: 'X', must_change_password: false, senha_definida: false };
  const view = setup();
  await waitFor(() => expect(view.result.current.verified).toBe(true));
  expect(view.result.current.mustChangePassword).toBe(false);
});
