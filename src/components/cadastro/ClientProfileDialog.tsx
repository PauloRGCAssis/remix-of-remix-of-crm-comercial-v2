import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Search, Loader2, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CATALOGO_PRODUTOS, produtoSearchText } from "@/types/crm";
import { searchProducts } from "@/lib/productSearch";
import {
  RAMOS_ATIVIDADE,
  EMPRESAS_FICHA,
  DIAS_ROTA,
  SEGMENTOS,
  FORMAS_PAGAMENTO,
  PRAZOS_PAGAMENTO,
  FORMAS_COM_PRAZO,
  type ClientProfile,
  type ClientProfileInput,
  type Contato,
  type ProdutoNegociadoFicha,
} from "@/types/clientProfile";
import { TIPOS_PONTO_VENDA } from "@/lib/pontoVenda";
import { QuickCreateSelect } from "@/components/QuickCreateSelect";
import { TEAM_VENDEDORES } from "@/hooks/useMetasData";
import { useVendorScope } from "@/hooks/useVendorScope";
import { REGIONAIS, getRegionalByBairro } from "@/data/regionais";
import { buscarCep, maskCep, maskCnpj } from "@/lib/viacep";
import { consultarCnpj, isValidCnpj, onlyDigits } from "@/lib/cnpjLookup";
import { isValidCpf, maskDocumento, type TipoDocumento } from "@/lib/documentoCliente";
import { extrairNumeroDaRua, fetchNumeroDoCadastro } from "@/lib/clientAddressLookup";
import {
  useUpsertClientProfile,
  useMergeUpdateClientProfile,
  findClientProfileByCnpj,
} from "@/hooks/useClientProfiles";
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
import { supabase } from "@/integrations/supabase/client";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { useTaxonomies, useCreateTaxonomy, useDeleteTaxonomy } from "@/hooks/useTaxonomies";
import { useVendors, useUpsertVendor } from "@/hooks/useVendors";
import { CreatableSelect } from "@/components/cadastro/CreatableSelect";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ClientProfile | null;
  onSaved?: (saved: ClientProfile) => void;
}

