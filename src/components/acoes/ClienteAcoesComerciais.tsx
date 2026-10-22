import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { diasRestantes, useCommercialActions, type AcaoStatus, type CommercialAction } from "@/hooks/useCommercialActions";
import { AcaoResultadoPanel } from "@/components/acoes/AcaoResultadoPanel";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");

export const STATUS_CLASS: Record<AcaoStatus, string> = {
  Planejada: "bg-blue-100 text-blue-800 border-blue-300",
  "Em andamento": "bg-green-100 text-green-800 border-green-300",
  Encerrada: "bg-muted text-muted-foreground border-border",
  Cancelada: "bg-red-100 text-red-800 border-red-300",
};

interface Props {
  clientProfileId?: string | null;
  clienteNome: string;
}

function AcaoItem({ a }: { a: CommercialAction }) {
  const [open, setOpen] = useState(false);
  const dias = diasRestantes(a.data_fim);

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{a.nome}</p>
          <p className="text-xs text-muted-foreground">{a.tipo}</p>
        </div>
        <Badge variant="outline" className={STATUS_CLASS[a.status]}>{a.status}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>📅 {br(a.data_inicio)} – {br(a.data_fim)}</span>
        <span>💰 {money(a.valor_investimento ?? 0)}</span>
        <span>👤 {a.responsavel ?? "—"}</span>
        <span>{a.status === "Em andamento" && dias >= 0 ? `⏳ ${dias} dia(s) restantes` : ""}</span>
      </div>
      {a.quantidade_bonificada != null && (
        <p className="mt-1 text-xs text-muted-foreground">
          🎁 Bonificação:{" "}
          {a.bonificacao_unidade === "kg"
            ? `${a.quantidade_bonificada.toLocaleString("pt-BR")} kg`
            : a.bonificacao_unidade === "%"
              ? `${a.quantidade_bonificada.toLocaleString("pt-BR")}% do volume vendido`
              : money(a.quantidade_bonificada)}
        </p>
      )}
      {a.regras && <p className="mt-2 text-xs whitespace-pre-line">{a.regras}</p>}

      <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
        {open ? "Ocultar resultado" : "Ver resultado, ROI e conclusão"}
      </Button>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <AcaoResultadoPanel action={a} compact />
        </div>
      )}
    </div>
  );
}

export function ClienteAcoesComerciais({ clientProfileId, clienteNome }: Props) {
  const { list } = useCommercialActions();

  const acoes = useMemo(() => {
    const all = list.data ?? [];
    return all.filter((a) =>
      clientProfileId ? a.client_profile_id === clientProfileId : a.cliente === clienteNome,
    );
  }, [list.data, clientProfileId, clienteNome]);

  const investido = acoes.reduce((s, a) => s + (a.valor_investimento ?? 0), 0);

  if (list.isLoading) return <p className="text-sm text-muted-foreground">Carregando ações…</p>;

  if (acoes.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhuma ação comercial registrada para este cliente.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {acoes.length} ação(ões) · investimento total {money(investido)}
      </p>
      {acoes.map((a) => (
        <AcaoItem key={a.id} a={a} />
      ))}
    </div>
  );
}
