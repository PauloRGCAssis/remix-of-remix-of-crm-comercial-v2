import { useEffect, useMemo, useState } from "react";
import { matchesClientQuery } from "@/lib/clientSearch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateClientProfilesRaw, usePatchClientProfile } from "@/hooks/useClientProfiles";
import { useSalesData } from "@/hooks/useSalesData";
import { TEAM_VENDEDORES } from "@/hooks/useMetasData";
import { useVendorScope } from "@/hooks/useVendorScope";
import { PermissionDeniedError, useModuleCrud, type CrudAcao } from "@/hooks/useModuleCrud";
import {
  buildPdvSalesIndex,
  diasSemComprar,
  findPossibleDuplicates,
  formatCurrency,
  formatDate,
  formatKg,
  fullAddress,
  nameKey,
  normalizeDoc,
  profilePhone,
  profileWhatsapp,
  resolvePdvStats,
  TIPOS_PONTO_VENDA,
  type DuplicateHint,
} from "@/lib/pontoVenda";
import { SEGMENTOS } from "@/types/clientProfile";
import { QuickCreateSelect } from "@/components/QuickCreateSelect";
import type { ClientProfile } from "@/types/clientProfile";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: ClientProfile[];
  /** Quando informado, o formulário edita apenas os dados cadastrais dessa ficha. */
  editing?: ClientProfile | null;
  /** Abre a ficha completa de um ponto de venda já existente. */
  onVisualizar?: (profile: ClientProfile) => void;
}

interface FormState {
  codigo_cliente: string;
  cnpj: string;
  nome: string;
  nome_fantasia: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  whatsapp: string;
  vendedor: string;
  segmento: string;
  pdv_tipo: string;
  pdv_ativo: boolean;
  observacoes: string;
}

const EMPTY: FormState = {
  codigo_cliente: "", cnpj: "", nome: "", nome_fantasia: "", rua: "", numero: "",
  complemento: "", bairro: "", cidade: "", estado: "", cep: "", telefone: "",
  whatsapp: "", vendedor: "", segmento: "", pdv_tipo: "", pdv_ativo: true, observacoes: "",
};

function fromProfile(p: ClientProfile): FormState {
  return {
    codigo_cliente: p.codigo_cliente ?? "",
    cnpj: p.cnpj ?? "",
    nome: p.nome ?? "",
    nome_fantasia: p.nome_fantasia ?? "",
    rua: p.rua ?? "",
    numero: p.numero ?? "",
    complemento: p.complemento ?? "",
    bairro: p.bairro ?? "",
    cidade: p.cidade ?? "",
    estado: p.estado ?? "",
    cep: p.cep ?? "",
    telefone: p.telefone ?? "",
    whatsapp: p.whatsapp ?? "",
    vendedor: p.vendedor ?? "",
    segmento: p.segmento ?? "",
    pdv_tipo: p.pdv_tipo ?? "",
    pdv_ativo: p.pdv_ativo ?? true,
    observacoes: p.observacoes ?? "",
  };
}

/**
 * Cadastro de ponto de venda em duas vias:
 *  1) buscar um cliente que já existe no CRM e apenas marcá-lo como ponto de venda;
 *  2) cadastro manual, só quando o cliente realmente não existe.
 * Nenhuma das duas cria vendas: pedidos, produtos e faturamento vêm sempre da
 * importação da planilha comercial.
 */
