import { useState, useEffect, useMemo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCrm } from "@/contexts/CrmContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { QuickCreateSelect } from "@/components/QuickCreateSelect";
import { DemandaFrequencia, Prospect, ProdutoConcorrente, CATALOGO_PRODUTOS, produtoSearchText, TipoAtendimento, TIPO_ATENDIMENTO_OPTIONS, SEGMENTOS, Segmento } from "@/types/crm";
import { ProdutoCheckList } from "@/components/produtos/ProdutoCheckList";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarIcon, CheckCircle2, Clock, HelpCircle, MapPin } from "lucide-react";
import { matchBairroRegional, addAuditLog, type RegionalMatchResult } from "@/lib/bairroNormalization";
import type { RegionalBH } from "@/data/bhBairrosRegionais";
import { cn } from "@/lib/utils";
import { inferEstadoFromCidade } from '@/lib/cidadeEstado';
import { usePersistentState } from "@/hooks/usePersistentState";

// ==================== FORM DATA ====================

interface FormData {
  empresa: string;
  segmento: string;
  agendadoPor: string;
  tipoAtendimento: string;
  contato: string;
  telefone: string;
  whatsapp: string;
  email: string;
  cidade: string;
  estado: string;
  bairro: string;
  endereco: string;
  complemento: string;
  demandaQuantidade: string;
  demandaFrequencia: DemandaFrequencia;
  paoQueijoTrabalha: string;
  paoQueijoMarca: string;
  paoQueijoValor: string;
  recheadoTrabalha: string;
  recheadoMarca: string;
  recheadoValor: string;
  empanadoTrabalha: string;
  empanadoMarca: string;
  empanadoValor: string;
  biscoitoTrabalha: string;
  biscoitoMarca: string;
  biscoitoValor: string;
  concorrente: string;
  valorConcorrente: string;
  produtosInteresse: string[];
  observacoes: string;
}

const emptyForm: FormData = {
  empresa: '', segmento: '', agendadoPor: '', tipoAtendimento: '', contato: '', telefone: '', whatsapp: '', email: '', cidade: '', estado: '', bairro: '', endereco: '', complemento: '',
  demandaQuantidade: '', demandaFrequencia: 'semanal',
  paoQueijoTrabalha: '', paoQueijoMarca: '', paoQueijoValor: '',
  recheadoTrabalha: '', recheadoMarca: '', recheadoValor: '',
  empanadoTrabalha: '', empanadoMarca: '', empanadoValor: '',
  biscoitoTrabalha: '', biscoitoMarca: '', biscoitoValor: '',
  concorrente: '', valorConcorrente: '', produtosInteresse: [], observacoes: '',
};

const INDICADO_POR_OPTIONS = ["Juliano", "Raiane", "Ana", "Fabiana", "Leonardo", "Adelfo", "Breno"] as const;

function prospectToForm(p: Prospect): FormData {
  return {
    empresa: p.empresa,
    segmento: (p as any).segmento || '',
    agendadoPor: (p as any).agendado_por || '',
    tipoAtendimento: p.tipo_atendimento || '',
    contato: p.contato || '',
    telefone: p.telefone || '',
    whatsapp: '',
    email: (p as any).email || '',
    cidade: p.cidade || '',
    estado: (p as any).estado || '',
    bairro: p.bairro || '',
    endereco: p.endereco || '',
    complemento: (p as any).complemento || '',
    demandaQuantidade: p.demandaQuantidade?.toString() || '',
    demandaFrequencia: p.demandaFrequencia || 'semanal',
    paoQueijoTrabalha: p.paoQueijo ? (p.paoQueijo.trabalha ? 'sim' : 'nao') : '',
    paoQueijoMarca: p.paoQueijo?.marca || '',
    paoQueijoValor: p.paoQueijo?.valorKg?.toString() || '',
    recheadoTrabalha: p.recheado ? (p.recheado.trabalha ? 'sim' : 'nao') : '',
    recheadoMarca: p.recheado?.marca || '',
    recheadoValor: p.recheado?.valorKg?.toString() || '',
    empanadoTrabalha: p.empanado ? (p.empanado.trabalha ? 'sim' : 'nao') : '',
    empanadoMarca: p.empanado?.marca || '',
    empanadoValor: p.empanado?.valorKg?.toString() || '',
    biscoitoTrabalha: p.biscoito ? (p.biscoito.trabalha ? 'sim' : 'nao') : '',
    biscoitoMarca: p.biscoito?.marca || '',
    biscoitoValor: p.biscoito?.valorKg?.toString() || '',
    concorrente: p.concorrente || '',
    valorConcorrente: p.valorConcorrente?.toString() || '',
    produtosInteresse: p.produtosInteresse || [],
    observacoes: p.observacoes || '',
  };
}

