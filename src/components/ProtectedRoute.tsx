import { ReactNode, useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions, logAccessEvent } from "@/hooks/usePermissions";
import { moduleKeyForRoute } from "@/lib/modulesCatalog";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function SemPermissao() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldAlert className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground max-w-sm">
        Você não possui permissão para acessar esta área.
      </p>
    </div>
  );
}

/**
 * Exige sessão ativa e valida a permissão do módulo correspondente à rota.
 * `gestorOnly` continua disponível para telas exclusivas de gestor.
 */
export function ProtectedRoute({
  children,
  gestorOnly = false,
  modulo,
}: {
  children: ReactNode;
  gestorOnly?: boolean;
  modulo?: string;
}) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const access = useUserRole();
  const perms = usePermissions();
  const logged = useRef<string | null>(null);

  const moduleKey = modulo ?? moduleKeyForRoute(location.pathname) ?? undefined;
  const permitido = !moduleKey || perms.loading || perms.can(moduleKey, "acessar");

  useEffect(() => {
    if (!session || perms.loading || !permitido) return;
    if (logged.current === location.pathname) return;
    logged.current = location.pathname;
    void logAccessEvent({
      userId: access.userId,
      nome: access.nome,
      evento: "pagina",
      modulo: moduleKey ?? location.pathname,
      detalhe: location.pathname,
    });
  }, [session, perms.loading, permitido, location.pathname, access.userId, access.nome, moduleKey]);

  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (access.loading || perms.loading) return <FullScreenLoader />;
  if (access.mustChangePassword) return <Navigate to="/nova-senha" replace />;
  if (!perms.ativo && !access.isGestor) return <SemPermissao />;
  if (gestorOnly && !access.isGestor) return <Navigate to="/dashboard" replace />;
  if (!permitido) return <SemPermissao />;

  return <>{children}</>;
}
