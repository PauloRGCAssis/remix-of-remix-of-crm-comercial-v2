import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Lead, Visita } from "@/types/crm";
import { useCrm } from "@/contexts/CrmContext";
import { useActiveVendorNames } from "@/hooks/useVendors";
import { useClientProfiles, useUpsertClientProfile } from "@/hooks/useClientProfiles";
import { REGIONAIS_BH } from "@/data/bhBairrosRegionais";
import { buscarCep } from "@/lib/viacep";
import { matchBairroRegional } from "@/lib/bairroNormalization";
import { formatPhone } from "@/lib/phoneFormatting";

interface EditarVisitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visita: Visita | null;
  lead: Lead | null;
}

export function EditarVisitaDialog({ open, onOpenChange, visita, lead }: EditarVisitaDialogProps) {
  const { updateLead, updateVisita } = useCrm();
  const vendorNames = useActiveVendorNames();
  const { data: profiles } = useClientProfiles();
  const upsertProfile = useUpsertClientProfile();

  const [nome, setNome] = useState("");
  const [contatoNome, setContatoNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [regional, setRegional] = useState("");
  const [data, setData] = useState<Date | undefined>();
  const [horario, setHorario] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  // Matching profile (by name)
  const profile = useMemo(() => {
    if (!lead || !profiles) return null;
    const target = lead.nome_fantasia.trim().toLowerCase();
    return profiles.find(p => p.nome.trim().toLowerCase() === target) || null;
  }, [profiles, lead]);

  useEffect(() => {
    if (!open || !lead || !visita) return;
    setNome(lead.nome_fantasia || "");
    setContatoNome(lead.contato_nome || profile?.contatos?.[0]?.nome || "");
    setTelefone(lead.telefone || profile?.contatos?.[0]?.telefone || "");
    setWhatsapp(lead.whatsapp || profile?.contatos?.[0]?.whatsapp || "");
    setEmail(lead.email || profile?.contatos?.[0]?.email || "");
    setCep(lead.cep || profile?.cep || "");
    setRua(lead.endereco || profile?.rua || "");
    setNumero(lead.numero || profile?.numero || "");
    setComplemento(lead.complemento || profile?.complemento || "");
    setBairro(lead.bairro || profile?.bairro || "");
    setCidade(lead.cidade || profile?.cidade || "");
    setEstado(lead.estado || profile?.estado || "");
    setRegional(lead.regional || profile?.regiao || "");
    setData(visita.data_visita ? new Date(visita.data_visita + "T12:00:00") : undefined);
    setHorario(visita.horario_visita || lead.horario || "");
    setVendedor(lead.vendedor || profile?.vendedor || "");
    setObservacoes(visita.notas || "");
  }, [open, lead, visita, profile]);

  // Auto-resolve regional when bairro changes for BH
  useEffect(() => {
    const cidadeUpper = (cidade || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isBH = cidadeUpper === "BELO HORIZONTE" || cidadeUpper === "BH";
    if (isBH && bairro && !regional) {
      const m = matchBairroRegional(bairro);
      if (m.regional) setRegional(m.regional);
    }
  }, [bairro, cidade, regional]);

  const handleCepBlur = async () => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await buscarCep(clean);
      if (r) {
        if (!rua && r.rua) setRua(r.rua);
        if (!bairro && r.bairro) setBairro(r.bairro);
        if (!cidade && r.cidade) setCidade(r.cidade);
        if (!estado && r.estado) setEstado(r.estado);
        if (!regional && r.regiao) setRegional(r.regiao);
      }
    } catch {
      /* silent */
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    if (!lead || !visita) return;
    if (!nome.trim()) {
      toast({ title: "Nome do cliente é obrigatório", variant: "destructive" });
      return;
    }
    if (!data) {
      toast({ title: "Informe a data da visita", variant: "destructive" });
      return;
    }

    // Update lead
    updateLead(lead.id, {
      nome_fantasia: nome.trim(),
      contato_nome: contatoNome || undefined,
      telefone: telefone || undefined,
      whatsapp: whatsapp || undefined,
      email: email || undefined,
      cep: cep || undefined,
      endereco: rua || undefined,
      numero: numero || undefined,
      complemento: complemento || undefined,
      bairro: bairro || undefined,
      cidade: cidade || undefined,
      estado: estado || undefined,
      regional: regional || undefined,
      vendedor: vendedor || undefined,
      horario: horario || undefined,
    });

    // Update visit
    updateVisita(visita.id, {
      data_visita: format(data, "yyyy-MM-dd"),
      horario_visita: horario || undefined,
      notas: observacoes || undefined,
    });

    // Sync to client_profiles — only complement empty fields, never overwrite
    if (profile) {
      const patch: any = { ...profile };
      const setIfEmpty = (key: string, value: string) => {
        if (value && !patch[key]) patch[key] = value;
      };
      setIfEmpty("cep", cep);
      setIfEmpty("rua", rua);
      setIfEmpty("numero", numero);
      setIfEmpty("complemento", complemento);
      setIfEmpty("bairro", bairro);
      setIfEmpty("cidade", cidade);
      setIfEmpty("estado", estado);
      setIfEmpty("regiao", regional);
      setIfEmpty("vendedor", vendedor);
      // contato
      const contatos = Array.isArray(profile.contatos) ? [...profile.contatos] : [];
      if (contatos.length === 0 && (contatoNome || telefone || whatsapp || email)) {
        contatos.push({
          nome: contatoNome || "Principal",
          telefone: telefone || undefined,
          whatsapp: whatsapp || undefined,
          email: email || undefined,
        } as any);
      } else if (contatos[0]) {
        const c: any = { ...contatos[0] };
        if (contatoNome && !c.nome) c.nome = contatoNome;
        if (telefone && !c.telefone) c.telefone = telefone;
        if (whatsapp && !c.whatsapp) c.whatsapp = whatsapp;
        if (email && !c.email) c.email = email;
        contatos[0] = c;
      }
      patch.contatos = contatos;
      try {
        await upsertProfile.mutateAsync({ id: profile.id, data: patch });
      } catch (e) {
        // best-effort: lead is already updated
        console.warn("Profile sync failed", e);
      }
    }

    toast({ title: "✔ Visita atualizada — salvando…", description: "O topo da tela mostra quando estiver salva na nuvem." });
    onOpenChange(false);
  };

  if (!lead || !visita) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Editar Visita</DialogTitle>
          <DialogDescription>
            Atualize os dados do cliente e da visita. Campos preenchidos manualmente nunca são sobrescritos no cadastro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Cliente */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Dados do Cliente</h3>
            <div>
              <Label className="text-xs">Nome do cliente *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1 h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contato principal</Label>
                <Input value={contatoNome} onChange={e => setContatoNome(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input
                  value={telefone}
                  onChange={e => setTelefone(formatPhone(e.target.value) || e.target.value)}
                  placeholder="(31) 9999-9999"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  value={whatsapp}
                  onChange={e => setWhatsapp(formatPhone(e.target.value) || e.target.value)}
                  placeholder="(31) 99999-9999"
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </section>

          {/* Endereço */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">CEP</Label>
                <div className="relative mt-1">
                  <Input value={cep} onChange={e => setCep(e.target.value)} onBlur={handleCepBlur} placeholder="00000-000" className="h-9" />
                  {cepLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Rua</Label>
                <Input value={rua} onChange={e => setRua(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Número</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} className="mt-1 h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Complemento</Label>
                <Input value={complemento} onChange={e => setComplemento(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <Input value={bairro} onChange={e => setBairro(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Cidade</Label>
                <Input value={cidade} onChange={e => setCidade(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input value={estado} onChange={e => setEstado(e.target.value.toUpperCase().slice(0, 2))} className="mt-1 h-9" />
              </div>
              <div className="col-span-3">
                <Label className="text-xs">Região</Label>
                <Select value={regional || "__none__"} onValueChange={v => setRegional(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem região —</SelectItem>
                    {REGIONAIS_BH.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    {regional && !REGIONAIS_BH.includes(regional as any) && (
                      <SelectItem value={regional}>{regional}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Visita */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Dados da Visita</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 h-9", !data && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {data ? format(data, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={data} onSelect={setData} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Hora</Label>
                <Input type="time" value={horario} onChange={e => setHorario(e.target.value)} className="mt-1 h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Vendedor</Label>
                <Select value={vendedor || "__none__"} onValueChange={v => setVendedor(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione um vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem vendedor —</SelectItem>
                    {vendorNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} className="mt-1" rows={3} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsertProfile.isPending}>
            {upsertProfile.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
