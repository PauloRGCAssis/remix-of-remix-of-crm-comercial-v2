import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { GoogleAccessGate } from '@/components/GoogleAccessGate';

const mocks = vi.hoisted(() => ({
  auth: {
    session: null as null | { user: { id: string; app_metadata: { provider: string; providers?: string[] } } },
    user: null as null | { id: string },
    loading: false,
    signOut: vi.fn(),
  },
  access: { loading: false, verified: false, deniedReason: null as string | null, error: false, retry: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => mocks.access }));
function Location() {
  const location = useLocation();
  return <span data-testid='location'>{location.pathname}</span>;
}
function setup() {
  return render(<MemoryRouter initialEntries={['/dashboard']}><Location /><GoogleAccessGate><span>CRM protegido</span></GoogleAccessGate></MemoryRouter>);
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.auth.session = { user: { id: 'google-user', app_metadata: { provider: 'google' } } };
  mocks.auth.user = mocks.auth.session.user;
  mocks.auth.loading = false;
  mocks.auth.signOut.mockResolvedValue(undefined);
  Object.assign(mocks.access, { loading: false, verified: false, deniedReason: null, error: false });
});
describe('autorização após Google', () => {
  it('libera somente após confirmação ativa', () => {
    mocks.access.verified = true;
    setup();
    expect(screen.getByText('CRM protegido')).toBeInTheDocument();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it.each(['missing', 'inactive'])('nega %s e encerra sessão uma vez', async (reason) => {
    mocks.access.deniedReason = reason;
    setup();
    await waitFor(() => expect(mocks.auth.signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('CRM protegido')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/auth');
  });
  it('bloqueia durante carregamento sem desconectar', () => {
    mocks.access.loading = true;
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('autorização');
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it('distingue falha de consulta e permite tentar novamente', () => {
    mocks.access.error = true;
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível verificar');
    fireEvent.click(screen.getByText('Tentar novamente'));
    expect(mocks.access.retry).toHaveBeenCalledOnce();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('CRM protegido')).not.toBeInTheDocument();
  });
  it('falha de logout mantém bloqueio sem loop automático', async () => {
    mocks.access.deniedReason = 'missing';
    mocks.auth.signOut.mockRejectedValue(new Error('network'));
    setup();
    await screen.findByText('Não foi possível encerrar a sessão. O acesso continua bloqueado.');
    expect(mocks.auth.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('CRM protegido')).not.toBeInTheDocument();
  });
  it('valida também conta preexistente com identidade Google vinculada', () => {
    mocks.auth.session.user.app_metadata = { provider: 'email', providers: ['email', 'google'] };
    mocks.access.verified = true;
    setup();
    expect(screen.getByText('CRM protegido')).toBeInTheDocument();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it('preserva login exclusivo por e-mail', () => {
    mocks.auth.session.user.app_metadata = { provider: 'email' };
    setup();
    expect(screen.getByText('CRM protegido')).toBeInTheDocument();
  });
  it('preserva páginas públicas sem sessão', () => {
    mocks.auth.session = null;
    mocks.auth.user = null;
    setup();
    expect(screen.getByText('CRM protegido')).toBeInTheDocument();
  });
  it('retorno sem redirecionamento bloqueia até finalizar a consulta', () => {
    mocks.access.loading = true;
    const view = setup();
    mocks.access.loading = false;
    mocks.access.verified = true;
    view.rerender(<MemoryRouter><GoogleAccessGate><span>CRM protegido</span></GoogleAccessGate></MemoryRouter>);
    expect(screen.getByText('CRM protegido')).toBeInTheDocument();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
});
