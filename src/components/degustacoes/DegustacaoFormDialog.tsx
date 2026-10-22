import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useClientProfiles, fetchClientProfileByIdentity } from "@/hooks/useClientProfiles";
import { fetchEnderecoOpcoes, type EnderecoOpcao } from "@/lib/clientAddressLookup";

import { formatPhone } from "@/lib/phoneFormatting";
import { useClientDirectory } from "@/hooks/useClientDirectory";
import { matchesClientQuery, clientMatchScore } from "@/lib/clientSearch";
import { getClientDisplayName } from "@/lib/clientDisplayName";
import { Plus, Search, Clock, UserPlus, Settings2, X, Trash2 } from "lucide-react";
import { ClientProfileDialog } from "@/components/cadastro/ClientProfileDialog";
import type { ClientProfile } from "@/types/clientProfile";
import { Degustacao, DegustacaoInput, DegustacaoProduto, DegustacaoStatus } from "@/hooks/useDegustacoes";
import { useMateriais, useEquipamentos } from "@/hooks/useDegustacaoCatalogos";
import {
  promotorasDaDegustacao,
  isSemPromotora,
  promotoraSemItem,
  LABEL_SEM_PROMOTORA,
  VALOR_PROMOTORA_PADRAO,
  type PromotoraItem,
} from "@/lib/degustacaoPromotoras";
import { CatalogoManagerDialog } from "./CatalogoManagerDialog";
import { CATALOGO_PRODUTOS, produtoSearchText } from "@/types/crm";
import { searchProducts } from "@/lib/productSearch";
import {
  NAO_PRECISA,
  NAO_PRECISA_PRODUTOS_ID,
  produtoNaoPrecisaItem,
  isSemMateriais,
  isSemEquipamentos,
  isSemProdutos,
  materiaisVisiveis,
  equipamentosVisiveis,
  produtosVisiveis,
} from "@/lib/degustacaoFlags";
import { toast } from "sonner";
import {
  HORARIO_OPTIONS,
  formatHorarioFriendly,
  parseHorarioRange,
} from "@/lib/horarioRange";

export interface DegustacaoClienteHint {
  cliente: string;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Degustacao | null;
  onSubmit: (input: DegustacaoInput) => Promise<void> | void;
  extraClientes?: DegustacaoClienteHint[];
}

interface ClienteSugestao {
  key: string;
  profileId?: string;
  nome: string;
  fantasia?: string;
  bairro?: string;
  cidade?: string;
  endereco?: string;
  cnpj?: string;
  aliases?: string[];
  origem: "cadastro" | "degustacao";
}

/** Endereço completo (rua, número, complemento) da base de Clientes e Endereços. */
function enderecoCompleto(p: {
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
}): string | undefined {
  const partes = [p.rua, p.numero, p.complemento].map((v) => (v ?? "").trim()).filter(Boolean);
  return partes.length ? partes.join(", ") : undefined;
}

/** Nome do contato + telefone/WhatsApp, quando existirem na ficha do cliente. */
function contatoResumo(p: ClientProfile): string {
  const principal = (p.contatos ?? [])[0];
  const nome = (principal?.nome ?? "").trim();
  const fone = formatPhone(
    principal?.whatsapp || principal?.telefone || p.whatsapp || p.telefone || "",
  );
  return [nome, fone].filter(Boolean).join(" · ");
}


