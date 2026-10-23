import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

/**
 * Primeiro acesso: o usuário cria a própria senha.
 * Exige e-mail previamente cadastrado pelo administrador e sem senha definida.
 */
export default function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');

  async function sendCode() {
    setBusy(true);
    try {
      await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
      toast.info('Se o cadastro permitir, você receberá um código por e-mail.');
    } catch {
      toast.error('Não foi possível solicitar o código. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");

    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();
    let response: Response;
    try {
      response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ativar-acesso`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: normalizedEmail, password, token }),
        },
      );
    } catch {
      setBusy(false);
      return toast.error("Não foi possível conectar ao serviço de ativação. Tente novamente.");
    }

    const result = await response.json().catch(() => null) as {
      ok?: boolean;
      code?: "EMAIL_NAO_AUTORIZADO" | "ACESSO_JA_ATIVO" | "SENHA_FRACA";
      error?: string;
    } | null;
    if (!response.ok || result?.ok !== true) {
      setBusy(false);
      const message = result?.error ?? (
        response.status === 403
            ? "Este e-mail não está autorizado a acessar o CRM."
          : response.status === 409
            ? "Este usuário já possui acesso. Utilize a tela de login."
            : "Não foi possível concluir seu primeiro acesso. Contate o administrador."
      );
      return toast.error(message, { duration: 9000 });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setBusy(false);
    if (signInError) {
      toast.success("Senha criada! Entre com seu e-mail e a nova senha.");
      return navigate("/auth", { replace: true });
    }
    toast.success("Senha criada com sucesso. Bem-vindo!");
    navigate("/", { replace: true });
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg gradient-brand flex items-center justify-center shadow-brand mb-2">
            <KeyRound className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle className="font-heading">Primeiro acesso</CardTitle>
          <CardDescription>
            Informe o e-mail cadastrado pelo administrador e crie sua senha pessoal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-2 mb-3'>
            <Button type='button' disabled={busy || !email.trim()} onClick={sendCode}>Enviar código por e-mail</Button>
            <Label htmlFor='pa-token'>Código recebido por e-mail</Label>
            <Input id='pa-token' autoComplete='one-time-code' inputMode='numeric' value={token} onChange={(event) => setToken(event.target.value)} />
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pa-email">E-mail</Label>
              <Input
                id="pa-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pa-senha">Criar senha</Label>
              <Input
                id="pa-senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pa-confirma">Confirmar senha</Label>
              <Input
                id="pa-confirma"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar senha e entrar
            </Button>
            <Link
              to="/auth"
              className="block text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Já tenho senha — voltar ao login
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