function emptyForm(): ClientProfileInput {
  return {
    is_ponto_venda: false,
    pdv_ativo: true,
    pdv_tipo: "",
    telefone: "",
    whatsapp: "",
    codigo_cliente: "",
    nome: "",
    nome_fantasia: "",
    cnpj: "",
    tipo_documento: "CNPJ",
    inscricao_estadual: "",
    inscricao_municipal: "",
    segmento: "",
    ramo_atividade: "",
    empresa: "",
    vendedor: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    regiao: "",
    entrega_mesmo_endereco: true,
    horario_manha_inicio: "",
    horario_manha_fim: "",
    horario_tarde_inicio: "",
    horario_tarde_fim: "",
    dias_rota: [],
    formas_pagamento: [],
    prazo_pagamento: "",
    contatos: [],
    produtos_negociados: [],
    observacoes: "",
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

export function ClientProfileDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { toast } = useToast();
  const upsert = useUpsertClientProfile();
  const mergeUpdate = useMergeUpdateClientProfile();
  const [duplicado, setDuplicado] = useState<ClientProfile | null>(null);
  const { data: segmentosCustom = [] } = useTaxonomies("segmento");
  const { data: ramosCustom = [] } = useTaxonomies("ramo");
  const createTaxonomy = useCreateTaxonomy();
  const deleteTaxonomy = useDeleteTaxonomy();
  const { data: vendorsData = [] } = useVendors();
  const vendorScope = useVendorScope();
  const upsertVendor = useUpsertVendor();
  const [form, setForm] = useState<ClientProfileInput>(emptyForm());
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [lastAutoFetchedCep, setLastAutoFetchedCep] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [lastAutoFetchedCnpj, setLastAutoFetchedCnpj] = useState("");
  const [numeroAviso, setNumeroAviso] = useState<string | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [produtoBusca, setProdutoBusca] = useState("");

  const tipoDocumento: TipoDocumento = form.tipo_documento === "CPF" ? "CPF" : "CNPJ";
  const isPessoaFisica = tipoDocumento === "CPF";
  const nomeLabel = isPessoaFisica ? "Nome completo *" : "Razão Social *";

  /**
   * Troca CNPJ <-> CPF: limpa o documento digitado e os dados que vieram da
   * consulta automática anterior, para não associá-los ao documento errado.
   */
  const trocarTipoDocumento = (novo: TipoDocumento) => {
    if (novo === tipoDocumento) return;
    setLastAutoFetchedCnpj("");
    setCnpjLoading(false);
    setForm((p) => ({
      ...p,
      tipo_documento: novo,
      cnpj: "",
      // Dados tipicamente preenchidos pela consulta de CNPJ
      inscricao_estadual: "",
      inscricao_municipal: "",
    }));
  };

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...emptyForm(), ...initial } : emptyForm());
      setLastAutoFetchedCnpj("");
      setLastAutoFetchedCep("");
      setCepError(null);
      setNumeroAviso(null);
    }
  }, [open, initial]);

  // Ficha existente sem número salvo: recupera o número do cadastro importado
  // (somente leitura) e sinaliza quando o número está embutido na rua.
  useEffect(() => {
    if (!open || !initial?.id) return;
    if (String(initial.numero ?? "").trim()) return;
    let cancelado = false;
    const embutido = extrairNumeroDaRua(initial.rua);
    if (embutido) {
      setNumeroAviso(
        `O número deste cliente está gravado dentro do campo Rua ("${embutido}"). Confirme e salve para separá-lo.`,
      );
    }
    void fetchNumeroDoCadastro(initial.nome, initial.cnpj).then((res) => {
      if (cancelado || !res) return;
      setForm((p) => {
        if (String(p.numero ?? "").trim()) return p;
        setNumeroAviso("Número recuperado do cadastro importado. Confira e salve para gravar na ficha.");
        return { ...p, numero: res.numero };
      });
    });
    return () => { cancelado = true; };
  }, [open, initial]);

  const update = <K extends keyof ClientProfileInput>(key: K, value: ClientProfileInput[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const fetchCep = async (cepValue: string) => {
    const digits = (cepValue ?? "").replace(/\D/g, "");
    if (digits.length !== 8 || digits === lastAutoFetchedCep) return;
    setCepLoading(true);
    setCepError(null);
    const r = await buscarCep(digits);
    setCepLoading(false);
    setLastAutoFetchedCep(digits);
    if (!r) {
      setCepError("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
      return;
    }
    setForm((p) => ({
      ...p,
      cep: r.cep,
      // Só preenche o que estiver vazio para não sobrescrever edição manual
      rua: p.rua || r.rua || p.rua,
      bairro: p.bairro || r.bairro || p.bairro,
      cidade: p.cidade || r.cidade || p.cidade,
      estado: p.estado || r.estado || p.estado,
      regiao: p.regiao || r.regiao || p.regiao,
    }));
  };

  const handleCepBlur = () => {
    void fetchCep(form.cep ?? "");
  };

  // Auto-busca ao completar 8 dígitos
  useEffect(() => {
    const digits = (form.cep ?? "").replace(/\D/g, "");
    if (digits.length !== 8) {
      if (digits.length < 8) setCepError(null);
      return;
    }
    if (digits === lastAutoFetchedCep) return;
    const t = window.setTimeout(() => void fetchCep(form.cep ?? ""), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cep]);


  const handleCnpjBlur = async () => {
    // Consulta automática existe apenas para pessoa jurídica (CNPJ).
    if (isPessoaFisica) return;
    const digits = (form.cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14 || digits === lastAutoFetchedCnpj) return;
    setCnpjLoading(true);
    const res = await consultarCnpj(digits);
    setCnpjLoading(false);

    if (res.status !== "error") setLastAutoFetchedCnpj(digits);

    if (res.status === "invalid") {
      toast({ title: "CNPJ inválido", description: res.message, variant: "destructive" });
      return;
    }
    if (res.status === "not_found") {
      toast({ title: "CNPJ não encontrado", description: "Preencha os dados manualmente.", variant: "destructive" });
      return;
    }
    if (res.status === "error" || !res.data) {
      toast({
        title: "Falha ao consultar CNPJ",
        description: res.message ?? "Não foi possível consultar o CNPJ no momento. Tente novamente.",
        variant: "destructive",
      });
      return;
    }
    const r = res.data;
    setForm((p) => ({
      ...p,
      // Só preenche o que está vazio para não sobrescrever edição manual
      nome: p.nome || r.razao_social || p.nome,
      nome_fantasia: p.nome_fantasia || r.nome_fantasia || p.nome_fantasia,
      inscricao_estadual: p.inscricao_estadual || r.inscricao_estadual || p.inscricao_estadual,
      inscricao_municipal: p.inscricao_municipal || r.inscricao_municipal || p.inscricao_municipal,
      telefone: p.telefone || r.telefone || p.telefone,
      
      cep: p.cep || r.cep || p.cep,
      rua: p.rua || r.rua || p.rua,
      numero: p.numero || r.numero || p.numero,
      complemento: p.complemento || r.complemento || p.complemento,
      bairro: p.bairro || r.bairro || p.bairro,
      cidade: p.cidade || r.cidade || p.cidade,
      estado: p.estado || r.estado || p.estado,
      regiao: p.regiao || r.regiao || p.regiao,
    }));
    toast({ title: "Dados do CNPJ preenchidos", description: r.razao_social ?? undefined });
  };

  useEffect(() => {
    if (isPessoaFisica) return;
    const digits = (form.cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14 || digits === lastAutoFetchedCnpj) return;

    const timer = window.setTimeout(() => {
      void handleCnpjBlur();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [form.cnpj, lastAutoFetchedCnpj]);

  useEffect(() => {
    const cidadeNorm = (form.cidade ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (cidadeNorm.includes("belo horizonte") && form.bairro && (!form.regiao || form.regiao === "Outros")) {
      const reg = getRegionalByBairro(form.bairro);
      if (reg && reg !== "Não definida" && reg !== form.regiao) update("regiao", reg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bairro, form.cidade]);

  const copyMainAddress = () => {
    setForm((p) => ({
      ...p,
      entrega_cep: p.cep,
      entrega_rua: p.rua,
      entrega_numero: p.numero,
      entrega_complemento: p.complemento,
      entrega_bairro: p.bairro,
      entrega_cidade: p.cidade,
      entrega_estado: p.estado,
    }));
    toast({ title: "Endereço copiado para a entrega" });
  };

  // Contatos
  const addContato = () =>
    update("contatos", [...form.contatos, { id: uid(), nome: "", cargo: "", telefone: "", whatsapp: "", email: "" }]);
  const updateContato = (id: string, patch: Partial<Contato>) =>
    update(
      "contatos",
      form.contatos.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  const removeContato = (id: string) =>
    update("contatos", form.contatos.filter((c) => c.id !== id));

  // Produtos
  const selectedProductIds = useMemo(
    () => new Set(form.produtos_negociados.map((p) => p.produto_id)),
    [form.produtos_negociados],
  );
  const toggleProduct = (produtoId: string, nome: string) => {
    if (selectedProductIds.has(produtoId)) {
      update(
        "produtos_negociados",
        form.produtos_negociados.filter((p) => p.produto_id !== produtoId),
      );
    } else {
      update("produtos_negociados", [
        ...form.produtos_negociados,
        { id: uid(), produto_id: produtoId, produto_nome: nome },
      ]);
    }
  };
  const updateProduto = (id: string, patch: Partial<ProdutoNegociadoFicha>) =>
    update(
      "produtos_negociados",
      form.produtos_negociados.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  const removeProduto = (id: string) =>
    update("produtos_negociados", form.produtos_negociados.filter((p) => p.id !== id));

  const toggleDiaRota = (dia: string) => {
    const set = new Set(form.dias_rota);
    if (set.has(dia)) set.delete(dia);
    else set.add(dia);
    update("dias_rota", Array.from(set));
  };

  const syncAgendaPedidos = async (saved: ClientProfile) => {
    // Espelha a ficha como cliente da Agenda de Pedidos.
    // Casa por nome normalizado; cria se não existir, atualiza dias_semana se já existir.
    // Exibição: prioriza Nome Fantasia, fallback para Razão Social.
    const displayName = (saved.nome_fantasia && saved.nome_fantasia.trim()) || saved.nome;
    const norm = normalizeClientName(displayName);
    const telefone = saved.contatos.find((c) => c.whatsapp || c.telefone)?.whatsapp
      ?? saved.contatos.find((c) => c.telefone)?.telefone
      ?? null;

    const { data: existing } = await supabase
      .from("order_schedule_clients")
      .select("id, nome, dias_semana");

    const match = (existing ?? []).find((c: any) => normalizeClientName(c.nome) === norm);

    if (saved.dias_rota.length === 0) {
      // Sem dias selecionados: não mexe na Agenda (evita apagar config existente sem intenção).
      return;
    }

    if (match) {
      await supabase
        .from("order_schedule_clients")
        .update({
          nome: displayName,
          dias_semana: saved.dias_rota,
          telefone: telefone || (match as any).telefone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (match as any).id);
    } else {
      await supabase.from("order_schedule_clients").insert({
        nome: displayName,
        telefone,
        dias_semana: saved.dias_rota,
        ativo: true,
      });
    }
  };

  /**
   * Payload de gravação: normaliza o número e, quando a entrega usa o mesmo
   * endereço principal, espelha inclusive o número no endereço de entrega.
   */
  const montarPayload = (): ClientProfileInput => {
    const base: ClientProfileInput = {
      ...form,
      numero: (form.numero ?? "").trim(),
      entrega_numero: (form.entrega_numero ?? "").trim(),
    };
    if (!base.entrega_mesmo_endereco) return base;
    return {
      ...base,
      entrega_cep: base.cep,
      entrega_rua: base.rua,
      entrega_numero: base.numero,
      entrega_complemento: base.complemento,
      entrega_bairro: base.bairro,
      entrega_cidade: base.cidade,
      entrega_estado: base.estado,
    };
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({
        title: isPessoaFisica ? "Nome completo é obrigatório" : "Razão Social é obrigatória",
        variant: "destructive",
      });
      return;
    }
    // Documento é opcional, mas quando informado precisa ser válido
    const docDigits = onlyDigits(form.cnpj ?? "");
    if (docDigits.length > 0) {
      const valido = isPessoaFisica ? isValidCpf(docDigits) : isValidCnpj(docDigits);
      if (!valido) {
        toast({
          title: isPessoaFisica ? "CPF inválido" : "CNPJ inválido",
          description: isPessoaFisica
            ? "Confira os 11 dígitos do CPF."
            : "Confira os 14 dígitos do CNPJ.",
          variant: "destructive",
        });
        return;
      }
    }
    if (
      form.formas_pagamento.some((f) => FORMAS_COM_PRAZO.includes(f)) &&
      !form.prazo_pagamento
    ) {
      toast({
        title: "Selecione o prazo de pagamento",
        description: "Boleto ou Cheque exigem prazo (7, 14, 21 ou 28 dias).",
        variant: "destructive",
      });
      return;
    }
    // Antes de criar: verifica se o CNPJ já possui ficha
    const digitsCnpj = (form.cnpj ?? "").replace(/\D/g, "");
    if (!initial?.id && digitsCnpj.length >= 11) {
      try {
        const existente = await findClientProfileByCnpj(digitsCnpj);
        if (existente) {
          setDuplicado(existente);
          return;
        }
      } catch (lookupErr) {
        console.warn("Falha ao verificar CNPJ existente:", lookupErr);
      }
    }

    try {
      const saved = await upsert.mutateAsync({ id: initial?.id, data: montarPayload() });
      await finalizarSalvamento(saved as ClientProfile);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (e?.code === "23505" || msg.includes("client_profiles_cnpj_unique")) {
        try {
          const existente = await findClientProfileByCnpj(digitsCnpj);
          if (existente) {
            setDuplicado(existente);
            return;
          }
        } catch { /* segue para mensagem amigável */ }
        toast({
          title: `${tipoDocumento} já cadastrado`,
          description: `Este ${tipoDocumento} já está cadastrado. Você pode atualizar o cadastro existente.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Erro ao salvar",
        description: msg || "Tente novamente",
        variant: "destructive",
      });
    }
  };

  const finalizarSalvamento = async (saved: ClientProfile) => {
    try {
      await syncAgendaPedidos(saved);
    } catch (syncErr) {
      console.error("Falha ao sincronizar Agenda de Pedidos:", syncErr);
    }
    toast({
      title: initial ? "Ficha atualizada" : "Ficha cadastrada com sucesso",
      description: form.dias_rota.length > 0
        ? `Sincronizado na Agenda de Pedidos: ${form.dias_rota.join(", ")}.`
        : undefined,
    });
    onSaved?.(saved);
    onOpenChange(false);
  };

  const handleAtualizarExistente = async () => {
    if (!duplicado) return;
    try {
      const saved = await mergeUpdate.mutateAsync({ id: duplicado.id, data: montarPayload() });
      setDuplicado(null);
      await finalizarSalvamento(saved as ClientProfile);
    } catch (e: any) {
      toast({
        title: "Erro ao atualizar cadastro",
        description: e?.message ?? "Tente novamente",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {initial ? "Editar Ficha de Cadastro" : "Nova Ficha de Cadastro"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Dados principais */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">🏢 Dados principais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Tipo de documento</Label>
                <div className="mt-1 inline-flex rounded-md border border-border p-0.5">
                  {(["CNPJ", "CPF"] as TipoDocumento[]).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={tipoDocumento === t ? "default" : "ghost"}
                      className="h-7 px-4 text-xs"
                      onClick={() => trocarTipoDocumento(t)}
                    >
                      {t === "CNPJ" ? "CNPJ (pessoa jurídica)" : "CPF (pessoa física)"}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">{tipoDocumento}</Label>
                <div className="relative">
                  <Input
                    value={form.cnpj ?? ""}
                    onChange={(e) => update("cnpj", maskDocumento(e.target.value, tipoDocumento))}
                    onBlur={handleCnpjBlur}
                    placeholder={isPessoaFisica ? "000.000.000-00" : "00.000.000/0000-00"}
                  />
                  {cnpjLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {isPessoaFisica
                    ? "Consulta automática indisponível para CPF. Preencha os dados manualmente."
                    : "Ao sair do campo, buscamos automaticamente os dados da empresa."}
                </p>
              </div>
              <div>
                <Label className="text-xs">{nomeLabel}</Label>
                <Input value={form.nome} onChange={(e) => update("nome", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nome fantasia</Label>
                <Input value={form.nome_fantasia ?? ""} onChange={(e) => update("nome_fantasia", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Empresa *</Label>
                <Select value={form.empresa || undefined} onValueChange={(v) => update("empresa", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {EMPRESAS_FICHA.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  {isPessoaFisica ? "Inscrição Estadual (IE)" : "Inscrição Estadual (IE) *"}
                </Label>
                <Input
                  value={form.inscricao_estadual ?? ""}
                  onChange={(e) => update("inscricao_estadual", e.target.value)}
                  placeholder="ISENTO ou número"
                />
              </div>
              <div>
                <Label className="text-xs">
                  {isPessoaFisica ? "Inscrição Municipal (IM)" : "Inscrição Municipal (IM) *"}
                </Label>
                <Input
                  value={form.inscricao_municipal ?? ""}
                  onChange={(e) => update("inscricao_municipal", e.target.value)}
                  placeholder="Número da IM"
                />
              </div>
              <div>
                <Label className="text-xs">Segmento</Label>
                <CreatableSelect
                  value={form.segmento ?? ""}
                  onChange={(v) => update("segmento", v)}
                  placeholder="Selecione..."
                  createLabel="Cadastrar novo segmento"
                  options={[
                    ...SEGMENTOS.map((s) => ({ value: s, label: s })),
                    ...segmentosCustom
                      .filter((t) => !SEGMENTOS.includes(t.nome as any))
                      .map((t) => ({
                        value: t.nome,
                        label: t.nome,
                        removable: true,
                        onRemove: () => deleteTaxonomy.mutateAsync(t.id),
                      })),
                  ]}
                  onCreate={async (nome) => {
                    const t = await createTaxonomy.mutateAsync({ tipo: "segmento", nome });
                    return t.nome;
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">Ramo de atividade</Label>
                <CreatableSelect
                  value={form.ramo_atividade ?? ""}
                  onChange={(v) => update("ramo_atividade", v)}
                  placeholder="Selecione..."
                  createLabel="Cadastrar novo ramo"
                  options={[
                    ...RAMOS_ATIVIDADE.map((r) => ({ value: r, label: r })),
                    ...ramosCustom
                      .filter((t) => !RAMOS_ATIVIDADE.includes(t.nome as any))
                      .map((t) => ({
                        value: t.nome,
                        label: t.nome,
                        removable: true,
                        onRemove: () => deleteTaxonomy.mutateAsync(t.id),
                      })),
                  ]}
                  onCreate={async (nome) => {
                    const t = await createTaxonomy.mutateAsync({ tipo: "ramo", nome });
                    return t.nome;
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Vendedor</Label>
                <CreatableSelect
                  value={form.vendedor ?? ""}
                  onChange={(v) => update("vendedor", v)}
                  placeholder="Selecione..."
                  createLabel="Cadastrar novo vendedor"
                  options={(() => {
                    const ativos = vendorsData.filter((v) => v.ativo).map((v) => v.nome);
                    const merged = Array.from(new Set([...TEAM_VENDEDORES, ...ativos]));
                    return vendorScope
                      .opcoesVendedor(merged)
                      .map((nome) => ({ value: nome, label: nome }));
                  })()}
                  onCreate={async (nome) => {
                    await upsertVendor.mutateAsync({ nome, ativo: true, is_team: false });
                    return nome;
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Telefone</Label>
                <Input
                  value={form.telefone ?? ""}
                  onChange={(e) => update("telefone", e.target.value)}
                  placeholder="(31) 3333-3333"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  value={form.whatsapp ?? ""}
                  onChange={(e) => update("whatsapp", e.target.value)}
                  placeholder="(31) 99999-9999"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">É ponto de venda?</Label>
                <Select
                  value={form.is_ponto_venda ? "sim" : "nao"}
                  onValueChange={(v) => update("is_ponto_venda", v === "sim")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.is_ponto_venda && (
                <>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Classificação do ponto de venda</Label>
                    <QuickCreateSelect
                      tipo="pdv_tipo"
                      value={form.pdv_tipo || ""}
                      onChange={(v) => update("pdv_tipo", v)}
                      baseOptions={TIPOS_PONTO_VENDA}
                      placeholder="Selecione..."
                      createLabel="Cadastrar nova classificação"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Situação do ponto de venda</Label>
                    <Select
                      value={form.pdv_ativo ? "ativo" : "inativo"}
                      onValueChange={(v) => update("pdv_ativo", v === "ativo")}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </section>

          <Separator />

          {/* Endereço */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">📍 Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">CEP</Label>
                <div className="relative">
                  <Input
                    value={form.cep ?? ""}
                    onChange={(e) => update("cep", maskCep(e.target.value))}
                    onBlur={handleCepBlur}
                    placeholder="00000-000"
                  />
                  {cepLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {cepError && <p className="text-[11px] text-destructive mt-1">{cepError}</p>}
                {cepLoading && <p className="text-[11px] text-muted-foreground mt-1">Buscando endereço...</p>}
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Rua</Label>
                <Input value={form.rua ?? ""} onChange={(e) => update("rua", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Número</Label>
                <Input value={form.numero ?? ""} onChange={(e) => update("numero", e.target.value)} />
                {numeroAviso && (
                  <p className="text-[11px] text-muted-foreground mt-1">{numeroAviso}</p>
                )}
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Complemento</Label>
                <Input value={form.complemento ?? ""} onChange={(e) => update("complemento", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Bairro</Label>
                <Input value={form.bairro ?? ""} onChange={(e) => update("bairro", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Cidade</Label>
                <Input value={form.cidade ?? ""} onChange={(e) => update("cidade", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Estado</Label>
                <Input
                  value={form.estado ?? ""}
                  maxLength={2}
                  onChange={(e) => update("estado", e.target.value.toUpperCase())}
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Região</Label>
                <Select value={form.regiao || undefined} onValueChange={(v) => update("regiao", v)}>
                  <SelectTrigger><SelectValue placeholder="Auto preenchido a partir do bairro..." /></SelectTrigger>
                  <SelectContent>
                    {REGIONAIS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Endereço de entrega */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">🚚 Endereço de entrega</h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={form.entrega_mesmo_endereco}
                    onChange={(e) => update("entrega_mesmo_endereco", e.target.checked)}
                  />
                  Mesmo endereço principal
                </label>
                {!form.entrega_mesmo_endereco && (
                  <Button type="button" variant="outline" size="sm" onClick={copyMainAddress}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar principal
                  </Button>
                )}
              </div>
            </div>
            {!form.entrega_mesmo_endereco && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs">CEP</Label>
                  <Input value={form.entrega_cep ?? ""} onChange={(e) => update("entrega_cep", maskCep(e.target.value))} />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Rua</Label>
                  <Input value={form.entrega_rua ?? ""} onChange={(e) => update("entrega_rua", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Número</Label>
                  <Input value={form.entrega_numero ?? ""} onChange={(e) => update("entrega_numero", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Bairro</Label>
                  <Input value={form.entrega_bairro ?? ""} onChange={(e) => update("entrega_bairro", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Cidade</Label>
                  <Input value={form.entrega_cidade ?? ""} onChange={(e) => update("entrega_cidade", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Estado</Label>
                  <Input
                    value={form.entrega_estado ?? ""}
                    maxLength={2}
                    onChange={(e) => update("entrega_estado", e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* Horário de entrega */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">⏰ Horário de entrega</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Manhã</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={form.horario_manha_inicio ?? ""} onChange={(e) => update("horario_manha_inicio", e.target.value)} />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="time" value={form.horario_manha_fim ?? ""} onChange={(e) => update("horario_manha_fim", e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Tarde</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={form.horario_tarde_inicio ?? ""} onChange={(e) => update("horario_tarde_inicio", e.target.value)} />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="time" value={form.horario_tarde_fim ?? ""} onChange={(e) => update("horario_tarde_fim", e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* Dias de rota de entrega */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">📅 Dias da rota de entrega</h3>
            <p className="text-xs text-muted-foreground">
              Selecione os dias da semana em que esse cliente recebe a entrega.
              Esses dias serão sincronizados automaticamente na <strong>Agenda de Pedidos</strong>.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {DIAS_ROTA.map((dia) => {
                const active = form.dias_rota.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDiaRota(dia)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* Forma de pagamento */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">💳 Forma de pagamento</h3>
            <p className="text-xs text-muted-foreground">
              Selecione todas as formas que o cliente costuma utilizar.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {FORMAS_PAGAMENTO.map((fp) => {
                const active = form.formas_pagamento.includes(fp);
                return (
                  <button
                    key={fp}
                    type="button"
                    onClick={() => {
                      const set = new Set(form.formas_pagamento);
                      if (set.has(fp)) set.delete(fp);
                      else set.add(fp);
                      const next = Array.from(set);
                      update("formas_pagamento", next);
                      // Se nenhuma forma com prazo restou selecionada, limpa o prazo
                      if (!next.some((f) => FORMAS_COM_PRAZO.includes(f))) {
                        update("prazo_pagamento", "");
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {fp}
                  </button>
                );
              })}
            </div>

            {form.formas_pagamento.some((f) => FORMAS_COM_PRAZO.includes(f)) && (
              <div className="pt-2 max-w-xs">
                <Label className="text-xs">Prazo de pagamento (Boleto/Cheque) *</Label>
                <Select
                  value={form.prazo_pagamento || undefined}
                  onValueChange={(v) => update("prazo_pagamento", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o prazo..." /></SelectTrigger>
                  <SelectContent>
                    {PRAZOS_PAGAMENTO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">📞 Contatos</h3>
              <Button type="button" variant="outline" size="sm" onClick={addContato}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar contato
              </Button>
            </div>
            {form.contatos.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhum contato adicionado.</p>
            )}
            {form.contatos.map((c) => (
              <div key={c.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded-md border border-border bg-muted/30">
                <div className="md:col-span-3">
                  <Label className="text-xs">Nome</Label>
                  <Input value={c.nome} onChange={(e) => updateContato(c.id, { nome: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Cargo</Label>
                  <Input value={c.cargo ?? ""} onChange={(e) => updateContato(c.id, { cargo: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={c.telefone ?? ""} onChange={(e) => updateContato(c.id, { telefone: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">WhatsApp</Label>
                  <Input value={c.whatsapp ?? ""} onChange={(e) => updateContato(c.id, { whatsapp: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={c.email ?? ""} onChange={(e) => updateContato(c.id, { email: e.target.value })} />
                </div>
                <div className="md:col-span-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeContato(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <Separator />

          {/* Produtos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">🧀 Produtos negociados</h3>
              <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Search className="h-3 w-3 mr-1" /> Selecionar produtos
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nome, código, recheio..."
                      value={produtoBusca}
                      onValueChange={setProdutoBusca}
                    />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                      <CommandGroup>
                        {searchProducts(CATALOGO_PRODUTOS, produtoBusca, produtoSearchText).map((p) => {
                          const checked = selectedProductIds.has(p.id);
                          return (
                            <CommandItem
                              key={p.id}
                              value={p.id}
                              onSelect={() => toggleProduct(p.id, p.nome)}
                              className="text-xs"
                            >
                              <input type="checkbox" checked={checked} readOnly className="mr-2" />
                              <span className="flex-1">{p.nome}</span>
                              <Badge variant="outline" className="text-[10px]">{p.marca}</Badge>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>

              </Popover>
            </div>

            {form.produtos_negociados.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhum produto selecionado.</p>
            )}
            {form.produtos_negociados.map((p) => (
              <div key={p.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded-md border border-border bg-muted/30">
                <div className="md:col-span-5">
                  <Label className="text-xs">Produto</Label>
                  <p className="text-sm font-medium truncate" title={p.produto_nome}>{p.produto_nome}</p>
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Preço negociado (R$/kg)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={p.preco ?? ""}
                    onChange={(e) => updateProduto(p.id, { preco: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Observação</Label>
                  <Input value={p.observacao ?? ""} onChange={(e) => updateProduto(p.id, { observacao: e.target.value })} />
                </div>
                <div className="md:col-span-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeProduto(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <Separator />

          {/* Observações */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">📝 Observações gerais</h3>
            <Textarea
              rows={3}
              value={form.observacoes ?? ""}
              onChange={(e) => update("observacoes", e.target.value)}
              placeholder="Informações relevantes sobre o cliente..."
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending || mergeUpdate.isPending}>
            {(upsert.isPending || mergeUpdate.isPending) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {initial ? "Salvar alterações" : "Cadastrar cliente"}
          </Button>
        </DialogFooter>

        <AlertDialog open={!!duplicado} onOpenChange={(o) => !o && setDuplicado(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Este {tipoDocumento} já possui cadastro</AlertDialogTitle>
              <AlertDialogDescription>
                {duplicado?.nome
                  ? `Já existe a ficha "${duplicado.nome}" com este ${tipoDocumento}. `
                  : ""}
                Deseja atualizar o cadastro existente com os dados preenchidos nesta ficha?
                Campos deixados em branco aqui não apagam o que já está salvo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={mergeUpdate.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleAtualizarExistente();
                }}
                disabled={mergeUpdate.isPending}
              >
                {mergeUpdate.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Atualizar cadastro
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
