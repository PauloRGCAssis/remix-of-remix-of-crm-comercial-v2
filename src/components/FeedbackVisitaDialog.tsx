import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon, Check, Clock, Plus, ThumbsUp, ThumbsDown, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { NegocioStatus, Justificativa, ProdutoNegociado, ProdutoCatalogo } from "@/types/crm";
import { CATALOGO_PRODUTOS, produtoSearchText } from "@/types/crm";
import { ProdutoCheckList } from "@/components/produtos/ProdutoCheckList";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadNome: string;
  leadProdutosInteresse?: string[];
  justificativas: Justificativa[];
  onNaoConcluida: () => void;
  onConcluir: (resultado: NegocioStatus, justificativaId?: string, motivo?: string, produtosNegociados?: ProdutoNegociado[]) => void;
  onReagendar: (novaData: string, notas?: string) => void;
  onAddJustificativa: (titulo: string) => Justificativa;
}

type Step = 'choose' | 'concluida_resultado' | 'fechado_produtos' | 'nao_fechado_justificativa' | 'reagendar';

export function FeedbackVisitaDialog({
  open, onOpenChange, leadNome, leadProdutosInteresse,
  justificativas, onNaoConcluida, onConcluir, onReagendar, onAddJustificativa,
}: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [motivo, setMotivo] = useState("");
  const [selectedJustificativaId, setSelectedJustificativaId] = useState("");
  const [newJustificativa, setNewJustificativa] = useState("");
  const [showNewJustificativa, setShowNewJustificativa] = useState(false);
  const [reagendarDate, setReagendarDate] = useState<Date>();
  const [reagendarNotas, setReagendarNotas] = useState("");
  
  // Products negotiated
  const [produtosNegociados, setProdutosNegociados] = useState<ProdutoNegociado[]>([]);

  const reset = () => {
    setStep('choose');
    setMotivo("");
    setSelectedJustificativaId("");
    setNewJustificativa("");
    setShowNewJustificativa(false);
    setReagendarDate(undefined);
    setReagendarNotas("");
    setProdutosNegociados([]);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleNaoConcluida = () => {
    onNaoConcluida();
    setStep('reagendar');
  };

  const handleFechado = () => {
    // Pre-populate with lead's produtos de interesse
    if (leadProdutosInteresse && leadProdutosInteresse.length > 0) {
      const initial = leadProdutosInteresse.map(pid => {
        const prod = CATALOGO_PRODUTOS.find(p => p.id === pid);
        return { produto_id: pid, produto_nome: prod?.nome || pid, preco: 0 };
      });
      setProdutosNegociados(initial);
    }
    setStep('fechado_produtos');
  };

  const handleConfirmFechado = () => {
    const validProdutos = produtosNegociados.filter(p => p.preco > 0);
    onConcluir('FECHADO', undefined, undefined, validProdutos.length > 0 ? validProdutos : undefined);
    handleClose();
  };

  const handleNaoFechado = () => {
    setStep('nao_fechado_justificativa');
  };

  const handleConfirmNaoFechado = () => {
    let justId = selectedJustificativaId;
    if (showNewJustificativa && newJustificativa.trim()) {
      const created = onAddJustificativa(newJustificativa.trim());
      justId = created.id;
    }
    onConcluir('NAO_FECHADO', justId || undefined, motivo || undefined);
    handleClose();
  };

  const handleReagendar = () => {
    if (!reagendarDate) return;
    onReagendar(format(reagendarDate, 'yyyy-MM-dd'), reagendarNotas || undefined);
    handleClose();
  };

  const toggleProduto = (prod: ProdutoCatalogo) => {
    setProdutosNegociados(prev => {
      const exists = prev.find(p => p.produto_id === prod.id);
      if (exists) return prev.filter(p => p.produto_id !== prod.id);
      return [...prev, { produto_id: prod.id, produto_nome: prod.nome, preco: 0 }];
    });
  };

  const updatePreco = (produtoId: string, preco: number) => {
    setProdutosNegociados(prev => prev.map(p => p.produto_id === produtoId ? { ...p, preco } : p));
  };

  const activeJustificativas = (justificativas ?? []).filter(j => j.ativo);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {step === 'choose' && 'Feedback da Visita'}
            {step === 'concluida_resultado' && 'Resultado do Negócio'}
            {step === 'fechado_produtos' && 'Produtos Negociados'}
            {step === 'nao_fechado_justificativa' && 'Justificativa'}
            {step === 'reagendar' && 'Reagendar Visita'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Status da visita */}
        {step === 'choose' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Lead: <strong>{leadNome}</strong></p>
            <p className="text-sm">Como foi a visita?</p>
            <div className="space-y-2">
              <Button className="w-full justify-start bg-success hover:bg-success/90 text-success-foreground" onClick={() => setStep('concluida_resultado')}>
                <Check className="h-4 w-4 mr-2" /> Concluída
              </Button>
              <Button variant="outline" className="w-full justify-start border-warning/30 text-warning hover:bg-warning/10" onClick={handleNaoConcluida}>
                <Clock className="h-4 w-4 mr-2" /> Não Concluída (adiar/reagendar)
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Fechado ou não? */}
        {step === 'concluida_resultado' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Lead: <strong>{leadNome}</strong></p>
            <p className="text-sm font-medium">O negócio foi fechado?</p>
            <div className="space-y-2">
              <Button className="w-full justify-start bg-success hover:bg-success/90 text-success-foreground" onClick={handleFechado}>
                <ThumbsUp className="h-4 w-4 mr-2" /> Sim, negócio fechado!
              </Button>
              <Button variant="outline" className="w-full justify-start border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleNaoFechado}>
                <ThumbsDown className="h-4 w-4 mr-2" /> Não fechou
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setStep('choose')}>← Voltar</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2b: Products + Price (when FECHADO) */}
        {step === 'fechado_produtos' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Lead: <strong>{leadNome}</strong></p>
            <p className="text-sm">Selecione os produtos negociados e informe o preço:</p>
            
            <ProdutoCheckList
              items={CATALOGO_PRODUTOS.filter(p => p.ativo).map(p => ({
                value: p.id,
                label: p.nome,
                searchText: produtoSearchText(p),
              }))}
              selected={produtosNegociados.map(pn => pn.produto_id)}
              onToggle={(id) => {
                const prod = CATALOGO_PRODUTOS.find(p => p.id === id);
                if (prod) toggleProduto(prod);
              }}
              maxHeightClass="max-h-56"
            />


            {produtosNegociados.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Preço negociado (R$/kg)</Label>
                {produtosNegociados.map(pn => (
                  <div key={pn.produto_id} className="flex items-center gap-2">
                    <span className="text-xs flex-1 min-w-0 truncate">{pn.produto_nome}</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="R$"
                      className="w-24 h-7 text-xs"
                      value={pn.preco || ''}
                      onChange={e => updatePreco(pn.produto_id, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('concluida_resultado')}>Voltar</Button>
              <Button onClick={handleConfirmFechado} disabled={produtosNegociados.length === 0}>
                Confirmar Fechamento
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Justificativa (quando não fechou) */}
        {step === 'nao_fechado_justificativa' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Lead: <strong>{leadNome}</strong></p>
            <div>
              <Label>Justificativa / Objeção *</Label>
              {!showNewJustificativa ? (
                <div className="space-y-2 mt-1">
                  <Select value={selectedJustificativaId} onValueChange={setSelectedJustificativaId}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione a justificativa" /></SelectTrigger>
                    <SelectContent>
                      {activeJustificativas.map(j => (
                        <SelectItem key={j.id} value={j.id}>{j.titulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => setShowNewJustificativa(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Criar nova justificativa
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 mt-1">
                  <Input
                    value={newJustificativa}
                    onChange={e => setNewJustificativa(e.target.value)}
                    placeholder="Digite a nova justificativa..."
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setShowNewJustificativa(false); setNewJustificativa(""); }}>
                    ← Voltar para lista
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Detalhes adicionais..." rows={2} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('concluida_resultado')}>Voltar</Button>
              <Button
                variant="destructive"
                onClick={handleConfirmNaoFechado}
                disabled={!selectedJustificativaId && !newJustificativa.trim()}
              >
                Registrar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Reagendar */}
        {step === 'reagendar' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">A visita foi marcada como não concluída. Escolha uma nova data:</p>
            <div>
              <Label>Nova data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !reagendarDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reagendarDate ? format(reagendarDate, "PPP", { locale: ptBR }) : "Selecione a nova data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reagendarDate}
                    onSelect={setReagendarDate}
                    
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={reagendarNotas} onChange={e => setReagendarNotas(e.target.value)} placeholder="Notas..." rows={2} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Fechar sem reagendar</Button>
              <Button onClick={handleReagendar} disabled={!reagendarDate}>Reagendar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
