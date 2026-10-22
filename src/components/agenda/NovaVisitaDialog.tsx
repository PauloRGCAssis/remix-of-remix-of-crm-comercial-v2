import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Clock, Search, X, Check, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { TipoAtendimento, TIPO_ATENDIMENTO_OPTIONS, Lead } from "@/types/crm";
import { useCrm } from "@/contexts/CrmContext";
import { useSalesData, getLastPurchaseByClient, shortVendedorName } from "@/hooks/useSalesData";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useActiveVendorNames } from "@/hooks/useVendors";
import { calcularStatusCliente } from "@/lib/clientStatusRule";
import { normalizeClientName } from "@/lib/clientNameNormalization";

type ClientStatus = "ativo" | "atencao" | "critico" | "inativo" | "prospect";

interface CandidateClient {
  canonicalName: string;
  source: "lead" | "base";
  leadId?: string;
  status: ClientStatus;
  vendedor?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  regional?: string;
  cnpj?: string;
  contato_nome?: string;
  telefone?: string;
  whatsapp?: string;
  diasSemComprar?: number;
}

function normalize(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function statusLabel(s: ClientStatus): { label: string; cls: string } {
  if (s === "ativo") return { label: "Em dia", cls: "bg-success/15 text-success border-success/40" };
  if (s === "atencao") return { label: "Atenção", cls: "bg-warning/20 text-warning border-warning/50" };
  if (s === "critico") return { label: "Crítico", cls: "bg-destructive/15 text-destructive border-destructive/40" };
  if (s === "inativo") return { label: "Inativo", cls: "bg-destructive/10 text-destructive border-destructive/30" };
  return { label: "Prospecção", cls: "bg-primary/10 text-primary border-primary/30" };
}

interface NovaVisitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a client by canonical name (used by Análise de Clientes "Agendar Visita") */
  initialClientName?: string;
}

