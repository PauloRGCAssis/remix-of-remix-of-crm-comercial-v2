import { promotorasDaDegustacao, promotorasDetalhe } from "@/lib/degustacaoPromotoras";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useDegustacoes } from "@/hooks/useDegustacoes";
import { useCustoProdutos } from "@/hooks/useCustoProdutos";
import { calcularCustoDegustacoes } from "@/lib/produtoCusto";
import { degustacoesDoClienteNoPeriodo, encontrarAcaoSemelhante } from "@/lib/acaoCopia";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Copy, Search } from "lucide-react";
import { CreatableSelect } from "@/components/cadastro/CreatableSelect";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useClientDirectory } from "@/hooks/useClientDirectory";
import { matchesClientQuery, clientMatchScore } from "@/lib/clientSearch";
import { useSalesData } from "@/hooks/useSalesData";
import { metricsForPeriod, salesForCliente } from "@/lib/acaoResultado";
import { CATALOGO_PRODUTOS, produtoSearchText } from "@/types/crm";
import { ProdutoCheckList } from "@/components/produtos/ProdutoCheckList";
import { useActiveVendorNames } from "@/hooks/useVendors";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { getClientDisplayName } from "@/lib/clientDisplayName";
import {
  ACAO_STATUS,
  FORMAS_INVESTIMENTO,
  useCommercialActionTypes,
  useCommercialActions,
  type AcaoStatus,
  type BonificacaoUnidade,
  type CommercialAction,
  type CommercialActionInput,
  type FormaInvestimento,
} from "@/hooks/useCommercialActions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const norm = (v: string) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Ação em edição, ou base para duplicação */
  action?: CommercialAction | null;
  mode: "create" | "edit" | "duplicate";
  /** Cliente pré-selecionado (integração com a ficha do cliente) */
  defaultClient?: { id: string; nome: string } | null;
}

interface FormState {
  client_profile_id: string | null;
  cliente: string;
  nome: string;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  status: AcaoStatus;
  forma_investimento: FormaInvestimento;
  valor_investimento: string;
  quantidade_bonificada: string;
  bonificacao_unidade: BonificacaoUnidade;
  bonificacao_produtos: string[];
  responsavel: string;
  objetivo: string;
  regras: string;
  observacoes: string;
  possui_degustacoes: boolean;
  degustacao_ids: string[];
  custo_kg_degustacao: string;
  valor_promotora: string;
  outros_custos: string;
}

const EMPTY: FormState = {
  client_profile_id: null,
  cliente: "",
  nome: "",
  tipo: "",
  data_inicio: "",
  data_fim: "",
  status: "Planejada",
  forma_investimento: "Dinheiro",
  valor_investimento: "",
  quantidade_bonificada: "",
  bonificacao_unidade: "R$",
  bonificacao_produtos: [],
  responsavel: "",
  objetivo: "",
  regras: "",
  observacoes: "",
  possui_degustacoes: false,
  degustacao_ids: [],
  custo_kg_degustacao: "",
  valor_promotora: "100",
  outros_custos: "",
};


