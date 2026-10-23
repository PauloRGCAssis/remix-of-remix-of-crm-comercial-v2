import { PodeCriar } from "@/components/PodeCriar";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Plus, Pencil, Copy, Trash2, History, AlertTriangle, Megaphone, BarChart3, Users } from "lucide-react";
import { AcaoComercialDialog } from "@/components/acoes/AcaoComercialDialog";
import { CopiarAcaoVariosDialog } from "@/components/acoes/CopiarAcaoVariosDialog";
import { AcaoHistoricoSheet } from "@/components/acoes/AcaoHistoricoSheet";
import { AcaoResultadoSheet } from "@/components/acoes/AcaoResultadoSheet";
import { InvestimentoDetalheDialog, type InvestimentoDetalheItem } from "@/components/acoes/InvestimentoDetalheDialog";
import { STATUS_CLASS } from "@/components/acoes/ClienteAcoesComerciais";
import { computeAcaoResultado, type AcaoResultado } from "@/lib/acaoResultado";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useDegustacoes } from "@/hooks/useDegustacoes";
import { useCustoProdutos } from "@/hooks/useCustoProdutos";
import { useBonificacaoRows } from "@/hooks/useBonificacoes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


import { useSalesData } from "@/hooks/useSalesData";
import {
  ACAO_STATUS,
  diasRestantes,
  marcoAlerta,
  useCommercialActionTypes,
  useCommercialActions,
  type CommercialAction,
} from "@/hooks/useCommercialActions";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { useActiveVendorNames } from "@/hooks/useVendors";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");
const norm = (v: string) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const ALL = "__all__";

