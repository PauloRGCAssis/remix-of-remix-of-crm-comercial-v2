import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSalesData } from "@/hooks/useSalesData";
import { useClientAliases } from "@/hooks/useClientAliases";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import {
  detectDuplicateCandidates,
  pairKey,
  confidenceLabel,
  type DuplicateCandidate,
  type ClienteMeta,
} from "@/lib/clientAliasResolver";
import { AppLayout } from "@/components/AppLayout";
import { CnpjAuditPanel } from "@/components/clientes/CnpjAuditPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClientAnalysisAuditPanel } from "@/components/clientes/ClientAnalysisAuditPanel";
import { Search, Merge, X, Clock, Wand2, RefreshCcw, ChevronRight, Sparkles, CheckCheck, SplitSquareHorizontal, EyeOff } from "lucide-react";
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
import { toast } from "sonner";

interface ClienteStats extends ClienteMeta {
  ultimaCompra: string;
  faturamento: number;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function daysSince(date?: string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function confidenceVariant(conf: number): "default" | "secondary" | "outline" {
  if (conf >= 0.9) return "default";
  if (conf >= 0.75) return "secondary";
  return "outline";
}

export default function ClientesDuplicadosPage() {
  const { data: sales = [], isLoading: loadingSales, refetch } = useSalesData();
  const { data: profiles = [] } = useClientProfiles();
  const qc = useQueryClient();
  const { aliases, decisions, isLoading: loadingAliases, addAlias, setDecision, removeAlias, excludedClients, restoreClient } =
    useClientAliases();
  const { podeEditar, podeExcluir } = useModuleCrud("clientes_duplicados", "clientes duplicados");
  const [busca, setBusca] = useState("");
  const [pendingUnify, setPendingUnify] = useState<{ candidate: DuplicateCandidate; canonical: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIdx, setWizardIdx] = useState(0);
  const [auditRunAt, setAuditRunAt] = useState<Date | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"group" | "separate">("group");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<
    | { mode: "group"; applied: number; failed: number; aliases: number; remaining: number }
    | { mode: "separate"; applied: number; failed: number }
    | null
  >(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideBranches, setHideBranches] = useState(true);
  const [tab, setTab] = useState("duplicados");


  // Stats + meta por cliente
  const stats = useMemo(() => {
    const map = new Map<string, ClienteStats>();
    for (const s of sales) {
      const k = s.cliente;
      if (!k) continue;
      const entry = map.get(k) ?? { ultimaCompra: "", faturamento: 0 };
      entry.faturamento += Number(s.preco_total) || 0;
      entry.vendedor = s.vendedor || entry.vendedor;
      if (!entry.ultimaCompra || new Date(s.data) > new Date(entry.ultimaCompra)) {
        entry.ultimaCompra = s.data;
      }
      map.set(k, entry);
    }
    // Enriquecer com client_profiles (telefone/CNPJ/bairro/cidade)
    for (const p of profiles) {
      const nome = (p as any).nome || (p as any).nome_fantasia;
      if (!nome) continue;
      const entry = map.get(nome);
      if (!entry) continue;
      entry.bairro = (p as any).bairro || (p as any).entrega_bairro || entry.bairro;
      entry.cidade = (p as any).cidade || (p as any).entrega_cidade || entry.cidade;
      entry.cnpj = (p as any).cnpj || entry.cnpj;
      const contatos: any[] = Array.isArray((p as any).contatos) ? (p as any).contatos : [];
      const tel = contatos.find((c) => c?.telefone)?.telefone;
      if (tel) entry.telefone = tel;
    }
    return map;
  }, [sales, profiles]);



  const decidedSet = useMemo(() => {
    const set = new Set<string>();
    for (const d of decisions) {
      if (d.decisao !== "perguntar_depois") set.add(pairKey(d.cliente_a, d.cliente_b));
    }
    return set;
  }, [decisions]);

  const metas = useMemo(() => {
    const m = new Map<string, ClienteMeta>();
    for (const [k, v] of stats.entries()) {
      m.set(k, {
        vendedor: v.vendedor,
        bairro: v.bairro,
        cidade: v.cidade,
        telefone: v.telefone,
        cnpj: v.cnpj,
        ultimaCompra: v.ultimaCompra,
        faturamento: v.faturamento,
      });
    }
    return m;
  }, [stats]);

  const allCandidates = useMemo(() => {
    const clientes = Array.from(stats.keys());
    return detectDuplicateCandidates(clientes, { decidedPairs: decidedSet, metas });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, decidedSet, metas, auditRunAt]);

  // Duplicados reais: confiança ≥95% E não-filial. Demais vão para "Redes/Filiais".
  const candidates = useMemo(
    () => allCandidates.filter((c) => c.confidence >= 0.95 && !c.possibleBranch),
    [allCandidates],
  );

  const redesFiliais = useMemo(
    () => allCandidates.filter((c) => c.possibleBranch || c.confidence < 0.95),
    [allCandidates],
  );

  const branchHiddenCount = redesFiliais.length;

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let list = candidates;
    if (!q) return list;
    return list.filter(
      (c) => c.clienteA.toLowerCase().includes(q) || c.clienteB.toLowerCase().includes(q),
    );
  }, [candidates, busca]);

