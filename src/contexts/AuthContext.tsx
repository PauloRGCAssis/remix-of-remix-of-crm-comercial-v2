import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  authorizationVersion: number;
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Mantém a mesma instância do contexto quando o módulo é recarregado em
// desenvolvimento (atualização a quente); senão o Provider antigo e o hook
// novo apontam para contextos diferentes e a tela fica em branco.
const globalScope = globalThis as typeof globalThis & {
  __tiDelsoAuthContext?: ReturnType<typeof createContext<AuthContextValue | undefined>>;
};
const AuthContext =
  globalScope.__tiDelsoAuthContext ??
  (globalScope.__tiDelsoAuthContext = createContext<AuthContextValue | undefined>(undefined));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorizationVersion, setAuthorizationVersion] = useState(0);

  useEffect(() => {
    let current: Session | null = null;
    let receivedEvent = false;
    let disposed = false;
    const acceptSession = (next: Session | null, signedIn = false) => {
      if (disposed) return;
      if (current?.user.id !== next?.user.id || (signedIn && current?.access_token !== next?.access_token)) {
        setAuthorizationVersion((version) => version + 1);
      }
      current = next;
      setSession(next);
      setLoading(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      receivedEvent = true;
      acceptSession(next, event === 'SIGNED_IN');
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!receivedEvent) acceptSession(error ? null : data.session);
    }).catch(() => {
      if (!receivedEvent) acceptSession(null);
    });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, authorizationVersion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
