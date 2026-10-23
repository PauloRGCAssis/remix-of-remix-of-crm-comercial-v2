import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

/** Primeiro acesso / senha temporária: obriga o usuário a criar uma senha pessoal. */
export default function NovaSenhaPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    if (user?.id) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_change_password: false, senha_definida: true } as never)
        .eq("id", user.id);
      if (profileError) {
        setBusy(false);
        return toast.error("Senha salva, mas não foi possível concluir o cadastro. Tente novamente.");
      }
    }
    await qc.invalidateQueries({ queryKey: ["user-access"] });
    await qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
    setBusy(false);
    toast.success("Senha atualizada! Use a nova senha nos próximos acessos.");
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg gradient-brand flex items-center justify-center shadow-brand mb-2">
            <KeyRound className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle className="font-heading">Crie sua senha</CardTitle>
          <CardDescription>
            Você entrou sem uma senha pessoal. Defina sua senha agora para usar nos próximos acessos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirma-senha">Confirmar senha</Label>
              <Input
                id="confirma-senha"
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
              Salvar nova senha
            </Button>
            <button
              type="button"
              onClick={() => signOut()}
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Sair
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