export default function AcoesComerciaisPage() {
  const { list, remove, update } = useCommercialActions();
  const { podeCriar, podeEditar, podeExcluir } = useModuleCrud("acoes_comerciais", "ações comerciais");
  const types = useCommercialActionTypes();
  const vendedores = useActiveVendorNames();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "duplicate">("create");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<CommercialAction | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [investmentDetail, setInvestmentDetail] = useState<{ title: string; items: InvestimentoDetalheItem[] } | null>(null);
  const [toDelete, setToDelete] = useState<CommercialAction | null>(null);

  const [fCliente, setFCliente] = useState("");
  const [fVendedor, setFVendedor] = useState(ALL);
  const [fTipo, setFTipo] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fInicio, setFInicio] = useState("");
  const [fFim, setFFim] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const acoes = list.data ?? [];

  const filtered = useMemo(() => {
    return acoes.filter((a) => {
      if (fCliente && !norm(a.cliente).includes(norm(fCliente))) return false;
      if (fVendedor !== ALL && (a.responsavel ?? "") !== fVendedor) return false;
      if (fTipo !== ALL && a.tipo !== fTipo) return false;
      if (fStatus !== ALL && a.status !== fStatus) return false;
      if (fInicio && a.data_fim < fInicio) return false;
      if (fFim && a.data_inicio > fFim) return false;
      return true;
    });
  }, [acoes, fCliente, fVendedor, fTipo, fStatus, fInicio, fFim]);

  const allSelected = filtered.length > 0 && filtered.every((a) => selectedIds.includes(a.id));


  const { data: sales = [] } = useSalesData();
  const { data: profilesAll = [] } = useClientProfiles();
  const { list: degustacoesList } = useDegustacoes();
  const { index: custoProdutos } = useCustoProdutos();
  const { data: bonifRows = [] } = useBonificacaoRows();

  const resultados = useMemo(() => {
    const map = new Map<string, AcaoResultado>();
    const todasDeg = degustacoesList.data ?? [];
    for (const a of filtered) {
      const profile = profilesAll.find((p) => p.id === a.client_profile_id);
      const vinculadas = a.possui_degustacoes
        ? todasDeg
            .filter((d) => (a.degustacao_ids ?? []).includes(d.id))
            .map((d) => ({
              id: d.id,
              cliente: d.cliente,
              data: d.data,
              promotora: d.promotora,
              promotoras: d.promotoras,
              produtos: (d.produtos ?? []).map((p) => ({ produto_id: p.produto_id, nome: p.nome, quantidade: Number(p.quantidade) || 0 })),
            }))
        : [];
      map.set(
        a.id,
        computeAcaoResultado(a, sales, {
          cnpj: profile?.cnpj ?? null,
          extraNames: [profile?.nome ?? "", profile?.nome_fantasia ?? ""].filter(Boolean),
          degustacoes: vinculadas,
           custoProdutos,
           bonificacoesConcedidas: bonifRows.map((b) => ({
             cliente: b.cliente,
             cnpj_cpf: b.cnpj_cpf ?? null,
             data: b.data ?? null,
             produto: b.produto,
             quantidade: Number(b.quantidade) || 0,
             custo: Number(b.custo) || 0,
           })),
        }),
      );
    }
    return map;
  }, [filtered, sales, profilesAll, degustacoesList.data, custoProdutos, bonifRows]);


  const roiKpis = useMemo(() => {
    const rois: number[] = [];
    let melhorCrescimento: { nome: string; cliente: string; pct: number } | null = null;
    let positivas = 0;
    for (const a of filtered) {
      const r = resultados.get(a.id);
      if (!r) continue;
      if (r.roi.roi != null) rois.push(r.roi.roi);
      if (r.conclusao.tom === "positivo") positivas++;
      const pct = r.referencia?.pctFaturamento ?? null;
      if (pct != null && (!melhorCrescimento || pct > melhorCrescimento.pct)) {
        melhorCrescimento = { nome: a.nome, cliente: a.cliente, pct };
      }
    }
    return {
      roiMedio: rois.length ? rois.reduce((s, v) => s + v, 0) / rois.length : null,
      melhorCrescimento,
      positivas,
      avaliadas: filtered.length,
    };
  }, [filtered, resultados]);


  const kpis = useMemo(() => {
    const ativas = filtered.filter((a) => a.status === "Em andamento");
    const encerradas = filtered.filter((a) => a.status === "Encerrada");
    const vencendo = filtered.filter((a) => {
      const d = diasRestantes(a.data_fim);
      return a.status === "Em andamento" && d >= 0 && d <= 7;
    });
    const total = filtered.reduce((s, a) => s + (resultados.get(a.id)?.roi.custo ?? 0), 0);
    const byVendedor = new Map<string, { total: number; items: InvestimentoDetalheItem[] }>();
    const byCliente = new Map<string, { total: number; items: InvestimentoDetalheItem[] }>();
    for (const a of filtered) {
      const resultado = resultados.get(a.id);
      if (!resultado) continue;
      const item = { action: a, resultado };
      const vendedor = a.responsavel ?? "—";
      const atualVendedor = byVendedor.get(vendedor) ?? { total: 0, items: [] };
      atualVendedor.total += resultado.roi.custo;
      atualVendedor.items.push(item);
      byVendedor.set(vendedor, atualVendedor);
      const atualCliente = byCliente.get(a.cliente) ?? { total: 0, items: [] };
      atualCliente.total += resultado.roi.custo;
      atualCliente.items.push(item);
      byCliente.set(a.cliente, atualCliente);
    }
    const sortDesc = (m: Map<string, { total: number; items: InvestimentoDetalheItem[] }>) =>
      [...m.entries()].sort((a, b) => b[1].total - a[1].total);
    const mesCompleto = (() => {
      if (!fInicio || !fFim || !fInicio.endsWith("-01")) return null;
      const [ano, mes] = fInicio.split("-").map(Number);
      const ultimoDia = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
      return fFim === ultimoDia ? `${String(mes).padStart(2, "0")}/${ano}` : null;
    })();
    const periodoLabel = mesCompleto ?? (fInicio || fFim
      ? `${fInicio ? br(fInicio) : "início"} a ${fFim ? br(fFim) : "hoje"}`
      : "Todas as ações filtradas");
    const periodoItems = filtered.flatMap((action) => {
      const resultado = resultados.get(action.id);
      return resultado ? [{ action, resultado }] : [];
    });
    return {
      ativas: ativas.length,
      encerradas: encerradas.length,
      vencendo,
      total,
      byVendedor: sortDesc(byVendedor),
      byCliente: sortDesc(byCliente).slice(0, 8),
      periodo: { label: periodoLabel, total, items: periodoItems },
      custoPendente: periodoItems.filter((item) => item.resultado.roi.custoIncompleto).length,
    };
  }, [filtered, resultados, fInicio, fFim]);

  const alertas = useMemo(
    () =>
      filtered
        .map((a) => ({ a, dias: diasRestantes(a.data_fim) }))
        .filter(({ a, dias }) => a.status !== "Encerrada" && a.status !== "Cancelada" && marcoAlerta(dias) != null)
        .sort((x, y) => x.dias - y.dias),
    [filtered],
  );

  const openCreate = () => {
    setSelected(null);
    setDialogMode("create");
    setDialogOpen(true);
  };
  const openEdit = (a: CommercialAction) => {
    setSelected(a);
    setDialogMode("edit");
    setDialogOpen(true);
  };
  const openDuplicate = (a: CommercialAction) => {
    setSelected(a);
    setDialogMode("duplicate");
    setDialogOpen(true);
  };

  const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-heading mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-heading flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" /> Ações Comerciais
            </h1>
            <p className="text-sm text-muted-foreground">
              Controle das campanhas promocionais: regras, período, investimento e resultados.
            </p>
          </div>
          {podeCriar && (
            <PodeCriar modulo={'acoes_comerciais'}><Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Nova Ação
            </Button></PodeCriar>
          )}
        </div>

        {/* Dashboard */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="ROI médio das ações"
            value={roiKpis.roiMedio == null ? "—" : `${roiKpis.roiMedio >= 0 ? "+" : ""}${roiKpis.roiMedio.toFixed(1)}%`}
            hint="Retorno incremental sobre o investimento"
          />
          <Kpi
            label="Ações com resultado positivo"
            value={`${roiKpis.positivas} de ${roiKpis.avaliadas}`}
          />
          <Kpi
            label="Maior crescimento"
            value={
              roiKpis.melhorCrescimento
                ? `${roiKpis.melhorCrescimento.pct >= 0 ? "+" : ""}${roiKpis.melhorCrescimento.pct.toFixed(1)}%`
                : "—"
            }
            hint={roiKpis.melhorCrescimento ? `${roiKpis.melhorCrescimento.nome} — ${roiKpis.melhorCrescimento.cliente}` : undefined}
          />
          <Kpi label="Investimento total" value={money(kpis.total)} hint={kpis.custoPendente ? `${kpis.custoPendente} ação(ões) com custo pendente` : undefined} />
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi label="Ações ativas" value={String(kpis.ativas)} />
          <Kpi label="Em andamento" value={String(kpis.ativas)} />
          <Kpi label="Encerradas" value={String(kpis.encerradas)} />
          <Kpi label="Vencem em 7 dias" value={String(kpis.vencendo.length)} />
        </div>

        {alertas.length > 0 && (
          <Card className="p-4 border-amber-300 bg-amber-50/60">
            <p className="text-sm font-semibold flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" /> Alertas de encerramento
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {alertas.map(({ a, dias }) => (
                <li key={a.id}>
                  <strong>{a.nome}</strong> — {a.cliente}: faltam <strong>{dias === 1 ? "1 dia" : `${dias} dias`}</strong>{" "}
                  (termina em {br(a.data_fim)})
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm font-semibold mb-2">Investimento por vendedor</p>
            <div className="space-y-1 text-sm max-h-44 overflow-y-auto">
              {kpis.byVendedor.length === 0 && <p className="text-muted-foreground text-xs">Sem dados.</p>}
               {kpis.byVendedor.map(([k, group]) => (
                 <button key={k} type="button" className="flex w-full justify-between gap-2 text-left hover:text-primary" onClick={() => setInvestmentDetail({ title: `Investimento — ${k}`, items: group.items })}>
                  <span className="truncate">{k}</span>
                   <span className="font-medium whitespace-nowrap underline decoration-dotted">{money(group.total)}</span>
                 </button>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-semibold mb-2">Investimento por cliente (top 8)</p>
            <div className="space-y-1 text-sm max-h-44 overflow-y-auto">
              {kpis.byCliente.length === 0 && <p className="text-muted-foreground text-xs">Sem dados.</p>}
               {kpis.byCliente.map(([k, group]) => (
                 <button key={k} type="button" className="flex w-full justify-between gap-2 text-left hover:text-primary" onClick={() => setInvestmentDetail({ title: `Investimento — ${k}`, items: group.items })}>
                  <span className="truncate">{k}</span>
                   <span className="font-medium whitespace-nowrap underline decoration-dotted">{money(group.total)}</span>
                 </button>
              ))}
            </div>
          </Card>
          <Card className="p-4">
             <p className="text-sm font-semibold mb-2">Investimento por período</p>
            <div className="space-y-1 text-sm max-h-44 overflow-y-auto">
               {kpis.periodo.items.length === 0 ? <p className="text-muted-foreground text-xs">Sem dados.</p> : (
                 <button type="button" className="flex w-full justify-between gap-2 text-left hover:text-primary" onClick={() => setInvestmentDetail({ title: `Investimento — ${kpis.periodo.label}`, items: kpis.periodo.items })}>
                   <span>{kpis.periodo.label}</span>
                   <span className="font-medium whitespace-nowrap underline decoration-dotted">{money(kpis.periodo.total)}</span>
                 </button>
               )}
            </div>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1.5 min-w-0 basis-full sm:basis-[calc(50%-0.5rem)] xl:flex-1 xl:basis-[240px]">
              <Label className="text-xs">Cliente</Label>
              <Input value={fCliente} onChange={(e) => setFCliente(e.target.value)} placeholder="Buscar cliente" className="w-full" />
            </div>

            <div className="grid gap-1.5 min-w-0 basis-full sm:basis-[calc(50%-0.5rem)] xl:flex-1 xl:basis-[220px]">
              <Label className="text-xs">Vendedor</Label>

              <Select value={fVendedor} onValueChange={setFVendedor}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 min-w-0 basis-full sm:basis-[calc(50%-0.5rem)] xl:flex-1 xl:basis-[170px]">
              <Label className="text-xs">Tipo</Label>
              <Select value={fTipo} onValueChange={setFTipo}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {(types.list.data ?? []).map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 min-w-0 basis-full sm:basis-[calc(50%-0.5rem)] xl:flex-1 xl:basis-[170px]">
              <Label className="text-xs">Status</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {ACAO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 min-w-0 basis-full sm:basis-[calc(50%-0.5rem)] xl:basis-[170px] xl:grow-0 xl:shrink-0">
              <Label className="text-xs">Período de</Label>
              <Input type="date" value={fInicio} onChange={(e) => setFInicio(e.target.value)} className="w-full min-w-[150px] pr-2" />
            </div>
            <div className="grid gap-1.5 min-w-0 basis-full sm:basis-[calc(50%-0.5rem)] xl:basis-[170px] xl:grow-0 xl:shrink-0">
              <Label className="text-xs">Período até</Label>
              <Input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} className="w-full min-w-[150px] pr-2" />
            </div>


          </div>

        </Card>

        {/* Barra de seleção */}
        {selectedIds.length > 0 && (
          <Card className="p-3 flex flex-wrap items-center gap-3 border-primary/40 bg-primary/5">
            <span className="text-sm font-medium">
              {selectedIds.length === 1 ? "1 ação selecionada" : `${selectedIds.length} ações selecionadas`}
            </span>
            {podeCriar && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.length !== 1}
                  onClick={() => {
                    const a = filtered.find((x) => x.id === selectedIds[0]);
                    if (a) openDuplicate(a);
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.length !== 1}
                  onClick={() => {
                    const a = filtered.find((x) => x.id === selectedIds[0]);
                    if (a) { setSelected(a); setBulkOpen(true); }
                  }}
                >
                  <Users className="h-3.5 w-3.5 mr-1" /> Copiar para clientes
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Limpar seleção
            </Button>
          </Card>
        )}

        {/* Tabela */}
        <Card className="p-0 overflow-hidden">
          <div className="sheet-table max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-muted">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium sticky left-0 z-20 bg-muted border-r border-border w-[44px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) =>
                        setSelectedIds(v === true ? filtered.map((a) => a.id) : [])
                      }
                      aria-label="Selecionar todas"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium sticky left-[44px] z-20 bg-muted border-r border-border min-w-[280px]">Cliente</th>
                  <th className="px-3 py-2 font-medium">Nome da ação</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Início</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Fim</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Valor</th>
                  <th className="px-3 py-2 font-medium">Responsável</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Dias restantes</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Crescimento</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">ROI</th>
                  <th className="px-3 py-2 font-medium">Conclusão</th>
                  
                </tr>
              </thead>
              <tbody>
                {list.isLoading && (
                  <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!list.isLoading && filtered.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">Nenhuma ação encontrada.</td></tr>
                )}

                {filtered.map((a) => {
                  const dias = diasRestantes(a.data_fim);
                  const encerrado = a.status === "Encerrada" || a.status === "Cancelada";
                  const res = resultados.get(a.id);
                  const cres = res?.referencia?.pctFaturamento ?? null;
                  const roi = res?.roi.roi ?? null;
                  const tone = (v: number | null) =>
                    v == null ? "text-muted-foreground" : v > 0 ? "text-success" : v < 0 ? "text-destructive" : "";
                  const fmtPct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
                  return (
                    <tr key={a.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-2 sticky left-0 z-10 bg-card border-r border-border w-[44px] align-top">
                        <Checkbox
                          checked={selectedIds.includes(a.id)}
                          onCheckedChange={(v) =>
                            setSelectedIds((prev) => (v === true ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                          }
                          aria-label={`Selecionar ação ${a.nome}`}
                        />
                      </td>
                      <td className="px-3 py-2 sticky left-[44px] z-10 bg-card border-r border-border min-w-[280px] max-w-[340px] align-top">
                        <div className="font-medium leading-snug break-words whitespace-normal" title={a.cliente}>
                          {a.cliente}
                        </div>
                        <div className="mt-0.5 flex items-center gap-0.5 -ml-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Ver resultado"
                            onClick={() => { setSelected(a); setResultOpen(true); }}>
                            <BarChart3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Histórico"
                            onClick={() => { setSelected(a); setHistOpen(true); }}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          {podeEditar && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Editar" onClick={() => openEdit(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {podeCriar && (
                            <>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Duplicar" onClick={() => openDuplicate(a)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Copiar para clientes"
                                onClick={() => { setSelected(a); setBulkOpen(true); }}>
                                <Users className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {podeExcluir && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Excluir"
                              onClick={() => setToDelete(a)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 max-w-[220px] truncate" title={a.nome}>{a.nome}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{a.tipo}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{br(a.data_inicio)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{br(a.data_fim)}</td>
                      <td className="px-3 py-2">
                        {!podeEditar ? (
                          <Badge variant="outline" className={STATUS_CLASS[a.status]}>
                            {a.status}
                          </Badge>
                        ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" title="Clique para alterar o status">
                              <Badge
                                variant="outline"
                                className={`${STATUS_CLASS[a.status]} cursor-pointer hover:opacity-80`}
                              >
                                {a.status}
                              </Badge>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {ACAO_STATUS.map((s) => (
                              <DropdownMenuItem
                                key={s}
                                disabled={s === a.status}
                                onClick={() =>
                                  update.mutate({ id: a.id, patch: { status: s }, before: a })
                                }
                              >
                                {s}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" className="font-medium hover:text-primary underline decoration-dotted" onClick={() => res && setInvestmentDetail({ title: `Investimento — ${a.nome}`, items: [{ action: a, resultado: res }] })}>
                          {res?.roi.custoIncompleto ? "Custo pendente" : money(res?.roi.custo ?? 0)}
                        </button>
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={a.responsavel ?? ""}>{a.responsavel ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {encerrado ? "—" : dias < 0 ? <span className="text-red-600">Vencida</span> : `${dias} dia(s)`}
                      </td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${tone(cres)}`}>{fmtPct(cres)}</td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${tone(roi)}`}>{fmtPct(roi)}</td>
                      <td className="px-3 py-2">
                        {res && (
                          <Badge
                            variant="outline"
                            className={
                              res.conclusao.tom === "positivo"
                                ? "bg-success/10 text-success border-success/30"
                                : res.conclusao.tom === "negativo"
                                  ? "bg-destructive/10 text-destructive border-destructive/30"
                                  : "bg-muted text-muted-foreground border-border"
                            }
                          >
                            {res.conclusao.tom === "positivo" ? "Positivo" : res.conclusao.tom === "negativo" ? "Negativo" : "Neutro"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <AcaoComercialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        action={dialogMode === "create" ? null : selected}
        mode={dialogMode}
      />

      <CopiarAcaoVariosDialog open={bulkOpen} onOpenChange={setBulkOpen} action={selected} />

      <AcaoHistoricoSheet open={histOpen} onOpenChange={setHistOpen} action={selected} />

      <AcaoResultadoSheet open={resultOpen} onOpenChange={setResultOpen} action={selected} />

      <InvestimentoDetalheDialog
        open={!!investmentDetail}
        onOpenChange={(open) => !open && setInvestmentDetail(null)}
        title={investmentDetail?.title ?? "Detalhamento do investimento"}
        items={investmentDetail?.items ?? []}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ação comercial?</AlertDialogTitle>
            <AlertDialogDescription>
              A ação “{toDelete?.nome}” do cliente {toDelete?.cliente} será removida permanentemente,
              junto com seu histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete) await remove.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
