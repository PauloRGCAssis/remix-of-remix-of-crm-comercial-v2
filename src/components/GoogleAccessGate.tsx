import { ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';

export function GoogleAccessGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p role='status'>Verificando sessão…</p>;
  const googleAccount = session?.user.app_metadata?.provider === 'google'
    || session?.user.app_metadata?.providers?.includes('google')
    || session?.user.identities?.some((identity) => identity.provider === 'google');
  if (!session || !googleAccount) return <>{children}</>;
  return <GoogleAuthorization>{children}</GoogleAuthorization>;
}

function GoogleAuthorization({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const access = useUserRole();
  const navigate = useNavigate();
  const attempted = useRef<string | null>(null);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const message = access.deniedReason === 'inactive'
    ? 'Sua conta está inativa. Contate o administrador.'
    : 'Sua conta não possui autorização para utilizar o CRM.';

  useEffect(() => {
    if (!access.deniedReason || !user || attempted.current === user.id) return;
    attempted.current = user.id;
    navigate('/auth', { replace: true, state: { authorizationMessage: message } });
    void signOut().catch(() => setLogoutFailed(true));
  }, [access.deniedReason, user, message, navigate, signOut]);

  async function retryLogout() {
    setLeaving(true);
    setLogoutFailed(false);
    try {
      await signOut();
    } catch {
      setLogoutFailed(true);
    } finally {
      setLeaving(false);
    }
  }

  if (access.loading) return <p role='status'>Verificando autorização…</p>;
  if (access.verified) return <>{children}</>;
  return (
    <div className='min-h-screen flex flex-col items-center justify-center gap-4 p-6'>
      <p role='alert'>{access.deniedReason ? message : 'Não foi possível verificar sua autorização. Tente novamente.'}</p>
      {logoutFailed && <p role='alert'>Não foi possível encerrar a sessão. O acesso continua bloqueado.</p>}
      {access.error && <Button onClick={access.retry}>Tentar novamente</Button>}
      <Button disabled={leaving} onClick={retryLogout}>Sair da conta</Button>
    </div>
  );
}