export function DegustacaoFormDialog({ open, onOpenChange, initial, onSubmit, extraClientes = [] }: Props) {
  const { data: profiles } = useClientProfiles();

  const materiais = useMateriais();
  const equipamentos = useEquipamentos();

  const [cliente, setCliente] = useState("");
  const [contatoCliente, setContatoCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [data, setData] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [horarioInicio, setHorarioInicio] = useState("");
  const [horarioFim, setHorarioFim] = useState("");
  const [promotoras, setPromotoras] = useState<PromotoraItem[]>([{ nome: "", valor: VALOR_PROMOTORA_PADRAO }]);
  const [semPromotora, setSemPromotora] = useState(false);
  const [horasEvento, setHorasEvento] = useState<string>("4");
  const [status, setStatus] = useState<DegustacaoStatus>("pendente");
  const [observacoes, setObservacoes] = useState("");
  const [materiaisSel, setMateriaisSel] = useState<string[]>([]);
  const [equipamentosSel, setEquipamentosSel] = useState<string[]>([]);
  const [produtosSel, setProdutosSel] = useState<DegustacaoProduto[]>([]);
  const [semMateriais, setSemMateriais] = useState(false);
  const [semEquipamentos, setSemEquipamentos] = useState(false);
  const [semProdutos, setSemProdutos] = useState(false);

  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [enderecoOpcoes, setEnderecoOpcoes] = useState<EnderecoOpcao[]>([]);
  const [enderecoOpcaoId, setEnderecoOpcaoId] = useState("");

  const { entries: directory } = useClientDirectory(clientSearch);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientInitialName, setNewClientInitialName] = useState("");
  const [matMgrOpen, setMatMgrOpen] = useState(false);
  const [equipMgrOpen, setEquipMgrOpen] = useState(false);
  const [prodPopoverOpen, setProdPopoverOpen] = useState(false);
  const [prodSearch, setProdSearch] = useState("");

  useEffect(() => {
    if (open) {
      setCliente(initial?.cliente ?? "");
      setContatoCliente(initial?.contato_cliente ?? "");
      setEndereco(initial?.endereco ?? "");
      setBairro(initial?.bairro ?? "");
      setCidade(initial?.cidade ?? "");
      setData(initial?.data ?? "");
      setDataEntrega(initial?.data_entrega_materiais ?? "");
      const parsed = parseHorarioRange(initial?.horario ?? "");
      setHorarioInicio(parsed?.inicio ?? "");
      setHorarioFim(parsed?.fim ?? "");
      const listaPromotoras = promotorasDaDegustacao(initial ?? {});
      setPromotoras(listaPromotoras.length ? listaPromotoras : [{ nome: "", valor: VALOR_PROMOTORA_PADRAO }]);
      setSemPromotora(isSemPromotora(initial ?? {}));
      setHorasEvento(String(initial?.horas_evento ?? 4));
      setStatus((initial?.status as DegustacaoStatus) ?? "pendente");
      setObservacoes(initial?.observacoes ?? "");
      setMateriaisSel(materiaisVisiveis(initial?.materiais));
      setEquipamentosSel(equipamentosVisiveis(initial?.equipamentos));
      setProdutosSel(produtosVisiveis(initial?.produtos));
      setSemMateriais(isSemMateriais(initial?.materiais));
      setSemEquipamentos(isSemEquipamentos(initial?.equipamentos));
      setSemProdutos(isSemProdutos(initial?.produtos));
      setClientSearch("");
      setProdSearch("");
    }
  }, [open, initial]);

  const totalPromotoras = useMemo(() => {
    if (semPromotora) return { qtd: 0, valor: 0 };
    const validas = promotoras.filter((p) => p.nome.trim() !== "" || (Number(p.valor) || 0) > 0);
    return {
      qtd: validas.length,
      valor: validas.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    };
  }, [promotoras, semPromotora]);

  const allSuggestions = useMemo<ClienteSugestao[]>(() => {
    const map = new Map<string, ClienteSugestao>();
    for (const p of profiles ?? []) {
      const display = getClientDisplayName(p);
      const key = display.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          profileId: p.id,
          nome: display,
          fantasia: p.nome_fantasia ?? undefined,
          bairro: p.bairro ?? undefined,
          cidade: p.cidade ?? undefined,
          endereco: enderecoCompleto(p),
          cnpj: p.cnpj ?? undefined,
          origem: "cadastro",
        });
      }
    }
    // Base completa (inclui clientes importados do SIGE que ainda não têm ficha)
    for (const e of directory) {
      const key = e.nome.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        key,
        nome: e.nome,
        fantasia: e.nomeFantasia,
        bairro: e.bairro,
        cidade: e.cidade,
        aliases: e.aliases,
        cnpj: e.cnpj,
        origem: "cadastro",
      });
    }
    for (const c of extraClientes) {
      const nome = (c.cliente ?? "").trim();
      if (!nome) continue;
      const key = nome.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          nome,
          bairro: c.bairro ?? undefined,
          cidade: c.cidade ?? undefined,
          endereco: c.endereco ?? undefined,
          origem: "degustacao",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [profiles, directory, extraClientes]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim();
    if (!q) return allSuggestions.slice(0, 60);
    return allSuggestions
      .filter((s) =>
        matchesClientQuery(q, [s.nome, s.fantasia, s.cidade, s.bairro, ...(s.aliases ?? [])], s.cnpj),
      )
      .sort((a, b) => clientMatchScore(q, b.nome) - clientMatchScore(q, a.nome))
      .slice(0, 60);
  }, [allSuggestions, clientSearch]);

  /**
   * Preenche automaticamente endereço, bairro, cidade e contato a partir da base
   * de Clientes e Endereços (client_profiles). Sempre substitui os dados do
   * cliente anterior: campos sem informação na base ficam em branco.
   */
  const aplicarOpcao = (op: EnderecoOpcao) => {
    setEndereco(op.endereco);
    setBairro(op.bairro);
    setCidade(op.cidade);
    if (op.contato) setContatoCliente(op.contato);
  };

  const handleSelectClient = async (s: ClienteSugestao) => {
    setCliente(s.nome);
    setClientPopoverOpen(false);

    // 1) Dados já conhecidos na sugestão (aplicados imediatamente)
    setEndereco(s.endereco ?? "");
    setBairro(s.bairro ?? "");
    setCidade(s.cidade ?? "");
    setContatoCliente("");
    setEnderecoOpcoes([]);
    setEnderecoOpcaoId("");

    // 2) Ficha completa da base de Clientes e Endereços
    let profile: ClientProfile | undefined = s.profileId
      ? (profiles ?? []).find((p) => p.id === s.profileId)
      : undefined;

    if (!profile) {
      profile = await fetchClientProfileByIdentity(s.nome, s.cnpj);
    }
    if (profile) {
      setEndereco(enderecoCompleto(profile) ?? "");
      setBairro(profile.bairro ?? "");
      setCidade(profile.cidade ?? "");
      setContatoCliente(contatoResumo(profile));
    }

    // 3) Demais unidades/endereços conhecidos (inclui cadastro importado do Sige)
    try {
      const opcoes = await fetchEnderecoOpcoes(s.nome, s.cnpj);
      if (opcoes.length > 1) {
        setEnderecoOpcoes(opcoes);
        setEnderecoOpcaoId(opcoes[0].id);
        if (!profile) aplicarOpcao(opcoes[0]);
      } else if (opcoes.length === 1 && !profile) {
        aplicarOpcao(opcoes[0]);
      }
    } catch {
      /* preenchimento automático é auxiliar: nunca bloqueia o cadastro */
    }
  };



  const toggleMaterial = (nome: string) => {
    setSemMateriais(false);
    setMateriaisSel((prev) =>
      prev.includes(nome) ? prev.filter((n) => n !== nome) : [...prev, nome],
    );
  };
  const toggleEquipamento = (nome: string) => {
    setSemEquipamentos(false);
    setEquipamentosSel((prev) =>
      prev.includes(nome) ? prev.filter((n) => n !== nome) : [...prev, nome],
    );
  };

  const handleSelectAllMateriais = () => {
    setSemMateriais(false);
    setMateriaisSel((materiais.list.data ?? []).map((m) => m.nome));
  };

  const handleToggleSemMateriais = (checked: boolean) => {
    setSemMateriais(checked);
    if (checked) setMateriaisSel([]);
  };
  const handleToggleSemEquipamentos = (checked: boolean) => {
    setSemEquipamentos(checked);
    if (checked) setEquipamentosSel([]);
  };
  const handleToggleSemProdutos = (checked: boolean) => {
    setSemProdutos(checked);
    if (checked) setProdutosSel([]);
  };

  const produtosDisponiveis = useMemo(() => {
    const ids = new Set(produtosSel.map((p) => p.produto_id));
    const base = CATALOGO_PRODUTOS.filter((p) => p.ativo && !ids.has(p.id));
    return searchProducts(base, prodSearch, produtoSearchText);
  }, [produtosSel, prodSearch]);


  const addProduto = (id: string, nome: string) => {
    setSemProdutos(false);
    setProdutosSel((prev) => [...prev, { produto_id: id, nome, quantidade: 1 }]);
    setProdSearch("");
  };
  const updateProdutoQt = (id: string, qt: number) => {
    setProdutosSel((prev) => prev.map((p) => (p.produto_id === id ? { ...p, quantidade: qt } : p)));
  };
  const removeProduto = (id: string) => {
    setProdutosSel((prev) => prev.filter((p) => p.produto_id !== id));
  };

  const handleSubmit = async () => {
    if (!cliente.trim() || !data) return;
    let horario: string | null = null;
    if (horarioInicio && horarioFim) {
      if (horarioFim <= horarioInicio) {
        toast.error("O horário final precisa ser maior que o horário inicial.");
        return;
      }
      horario = formatHorarioFriendly({ inicio: horarioInicio, fim: horarioFim });
    } else if (horarioInicio || horarioFim) {
      toast.error("Preencha início e fim do horário.");
      return;
    }
    const promotorasLimpas = semPromotora
      ? [promotoraSemItem]
      : promotoras
          .map((p) => ({ nome: p.nome.trim(), valor: Number(p.valor) || 0 }))
          .filter((p) => p.nome !== "" || p.valor > 0);

    await onSubmit({
      cliente: cliente.trim(),
      contato_cliente: contatoCliente.trim() || null,
      endereco: endereco.trim() || null,
      bairro: bairro.trim() || null,
      cidade: cidade.trim() || null,
      data,
      data_entrega_materiais: dataEntrega || null,
      horario,
      promotora: semPromotora ? null : promotorasLimpas.map((p) => p.nome).join(", ") || null,
      promotoras: promotorasLimpas,
      horas_evento: Math.max(Number(horasEvento.replace(",", ".")) || 0, 0) || 4,
      status,
      observacoes: observacoes.trim() || null,
      materiais: semMateriais ? [NAO_PRECISA] : materiaisSel,
      equipamentos: semEquipamentos ? [NAO_PRECISA] : equipamentosSel,
      produtos: semProdutos ? [produtoNaoPrecisaItem] : produtosSel,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {initial ? "Editar Degustação" : "Nova Degustação"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Cliente */}
          <div className="grid gap-2">
            <Label>Cliente *</Label>
            <div className="flex gap-2">
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start font-normal min-w-0">
                    <Search className="h-4 w-4 mr-2 opacity-60 shrink-0" />
                    <span className="truncate text-left">{cliente || "Buscar cliente..."}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nome, fantasia ou parte do nome..."
                      value={clientSearch}
                      onValueChange={setClientSearch}
                    />
                    <CommandList className="max-h-[320px] overflow-y-auto">
                      <CommandEmpty>
                        <div className="flex flex-col items-center gap-2 py-2">
                          <span className="text-sm text-muted-foreground">Nenhum cliente encontrado</span>
                          <Button
                            type="button" size="sm" variant="outline"
                            onClick={() => {
                              setNewClientInitialName(clientSearch.trim());
                              setClientPopoverOpen(false);
                              setNewClientOpen(true);
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-1.5" /> Cadastrar novo cliente
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredClients.map((s) => (
                          <CommandItem key={`${s.origem}-${s.key}`} value={s.key} onSelect={() => handleSelectClient(s)} className="py-2.5">
                            <div className="flex flex-col min-w-0 w-full">
                              <span className="font-medium text-sm leading-snug break-words">{s.nome}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                {s.bairro && <span className="text-xs text-muted-foreground truncate">{s.bairro}</span>}
                                {s.origem === "degustacao" && (
                                  <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">já usado</span>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button type="button" variant="outline" size="icon" title="Cadastrar novo cliente"
                onClick={() => { setNewClientInitialName(cliente.trim() || clientSearch.trim()); setNewClientOpen(true); }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ou digite manualmente" />
            {enderecoOpcoes.length > 1 && (
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">
                  Este cliente tem mais de um endereço — escolha a unidade
                </Label>
                <Select
                  value={enderecoOpcaoId}
                  onValueChange={(id) => {
                    setEnderecoOpcaoId(id);
                    const op = enderecoOpcoes.find((o) => o.id === id);
                    if (op) aplicarOpcao(op);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {enderecoOpcoes.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {[o.label, o.endereco].filter(Boolean).join(" — ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Nome do contato do cliente</Label>
              <Input value={contatoCliente} onChange={(e) => setContatoCliente(e.target.value)} placeholder="Ex: João (gerente)" />
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">Promotoras da degustação</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={semPromotora}
                onClick={() => setPromotoras((prev) => [...prev, { nome: "", valor: VALOR_PROMOTORA_PADRAO }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar promotora
              </Button>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={semPromotora} onCheckedChange={(c) => setSemPromotora(!!c)} />
              <span className="text-sm">
                Degustação sem promotora — realizada pela própria loja
                <span className="block text-[11px] text-muted-foreground">
                  Custo de promotora considerado como R$ 0,00. Nos relatórios aparece “{LABEL_SEM_PROMOTORA}”.
                </span>
              </span>
            </label>

            {!semPromotora && promotoras.map((p, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2 items-end">
                <div className="grid gap-1">
                  <Label className="text-xs">Promotora {idx + 1} — nome</Label>
                  <Input
                    value={p.nome}
                    onChange={(e) =>
                      setPromotoras((prev) => prev.map((x, i) => (i === idx ? { ...x, nome: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.valor}
                    onChange={(e) =>
                      setPromotoras((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, valor: Number(e.target.value) || 0 } : x)),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={promotoras.length <= 1}
                  title={promotoras.length <= 1 ? "É preciso manter ao menos um campo" : "Remover promotora"}
                  onClick={() => setPromotoras((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}


            <div className="grid gap-1 md:max-w-[220px]">
              <Label className="text-xs">Horas do evento</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={horasEvento}
                onChange={(e) => setHorasEvento(e.target.value)}
                placeholder="4"
              />
              <p className="text-[11px] text-muted-foreground">
                Duração da degustação (padrão 4 horas). Vale também sem promotora.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              {totalPromotoras.qtd} promotora{totalPromotoras.qtd === 1 ? "" : "s"} · Custo total:{" "}
              <strong>
                {totalPromotoras.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </strong>
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Endereço</Label>
            <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Bairro</Label>
              <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Cidade</Label>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: Belo Horizonte" />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DegustacaoStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="realizada">Realizada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>

              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Data da ação *</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Entrega dos materiais</Label>
              <Input type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Horário</Label>
              <div className="grid grid-cols-2 gap-2">
                <TimePicker value={horarioInicio} onChange={setHorarioInicio} placeholder="Início" />
                <TimePicker value={horarioFim} onChange={setHorarioFim} placeholder="Fim" minValue={horarioInicio} />
              </div>
              {horarioInicio && horarioFim && (
                <p className="text-xs text-muted-foreground">
                  {formatHorarioFriendly({ inicio: horarioInicio, fim: horarioFim })}
                </p>
              )}
            </div>
          </div>

          {/* Materiais */}
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm font-semibold">Materiais</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={handleSelectAllMateriais}
                  disabled={semMateriais || (materiais.list.data ?? []).length === 0}
                >
                  Selecionar todos
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setMatMgrOpen(true)}>
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Gerenciar
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-2 py-1.5">
              <Checkbox checked={semMateriais} onCheckedChange={(c) => handleToggleSemMateriais(!!c)} />
              <span className="font-medium">Não precisa enviar materiais</span>
            </label>
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${semMateriais ? "opacity-50 pointer-events-none" : ""}`}>
              {(materiais.list.data ?? []).map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={materiaisSel.includes(m.nome)} onCheckedChange={() => toggleMaterial(m.nome)} />
                  <span className="truncate">{m.nome}</span>
                </label>
              ))}
              {(materiais.list.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground col-span-full">Nenhum material cadastrado</p>
              )}
            </div>
          </div>

          {/* Equipamentos */}
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">Equipamentos</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setEquipMgrOpen(true)}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Gerenciar
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-2 py-1.5">
              <Checkbox checked={semEquipamentos} onCheckedChange={(c) => handleToggleSemEquipamentos(!!c)} />
              <span className="font-medium">Não precisa de equipamento</span>
            </label>
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${semEquipamentos ? "opacity-50 pointer-events-none" : ""}`}>
              {(equipamentos.list.data ?? []).map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={equipamentosSel.includes(m.nome)} onCheckedChange={() => toggleEquipamento(m.nome)} />
                  <span className="truncate">{m.nome}</span>
                </label>
              ))}
              {(equipamentos.list.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground col-span-full">Nenhum equipamento cadastrado</p>
              )}
            </div>
          </div>

          {/* Produtos */}
          <div className="border rounded-md p-3 space-y-2">
            <Label className="text-sm font-semibold">Produtos</Label>
            <label className="flex items-center gap-2 text-sm cursor-pointer bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-2 py-1.5">
              <Checkbox checked={semProdutos} onCheckedChange={(c) => handleToggleSemProdutos(!!c)} />
              <span className="font-medium">Não precisa enviar produtos</span>
            </label>
            <div className={semProdutos ? "opacity-50 pointer-events-none" : ""}>
              <Popover open={prodPopoverOpen} onOpenChange={setProdPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start" disabled={semProdutos}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar produto
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Buscar por nome, código, recheio..." value={prodSearch} onValueChange={setProdSearch} />
                    <CommandList className="max-h-[280px] overflow-y-auto">
                      <CommandEmpty>Nenhum produto disponível</CommandEmpty>
                      <CommandGroup>
                        {produtosDisponiveis.map((p) => (
                          <CommandItem key={p.id} value={p.id} onSelect={() => { addProduto(p.id, p.nome); setProdPopoverOpen(false); }}>
                            <span className="text-sm">{p.nome}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {produtosSel.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">Nenhum produto adicionado</p>
              ) : (
                <div className="space-y-1.5 mt-2">
                  {produtosSel.map((p) => (
                    <div key={p.produto_id} className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5">
                      <span className="flex-1 text-sm truncate">{p.nome}</span>
                      <Input
                        type="number" min={1} step={1}
                        value={p.quantidade}
                        onChange={(e) => updateProdutoQt(p.produto_id, Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 w-20"
                      />
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeProduto(p.produto_id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!cliente.trim() || !data}>
            {initial ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ClientProfileDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        initial={newClientInitialName ? ({ nome: newClientInitialName } as ClientProfile) : null}
        onSaved={(saved) => {
          const display = getClientDisplayName(saved);
          setCliente(display);
          const enderecoFull = [saved.rua, saved.numero].filter(Boolean).join(", ");
          if (enderecoFull) setEndereco(enderecoFull);
          if (saved.bairro) setBairro(saved.bairro);
          if (saved.cidade) setCidade(saved.cidade);
        }}
      />

      <CatalogoManagerDialog
        open={matMgrOpen} onOpenChange={setMatMgrOpen}
        title="Gerenciar Materiais"
        items={materiais.list.data ?? []}
        onCreate={(nome) => materiais.create.mutateAsync(nome)}
        onUpdate={(args) => materiais.update.mutateAsync(args)}
        onRemove={(id) => materiais.remove.mutateAsync(id)}
      />
      <CatalogoManagerDialog
        open={equipMgrOpen} onOpenChange={setEquipMgrOpen}
        title="Gerenciar Equipamentos"
        items={equipamentos.list.data ?? []}
        onCreate={(nome) => equipamentos.create.mutateAsync(nome)}
        onUpdate={(args) => equipamentos.update.mutateAsync(args)}
        onRemove={(id) => equipamentos.remove.mutateAsync(id)}
      />
    </Dialog>
  );
}

function TimePicker({
  value, onChange, placeholder, minValue,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; minValue?: string;
}) {
  const options = useMemo(
    () => HORARIO_OPTIONS.filter((opt) => !minValue || opt > minValue),
    [minValue],
  );
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 opacity-60 shrink-0" />
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent className="max-h-[260px]">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
