import { AlertTriangle, CheckCircle2, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrmSincronizacao } from "@/contexts/CrmContext";

/**
 * Situação da gravação da Prospecção/Agenda na nuvem. "Salvo na nuvem" só
 * aparece depois da confirmação do banco; salvar no navegador não conta.
 */
export function SincronizacaoIndicador() {
  const sync = useCrmSincronizacao();
  if (!sync) return null;
  const { estado, tentarNovamente } = sync;
  const pendentes = estado.pendentes > 0 ? ` (${estado.pendentes})` : "";

  const conteudo = {
    carregando: { icone: <Loader2 className="h-3.5 w-3.5 animate-spin" />, texto: "Carregando CRM…", cor: "text-muted-foreground" },
    salvando: { icone: <Loader2 className="h-3.5 w-3.5 animate-spin" />, texto: `Salvando${pendentes}…`, cor: "text-muted-foreground" },
    sincronizado: { icone: <CheckCircle2 className="h-3.5 w-3.5" />, texto: "Salvo na nuvem", cor: "text-success" },
    pendente: { icone: <CloudOff className="h-3.5 w-3.5" />, texto: `Não salvo — aguardando conexão${pendentes}`, cor: "text-warning" },
    erro: { icone: <AlertTriangle className="h-3.5 w-3.5" />, texto: `Alterações não salvas na nuvem${pendentes}`, cor: "text-destructive" },
    indisponivel: { icone: <AlertTriangle className="h-3.5 w-3.5" />, texto: "CRM não carregado — nada será salvo", cor: "text-destructive" },
  }[estado.fase];

  const podeTentar = estado.fase === "pendente" || estado.fase === "erro" || estado.fase === "indisponivel";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`ml-auto flex items-center gap-1.5 text-xs ${conteudo.cor}`}
      title={estado.ultimaFalha?.mensagem}
    >
      {conteudo.icone}
      <span>{conteudo.texto}</span>
      {podeTentar && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={tentarNovamente}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