  const filteredRedes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return redesFiliais;
    return redesFiliais.filter(
      (c) => c.clienteA.toLowerCase().includes(q) || c.clienteB.toLowerCase().includes(q),
    );
  }, [redesFiliais, busca]);

  const counts = useMemo(() => {
    let auto = 0;
    for (const c of candidates) if (c.autoSuggested) auto++;
    return { alta: candidates.length, media: 0, baixa: 0, auto };
  }, [candidates]);

  function openUnify(candidate: DuplicateCandidate) {
    setPendingUnify({ candidate, canonical: candidate.canonicalSuggested ?? candidate.clienteA });
  }

  async function confirmUnify() {
    if (!pendingUnify) return;
    const { candidate, canonical } = pendingUnify;
    const alias = canonical === candidate.clienteA ? candidate.clienteB : candidate.clienteA;
    try {
      await addAlias.mutateAsync({
        canonical,
        alias,
        motivo: candidate.motivos.join(", "),
      });
      await setDecision.mutateAsync({ a: candidate.clienteA, b: candidate.clienteB, decisao: "unificar" });
      toast.success("Clientes agrupados. Análises serão recalculadas.");
      setPendingUnify(null);
      if (wizardOpen) advanceWizard();
    } catch (e: any) {
      toast.error("Falha ao unificar: " + (e?.message ?? e));
    }
  }

  async function keepSeparate(c: DuplicateCandidate) {
    try {
      await setDecision.mutateAsync({ a: c.clienteA, b: c.clienteB, decisao: "manter_separados" });
      toast.success("Mantidos separados.");
      if (wizardOpen) advanceWizard();
    } catch (e: any) { toast.error("Erro: " + (e?.message ?? e)); }
  }

  async function askLater(c: DuplicateCandidate) {
    try {
      await setDecision.mutateAsync({ a: c.clienteA, b: c.clienteB, decisao: "perguntar_depois" });
      if (wizardOpen) advanceWizard();
    } catch (e: any) { toast.error("Erro: " + (e?.message ?? e)); }
  }

  function advanceWizard() {
    setWizardIdx((i) => i + 1);
  }

  function startWizard() {
    if (candidates.length === 0) {
      toast.message("Nenhum candidato pendente.");
      return;
    }
    setWizardIdx(0);
    setWizardOpen(true);
  }

  async function runAudit() {
    setAuditRunAt(new Date());
    await refetch();
    toast.success(`Auditoria concluída — ${candidates.length} pares analisados.`);
  }

  const autoCandidates = useMemo(
    () => candidates.filter((c) => c.autoSuggested && c.canonicalSuggested),
    [candidates],
  );

  const selectableCandidates = filtered;

  const selectedCandidates = useMemo(
    () => filtered.filter((c) => selected.has(pairKey(c.clienteA, c.clienteB))),
    [filtered, selected],
  );

  const selectedGroupable = useMemo(
    () => selectedCandidates.filter((c) => !!c.canonicalSuggested),
    [selectedCandidates],
  );

  function toggleOne(c: DuplicateCandidate, checked: boolean) {
    const k = pairKey(c.clienteA, c.clienteB);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(k);
      else next.delete(k);
      return next;
    });
  }

  function selectAllAutoSuggested() {
    const next = new Set<string>();
    for (const c of filtered) {
      if (c.autoSuggested && c.canonicalSuggested) {
        next.add(pairKey(c.clienteA, c.clienteB));
      }
    }
    setSelected(next);
  }

  function selectAllFiltered() {
    const next = new Set<string>();
    for (const c of filtered) {
      next.add(pairKey(c.clienteA, c.clienteB));
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openBulkConfirm(mode: "group" | "separate") {
    setBulkMode(mode);
    setBulkConfirmOpen(true);
  }

  async function runBulk() {
    setBulkRunning(true);
    let applied = 0;
    let failed = 0;
    if (bulkMode === "group") {
      for (const c of selectedGroupable) {
        const canonical = c.canonicalSuggested!;
        const alias = canonical === c.clienteA ? c.clienteB : c.clienteA;
        try {
          await addAlias.mutateAsync({
            canonical,
            alias,
            motivo: ["aplicado em massa", ...c.motivos].join(", "),
          });
          await setDecision.mutateAsync({ a: c.clienteA, b: c.clienteB, decisao: "unificar" });
          applied++;
        } catch {
          failed++;
        }
      }
      const uniqueClients = new Set(Array.from(stats.keys()));
      for (const a of aliases) uniqueClients.delete(a.alias_name);
      setBulkSummary({
        mode: "group",
        applied,
        failed,
        aliases: applied,
        remaining: uniqueClients.size - applied,
      });
      if (applied > 0) toast.success(`${applied} agrupamento(s) aplicado(s).`);
      if (failed > 0) toast.error(`${failed} agrupamento(s) falharam.`);
    } else {
      for (const c of selectedCandidates) {
        try {
          await setDecision.mutateAsync({ a: c.clienteA, b: c.clienteB, decisao: "manter_separados" });
          applied++;
        } catch {
          failed++;
        }
      }
      setBulkSummary({ mode: "separate", applied, failed });
      if (applied > 0) toast.success(`${applied} par(es) marcado(s) como distintos.`);
      if (failed > 0) toast.error(`${failed} falha(s) ao separar.`);
    }
    setBulkRunning(false);
    setBulkConfirmOpen(false);
    setSelected(new Set());
  }

  const autoFilteredCount = filtered.filter((c) => c.autoSuggested && c.canonicalSuggested).length;
  const allAutoSelected =
    autoFilteredCount > 0 &&
    filtered.filter((c) => c.autoSuggested && c.canonicalSuggested)
      .every((c) => selected.has(pairKey(c.clienteA, c.clienteB)));
  const allFilteredSelected =
    selectableCandidates.length > 0 &&
    selectableCandidates.every((c) => selected.has(pairKey(c.clienteA, c.clienteB)));


  const wizardCurrent = candidates[wizardIdx];

  function renderPairCell(nome: string, highlight = false) {
    const s = stats.get(nome);
    const dias = daysSince(s?.ultimaCompra);
    return (
      <div className={`rounded-md border p-3 text-xs ${highlight ? "border-primary bg-primary/5" : ""}`}>
        <div className="font-medium text-sm mb-1">{nome}</div>
        <div className="text-muted-foreground space-y-0.5">
          <div>Vendedor: {s?.vendedor || "—"}</div>
          <div>Cidade / Bairro: {s?.cidade || "—"} {s?.bairro ? `· ${s.bairro}` : ""}</div>
          <div>Telefone: {s?.telefone || "—"} {s?.cnpj ? `· CNPJ ${s.cnpj}` : ""}</div>
          <div>Última compra: {s?.ultimaCompra?.slice(0, 10) || "—"} {dias !== null ? `(${dias}d)` : ""}</div>
          <div>Faturamento: {brl(s?.faturamento ?? 0)}</div>
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-heading font-bold">Clientes Duplicados e Auditoria</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Central técnica de diagnóstico e saneamento da base. A Análise de Clientes consome apenas
              dados já tratados — todas as correções (duplicidades, aliases, divergências de última compra,
              pedidos ignorados e auditoria por CNPJ) acontecem aqui.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={runAudit} variant="outline" size="sm">
              <RefreshCcw className="h-3 w-3" /> Reprocessar duplicidades
            </Button>
            <Button
              onClick={async () => {
                await qc.invalidateQueries({ queryKey: ["client-aliases"] });
                await qc.invalidateQueries({ queryKey: ["sales-data"] });
                await refetch();
                toast.success("Aliases e vendas reprocessados. Análises recalculadas.");
              }}
              variant="outline"
              size="sm"
            >
              <RefreshCcw className="h-3 w-3" /> Reprocessar aliases e vendas
            </Button>
            {podeEditar && (
              <Button onClick={startWizard} size="sm" variant="outline">
                <Wand2 className="h-3 w-3" /> Revisar um por um
              </Button>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto justify-start">
            <TabsTrigger value="duplicados">Clientes Duplicados ({candidates.length})</TabsTrigger>
            <TabsTrigger value="redes">Redes / Filiais ({redesFiliais.length})</TabsTrigger>
            <TabsTrigger value="aliases">Aliases</TabsTrigger>
            <TabsTrigger value="divergencias">Divergências & Pedidos Ignorados</TabsTrigger>
            <TabsTrigger value="cnpj">Auditoria por CNPJ</TabsTrigger>
            <TabsTrigger value="historico">Histórico de Correções</TabsTrigger>
          </TabsList>

          <TabsContent value="duplicados" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Duplicados reais (≥95%)</div>
                <div className="text-2xl font-bold text-primary">{candidates.length}</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Sugeridos automaticamente</div>
                <div className="text-2xl font-bold">{counts.auto}</div>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Redes / Filiais (separados)</div>
                <div className="text-2xl font-bold flex items-center gap-1">
                  <EyeOff className="h-4 w-4 text-muted-foreground" /> {redesFiliais.length}
                </div>
              </CardContent></Card>
            </div>




        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> Duplicados confirmáveis (confiança ≥ 95%)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Mostra apenas casos com altíssima probabilidade de serem o mesmo cliente
              (mesmo CNPJ, telefone, nome muito próximo). Redes, filiais e indicadores
              geográficos foram movidos para a aba "Redes / Filiais".
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <Input
                placeholder="Buscar cliente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="max-w-sm"
              />
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(v) => (v ? selectAllFiltered() : clearSelection())}
                />
                Selecionar todos ({selectableCandidates.length})
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <Checkbox
                  checked={allAutoSelected}
                  onCheckedChange={(v) => (v ? selectAllAutoSuggested() : clearSelection())}
                />
                Apenas principais sugeridos ({autoCandidates.length})
              </label>
              <div className="text-xs text-muted-foreground">
                {selected.size} selecionado(s) · {selectedGroupable.length} agrupável(is) · {selectedCandidates.length} separável(is)
              </div>
              {selected.size > 0 && (
                <>
                  {podeEditar && <>
                  <Button
                    size="sm"
                    onClick={() => openBulkConfirm("group")}
                    disabled={bulkRunning || selectedGroupable.length === 0}
                    className="bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Agrupar selecionados ({selectedGroupable.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => openBulkConfirm("separate")}
                    disabled={bulkRunning || selectedCandidates.length === 0}
                  >
                    <SplitSquareHorizontal className="h-3 w-3" />
                    Separar selecionados ({selectedCandidates.length})
                  </Button>
                  </>}
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Limpar seleção
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingSales || loadingAliases ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum candidato pendente. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Cliente A</TableHead>
                      <TableHead>Cliente B</TableHead>
                      <TableHead>Última compra (dias)</TableHead>
                      <TableHead>Faturamento</TableHead>
                      <TableHead>Confiança</TableHead>
                      <TableHead>Motivos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => {
                      const sA = stats.get(c.clienteA);
                      const sB = stats.get(c.clienteB);
                      const dA = daysSince(sA?.ultimaCompra);
                      const dB = daysSince(sB?.ultimaCompra);
                      const label = confidenceLabel(c.confidence);
                      const k = pairKey(c.clienteA, c.clienteB);
                      const isSelected = selected.has(k);
                      return (
                        <TableRow key={k} data-state={isSelected ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(v) => toggleOne(c, !!v)}
                              aria-label="Selecionar par"
                            />
                          </TableCell>
                          <TableCell className="font-medium text-xs">
                            {c.clienteA}
                            {c.canonicalSuggested === c.clienteA && (
                              <Badge variant="default" className="ml-1 text-[10px]">principal sugerido</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-xs">
                            {c.clienteB}
                            {c.canonicalSuggested === c.clienteB && (
                              <Badge variant="default" className="ml-1 text-[10px]">principal sugerido</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{dA ?? "—"}d</div>
                            <div className="text-muted-foreground">{dB ?? "—"}d</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{brl(sA?.faturamento ?? 0)}</div>
                            <div className="text-muted-foreground">{brl(sB?.faturamento ?? 0)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={confidenceVariant(c.confidence)} className="text-[10px]">
                              {label} · {Math.round(c.confidence * 100)}%
                            </Badge>
                            {c.autoSuggested && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> sugerido auto
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {c.motivos.map((m) => (
                                <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {podeEditar && <div className="flex gap-1 justify-end flex-wrap">
                              <Button size="sm" variant="default" onClick={() => openUnify(c)}>
                                <Merge className="h-3 w-3" /> Agrupar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => keepSeparate(c)}>
                                <X className="h-3 w-3" /> Separados
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => askLater(c)}>
                                <Clock className="h-3 w-3" /> Depois
                              </Button>
                            </div>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="redes" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <EyeOff className="h-4 w-4" /> Redes / Filiais — mantidos separados por padrão
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Pares com mesmo nome base mas indicadores de bairro, cidade, unidade,
                  loja ou filial diferentes. Estes clientes NÃO entram na fila de duplicados
                  e permanecem separados. Use esta aba apenas se confirmar manualmente que
                  algum par representa, de fato, o mesmo cliente.
                </p>
                <div className="mt-2">
                  <Input
                    placeholder="Buscar cliente…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {filteredRedes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum par de rede/filial detectado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente A</TableHead>
                          <TableHead>Cliente B</TableHead>
                          <TableHead>Confiança</TableHead>
                          <TableHead>Motivos</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRedes.slice(0, 200).map((c) => {
                          const k = pairKey(c.clienteA, c.clienteB);
                          return (
                            <TableRow key={k}>
                              <TableCell className="text-xs font-medium">{c.clienteA}</TableCell>
                              <TableCell className="text-xs font-medium">{c.clienteB}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {Math.round(c.confidence * 100)}%
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[260px]">
                                  {c.motivos.map((m) => (
                                    <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {podeEditar && <div className="flex gap-1 justify-end flex-wrap">
                                  <Button size="sm" variant="outline" onClick={() => keepSeparate(c)}>
                                    <X className="h-3 w-3" /> Confirmar separados
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => openUnify(c)}>
                                    <Merge className="h-3 w-3" /> Forçar agrupamento
                                  </Button>
                                </div>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {filteredRedes.length > 200 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Mostrando 200 de {filteredRedes.length} pares. Use a busca para refinar.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="aliases" className="space-y-4 mt-0">
            {aliases.length === 0 && excludedClients.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum alias configurado.</p>
            )}
            {aliases.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Auditoria de fusões / aliases ativos</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cada linha mostra o cadastro removido visualmente e o cliente principal que recebe 100% do histórico.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente principal</TableHead>
                          <TableHead>Cliente removido / alias</TableHead>
                          <TableHead>Motivo</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aliases.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">
                              {a.canonical_name}
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                Cliente agrupado automaticamente por atividade recente
                              </Badge>
                            </TableCell>
                            <TableCell>{a.alias_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.motivo ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              {podeExcluir && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    removeAlias.mutate(a.id, {
                                      onSuccess: () => toast.success("Alias removido."),
                                      onError: (e: unknown) => toast.error("Erro: " + (e instanceof Error ? e.message : String(e))),
                                    })
                                  }
                                >
                                  <X className="h-3 w-3" /> Remover
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {excludedClients.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Clientes excluídos das análises</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Estes clientes foram ocultados manualmente. Os dados de venda permanecem no banco — restaurar
                    os reincorpora a todas as análises.
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {excludedClients.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.alias_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.motivo ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {podeEditar && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  restoreClient.mutate(a.alias_name, {
                                    onSuccess: () => toast.success(`"${a.alias_name}" restaurado.`),
                                    onError: (e: unknown) => toast.error("Erro: " + (e instanceof Error ? e.message : String(e))),
                                  })
                                }
                              >
                                <RefreshCcw className="h-3 w-3" /> Restaurar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="divergencias" className="space-y-4 mt-0">
            <p className="text-xs text-muted-foreground">
              Compara, por cliente, os pedidos da tabela de vendas/SIGE (<span className="font-mono">public.sales</span>),
              a fonte bruta da análise (<span className="font-mono">sales_raw_rows</span>) e o resultado efetivamente lido pela
              Análise de Clientes. Pedidos ausentes em qualquer etapa aparecem com o motivo do descarte.
            </p>
            <ClientAnalysisAuditPanel analysisSales={sales} />
          </TabsContent>

          <TabsContent value="cnpj" className="space-y-4 mt-0">
            <CnpjAuditPanel sales={sales} aliases={aliases} />
          </TabsContent>

          <TabsContent value="historico" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico de correções</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Decisões já registradas — agrupamentos confirmados, pares mantidos separados e itens
                  adiados para revisão posterior.
                </p>
              </CardHeader>
              <CardContent>
                {decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente A</TableHead>
                          <TableHead>Cliente B</TableHead>
                          <TableHead>Decisão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {decisions.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-xs font-medium">{d.cliente_a}</TableCell>
                            <TableCell className="text-xs font-medium">{d.cliente_b}</TableCell>
                            <TableCell className="text-xs">
                              <Badge
                                variant={
                                  d.decisao === "unificar"
                                    ? "default"
                                    : d.decisao === "manter_separados"
                                      ? "destructive"
                                      : "outline"
                                }
                                className="text-[10px]"
                              >
                                {d.decisao === "unificar"
                                  ? "Unificado"
                                  : d.decisao === "manter_separados"
                                    ? "Mantidos separados"
                                    : "Perguntar depois"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>


      {/* Unify dialog */}
      <Dialog open={!!pendingUnify} onOpenChange={(o) => !o && setPendingUnify(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agrupar clientes</DialogTitle>
            <DialogDescription>
              Escolha qual nome será o principal. O outro vira alias e as compras serão somadas em todas as análises.
              O sistema sugere o cliente com compra mais recente.
            </DialogDescription>
          </DialogHeader>
          {pendingUnify && (
            <div className="space-y-2">
              {[pendingUnify.candidate.clienteA, pendingUnify.candidate.clienteB].map((nome) => {
                const s = stats.get(nome);
                const dias = daysSince(s?.ultimaCompra);
                const suggested = pendingUnify.candidate.canonicalSuggested === nome;
                return (
                  <button
                    key={nome}
                    onClick={() => setPendingUnify({ ...pendingUnify, canonical: nome })}
                    className={`w-full text-left rounded-md border p-3 transition-colors ${
                      pendingUnify.canonical === nome ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-medium flex items-center gap-2">
                      {nome}
                      {suggested && <Badge variant="default" className="text-[10px]">sugerido</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Última compra: {dias !== null ? `${dias} dias` : "—"} · Faturamento: {brl(s?.faturamento ?? 0)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingUnify(null)}>Cancelar</Button>
            <Button onClick={confirmUnify} disabled={addAlias.isPending}>Confirmar agrupamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wizard assistente */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assistente de revisão de duplicidades</DialogTitle>
            <DialogDescription>
              {wizardCurrent
                ? `Caso ${wizardIdx + 1} de ${candidates.length}`
                : "Você revisou todos os casos."}
            </DialogDescription>
          </DialogHeader>
          {wizardCurrent ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={confidenceVariant(wizardCurrent.confidence)}>
                  {confidenceLabel(wizardCurrent.confidence)} confiança · {Math.round(wizardCurrent.confidence * 100)}%
                </Badge>
                {wizardCurrent.autoSuggested && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Provável atualização do mesmo cliente
                  </Badge>
                )}
                {wizardCurrent.motivos.map((m) => (
                  <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {renderPairCell(wizardCurrent.clienteA, wizardCurrent.canonicalSuggested === wizardCurrent.clienteA)}
                {renderPairCell(wizardCurrent.clienteB, wizardCurrent.canonicalSuggested === wizardCurrent.clienteB)}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" onClick={() => askLater(wizardCurrent)}>
                  <Clock className="h-3 w-3" /> Perguntar depois
                </Button>
                <Button variant="outline" onClick={() => keepSeparate(wizardCurrent)}>
                  <X className="h-3 w-3" /> Manter separados
                </Button>
                <Button onClick={() => openUnify(wizardCurrent)}>
                  <Merge className="h-3 w-3" /> Agrupar
                </Button>
                <Button variant="ghost" onClick={advanceWizard}>
                  Pular <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum caso pendente. ✨
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWizardOpen(false)}>Fechar assistente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkMode === "group"
                ? `Agrupar ${selectedGroupable.length} pares de clientes?`
                : `Separar ${selectedCandidates.length} pares de clientes?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkMode === "group" ? (
                <>
                  Você está prestes a agrupar <strong>{selectedGroupable.length}</strong> pares de clientes.
                  O sistema usará o cliente marcado como <em>principal sugerido</em> em cada linha como
                  principal oficial; o outro vira alias.
                  <br />
                  <br />
                  Nenhum cliente original será apagado e nenhum histórico será excluído. As análises
                  (Análise de Clientes, Inteligência Comercial, Estudo de Vendas, Curva ABC, Ranking,
                  Faturamento, Ticket Médio, Alertas) passarão a somar sob o nome principal.
                </>
              ) : (
                <>
                  Você está prestes a marcar <strong>{selectedCandidates.length}</strong> pares como
                  <em> clientes distintos</em>. O sistema criará uma exceção de auditoria e não voltará
                  a sugerir esses agrupamentos automaticamente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runBulk} disabled={bulkRunning}>
              {bulkRunning
                ? "Aplicando…"
                : bulkMode === "group"
                  ? "Confirmar e agrupar"
                  : "Confirmar e separar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!bulkSummary} onOpenChange={(o) => !o && setBulkSummary(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkSummary?.mode === "separate" ? "Pares separados" : "Agrupamentos aplicados"}
            </DialogTitle>
            <DialogDescription>Resumo da operação em massa.</DialogDescription>
          </DialogHeader>
          {bulkSummary && bulkSummary.mode === "group" && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Agrupamentos aplicados</span>
                <strong>{bulkSummary.applied}</strong>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Aliases criados</span>
                <strong>{bulkSummary.aliases}</strong>
              </div>
              {bulkSummary.failed > 0 && (
                <div className="flex justify-between border-b pb-2 text-destructive">
                  <span>Falhas</span>
                  <strong>{bulkSummary.failed}</strong>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clientes únicos restantes</span>
                <strong>{bulkSummary.remaining}</strong>
              </div>
            </div>
          )}
          {bulkSummary && bulkSummary.mode === "separate" && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Pares marcados como distintos</span>
                <strong>{bulkSummary.applied}</strong>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Exceções de auditoria criadas</span>
                <strong>{bulkSummary.applied}</strong>
              </div>
              {bulkSummary.failed > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Falhas</span>
                  <strong>{bulkSummary.failed}</strong>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBulkSummary(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
