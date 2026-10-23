import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
const mocks = vi.hoisted(() => ({
  callback: (_event: string, _session: unknown) => {},
  getSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: {
    onAuthStateChange: (callback: typeof mocks.callback) => { mocks.callback = callback; return { data: { sub: null, subscription: { unsubscribe: vi.fn() } } }; },
    getSession: mocks.getSession,
    signOut: mocks.signOut,
  } },
}));
function session(id: string, token: string) {
  return { user: { id }, access_token: token } as Session;
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
it('nova autenticação muda versão; renovação de token não invalida permissões', async () => {
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  act(() => mocks.callback('SIGNED_IN', session('A', 'one')));
  const first = view.result.current.authorizationVersion;
  act(() => mocks.callback('TOKEN_REFRESHED', session('A', 'two')));
  expect(view.result.current.authorizationVersion).toBe(first);
  act(() => mocks.callback('SIGNED_OUT', null));
  act(() => mocks.callback('SIGNED_IN', session('A', 'three')));
  expect(view.result.current.authorizationVersion).toBeGreaterThan(first);
});
it('resposta inicial atrasada não restaura sessão após logout', async () => {
  let resolveInitial!: (value: unknown) => void;
  mocks.getSession.mockReturnValue(new Promise((resolve) => { resolveInitial = resolve; }));
  const view = renderHook(() => useAuth(), { wrapper });
  act(() => mocks.callback('SIGNED_OUT', null));
  await act(async () => resolveInitial({ data: { session: session('old', 'old') }, error: null }));
  expect(view.result.current.session).toBeNull();
  expect(view.result.current.loading).toBe(false);
});
it('propaga falha de logout ao bloqueio do Google', async () => {
  mocks.signOut.mockResolvedValue({ error: new Error('network') });
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await expect(view.result.current.signOut()).rejects.toThrow('network');
});