export function NovoPontoVendaDialog({ open, onOpenChange, profiles, editing, onVisualizar }: Props) {
  const { toast } = useToast();
  const crud = useModuleCrud("ponto_venda", "pontos de venda");
  const semPermissao = (acao: CrudAcao) => {
    if (crud.pode(acao)) return false;
    toast({ title: "Sem permissão", description: new PermissionDeniedError(acao, "pontos de venda").message, variant: "destructive" });
    return true;
  };
  const { user } = useAuth();
  const autor = user?.email ?? user?.id ?? "usuário do sistema";
  const createRaw = useCreateClientProfilesRaw();
  const patch = usePatchClientProfile();
  const { data: sales = [] } = useSalesData();
  const [form, setForm] = useState<FormState>(EMPTY);
  const vendorScope = useVendorScope();
  const [ignorarDuplicidade, setIgnorarDuplicidade] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<ClientProfile | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? fromProfile(editing) : EMPTY);
    setIgnorarDuplicidade(false);
    setBusca("");
    setSelecionado(null);
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const salesIndex = useMemo(() => (open ? buildPdvSalesIndex(sales) : null), [open, sales]);
  const statsSelecionado = useMemo(
    () => (selecionado && salesIndex ? resolvePdvStats(salesIndex, selecionado) : null),
    [selecionado, salesIndex],
  );

  const resultados = useMemo(() => {
    const s = nameKey(busca);
    const digits = busca.replace(/\D/g, "");
    const codigo = busca.trim();
    if (!s && digits.length < 3) return [];
    return profiles
      .filter((p) => {
        if (codigo && String(p.codigo_cliente ?? "").trim() === codigo) return true;
        if (digits.length >= 3 && normalizeDoc(p.cnpj).includes(digits)) return true;
        if (!s) return false;
        return matchesClientQuery(busca, [p.nome, p.nome_fantasia, p.cidade, p.bairro], p.cnpj);
      })
      .slice(0, 30);

  }, [profiles, busca]);

  const duplicados: DuplicateHint[] = useMemo(
    () =>
      findPossibleDuplicates(profiles, {
        id: editing?.id,
        codigo_cliente: form.codigo_cliente,
        cnpj: form.cnpj,
        nome: form.nome,
        nome_fantasia: form.nome_fantasia,
        cidade: form.cidade,
      }),
    [profiles, form.codigo_cliente, form.cnpj, form.nome, form.nome_fantasia, form.cidade, editing?.id],
  );

  const cadastrais = () => ({
    nome_fantasia: form.nome_fantasia.trim() || null,
    rua: form.rua.trim() || null,
    numero: form.numero.trim() || null,
    complemento: form.complemento.trim() || null,
    bairro: form.bairro.trim() || null,
    cidade: form.cidade.trim() || null,
    estado: form.estado.trim() || null,
    cep: form.cep.trim() || null,
    telefone: form.telefone.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    vendedor: form.vendedor.trim() || null,
    segmento: form.segmento.trim() || null,
    pdv_tipo: form.pdv_tipo.trim() || null,
    pdv_ativo: form.pdv_ativo,
    observacoes: form.observacoes.trim() || null,
    codigo_cliente: form.codigo_cliente.trim() || null,
    cnpj: form.cnpj.trim() || null,
    pdv_atualizado_por: autor,
    pdv_atualizado_em: new Date().toISOString(),
  });

  const salvar = async () => {
    if (semPermissao(editing ? "editar" : "criar")) return;
    const nome = form.nome.trim() || form.nome_fantasia.trim();
    if (!nome) {
      toast({ title: "Informe a razão social ou o nome fantasia", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await patch.mutateAsync({
          id: editing.id,
          patch: { ...cadastrais(), is_ponto_venda: true, pdv_removido_em: null, pdv_removido_por: null },
        });
        toast({ title: "Ponto de venda atualizado", description: nome });
      } else {
        await createRaw.mutateAsync([
          { ...cadastrais(), nome, is_ponto_venda: true, pdv_origem: "cadastro manual" },
        ]);
        toast({
          title: "Ponto de venda cadastrado",
          description: "Os dados comerciais aparecem automaticamente assim que houver vendas desse cliente.",
        });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    }
  };

  /** Apenas classifica o cadastro existente como ponto de venda — nunca cria cliente novo. */
  const marcarComoPdv = async (p: ClientProfile, complementos?: Record<string, any>) => {
    if (semPermissao("criar")) return; // incluir cliente existente na lista de PDV
    try {
      await patch.mutateAsync({
        id: p.id,
        patch: {
          ...(complementos ?? {}),
          is_ponto_venda: true,
          pdv_ativo: true,
          pdv_removido_em: null,
          pdv_removido_por: null,
          pdv_atualizado_por: autor,
          pdv_atualizado_em: new Date().toISOString(),
        },
      });
      toast({
        title: "Cliente adicionado como ponto de venda",
        description: `${p.nome_fantasia?.trim() || p.nome} — histórico comercial aproveitado sem duplicar cadastro.`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao adicionar", description: e?.message, variant: "destructive" });
    }
  };

  const usarExistente = async (hint: DuplicateHint) => marcarComoPdv(hint.profile);

  const atualizarExistente = async (hint: DuplicateHint) => {
    const p = cadastrais();
    const limpo = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== ""));
    await marcarComoPdv(hint.profile, { ...limpo, pdv_ativo: form.pdv_ativo });
  };

  const saving = createRaw.isPending || patch.isPending;
  const bloqueado = !editing && duplicados.length > 0 && !ignorarDuplicidade;

  const camposFaltando = selecionado
    ? [
        !fullAddressPreenchido(selecionado) && "endereço",
        !profilePhone(selecionado) && "telefone",
        !profileWhatsapp(selecionado) && "WhatsApp",
      ].filter(Boolean)
    : [];

  const formularioManual = (
    <>
      {!editing && duplicados.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Possível duplicidade</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">
              Já existe cadastro com dados semelhantes. Use o cadastro existente, atualize-o ou revise os dados.
            </p>
            {duplicados.slice(0, 5).map((d) => (
              <div key={d.profile.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.profile.nome_fantasia?.trim() || d.profile.nome}</p>
                  <p className="text-[11px]">
                    {d.motivo} · {[d.profile.cidade, d.profile.bairro].filter(Boolean).join(" · ") || "sem endereço"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => usarExistente(d)} disabled={saving}>
                    Usar cadastro existente
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => atualizarExistente(d)} disabled={saving}>
                    Atualizar existente
                  </Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setIgnorarDuplicidade(true)}>
              Revisei os dados — continuar cadastro manual
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Código do cliente" value={form.codigo_cliente} onChange={(v) => set("codigo_cliente", v)} />
        <Field label="CPF ou CNPJ" value={form.cnpj} onChange={(v) => set("cnpj", v)} />
        <Field label="Razão social" value={form.nome} onChange={(v) => set("nome", v)} />
        <Field label="Nome fantasia" value={form.nome_fantasia} onChange={(v) => set("nome_fantasia", v)} />
        <Field label="Logradouro" value={form.rua} onChange={(v) => set("rua", v)} />
        <Field label="Número" value={form.numero} onChange={(v) => set("numero", v)} />
        <Field label="Complemento" value={form.complemento} onChange={(v) => set("complemento", v)} />
        <Field label="Bairro" value={form.bairro} onChange={(v) => set("bairro", v)} />
        <Field label="Cidade" value={form.cidade} onChange={(v) => set("cidade", v)} />
        <Field label="Estado" value={form.estado} onChange={(v) => set("estado", v)} />
        <Field label="CEP" value={form.cep} onChange={(v) => set("cep", v)} />
        <Field label="Telefone" value={form.telefone} onChange={(v) => set("telefone", v)} />
        <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} />

        <div className="space-y-1">
          <Label className="text-xs">Vendedor responsável</Label>
          <Select value={form.vendedor || NONE} onValueChange={(v) => set("vendedor", v === NONE ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não informado</SelectItem>
              {vendorScope.opcoesVendedor(TEAM_VENDEDORES).map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Segmento</Label>
          <QuickCreateSelect
            tipo="segmento"
            modulo="ponto_venda"
            value={form.segmento || ""}
            onChange={(v) => set("segmento", v)}
            baseOptions={SEGMENTOS}
            emptyLabel="Não informado"
            placeholder="Selecione"
            createLabel="Cadastrar novo segmento"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Classificação do PDV</Label>
          <QuickCreateSelect
            tipo="pdv_tipo"
            modulo="ponto_venda"
            value={form.pdv_tipo || ""}
            onChange={(v) => set("pdv_tipo", v)}
            baseOptions={TIPOS_PONTO_VENDA}
            emptyLabel="Não informado"
            placeholder="Selecione"
            createLabel="Cadastrar nova classificação"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <Switch checked={form.pdv_ativo} onCheckedChange={(v) => set("pdv_ativo", v)} />
        <span className="text-sm">{form.pdv_ativo ? "Ponto de venda ativo" : "Ponto de venda inativo"}</span>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Observações</Label>
        <Textarea
          rows={3}
          value={form.observacoes}
          onChange={(e) => set("observacoes", e.target.value)}
          placeholder="Informações internas sobre o ponto de venda"
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving || bloqueado}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {editing ? "Salvar alterações" : "Cadastrar ponto de venda"}
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {editing ? "Editar ponto de venda" : "Cadastrar novo ponto de venda"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Dados cadastrais (endereço, contato, status). Pedidos, produtos e faturamento vêm da importação da planilha e nunca são alterados aqui."
              : "Marcar um cliente já existente como ponto de venda não cria outro cadastro: o mesmo cliente passa a aparecer nesta aba com todo o histórico."}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          formularioManual
        ) : (
          <Tabs defaultValue="buscar">
            <TabsList>
              <TabsTrigger value="buscar">Buscar cliente existente</TabsTrigger>
              <TabsTrigger value="manual">Cadastrar manualmente</TabsTrigger>
            </TabsList>

            <TabsContent value="buscar" className="space-y-3">
              {!selecionado ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      className="pl-8"
                      placeholder="Buscar por nome fantasia, razão social, CPF/CNPJ ou código do cliente"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </div>
                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {resultados.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {busca ? "Nenhum cliente encontrado." : "Digite para buscar na base de clientes do CRM."}
                      </p>
                    )}
                    {resultados.map((p) => {
                      const st = salesIndex ? resolvePdvStats(salesIndex, p) : null;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelecionado(p)}
                          className="flex w-full items-center justify-between gap-3 rounded-md border p-2 text-left hover:bg-muted/60"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{p.nome_fantasia?.trim() || p.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[p.nome, p.cnpj, p.cidade, p.bairro, p.vendedor].filter(Boolean).join(" · ") || "—"}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              Última compra: {formatDate(st?.ultimoPedido ?? null)}
                            </p>
                          </div>
                          <Badge variant={p.is_ponto_venda ? "secondary" : "outline"} className="shrink-0">
                            {p.is_ponto_venda ? "Ponto de venda" : "Cliente comum"}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelecionado(null)}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para a busca
                  </Button>

                  <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
                    <Info label="Nome fantasia" value={selecionado.nome_fantasia || "—"} />
                    <Info label="Razão social" value={selecionado.nome} />
                    <Info label="Código do cliente" value={selecionado.codigo_cliente || "—"} />
                    <Info label="CPF/CNPJ" value={selecionado.cnpj || "—"} />
                    <Info label="Endereço" value={fullAddress(selecionado)} />
                    <Info label="Cidade / Bairro / UF" value={[selecionado.cidade, selecionado.bairro, selecionado.estado].filter(Boolean).join(" · ") || "—"} />
                    <Info label="Telefone" value={profilePhone(selecionado) || "—"} />
                    <Info label="WhatsApp" value={profileWhatsapp(selecionado) || "—"} />
                    <Info label="Vendedor" value={selecionado.vendedor || statsSelecionado?.vendedor || "—"} />
                    <Info label="Segmento" value={selecionado.segmento || "—"} />
                    <Info label="Último pedido" value={formatDate(statsSelecionado?.ultimoPedido ?? null)} />
                    <Info
                      label="Dias sem comprar"
                      value={
                        diasSemComprar(statsSelecionado?.ultimoPedido ?? null) === null
                          ? "Nunca comprou"
                          : String(diasSemComprar(statsSelecionado?.ultimoPedido ?? null))
                      }
                    />
                    <Info label="Pedidos" value={String(statsSelecionado?.pedidos ?? 0)} />
                    <Info label="Quantidade" value={formatKg(statsSelecionado?.kg ?? 0)} />
                    <Info label="Faturamento" value={formatCurrency(statsSelecionado?.faturamento ?? 0)} />
                    <Info
                      label="Produtos já comprados"
                      value={statsSelecionado?.produtos.map((p) => p.produto).join(", ") || "—"}
                    />
                  </div>

                  {camposFaltando.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Alguns dados cadastrais estão incompletos.</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p className="text-xs">
                          Faltando: {camposFaltando.join(", ")}. Você pode complementar agora — os dados atualizam o
                          mesmo cadastro principal do cliente.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Field label="Logradouro" value={form.rua} onChange={(v) => set("rua", v)} />
                          <Field label="Número" value={form.numero} onChange={(v) => set("numero", v)} />
                          <Field label="Bairro" value={form.bairro} onChange={(v) => set("bairro", v)} />
                          <Field label="Cidade" value={form.cidade} onChange={(v) => set("cidade", v)} />
                          <Field label="Estado" value={form.estado} onChange={(v) => set("estado", v)} />
                          <Field label="CEP" value={form.cep} onChange={(v) => set("cep", v)} />
                          <Field label="Telefone" value={form.telefone} onChange={(v) => set("telefone", v)} />
                          <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} />
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {selecionado.is_ponto_venda ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                      <p className="text-sm">
                        <Check className="mr-1 inline h-4 w-4" />
                        Este cliente já está cadastrado como ponto de venda.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          onVisualizar?.(selecionado);
                        }}
                      >
                        Visualizar ponto de venda
                      </Button>
                    </div>
                  ) : (
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                      <Button
                        disabled={saving}
                        onClick={() => {
                          const complementos = Object.fromEntries(
                            Object.entries({
                              rua: form.rua.trim(),
                              numero: form.numero.trim(),
                              bairro: form.bairro.trim(),
                              cidade: form.cidade.trim(),
                              estado: form.estado.trim(),
                              cep: form.cep.trim(),
                              telefone: form.telefone.trim(),
                              whatsapp: form.whatsapp.trim(),
                            }).filter(([, v]) => v !== ""),
                          );
                          void marcarComoPdv(selecionado, complementos);
                        }}
                      >
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        Adicionar como ponto de venda
                      </Button>
                    </DialogFooter>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-3">
              {formularioManual}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function fullAddressPreenchido(p: ClientProfile): boolean {
  return Boolean(String(p.rua ?? "").trim() && String(p.cidade ?? "").trim());
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-sm">{value || "—"}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
