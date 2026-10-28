import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { logAccessEvent } from "@/hooks/usePermissions";

/**
 * Acesso por e-mail + senha (qualquer domínio de e-mail).
 * Contas são criadas pelo administrador em Administração → Usuários, com senha
 * temporária — não há dependência de envio de e-mail.
 */
export default function AuthPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (!authLoading && session) navigate(from, { replace: true });
  }, [authLoading, session, from, navigate]);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (!error && data.user) {
      void logAccessEvent({
        userId: data.user.id,
        nome: (data.user.user_metadata?.full_name as string) ?? data.user.email,
        evento: "login",
        detalhe: data.user.email ?? null,
      });
    }
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("invalid login credentials")) {
        toast.error(
          "E-mail ou senha inválidos. Se é seu primeiro acesso, use \"Primeiro acesso / Criar minha senha\".",
          { duration: 8000 },
        );
      } else {
        toast.error(error.message);
      }
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) toast.error(result.error.message ?? "Erro ao entrar com Google");
    } catch {
      toast.error("Não foi possível entrar com Google. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-t-4 border-t-brand-orange shadow-card">
        <CardHeader className="text-center">
          <img src="/logo-ti-delso.png" alt="Ti Delso" className="mx-auto h-28 w-auto max-w-full object-contain mb-2" />
          <CardTitle className="font-heading">Ti Delso</CardTitle>
          <CardDescription>Entre com seu e-mail e senha para acessar o sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(location.state as { authorizationMessage?: string } | null)?.authorizationMessage && (
            <p role="alert">{(location.state as { authorizationMessage: string }).authorizationMessage}</p>
          )}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Entrar
            </Button>
          </form>

          <div className="rounded-lg border border-brand-yellow bg-accent p-3 space-y-2">
            <p className="text-sm text-center text-foreground">
              Primeiro acesso? Crie sua senha para entrar no sistema.
            </p>
            <Button asChild type="button" className="w-full bg-brand-orange text-brand-black hover:bg-brand-orange/90">
              <Link to="/primeiro-acesso">PRIMEIRO ACESSO / CRIAR MINHA SENHA</Link>
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
            Entrar com Google
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Seu e-mail precisa estar previamente cadastrado pelo administrador em Administração →
            Usuários.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
