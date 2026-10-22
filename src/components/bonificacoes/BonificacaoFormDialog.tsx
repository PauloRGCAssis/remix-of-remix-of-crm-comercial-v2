import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { BonificacaoCadastro } from "@/lib/bonificacaoLogic";
import { useBonificacaoMutations } from "@/hooks/useBonificacoes";
import { ProdutoSelectSearch } from "@/components/produtos/ProdutoSelectSearch";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: BonificacaoCadastro | null;
  /** cliente pré-preenchido ao adicionar produto a um controle existente */
  clienteInicial?: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BonificacaoFormDialog({ open, onOpenChange, item, clienteInicial }: Props) {
  const { salvarCadastro } = useBonificacaoMutations();
  const [form, setForm] = useState(() => blank(item, clienteInicial));

  useEffect(() => {
    if (open) setForm(blank(item, clienteInicial));
  }, [item, open, clienteInicial]);

  function set<K extends keyof ReturnType<typeof blank>>(k: K, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const pct = Number(String(form.pct_negociacao).replace(",", ".")) || 0;
  const precoAtual = Number(String(form.preco_atual).replace(",", ".")) || 0;
  // Preço efetivo = preço de tabela diluído pela bonificação recebida.
  const precoEfetivo = pct > 0 ? precoAtual / (1 + pct / 100) : precoAtual;

  async function handleSave() {
    if (!form.cliente.trim() || !form.produto.trim()) {
      toast.error("Cliente e produto são obrigatórios.");
      return;
    }
    if (pct < 0 || pct > 100) {
      toast.error("Informe uma % de negociação entre 0 e 100.");
      return;
    }
    try {
      await salvarCadastro.mutateAsync({
        ...(item?.id ? { id: item.id } : {}),
        vendedor: form.vendedor || null,
        cliente: form.cliente.trim(),
        produto: form.produto.trim(),
        cnpj_cpf: form.cnpj_cpf || null,
        preco_anterior: form.preco_anterior === "" ? null : Number(String(form.preco_anterior).replace(",", ".")),
        preco_atual: precoAtual,
        // mantido por compatibilidade: kg bonificados a cada 10 kg comprados
        produtos_bonificados: pct / 10,
        pct_negociacao: pct > 0 ? pct : null,
        categoria: pct > 0 ? "Bonificação Preço" : "Sem Bonificação",
        observacoes: form.observacoes || null,
        origem: item?.origem ?? "Cadastro manual",
        ativo: true,
      } as any);
      toast.success("Bonificação salva.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Não foi possível salvar: ${e?.message ?? e}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar bonificação" : "Nova bonificação"}</DialogTitle>
          <DialogDescription>
            A % de negociação é calculada sobre o volume comprado: 10 kg comprados + 2 kg bonificados = 20%.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Produto</Label>
            <ProdutoSelectSearch value={form.produto} onChange={(v) => set("produto", v)} />
          </div>

          <div className="space-y-2">
            <Label>Vendedor</Label>
            <Input value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>CNPJ/CPF</Label>
            <Input value={form.cnpj_cpf} onChange={(e) => set("cnpj_cpf", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Preço anterior (R$)</Label>
            <Input value={form.preco_anterior} onChange={(e) => set("preco_anterior", e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-2">
            <Label>Preço atual / tabela (R$)</Label>
            <Input value={form.preco_atual} onChange={(e) => set("preco_atual", e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-2">
            <Label>% de negociação</Label>
            <Input value={form.pct_negociacao} onChange={(e) => set("pct_negociacao", e.target.value)} inputMode="decimal" />
            <p className="text-xs text-muted-foreground">Ex.: 10, 20 ou 30. Gera {pct}% do volume comprado em kg.</p>
          </div>
          <div className="space-y-2">
            <Label>Preço efetivo com bonificação</Label>
            <div className="h-10 flex items-center rounded-md border border-border px-3 font-semibold">
              {brl(precoEfetivo)}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={salvarCadastro.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blank(item: BonificacaoCadastro | null, clienteInicial?: string) {
  const pct =
    item?.pct_negociacao != null ? item.pct_negociacao : item ? (Number(item.produtos_bonificados) || 0) * 10 : 0;
  return {
    cliente: item?.cliente ?? clienteInicial ?? "",
    produto: item?.produto ?? "",
    vendedor: item?.vendedor ?? "",
    cnpj_cpf: item?.cnpj_cpf ?? "",
    preco_anterior: item?.preco_anterior == null ? "" : String(item.preco_anterior),
    preco_atual: item?.preco_atual == null ? "" : String(item.preco_atual),
    pct_negociacao: String(pct),
    observacoes: item?.observacoes ?? "",
  };
}