function parseProduto(trabalha: string, marca: string, valor: string): ProdutoConcorrente | undefined {
  if (!trabalha) return undefined;
  return {
    trabalha: trabalha === 'sim',
    marca: marca || undefined,
    valorKg: valor ? parseFloat(valor) : undefined,
  };
}

// ==================== REGIONAL STATUS UI ====================

function RegionalStatusIndicator({ matchResult, selectedRegional, onSelectRegional }: {
  matchResult: RegionalMatchResult | null;
  selectedRegional?: string;
  onSelectRegional: (regional: RegionalBH) => void;
}) {
  if (!matchResult) return null;

  const { regional_status, regional, matches, regional_confianca } = matchResult;

  if (regional_status === 'AUTO_OK' && regional) {
    return (
      <div className="flex items-center gap-2 mt-1.5 p-2 rounded-md bg-success/10 border border-success/20">
        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-success">Regional identificada automaticamente</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-success/30">{regional}</Badge>
            <span className="text-[10px] text-muted-foreground">Confiança: {(regional_confianca * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (regional_status === 'AUTO_AMBIGUO') {
    const uniqueRegionais = [...new Set(matches.map(m => m.regional))];
    return (
      <div className="mt-1.5 p-2 rounded-md bg-warning/10 border border-warning/20 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-warning">Bairro compartilhado entre regionais</p>
            <p className="text-[10px] text-muted-foreground">Selecione a regional correta:</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {uniqueRegionais.map(r => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={selectedRegional === r ? 'default' : 'outline'}
              className={cn("h-7 text-xs", selectedRegional === r && "ring-2 ring-primary/30")}
              onClick={() => onSelectRegional(r)}
            >
              <MapPin className="h-3 w-3 mr-1" />
              {r}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (regional_status === 'AUTO_NAO_ENCONTRADO') {
    return (
      <div className="flex items-center gap-2 mt-1.5 p-2 rounded-md bg-destructive/10 border border-destructive/20">
        <HelpCircle className="h-4 w-4 text-destructive flex-shrink-0" />
        <div>
          <p className="text-xs font-medium text-destructive">Bairro não encontrado na base oficial</p>
          <p className="text-[10px] text-muted-foreground">Revise a grafia ou selecione a regional manualmente abaixo.</p>
        </div>
      </div>
    );
  }

  return null;
}

// ==================== PRODUTO QUESTION ====================

function ProdutoQuestion({ label, form, prefixTrabalha, prefixMarca, prefixValor, idPrefix, onChange }: {
  label: string;
  form: FormData;
  prefixTrabalha: keyof FormData;
  prefixMarca: keyof FormData;
  prefixValor: keyof FormData;
  idPrefix: string;
  onChange: (key: keyof FormData, value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <RadioGroup value={form[prefixTrabalha] as string} onValueChange={v => onChange(prefixTrabalha, v)} className="flex gap-4">
        <div className="flex items-center gap-2"><RadioGroupItem value="sim" id={`${idPrefix}-sim`} /><Label htmlFor={`${idPrefix}-sim`}>Sim</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="nao" id={`${idPrefix}-nao`} /><Label htmlFor={`${idPrefix}-nao`}>Não</Label></div>
      </RadioGroup>
      {form[prefixTrabalha] === 'sim' && (
        <div className="grid grid-cols-2 gap-2 pl-2">
          <div>
            <Label className="text-xs text-muted-foreground">Marca atual</Label>
            <Input value={form[prefixMarca] as string} onChange={e => onChange(prefixMarca, e.target.value)} placeholder="Marca" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor (R$/kg)</Label>
            <Input type="number" step="0.01" value={form[prefixValor] as string} onChange={e => onChange(prefixValor, e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== MAIN DIALOG ====================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect?: Prospect | null;
  onSave: (data: Record<string, any>) => void;
  visitaDate?: string | null; // ISO date string of current visit (for AGENDADO leads)
  visitaHorario?: string | null;
  onVisitaDateChange?: (novaData: string, horario?: string) => void;
}

export function ProspectFormDialog({ open, onOpenChange, prospect, onSave, visitaDate, visitaHorario, onVisitaDateChange }: Props) {
  const { checkDuplicates } = useCrm();
  const [draftForm, setDraftForm] = usePersistentState<FormData>("prospeccao:prospect-form-draft", emptyForm);
  const [form, setForm] = useState<FormData>(draftForm);
  const [matchResult, setMatchResult] = useState<RegionalMatchResult | null>(null);
  const [manualRegional, setManualRegional] = useState<string>('');
  const [duplicateWarning, setDuplicateWarning] = useState<{ lead_nome: string; match_type: string }[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [editVisitaDate, setEditVisitaDate] = useState<Date | undefined>();
  const [editVisitaHorario, setEditVisitaHorario] = useState("");
  const isEdit = !!prospect;
  const indicadoPorOptions = useMemo(() => {
    if (form.agendadoPor && !INDICADO_POR_OPTIONS.includes(form.agendadoPor as (typeof INDICADO_POR_OPTIONS)[number])) {
      return [form.agendadoPor, ...INDICADO_POR_OPTIONS];
    }

    return [...INDICADO_POR_OPTIONS];
  }, [form.agendadoPor]);

  useEffect(() => {
    if (prospect) {
      setForm(prospectToForm(prospect));
      setManualRegional(prospect.regional || '');
    } else {
      setForm(draftForm);
      setManualRegional('');
    }
    setEditVisitaDate(visitaDate ? parseISO(visitaDate) : undefined);
    setEditVisitaHorario(visitaHorario || '');
    setMatchResult(null);
    setDuplicateWarning([]);
    setDuplicateConfirmed(false);
  }, [prospect, open, visitaDate, visitaHorario]);

  useEffect(() => {
    if (isEdit || !open) return;
    setDraftForm(form);
  }, [form, isEdit, open, setDraftForm]);

  // Debounced duplicate detection
  useEffect(() => {
    if (isEdit || !form.empresa.trim()) {
      setDuplicateWarning([]);
      return;
    }
    const timer = setTimeout(() => {
      const dupes = checkDuplicates(form.empresa, form.endereco, prospect?.id);
      setDuplicateWarning(dupes.map(d => ({ lead_nome: d.lead_nome, match_type: d.match_type })));
      if (dupes.length === 0) setDuplicateConfirmed(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.empresa, form.endereco, isEdit, checkDuplicates, prospect?.id]);

  // Check if city is BH (for regional matching logic)
  const isBH = useMemo(() => {
    const cidade = (form.cidade || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return !cidade || cidade === 'BELO HORIZONTE' || cidade === 'BH';
  }, [form.cidade]);

  // Debounced bairro matching
  useEffect(() => {
    // For non-BH cities, set regional = city name directly (even without bairro)
    if (!isBH && form.cidade?.trim()) {
      setMatchResult(null);
      setManualRegional(form.cidade.trim());
      return;
    }

    if (!form.bairro.trim()) {
      setMatchResult(null);
      setManualRegional('');
      return;
    }

    const timer = setTimeout(() => {
      const result = matchBairroRegional(form.bairro);
      setMatchResult(result);

      // Auto-set regional for AUTO_OK
      if (result.regional_status === 'AUTO_OK' && result.regional) {
        setManualRegional(result.regional);
      } else if (result.regional_status === 'AUTO_NAO_ENCONTRADO') {
        setManualRegional('');
      }
      // For AMBIGUO, keep manualRegional as user selection

      // Audit log
      addAuditLog({
        bairro_digitado: form.bairro,
        bairro_normalizado: result.bairro_normalizado,
        regional_status: result.regional_status,
        regional_resultado: result.regional,
        regionais_possiveis: result.matches.map(m => m.regional),
        acao: result.regional_status === 'AUTO_OK' ? 'auto_preenchido' : 'aguardando_resolucao',
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [form.bairro, isBH, form.cidade]);

  // When city changes: auto-fill estado and set regional for non-BH
  useEffect(() => {
    const cidadeTrimmed = form.cidade?.trim();
    if (cidadeTrimmed) {
      const estadoInferido = inferEstadoFromCidade(cidadeTrimmed);
      if (estadoInferido && form.estado !== estadoInferido) {
        setForm(f => ({ ...f, estado: estadoInferido }));
      }
    }
    if (!isBH && cidadeTrimmed) {
      setManualRegional(cidadeTrimmed);
      setMatchResult(null);
    } else if (isBH && !matchResult) {
      setManualRegional('');
    }
  }, [isBH, form.cidade]);

  const set = useCallback((key: keyof FormData, value: string | string[]) => {
    setForm(f => ({ ...f, [key]: value } as FormData));
  }, []);

  const handleInputChange = useCallback((key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    set(key, e.target.value);
  }, [set]);

  const handleSelectRegional = useCallback((regional: RegionalBH) => {
    setManualRegional(regional);
    addAuditLog({
      bairro_digitado: form.bairro,
      bairro_normalizado: matchResult?.bairro_normalizado || '',
      regional_status: 'MANUAL',
      regional_resultado: regional,
      regionais_possiveis: matchResult?.matches.map(m => m.regional),
      acao: 'selecao_manual_por_ambiguidade',
    });
  }, [form.bairro, matchResult]);

  const handleSubmit = () => {
    if (!form.empresa.trim()) return;
    // Block if duplicates found and not confirmed
    if (duplicateWarning.length > 0 && !duplicateConfirmed) return;
    const freqLabel = { semanal: 'semana', quinzenal: 'quinzena', mensal: 'mês' }[form.demandaFrequencia];
    const demandaStr = form.demandaQuantidade ? `${form.demandaQuantidade}kg/${freqLabel}` : undefined;

    // Determine regional status
    let regionalStatus = matchResult?.regional_status || 'AUTO_NAO_ENCONTRADO';
    let regionalConfianca = matchResult?.regional_confianca || 0;
    const finalRegional = manualRegional || undefined;

    // Non-BH cities: regional = city name, always AUTO_OK
    if (!isBH && manualRegional) {
      regionalStatus = 'AUTO_OK';
      regionalConfianca = 1.0;
    } else if (matchResult?.regional_status === 'AUTO_AMBIGUO' && manualRegional) {
      regionalStatus = 'MANUAL';
      regionalConfianca = 1.0;
    } else if (matchResult?.regional_status === 'AUTO_NAO_ENCONTRADO' && manualRegional) {
      regionalStatus = 'MANUAL';
      regionalConfianca = 1.0;
    }

    onSave({
      empresa: form.empresa,
      segmento: form.segmento || undefined,
      agendadoPor: form.agendadoPor || undefined,
      tipoAtendimento: form.tipoAtendimento || undefined,
      contato: form.contato || undefined,
      telefone: form.telefone || undefined,
      whatsapp: form.whatsapp || undefined,
      email: form.email || undefined,
      cidade: form.cidade || undefined,
      estado: form.estado || undefined,
      bairro: form.bairro || undefined,
      regional: finalRegional,
      regional_status: regionalStatus,
      regional_confianca: regionalConfianca,
      regional_fonte: 'BH_BAIRROS_REGIONAIS',
      endereco: form.endereco || undefined,
      complemento: form.complemento || undefined,
      demanda: demandaStr,
      demandaQuantidade: form.demandaQuantidade ? parseFloat(form.demandaQuantidade) : undefined,
      demandaFrequencia: form.demandaFrequencia,
      paoQueijo: parseProduto(form.paoQueijoTrabalha, form.paoQueijoMarca, form.paoQueijoValor),
      recheado: parseProduto(form.recheadoTrabalha, form.recheadoMarca, form.recheadoValor),
      empanado: parseProduto(form.empanadoTrabalha, form.empanadoMarca, form.empanadoValor),
      biscoito: parseProduto(form.biscoitoTrabalha, form.biscoitoMarca, form.biscoitoValor),
      concorrente: form.concorrente || undefined,
      valorConcorrente: form.valorConcorrente ? parseFloat(form.valorConcorrente) : undefined,
      produtosInteresse: form.produtosInteresse.length > 0 ? form.produtosInteresse : undefined,
      observacoes: form.observacoes || undefined,
    });
    // If visit date was changed, call the callback
    if (onVisitaDateChange && editVisitaDate) {
      const newDateStr = format(editVisitaDate, 'yyyy-MM-dd');
      if (newDateStr !== visitaDate || editVisitaHorario !== (visitaHorario || '')) {
        onVisitaDateChange(newDateStr, editVisitaHorario || undefined);
      }
    }

    onOpenChange(false);
    if (!isEdit) setDraftForm(emptyForm);
  };

  const REGIONAIS_MANUAIS: RegionalBH[] = ['Barreiro', 'Centro-Sul', 'Leste', 'Nordeste', 'Noroeste', 'Norte', 'Oeste', 'Pampulha', 'Venda Nova'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEdit ? 'Editar Prospecção' : 'Nova Prospecção'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Empresa *</Label>
            <Input value={form.empresa} onChange={handleInputChange('empresa')} placeholder="Nome da empresa" />
          </div>
          <div>
            <Label>Segmento</Label>
            <QuickCreateSelect
              tipo="segmento"
              value={form.segmento}
              onChange={(v) => set('segmento', v)}
              baseOptions={SEGMENTOS}
              emptyLabel="Não informado"
              placeholder="Selecione o segmento"
              createLabel="Cadastrar novo segmento"
            />
          </div>
          {duplicateWarning.length > 0 && !isEdit && (
            <div className="p-3 rounded-md bg-warning/10 border border-warning/30 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                <p className="text-xs font-medium text-warning">Possível(is) duplicata(s) encontrada(s):</p>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 pl-6">
                {duplicateWarning.map((d, i) => (
                  <li key={i}>• <strong>{d.lead_nome}</strong> ({d.match_type === 'ambos' ? 'nome e endereço' : d.match_type === 'nome' ? 'nome similar' : 'mesmo endereço'})</li>
                ))}
              </ul>
              <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setDuplicateConfirmed(true)}>
                Não é duplicata, continuar cadastro
              </Button>
            </div>
          )}
          <div>
            <Label>Indicado por</Label>
            <QuickCreateSelect
              tipo="indicado"
              value={form.agendadoPor}
              onChange={(v) => set('agendadoPor', v)}
              baseOptions={indicadoPorOptions}
              emptyLabel="Não informado"
              placeholder="Selecione o nome"
              createLabel="Cadastrar novo nome"
            />
          </div>
          <div>
            <Label>Tipo de Atendimento</Label>
            <Select value={form.tipoAtendimento} onValueChange={v => set('tipoAtendimento', v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                {TIPO_ATENDIMENTO_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.icon} {o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Visit date editing for AGENDADO leads - right after Tipo de Atendimento */}
          {onVisitaDateChange && (
            <div className="space-y-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
              <Label className="text-sm font-semibold">📅 Data do Agendamento</Label>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editVisitaDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editVisitaDate ? format(editVisitaDate, "PPP", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editVisitaDate}
                      onSelect={setEditVisitaDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Horário</Label>
                <div className="relative mt-1">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={editVisitaHorario}
                    onChange={e => setEditVisitaHorario(e.target.value)}
                    className="pl-10"
                    placeholder="08:00"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contato</Label><Input value={form.contato} onChange={handleInputChange('contato')} placeholder="Nome do contato" /></div>
            <div><Label>Telefone fixo</Label><Input value={form.telefone} onChange={handleInputChange('telefone')} placeholder="(00) 0000-0000" /></div>
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={handleInputChange('whatsapp')} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={handleInputChange('email')} placeholder="email@exemplo.com" />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input value={form.endereco} onChange={handleInputChange('endereco')} placeholder="Rua, número" />
          </div>
          <div>
            <Label>Complemento</Label>
            <Input value={form.complemento} onChange={handleInputChange('complemento')} placeholder="Apartamento, sala, loja, bloco, referência…" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={handleInputChange('bairro')} placeholder="Digite o bairro" />
            </div>
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={handleInputChange('cidade')} placeholder="Ex: Belo Horizonte" /></div>
            <div>
              <Label>Estado</Label>
              <Input value={form.estado} readOnly placeholder="Auto" className="bg-muted/50 cursor-default" />
            </div>
          </div>

          {/* Regional field - auto-filled */}
          <div>
            <Label>Regional</Label>
            <div className="flex items-center gap-2">
              <Input
                value={manualRegional}
                readOnly
                placeholder="Preenchido automaticamente pelo bairro"
                className="bg-muted/50 cursor-default"
              />
              {matchResult?.regional_status === 'AUTO_NAO_ENCONTRADO' || matchResult?.regional_status === 'AUTO_AMBIGUO' ? (
                <Select value={manualRegional} onValueChange={v => {
                  setManualRegional(v);
                  if (matchResult) {
                    addAuditLog({
                      bairro_digitado: form.bairro,
                      bairro_normalizado: matchResult.bairro_normalizado || '',
                      regional_status: 'MANUAL',
                      regional_resultado: v as RegionalBH,
                      regionais_possiveis: matchResult.matches.map(m => m.regional),
                      acao: 'selecao_manual',
                    });
                  }
                }}>
                  <SelectTrigger className="w-48 flex-shrink-0"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {matchResult?.regional_status === 'AUTO_AMBIGUO'
                      ? [...new Set(matchResult.matches.map(m => m.regional))].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)
                      : REGIONAIS_MANUAIS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            <RegionalStatusIndicator
              matchResult={matchResult}
              selectedRegional={manualRegional}
              onSelectRegional={handleSelectRegional}
            />
          </div>

          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produtos que o cliente trabalha</p>

          <ProdutoQuestion label="Trabalha com pão de queijo?" form={form} prefixTrabalha="paoQueijoTrabalha" prefixMarca="paoQueijoMarca" prefixValor="paoQueijoValor" idPrefix="pq" onChange={set} />
          <ProdutoQuestion label="Trabalha com recheado?" form={form} prefixTrabalha="recheadoTrabalha" prefixMarca="recheadoMarca" prefixValor="recheadoValor" idPrefix="rec" onChange={set} />
          <ProdutoQuestion label="Trabalha com empanado?" form={form} prefixTrabalha="empanadoTrabalha" prefixMarca="empanadoMarca" prefixValor="empanadoValor" idPrefix="emp" onChange={set} />
          <ProdutoQuestion label="Trabalha com biscoito?" form={form} prefixTrabalha="biscoitoTrabalha" prefixMarca="biscoitoMarca" prefixValor="biscoitoValor" idPrefix="bis" onChange={set} />

          <Separator />

          <div>
            <Label>Produtos de interesse</Label>
            <div className="mt-1">
              <ProdutoCheckList
                items={CATALOGO_PRODUTOS.filter(p => p.ativo).map(p => ({
                  value: p.id,
                  label: p.nome,
                  searchText: produtoSearchText(p),
                }))}
                selected={form.produtosInteresse}
                onToggle={(id, checked) =>
                  set('produtosInteresse', checked
                    ? [...form.produtosInteresse, id]
                    : form.produtosInteresse.filter((x: string) => x !== id))
                }
                maxHeightClass="max-h-40"
              />
            </div>

            {form.produtosInteresse.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{form.produtosInteresse.length} produto(s) selecionado(s)</p>
            )}
          </div>
          <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={handleInputChange('observacoes')} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.empresa.trim()}>{isEdit ? 'Salvar' : 'Adicionar Lead'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
