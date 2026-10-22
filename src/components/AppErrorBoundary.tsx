import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Evita tela branca quando uma tela quebra em tempo de execução
 * (ex.: erro de hooks após uma atualização do app carregada no navegador).
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro inesperado na aplicação:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="font-heading text-lg">Algo deu errado ao abrir esta tela</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Recarregue a página para continuar. Se o erro persistir, avise o administrador.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Recarregar página</Button>
      </div>
    );
  }
}
