import { useUserRole } from "@/hooks/useUserRole";
import { useVendorScope } from "@/hooks/useVendorScope";
import { User, Users } from "lucide-react";

/**
 * Bloco padrão exibido logo abaixo do título das telas operacionais.
 * Mostra o usuário logado e o vendedor (ou vendedores) em visualização,
 * deixando explícito o escopo aplicado às consultas da tela.
 */
export function EscopoUsuarioBar({ className = "" }: { className?: string }) {
  const { nome, vendedor } = useUserRole();
  const scope = useVendorScope();

  const visualizacao = scope.todos
    ? "Todos"
    : scope.vendedores.length
      ? scope.vendedores.join(", ")
      : "Nenhum vendedor vinculado";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm ${className}`}
    >
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Usuário logado:</span>
        <span className="font-medium">{nome ?? vendedor ?? "—"}</span>
      </div>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Vendedor em visualização:</span>
        <span className="rounded-md border bg-background px-2 py-0.5 font-medium">{visualizacao}</span>
      </div>
    </div>
  );
}
