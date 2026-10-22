import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Copy } from "lucide-react";
import { toast } from "sonner";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { matchesClientQuery } from "@/lib/clientSearch";
import { useDegustacoes } from "@/hooks/useDegustacoes";
import { useCustoProdutos } from "@/hooks/useCustoProdutos";
import { calcularCustoDegustacoes } from "@/lib/produtoCusto";
import { getClientDisplayName } from "@/lib/clientDisplayName";
import { degustacoesDoClienteNoPeriodo, encontrarAcaoSemelhante, normTexto } from "@/lib/acaoCopia";
import {
  useCommercialActions,
  type CommercialAction,
  type CommercialActionInput,
} from "@/hooks/useCommercialActions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: CommercialAction | null;
}

export function CopiarAcaoVariosDialog({ open, onOpenChange, action }: Props) {
  const { list, create } = useCommercialActions();
  const { data: profiles = [] } = useClientProfiles();
  const { list: degustacoesList } = useDegustacoes();
  const { index: custoIndex } = useCustoProdutos();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmarConflito, setConfirmarConflito] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected([]);
      setConfirmarConflito(false);
    }
  }, [open]);

  const options = useMemo(() => {
    const all = profiles.map((p) => ({
      id: p.id,
      nome: getClientDisplayName(p),
      razao: p.nome ?? "",
      cnpj: p.cnpj,
    }));
    const s = search.trim();
    const base = s ? all.filter((o) => matchesClientQuery(s, [o.nome, o.razao], o.cnpj)) : all;
    return base
      .filter((o) => !action || normTexto(o.nome) !== normTexto(action.cliente))
      .slice(0, 80);
  }, [profiles, search, action]);


  const conflitos = useMemo(() => {
    if (!action) return [] as string[];
    return selected
      .map((id) => profiles.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => getClientDisplayName(p as any))
      .filter((nome) =>
        encontrarAcaoSemelhante(list.data ?? [], {
          cliente: nome,
          tipo: action.tipo,
          nome: action.nome,
          data_inicio: action.data_inicio,
          data_fim: action.data_fim,
        }),
      );
  }, [selected, profiles, list.data, action]);

  const criar = async () => {
    if (!action) return;
    if (selected.length === 0) return toast.error("Selecione pelo menos um cliente");
    if (conflitos.length > 0 && !confirmarConflito) {
      setConfirmarConflito(true);
      return;
    }

    setSalvando(true);
    try {
      for (const id of selected) {
        const profile = profiles.find((p) => p.id === id);
        if (!profile) continue;
        const nomeCliente = getClientDisplayName(profile);

        // Degustações do NOVO cliente dentro do período — nunca as do cliente original.
        const degs = action.possui_degustacoes
          ? degustacoesDoClienteNoPeriodo(
              degustacoesList.data ?? [],
              nomeCliente,
              action.data_inicio,
              action.data_fim,
            )
          : [];
        const custo = calcularCustoDegustacoes(
          degs.map((d) => ({ id: d.id, data: d.data, produtos: d.produtos ?? [] })),
          custoIndex,
        );

        const payload: CommercialActionInput = {
          client_profile_id: profile.id,
          cliente: nomeCliente,
          nome: action.nome,
          tipo: action.tipo,
          data_inicio: action.data_inicio,
          data_fim: action.data_fim,
          status: "Planejada",
          forma_investimento: action.forma_investimento,
          valor_investimento: action.valor_investimento ?? 0,
          quantidade_bonificada: action.quantidade_bonificada,
          bonificacao_unidade: action.bonificacao_unidade,
          bonificacao_produtos: action.bonificacao_produtos ?? [],
          responsavel: action.responsavel,
          objetivo: action.objetivo,
          regras: action.regras,
          observacoes: action.observacoes,
          possui_degustacoes: action.possui_degustacoes,
          degustacao_ids: degs.map((d) => d.id),
          custo_kg_degustacao: custo.custoMedioKg ?? 0,
          valor_promotora: action.valor_promotora ?? 0,
          outros_custos: action.outros_custos ?? 0,
        };

        await create.mutateAsync({
          ...payload,
          copiadaDe: { id: action.id, nome: action.nome, cliente: action.cliente },
        });
      }
      toast.success(`${selected.length} nova(s) ação(ões) criada(s)`);
      onOpenChange(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Copiar para vários clientes</DialogTitle>
        </DialogHeader>

        {action && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex items-start gap-2">
            <Copy className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Você está criando cópias de: {action.nome}</p>
              <p className="text-xs text-muted-foreground">
                Original: {action.cliente} · {action.data_inicio.split("-").reverse().join("/")} a{" "}
                {action.data_fim.split("-").reverse().join("/")}. Degustações e custos são revinculados por
                cliente e recalculados automaticamente.
              </p>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clientes/lojas"
            className="pl-7"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {options.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
          {options.map((o) => {
            const marcado = selected.includes(o.id);
            return (
              <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
                <Checkbox
                  checked={marcado}
                  onCheckedChange={(v) => {
                    setConfirmarConflito(false);
                    setSelected((prev) => (v === true ? [...prev, o.id] : prev.filter((id) => id !== o.id)));
                  }}
                />
                <span className="truncate">{o.nome}</span>
              </label>
            );
          })}
        </div>

        <p className="text-sm">
          {selected.length === 0
            ? "Nenhum cliente selecionado."
            : `Serão criadas ${selected.length} ${selected.length === 1 ? "nova ação" : "novas ações"}.`}
        </p>

        {conflitos.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <p className="font-medium">Já existe uma ação semelhante para este cliente neste período.</p>
            <ul className="mt-1 list-disc pl-4">
              {conflitos.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {confirmarConflito && <p className="mt-1 font-medium">Clique novamente para criar mesmo assim.</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando || selected.length === 0}>
            {conflitos.length > 0 && confirmarConflito ? "Criar mesmo assim" : "Criar cópias"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