export function NovaVisitaDialog({ open, onOpenChange, initialClientName }: NovaVisitaDialogProps) {
  const { leads, addLead, updateLead, agendarVisita, reagendarVisita } = useCrm();
  const { data: allSales } = useSalesData();
  const { data: profiles } = useClientProfiles();
  const vendorNames = useActiveVendorNames();

  // Build candidate list — unified base + prospect leads, deduped by canonical name
  const candidates = useMemo<CandidateClient[]>(() => {
    const map = new Map<string, CandidateClient>();
    const today = new Date();
    const lastPurchase = allSales ? getLastPurchaseByClient(allSales) : new Map<string, Date>();

    // From sales base
    if (allSales) {
      const seenVendedor = new Map<string, string>();
      allSales.forEach(s => {
        if (!seenVendedor.has(s.cliente)) seenVendedor.set(s.cliente, shortVendedorName(s.vendedor));
      });
      lastPurchase.forEach((date, nome) => {
        const days = Math.floor((today.getTime() - date.getTime()) / 86400000);
        map.set(normalize(nome), {
          canonicalName: nome,
          source: "base",
          status: calcularStatusCliente(days) as ClientStatus,
          vendedor: seenVendedor.get(nome),
          diasSemComprar: days,
        });
      });
    }

    // From client_profiles — enrich (address, contact, cnpj)
    (profiles ?? []).forEach(p => {
      const key = normalize(p.nome);
      const contato = (p.contatos && p.contatos[0]) || undefined;
      const enrichment: Partial<CandidateClient> = {
        endereco: p.rua,
        numero: p.numero,
        complemento: p.complemento,
        bairro: p.bairro,
        cidade: p.cidade,
        estado: p.estado,
        regional: p.regiao,
        cnpj: p.cnpj,
        contato_nome: contato?.nome,
        telefone: contato?.telefone,
        whatsapp: contato?.whatsapp,
        vendedor: p.vendedor,
      };
      const existing = map.get(key);
      if (existing) {
        Object.assign(existing, Object.fromEntries(Object.entries(enrichment).filter(([, v]) => v != null && v !== "")));
      } else {
        map.set(key, {
          canonicalName: p.nome,
          source: "base",
          status: "inativo",
          ...enrichment,
        });
      }
    });

    // From leads (prospecção) — keep separate entries with leadId reference
    leads.forEach(l => {
      if (!l.nome_fantasia) return;
      const key = normalize(l.nome_fantasia);
      const isBaseLead = l.origem === "BASE";
      const existing = map.get(key);
      if (existing && isBaseLead) {
        // link existing base candidate to its lead
        existing.leadId = l.id;
        existing.contato_nome = existing.contato_nome || l.contato_nome;
        existing.telefone = existing.telefone || l.telefone;
        existing.whatsapp = existing.whatsapp || l.whatsapp;
        existing.endereco = existing.endereco || l.endereco;
        existing.bairro = existing.bairro || l.bairro;
        existing.cidade = existing.cidade || l.cidade;
        existing.estado = existing.estado || l.estado;
        existing.regional = existing.regional || l.regional;
        return;
      }
      if (!existing) {
        map.set(key, {
          canonicalName: l.nome_fantasia,
          source: isBaseLead ? "base" : "lead",
          leadId: l.id,
          status: isBaseLead ? "inativo" : "prospect",
          vendedor: l.vendedor,
          endereco: l.endereco,
          numero: l.numero,
          complemento: l.complemento,
          bairro: l.bairro,
          cidade: l.cidade,
          estado: l.estado,
          regional: l.regional,
          contato_nome: l.contato_nome,
          telefone: l.telefone,
          whatsapp: l.whatsapp,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "pt-BR"));
  }, [allSales, profiles, leads]);

  // Form state
  const [batchMode, setBatchMode] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [date, setDate] = useState<Date | undefined>();
  const [horario, setHorario] = useState("");
  const [vendedor, setVendedor] = useState<string>("");
  const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>("visita_externa");
  const [notas, setNotas] = useState("");

  // Reset when dialog opens / preselect
  useEffect(() => {
    if (!open) return;
    setBatchMode(false);
    setSearch("");
    setDate(undefined);
    setHorario("");
    setVendedor("");
    setTipoAtendimento("visita_externa");
    setNotas("");
    if (initialClientName) {
      const canonical = normalizeClientName(initialClientName);
      const key = normalize(canonical);
      setSelectedKeys([key]);
      // also set vendedor default from candidate
      const c = candidates.find(x => normalize(x.canonicalName) === key);
      if (c?.vendedor) setVendedor(c.vendedor);
    } else {
      setSelectedKeys([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClientName]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return candidates.slice(0, 50);
    return candidates.filter(c => {
      const hay = [
        c.canonicalName, c.bairro, c.cidade, c.regional, c.cnpj,
        c.contato_nome, c.endereco,
      ].map(normalize).join(" | ");
      return hay.includes(q);
    }).slice(0, 100);
  }, [candidates, search]);

  const toggleSelect = (key: string) => {
    if (batchMode) {
      setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    } else {
      setSelectedKeys([key]);
      const c = candidates.find(x => normalize(x.canonicalName) === key);
      if (c?.vendedor && !vendedor) setVendedor(c.vendedor);
    }
  };

  const selectedCandidates = useMemo(
    () => selectedKeys.map(k => candidates.find(c => normalize(c.canonicalName) === k)).filter(Boolean) as CandidateClient[],
    [selectedKeys, candidates],
  );

  const handleConfirm = () => {
    if (selectedCandidates.length === 0) {
      toast({ title: "Selecione ao menos um cliente", variant: "destructive" });
      return;
    }
    if (!date) {
      toast({ title: "Informe a data da visita", variant: "destructive" });
      return;
    }
    const dataStr = format(date, "yyyy-MM-dd");
    let created = 0;
    selectedCandidates.forEach(c => {
      let leadId = c.leadId;
      if (!leadId) {
        // Create a new lead for the base client
        const newLead = addLead({
          nome_fantasia: c.canonicalName,
          origem: "BASE",
          vendedor: vendedor || c.vendedor,
          tipo_atendimento: tipoAtendimento,
          endereco: c.endereco,
          numero: c.numero,
          complemento: c.complemento,
          bairro: c.bairro,
          cidade: c.cidade,
          estado: c.estado,
          regional: c.regional,
          contato_nome: c.contato_nome,
          telefone: c.telefone,
          whatsapp: c.whatsapp,
        });
        leadId = newLead.id;
      } else if (vendedor || tipoAtendimento) {
        updateLead(leadId, { vendedor: vendedor || c.vendedor, tipo_atendimento: tipoAtendimento });
      }
      const hasActive = leads.find(l => l.id === leadId)?.status_pipeline === "AGENDADO";
      if (hasActive) {
        reagendarVisita(leadId, dataStr, horario || undefined, notas || undefined);
      } else {
        agendarVisita(leadId, dataStr, horario || undefined, notas || undefined);
      }
      created++;
    });
    toast({
      title: created > 1 ? `🎯 ${created} visitas agendadas!` : "✔ Visita agendada!",
      description: `Para ${format(date, "dd/MM/yyyy", { locale: ptBR })}${horario ? ` às ${horario}` : ""}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Nova Visita</DialogTitle>
          <DialogDescription>
            Agende visitas para clientes da Prospecção ou da Base (Ativos, Atenção, Críticos, Inativos).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Batch toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">Cliente(s)</Label>
            <Button
              type="button"
              variant={batchMode ? "default" : "outline"}
              size="sm"
              onClick={() => { setBatchMode(!batchMode); if (batchMode) setSelectedKeys(selectedKeys.slice(0, 1)); }}
              className="h-7 text-xs gap-1"
            >
              <Users className="h-3 w-3" />
              {batchMode ? "Modo lote ativo" : "Selecionar vários clientes"}
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nome, cidade, bairro, região, CNPJ ou contato..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Selected chips */}
          {selectedCandidates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded border bg-muted/30">
              {selectedCandidates.map(c => {
                const sl = statusLabel(c.status);
                return (
                  <Badge key={c.canonicalName} variant="outline" className={cn("gap-1 pl-2 pr-1 py-1", sl.cls)}>
                    <span className="text-xs">{c.canonicalName}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(prev => prev.filter(k => k !== normalize(c.canonicalName)))}
                      className="hover:bg-background/40 rounded p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Suggestions list */}
          <div className="border rounded max-h-64 overflow-y-auto divide-y">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">Nenhum cliente encontrado.</div>
            ) : filtered.map(c => {
              const key = normalize(c.canonicalName);
              const isSelected = selectedKeys.includes(key);
              const sl = statusLabel(c.status);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => toggleSelect(key)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-muted/40 transition-colors flex items-start gap-2",
                    isSelected && "bg-primary/5",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5",
                    isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input",
                  )}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{c.canonicalName}</span>
                      <Badge variant="outline" className={cn("text-[10px] h-4", sl.cls)}>{sl.label}</Badge>
                      {c.source === "lead" && (
                        <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/30">Prospecção</Badge>
                      )}
                      {c.source === "base" && (
                        <Badge variant="outline" className="text-[10px] h-4 bg-muted text-muted-foreground border-border">Base</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {[c.bairro, c.cidade, c.regional].filter(Boolean).join(" • ")}
                      {c.vendedor && ` — ${c.vendedor}`}
                      {typeof c.diasSemComprar === "number" && ` • ${c.diasSemComprar}d s/ comprar`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Date, Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 h-9", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <div className="relative mt-1">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="time" value={horario} onChange={e => setHorario(e.target.value)} className="pl-9 h-9" />
              </div>
            </div>
          </div>

          {/* Vendedor */}
          <div>
            <Label className="text-xs">Vendedor</Label>
            <Select value={vendedor || "__none__"} onValueChange={v => setVendedor(v === "__none__" ? "" : v)}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue placeholder="Selecione um vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sem vendedor —</SelectItem>
                {vendorNames.map(n => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo */}
          <div>
            <Label className="text-xs">Tipo de atendimento</Label>
            <RadioGroup
              value={tipoAtendimento}
              onValueChange={v => setTipoAtendimento(v as TipoAtendimento)}
              className="flex gap-3 mt-2"
            >
              {TIPO_ATENDIMENTO_OPTIONS.map(opt => (
                <div key={opt.value} className="flex items-center space-x-1.5">
                  <RadioGroupItem value={opt.value} id={`nv-tipo-${opt.value}`} />
                  <Label htmlFor={`nv-tipo-${opt.value}`} className="text-xs font-normal cursor-pointer">
                    {opt.icon} {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Notas */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} className="mt-1" placeholder="Notas sobre a visita..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={selectedCandidates.length === 0 || !date}>
            {selectedCandidates.length > 1 ? `Agendar ${selectedCandidates.length} visitas` : "Agendar visita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