function ClienteSearch({
  value,
  onSelect,
  autoFocus,
}: {
  value: string;
  onSelect: (c: { id: string | null; nome: string }) => void;
  autoFocus?: boolean;
}) {
  const { data: profiles = [] } = useClientProfiles();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { entries: directory } = useClientDirectory(search);


  const options = useMemo(() => {
    const all: { id: string | null; nome: string; razao: string; aliases: string[]; cnpj?: string }[] =
      profiles.map((p) => ({
        id: p.id,
        nome: getClientDisplayName(p),
        razao: p.nome ?? "",
        aliases: [],
        cnpj: p.cnpj,
      }));
    const seen = new Set<string>();
    for (const o of all) {
      seen.add(norm(o.nome));
      if (o.razao) seen.add(norm(o.razao));
    }
    for (const e of directory) {
      if (seen.has(norm(e.nome))) continue;
      seen.add(norm(e.nome));
      all.push({ id: null, nome: e.nome, razao: e.nomeFantasia ?? "", aliases: e.aliases, cnpj: e.cnpj });
    }
    const s = search.trim();
    const filtered = s
      ? all
          .filter((o) => matchesClientQuery(s, [o.nome, o.razao, ...o.aliases], o.cnpj))
          .sort((a, b) => clientMatchScore(s, b.nome) - clientMatchScore(s, a.nome))
      : all;
    return filtered.slice(0, 60);
  }, [profiles, directory, search]);



  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          autoFocus={autoFocus}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Buscar cliente pelo nome fantasia..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digite o nome fantasia"
              className="pl-7 h-8"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {options.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
          {options.map((o) => (
            <button
              key={`${o.id ?? "dir"}-${o.nome}`}
              type="button"
              onClick={() => {
                onSelect({ id: o.id, nome: o.nome });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
            >
              <Check className={cn("h-3.5 w-3.5", value === o.nome ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.nome}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}


const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const kgFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;



export function AcaoComercialDialog({ open, onOpenChange, action, mode, defaultClient }: Props) {
  const { list: acoesList, create, update } = useCommercialActions();
  const types = useCommercialActionTypes();
  const crud = useModuleCrud("acoes_comerciais", "tipos de ação comercial");
  const vendedores = useActiveVendorNames();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmDup, setConfirmDup] = useState(false);
  const { list: degustacoesList } = useDegustacoes();

  const isCopia = mode === "duplicate";

  // Degustações do mesmo cliente dentro do período da ação (com as já vinculadas).
  const degustacoesDoCliente = useMemo(() => {
    const todas = degustacoesList.data ?? [];
    const alvo = norm(form.cliente);
    return todas.filter((d) => {
      const nome = norm(d.cliente);
      const mesmoCliente = !!alvo && (nome.includes(alvo) || alvo.includes(nome));
      if (form.degustacao_ids.includes(d.id) && mesmoCliente) return true;
      if (!mesmoCliente) return false;
      if (form.data_inicio && d.data < form.data_inicio) return false;
      if (form.data_fim && d.data > form.data_fim) return false;
      return true;
    });
  }, [degustacoesList.data, form.cliente, form.data_inicio, form.data_fim, form.degustacao_ids]);

  /** Troca de cliente: nunca manter degustação do cliente anterior — revincula as do novo. */
  const trocarCliente = (c: { id: string | null; nome: string }) =>
    setForm((p) => {
      const novas = degustacoesDoClienteNoPeriodo(
        degustacoesList.data ?? [],
        c.nome,
        p.data_inicio,
        p.data_fim,
      ).map((d) => d.id);
      const manter = mode === "edit" && norm(p.cliente) === norm(c.nome);
      return {
        ...p,
        client_profile_id: c.id,
        cliente: c.nome,
        degustacao_ids: manter ? p.degustacao_ids : novas,
      };
    });

  // Custo dos produtos degustados: Σ (quantidade × custo cadastrado do produto na data)
  const { index: custoIndex } = useCustoProdutos();
  const custoDegustacoes = useMemo(() => {
    const vinculadas = form.possui_degustacoes
      ? degustacoesDoCliente
          .filter((d) => form.degustacao_ids.includes(d.id))
          .map((d) => ({ id: d.id, data: d.data, produtos: d.produtos ?? [] }))
      : [];
    return calcularCustoDegustacoes(vinculadas, custoIndex);
  }, [custoIndex, degustacoesDoCliente, form.degustacao_ids, form.possui_degustacoes]);

  /**
   * Estimativa da bonificação percentual:
   * kg bonificados = kg vendidos no período × % / 100 (não é desconto financeiro).
   */
  const { data: salesData = [] } = useSalesData();
  const { data: perfis = [] } = useClientProfiles();
  const estimativaPercentual = useMemo(() => {
    if (form.bonificacao_unidade !== "%") return null;
    const pct = Number(String(form.quantidade_bonificada).replace(",", ".")) || 0;
    if (!form.cliente || !form.data_inicio || !form.data_fim) return { pct, kgVendidos: 0, kgBonif: 0, custo: null as number | null };
    const perfil = perfis.find((p) => p.id === form.client_profile_id);
    const { rows } = salesForCliente(
      salesData,
      form.cliente,
      [perfil?.nome ?? "", perfil?.nome_fantasia ?? ""].filter(Boolean),
      perfil?.cnpj ?? null,
    );
    const m = metricsForPeriod(rows, form.data_inicio, form.data_fim);
    const kgBonif = (m.kg * pct) / 100;

    let custoKg: number | null = null;
    if (form.bonificacao_produtos.length > 0) {
      let soma = 0;
      let n = 0;
      for (const nome of form.bonificacao_produtos) {
        const { custoKg: c } = custoIndex.buscar(nome, form.data_fim);
        if (c != null) {
          soma += c;
          n += 1;
        }
      }
      custoKg = n > 0 ? soma / n : null;
    } else {
      let kgComCusto = 0;
      let total = 0;
      for (const r of rows) {
        const d = String(r.data).slice(0, 10);
        if (d < form.data_inicio || d > form.data_fim) continue;
        const q = Number(r.quantidade) || 0;
        const { custoKg: c } = custoIndex.buscar(r.descricao, d);
        if (q <= 0 || c == null) continue;
        kgComCusto += q;
        total += q * c;
      }
      custoKg = kgComCusto > 0 ? total / kgComCusto : null;
    }
    return { pct, kgVendidos: m.kg, kgBonif, custo: custoKg == null ? null : kgBonif * custoKg };
  }, [
    form.bonificacao_unidade,
    form.quantidade_bonificada,
    form.cliente,
    form.client_profile_id,
    form.data_inicio,
    form.data_fim,
    form.bonificacao_produtos,
    salesData,
    perfis,
    custoIndex,
  ]);


  useEffect(() => {
    if (!open) return;
    if (action) {
      setForm({
        client_profile_id: action.client_profile_id,
        cliente: action.cliente,
        nome: action.nome,
        tipo: action.tipo,
        data_inicio: action.data_inicio,
        data_fim: action.data_fim,
        status: mode === "duplicate" ? "Planejada" : action.status,
        forma_investimento: action.forma_investimento,
        valor_investimento: action.valor_investimento ? String(action.valor_investimento) : "",
        quantidade_bonificada:
          action.quantidade_bonificada != null ? String(action.quantidade_bonificada) : "",
        bonificacao_unidade: action.bonificacao_unidade ?? "R$",
        bonificacao_produtos: action.bonificacao_produtos ?? [],
        responsavel: action.responsavel ?? "",
        objetivo: action.objetivo ?? "",
        regras: action.regras ?? "",
        observacoes: action.observacoes ?? "",
        possui_degustacoes: action.possui_degustacoes ?? false,
        degustacao_ids: action.degustacao_ids ?? [],
        custo_kg_degustacao: action.custo_kg_degustacao ? String(action.custo_kg_degustacao) : "",
        valor_promotora: String(action.valor_promotora ?? 100),
        outros_custos: action.outros_custos ? String(action.outros_custos) : "",

      });
    } else {
      setForm({
        ...EMPTY,
        client_profile_id: defaultClient?.id ?? null,
        cliente: defaultClient?.nome ?? "",
      });
    }
  }, [open, action, mode, defaultClient]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const buildPayload = (): CommercialActionInput => ({
    client_profile_id: form.client_profile_id,
    cliente: form.cliente.trim(),
    nome: form.nome.trim(),
    tipo: form.tipo,
    data_inicio: form.data_inicio,
    data_fim: form.data_fim,
    status: form.status,
    forma_investimento: form.forma_investimento,
    valor_investimento: Number(String(form.valor_investimento).replace(",", ".")) || 0,
    quantidade_bonificada: form.quantidade_bonificada
      ? Number(String(form.quantidade_bonificada).replace(",", "."))
      : null,
    bonificacao_unidade: form.bonificacao_unidade,
    bonificacao_produtos: form.bonificacao_unidade === "R$" ? [] : form.bonificacao_produtos,
    responsavel: form.responsavel || null,
    objetivo: form.objetivo || null,
    regras: form.regras || null,
    observacoes: form.observacoes || null,
    possui_degustacoes: form.possui_degustacoes,
    degustacao_ids: form.possui_degustacoes ? form.degustacao_ids : [],
    custo_kg_degustacao: custoDegustacoes.custoMedioKg ?? 0,
    valor_promotora: Number(String(form.valor_promotora).replace(",", ".")) || 0,
    outros_custos: Number(String(form.outros_custos).replace(",", ".")) || 0,
  });

  const persist = async () => {
    const payload = buildPayload();
    if (mode === "edit" && action) {
      await update.mutateAsync({ id: action.id, patch: payload, before: action });
    } else {
      await create.mutateAsync({
        ...payload,
        copiadaDe: isCopia && action ? { id: action.id, nome: action.nome, cliente: action.cliente } : null,
      });
    }
    setConfirmDup(false);
    onOpenChange(false);
  };

  const submit = async () => {
    if (!form.cliente.trim()) return toast.error("Selecione o cliente");
    if (!form.nome.trim()) return toast.error("Informe o nome da ação");
    if (!form.tipo.trim()) return toast.error("Selecione o tipo da ação");
    if (!form.data_inicio || !form.data_fim) return toast.error("Informe as datas inicial e final");
    if (form.data_fim < form.data_inicio)
      return toast.error("A data final não pode ser anterior à inicial");

    const semelhante = encontrarAcaoSemelhante(
      acoesList.data ?? [],
      {
        cliente: form.cliente.trim(),
        tipo: form.tipo,
        nome: form.nome.trim(),
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
      },
      mode === "edit" ? action?.id : undefined,
    );
    if (semelhante) {
      setConfirmDup(true);
      return;
    }

    await persist();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {mode === "edit" ? "Editar ação comercial" : isCopia ? "Copiar ação comercial" : "Nova ação comercial"}
          </DialogTitle>
        </DialogHeader>

        {isCopia && action && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex items-start gap-2">
            <Copy className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Você está criando uma cópia de: {action.nome}
              </p>
              <p className="text-xs text-muted-foreground">
                Original: {action.cliente} · a ação original permanece intacta. Troque o cliente abaixo —
                as degustações e os custos são revinculados e recalculados automaticamente.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Cliente *</Label>
            <ClienteSearch value={form.cliente} onSelect={trocarCliente} autoFocus={isCopia} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Nome da ação *</Label>
              <Input
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="Ex.: Compre 2 e Leve 3"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo da ação *</Label>
              <CreatableSelect
                value={form.tipo}
                onChange={(v) => set("tipo", v)}
                options={(types.list.data ?? []).map((t) => ({
                  value: t.nome,
                  label: t.nome,
                  removable: crud.podeExcluir,
                  onRemove: () => types.remove.mutateAsync(t.id),
                }))}
                placeholder="Selecione o tipo"
                createLabel="Cadastrar novo tipo"
                podeCriar={crud.podeCriar}
                onCreate={async (nome) => {
                  const created = await types.create.mutateAsync(nome);
                  return created.nome;
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Data inicial *</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => set("data_inicio", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Data final *</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => set("data_fim", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as AcaoStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACAO_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Forma do investimento</Label>
              <Select
                value={form.forma_investimento}
                onValueChange={(v) => set("forma_investimento", v as FormaInvestimento)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_INVESTIMENTO.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Valor do investimento (R$)</Label>
              <Input
                inputMode="decimal"
                value={form.valor_investimento}
                onChange={(e) => set("valor_investimento", e.target.value)}
                placeholder="Ex.: 1200,00"
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Valor da bonificação</Label>
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  className="flex-1"
                  value={form.quantidade_bonificada}
                  onChange={(e) => set("quantidade_bonificada", e.target.value)}
                  placeholder={
                    form.bonificacao_unidade === "kg"
                      ? "Ex.: 25"
                      : form.bonificacao_unidade === "%"
                        ? "Ex.: 20"
                        : "Ex.: 500,00"
                  }
                />
                <Select
                  value={form.bonificacao_unidade}
                  onValueChange={(v) => set("bonificacao_unidade", v as BonificacaoUnidade)}
                >
                  <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R$">Em Reais (R$)</SelectItem>
                    <SelectItem value="kg">Em Quilos (kg)</SelectItem>
                    <SelectItem value="%">Em Porcentagem (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {form.quantidade_bonificada
                  ? form.bonificacao_unidade === "kg"
                    ? `${form.quantidade_bonificada} kg`
                    : form.bonificacao_unidade === "%"
                      ? `${form.quantidade_bonificada}% sobre o volume vendido`
                      : `R$ ${form.quantidade_bonificada}`
                  : "Informe apenas o valor negociado — o cliente escolhe os produtos depois."}
              </p>

              {form.bonificacao_unidade === "%" && (
                <div className="rounded-md border border-border p-3 space-y-2 text-xs">
                  <p className="text-[11px] text-muted-foreground">
                    Bonificação em produto: {form.quantidade_bonificada || 0}% do volume vendido é entregue
                    em kg bonificados (não é desconto financeiro).
                  </p>
                  {estimativaPercentual && (
                    <div className="grid gap-0.5 sm:grid-cols-3">
                      <p>
                        Volume vendido até o momento:{" "}
                        <span className="font-medium">{kgFmt(estimativaPercentual.kgVendidos)}</span>
                      </p>
                      <p>
                        Bonificação prevista:{" "}
                        <span className="font-medium">{kgFmt(estimativaPercentual.kgBonif)}</span>
                      </p>
                      <p>
                        Custo estimado:{" "}
                        <span className="font-medium">
                          {estimativaPercentual.custo == null ? "—" : money(estimativaPercentual.custo)}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {form.bonificacao_unidade !== "R$" && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-xs font-medium">Produto utilizado na bonificação (opcional)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Sem seleção, o custo usa o mix de produtos efetivamente vendidos no período.
                  </p>
                  <ProdutoCheckList
                    items={CATALOGO_PRODUTOS.filter((p) => p.ativo).map((p) => {
                      const c = custoIndex.buscar(p.nome, form.data_fim).custoKg;
                      return {
                        value: p.nome,
                        label: p.nome,
                        searchText: produtoSearchText(p),
                        right: (
                          <span className="text-muted-foreground">
                            {c == null ? "sem custo" : `${money(c)}/kg`}
                          </span>
                        ),
                      };
                    })}
                    selected={form.bonificacao_produtos}
                    onToggle={(nome, checked) =>
                      set(
                        "bonificacao_produtos",
                        checked
                          ? [...form.bonificacao_produtos, nome]
                          : form.bonificacao_produtos.filter((n) => n !== nome),
                      )
                    }
                    maxHeightClass="max-h-40"
                  />


                </div>
              )}
            </div>
          </div>


          <div className="rounded-md border border-border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox
                checked={form.possui_degustacoes}
                onCheckedChange={(v) => set("possui_degustacoes", v === true)}
              />
              Esta ação possui degustações vinculadas
            </label>

            {form.possui_degustacoes && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Degustações do cliente dentro do período da ação
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {degustacoesDoCliente.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        Nenhuma degustação encontrada para este cliente no período informado.
                      </p>
                    )}
                    {degustacoesDoCliente.map((d) => {
                      const marcada = form.degustacao_ids.includes(d.id);
                      const detalhe = custoDegustacoes.porDegustacao.get(d.id);
                      const kg =
                        detalhe?.kg ?? (d.produtos ?? []).reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
                      return (
                        <label key={d.id} className="flex items-start gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-accent/50">
                          <Checkbox
                            checked={marcada}
                            onCheckedChange={(v) =>
                              set(
                                "degustacao_ids",
                                v === true
                                  ? [...form.degustacao_ids, d.id]
                                  : form.degustacao_ids.filter((id) => id !== d.id),
                              )
                            }
                          />
                          <span className="flex-1">
                            <span className="font-medium">{d.data.split("-").reverse().join("/")}</span> —{" "}
                            {d.cliente}
                            {promotorasDaDegustacao(d).length
                              ? ` · Promotoras: ${promotorasDetalhe(d)}`
                              : ""}
                            {kg ? ` · ${kg} kg` : ""}
                            {marcada && detalhe ? (
                              <span className="block mt-1 space-y-0.5">
                                {detalhe.itens.map((i, idx) => (
                                  <span key={idx} className="block text-muted-foreground">
                                    ↳ {i.nome} · Quantidade: {i.quantidade} kg ·{" "}
                                    {i.custoKg == null ? (
                                      <span className="text-destructive">sem custo cadastrado</span>
                                    ) : (
                                      <>Custo: {money(i.custoKg)}/kg · Total: {money(i.total)}</>
                                    )}
                                  </span>
                                ))}
                                <span className="block font-medium">
                                  Total da degustação: {detalhe.kg} kg · Custo produtos: {money(detalhe.custoProdutos)}
                                </span>
                              </span>
                            ) : (
                              <span className="block text-muted-foreground">
                                {(d.produtos ?? []).map((p) => `${p.nome} (${p.quantidade})`).join(", ") || "Sem produtos informados"}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Custo dos produtos degustados
                    </p>
                    <p className="text-lg font-bold font-heading mt-0.5">{money(custoDegustacoes.custoTotal)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {custoDegustacoes.kgTotal} kg degustados · calculado automaticamente
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo médio por kg</p>
                    <p className="text-lg font-bold font-heading mt-0.5">
                      {custoDegustacoes.custoMedioKg == null
                        ? "—"
                        : `${money(custoDegustacoes.custoMedioKg)}/kg`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Somente leitura</p>
                  </div>
                </div>

                {custoDegustacoes.incompleto && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                    {custoDegustacoes.produtosSemCusto.map((p) => (
                      <p key={p}>Produto sem custo cadastrado: {p}</p>
                    ))}
                    <p className="font-medium mt-1">
                      Custo da degustação incompleto — o investimento total está incompleto.
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Valor da promotora (R$) — padrão antigo</Label>
                    <Input
                      inputMode="decimal"
                      value={form.valor_promotora}
                      onChange={(e) => set("valor_promotora", e.target.value)}
                      placeholder="100,00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Usado apenas em degustações antigas sem lista de promotoras. Quando a degustação
                      tem promotoras cadastradas, o custo vem dos valores individuais.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Outros custos (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={form.outros_custos}
                      onChange={(e) => set("outros_custos", e.target.value)}
                      placeholder="Ex.: 150,00"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  O investimento total da ação soma: investimento + bonificação em R$ + custo dos produtos
                  degustados (Σ quantidade × custo do produto) + valor das promotoras + outros custos.
                </p>

              </div>
            )}
          </div>


          <div className="grid gap-1.5">
            <Label>Responsável</Label>
            <Select
              value={form.responsavel || undefined}
              onValueChange={(v) => set("responsavel", v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o vendedor responsável" /></SelectTrigger>
              <SelectContent>
                {vendedores.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Objetivo da ação</Label>
            <Textarea
              rows={3}
              value={form.objetivo}
              onChange={(e) => set("objetivo", e.target.value)}
              placeholder="Ex.: Aumentar a venda da linha Tradicional."
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Regras da ação</Label>
            <Textarea
              rows={5}
              value={form.regras}
              onChange={(e) => set("regras", e.target.value)}
              placeholder="Descreva as regras da campanha"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {mode === "edit" ? "Salvar alterações" : isCopia ? "Criar cópia" : "Cadastrar ação"}
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmDup} onOpenChange={setConfirmDup}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Já existe uma ação semelhante para este cliente neste período.</AlertDialogTitle>
              <AlertDialogDescription>
                Mesmo cliente, mesmo tipo, mesmo nome e mesmo período. Deseja criar mesmo assim?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => persist()}>Criar mesmo assim</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
