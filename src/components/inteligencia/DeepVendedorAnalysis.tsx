import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import {
  Brain, Users, ShoppingCart, DollarSign, Package, TrendingUp, TrendingDown,
  AlertTriangle, Target, ArrowUpRight, ArrowDownRight, Minus, Sparkles, Activity, UserCheck, UserMinus, Search,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { SaleRow, cleanProductName, shortVendedorName, getVendedoresWith2026Sales } from "@/hooks/useSalesData";
import { buildClientConsolidation } from "@/lib/clientConsolidation";
import { formatProductDisplay } from "@/lib/productDisplay";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { ClientesDetalhesDialog } from "./ClientesDetalhesDialog";
import { rankVariation } from "@/lib/variationRanking";
import { classifyClientsForPeriod, type ClientClassificationResult } from "@/lib/clientClassification";
import { useAppSetting, REATIVACAO_DIAS_KEY, REATIVACAO_DIAS_DEFAULT } from "@/hooks/useAppSetting";

const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const num1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

function calcVar(a: number, c: number): number | null {
  if (c <= 0) return a > 0 ? 100 : null;
  return ((a - c) / c) * 100;
}

function VarBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (Math.abs(value) < 1) return <span className="text-muted-foreground text-xs inline-flex items-center gap-0.5"><Minus className="h-3 w-3" />{pct(value)}</span>;
  if (value > 0) return <span className="text-green-600 text-xs inline-flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" />{pct(value)}</span>;
  return <span className="text-red-500 text-xs inline-flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" />{pct(value)}</span>;
}

function MiniKpi({ title, atual, comp, variation, icon: Icon }: { title: string; atual: string; comp?: string; variation?: number | null; icon: any }) {
  return (
    <div className="rounded-md border bg-card p-3 min-w-0 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      <p className="text-sm md:text-base font-bold leading-tight tabular-nums truncate" title={atual}>{atual}</p>
      {comp !== undefined && (
        <div className="mt-1 flex items-center justify-between gap-2 min-w-0">
          <p className="text-[10px] text-muted-foreground truncate tabular-nums" title={`vs ${comp}`}>vs {comp}</p>
          {variation !== undefined && <span className="shrink-0"><VarBadge value={variation ?? null} /></span>}
        </div>
      )}
    </div>
  );
}

interface VendMetrics {
  fat: number;
  qty: number;
  pedidos: Set<number>;
  clientes: Map<string, { fat: number; pedidos: Set<number> }>;
  produtos: Map<string, { fat: number; qty: number }>;
  dias: Set<string>;
}

function emptyMetrics(): VendMetrics {
  return { fat: 0, qty: 0, pedidos: new Set(), clientes: new Map(), produtos: new Map(), dias: new Set() };
}

function accumulate(target: VendMetrics, r: SaleRow, canonCliente: (raw: string) => string) {
  const valor = Number(r.preco_total);
  const qty = Number(r.quantidade);
  target.fat += valor;
  target.qty += qty;
  target.pedidos.add(r.codigo_venda);
  target.dias.add(String(r.data).slice(0, 10));
  const cli = canonCliente(r.cliente);
  const ec = target.clientes.get(cli) ?? { fat: 0, pedidos: new Set<number>() };
  ec.fat += valor;
  ec.pedidos.add(r.codigo_venda);
  target.clientes.set(cli, ec);
  const p = cleanProductName(r.descricao);
  if (p) {
    const ep = target.produtos.get(p) ?? { fat: 0, qty: 0 };
    ep.fat += valor;
    ep.qty += qty;
    target.produtos.set(p, ep);
  }
}

function monthlySeries(rows: SaleRow[], vendedor: string) {
  const map = new Map<string, { fat: number; pedidos: Set<number>; clientes: Set<string> }>();
  for (const r of rows) {
    if (shortVendedorName(r.vendedor) !== vendedor) continue;
    const ym = String(r.data).slice(0, 7);
    const e = map.get(ym) ?? { fat: 0, pedidos: new Set(), clientes: new Set() };
    e.fat += Number(r.preco_total);
    e.pedidos.add(r.codigo_venda);
    if (r.cliente) e.clientes.add(r.cliente);
    map.set(ym, e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({
      mes,
      fat: v.fat,
      pedidos: v.pedidos.size,
      clientes: v.clientes.size,
      ticket: v.pedidos.size > 0 ? v.fat / v.pedidos.size : 0,
    }));
}

function buildDiagnostico(args: {
  vendedor: string;
  fA: number; fC: number;
  pA: number; pC: number;
  cA: number; cC: number;
  tA: number; tC: number;
  novos: string[]; perdidos: string[];
  clientesCresceram: { nome: string; delta: number }[];
  clientesCairam: { nome: string; delta: number }[];
  produtosCresceram: { nome: string; delta: number }[];
  produtosCairam: { nome: string; delta: number }[];
  hasComp: boolean;
}): string {
  const { vendedor, fA, fC, pA, pC, cA, cC, tA, tC, novos, perdidos,
    clientesCresceram, clientesCairam, produtosCresceram, produtosCairam, hasComp } = args;
  if (!hasComp) {
    if (fA <= 0) return `O vendedor ${vendedor} não apresentou vendas no período selecionado.`;
    return `O vendedor ${vendedor} faturou ${R$(fA)} em ${pA} pedidos para ${cA} clientes, com ticket médio de ${R$(tA)}. Selecione período comparativo para análise de evolução.`;
  }
  const variacao = calcVar(fA, fC);
  if (fA <= 0 && fC > 0) return `⚠️ O vendedor ${vendedor} ZEROU as vendas no período atual. Antes faturava ${R$(fC)} em ${pC} pedidos. Investigar urgentemente.`;
  if (fC <= 0 && fA > 0) return `✨ O vendedor ${vendedor} começou a vender no período: ${R$(fA)} em ${pA} pedidos para ${cA} clientes.`;
  const cresceu = (variacao ?? 0) > 0;
  const intro = cresceu
    ? `📈 O vendedor ${vendedor} cresceu ${pct(variacao)} (${R$(fA - fC)} a mais).`
    : `📉 O vendedor ${vendedor} caiu ${pct(variacao)} (${R$(fA - fC)}).`;

  const varPedidos = calcVar(pA, pC);
  const varClientes = calcVar(cA, cC);
  const varTicket = calcVar(tA, tC);
  const causas: string[] = [];
  if (cresceu) {
    if (varClientes !== null && varClientes > 10) causas.push(`expansão de carteira ativa (${cC} → ${cA} clientes)`);
    if (varPedidos !== null && varPedidos > 15) causas.push(`mais pedidos no período (${pC} → ${pA})`);
    if (varTicket !== null && varTicket > 10) causas.push(`ticket médio mais alto (${R$(tC)} → ${R$(tA)})`);
    if (novos.length >= 3) causas.push(`${novos.length} clientes novos conquistados`);
  } else {
    if (varClientes !== null && varClientes < -10) causas.push(`redução da carteira ativa (${cC} → ${cA} clientes)`);
    if (varPedidos !== null && varPedidos < -15) causas.push(`queda na frequência de pedidos (${pC} → ${pA})`);
    if (varTicket !== null && varTicket < -10) causas.push(`queda do ticket médio (${R$(tC)} → ${R$(tA)})`);
    if (perdidos.length >= 3) causas.push(`${perdidos.length} clientes deixaram de comprar`);
  }
  const causaTxt = causas.length > 0 ? ` Principais causas: ${causas.join("; ")}.` : ` Indicadores principais estáveis.`;

  const extras: string[] = [];
  if (cresceu && clientesCresceram.length > 0) {
    extras.push(`Clientes que mais impulsionaram: ${clientesCresceram.slice(0, 3).map(c => c.nome).join(", ")}.`);
  }
  if (!cresceu && clientesCairam.length > 0) {
    extras.push(`Clientes que mais puxaram a queda: ${clientesCairam.slice(0, 3).map(c => c.nome).join(", ")}.`);
  }
  if (cresceu && produtosCresceram.length > 0) {
    extras.push(`Produtos em alta na carteira: ${produtosCresceram.slice(0, 3).map(p => formatProductDisplay(p.nome)).join(", ")}.`);
  }
  if (!cresceu && produtosCairam.length > 0) {
    extras.push(`Produtos que mais perderam volume: ${produtosCairam.slice(0, 3).map(p => formatProductDisplay(p.nome)).join(", ")}.`);
  }
  return intro + causaTxt + (extras.length ? " " + extras.join(" ") : "");
}

function buildLeitura(args: { fA: number; fC: number; cA: number; cC: number; pA: number; pC: number; hasComp: boolean; novos: number; perdidos: number; }) {
  const { fA, fC, cA, cC, hasComp, novos, perdidos } = args;
  if (!hasComp) return "Configure período comparativo para leitura estratégica completa.";
  const v = calcVar(fA, fC) ?? 0;
  if (fA <= 0 && fC > 0) return "Vendedor ZEROU — risco crítico. Necessário diagnóstico imediato (afastamento, mudança de carteira, problema operacional).";
  if (fC <= 0 && fA > 0) return "Vendedor INICIANDO. Acompanhar evolução de carteira e mix.";
  if (v > 25) return "Crescimento ACELERADO. Replicar boas práticas; proteger a carteira; reforçar metas.";
  if (v > 5) return "Crescimento saudável. Espaço para ampliar mix e ticket dos clientes principais.";
  if (v > -5) return "Performance ESTÁVEL. Identificar clientes com potencial de upsell.";
  if (v > -25) {
    if (perdidos > novos + 2) return "ALERTA — perda líquida de clientes. Plano de reativação prioritário.";
    return "ALERTA — queda moderada. Mapear causa antes que se aprofunde.";
  }
  return "RISCO CRÍTICO. Queda estrutural — combinação de perda de carteira, frequência ou ticket. Plano de recuperação urgente.";
}

function buildAlertas(args: {
  fA: number; fC: number; cA: number; cC: number; pA: number; pC: number;
  tA: number; tC: number; novos: number; perdidos: number; hasComp: boolean;
}): { tipo: string; severidade: "alta" | "media" | "baixa" }[] {
  const out: { tipo: string; severidade: "alta" | "media" | "baixa" }[] = [];
  if (!args.hasComp) return out;
  const { fA, fC, cA, cC, tA, tC, novos, perdidos } = args;
  const v = calcVar(fA, fC);
  if (fA <= 0 && fC > 0) out.push({ tipo: "Vendedor zerou no período", severidade: "alta" });
  if (v !== null && v <= -25) out.push({ tipo: "Forte queda de faturamento", severidade: "alta" });
  if (v !== null && v >= 25) out.push({ tipo: "Crescimento acelerado", severidade: "baixa" });
  if (cC > 0 && cA < cC * 0.7) out.push({ tipo: "Carteira encolheu fortemente", severidade: "alta" });
  if (perdidos >= 5) out.push({ tipo: `${perdidos} clientes perdidos no período`, severidade: "media" });
  if (novos >= 3) out.push({ tipo: `${novos} clientes novos conquistados`, severidade: "baixa" });
  if (tC > 0 && tA < tC * 0.8) out.push({ tipo: "Queda relevante de ticket médio", severidade: "media" });
  if (tC > 0 && tA > tC * 1.2) out.push({ tipo: "Ticket médio em alta", severidade: "baixa" });
  return out;
}

interface Props {
  sales: SaleRow[];
  inicio: string;
  fim: string;
  compInicio: string;
  compFim: string;
  vendedoresFilter: string[];
}

export function DeepVendedorAnalysis({ sales, inicio, fim, compInicio, compFim, vendedoresFilter }: Props) {
  const { value: reativacaoDias } = useAppSetting<number>(REATIVACAO_DIAS_KEY, REATIVACAO_DIAS_DEFAULT);
  // Seletor de vendedores desta análise é INDEPENDENTE do filtro principal do cabeçalho.
  // Sempre usamos a base completa de vendas; a filtragem por vendedor é feita pelo `selected` local.
  const baseSales = sales;

  const consolidation = useMemo(() => {
    const names = new Set<string>();
    for (const s of baseSales) names.add(s.cliente ?? "");
    return buildClientConsolidation(names);
  }, [baseSales]);
  const canonCliente = useMemo(() => {
    const m = consolidation.map;
    return (raw: string) => m.get(raw) ?? normalizeClientName(raw || "") ?? raw ?? "(sem cliente)";
  }, [consolidation]);

  // Mesma fonte unificada dos demais filtros: apenas vendedores ativos
  // (lista base oficial OU com vendas em 2026). Sem históricos/desligados.
  const vendedoresOptions = useMemo(() => getVendedoresWith2026Sales(sales), [sales]);

  const [selected, setSelected] = useState<string[]>([]);

  const hasUserComp = Boolean(compInicio && compFim);
  const autoCompRange = useMemo(() => {
    if (!inicio || !fim) return { start: "", end: "" };
    const ini = new Date(inicio + "T00:00:00");
    const fi = new Date(fim + "T00:00:00");
    const days = Math.max(1, Math.round((fi.getTime() - ini.getTime()) / 86400000) + 1);
    const compEnd = new Date(ini.getTime() - 86400000);
    const compStart = new Date(compEnd.getTime() - (days - 1) * 86400000);
    return { start: compStart.toISOString().slice(0, 10), end: compEnd.toISOString().slice(0, 10) };
  }, [inicio, fim]);

  const cStart = hasUserComp ? compInicio : autoCompRange.start;
  const cEnd = hasUserComp ? compFim : autoCompRange.end;
  const hasComp = Boolean(cStart && cEnd);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Análise Profunda por Vendedor
          <Badge variant="outline" className="text-[10px] font-normal">
            <Sparkles className="h-2.5 w-2.5 mr-1" />Diagnóstico inteligente
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Selecione 1 ou mais vendedores para entender POR QUE cresceu ou caiu —
          carteira, recorrência, ticket, clientes ganhos/perdidos e produtos que mais impactaram.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">Vendedor(es)</p>
          <SearchableCombobox
            options={vendedoresOptions}
            value={selected}
            onValueChange={setSelected}
            placeholder="Buscar vendedor..."
            searchPlaceholder="Digite o nome do vendedor..."
            allLabel="Nenhum vendedor selecionado"
            applyMode={false}
            selectionMode="multiple"
            closeOnSelect={false}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {selected.length === 0
              ? "Nenhum vendedor selecionado"
              : `${selected.length} vendedor${selected.length > 1 ? "es" : ""} em análise`}
          </p>
        </div>

        {!hasComp && selected.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Sem período comparativo definido — usando janela anterior automática ({autoCompRange.start || "—"} → {autoCompRange.end || "—"}).
            </AlertDescription>
          </Alert>
        )}

        {selected.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-40" />
            <p className="text-sm">Selecione um vendedor para começar o diagnóstico.</p>
            <p className="text-[11px] max-w-md">
              A análise mostra evolução, mix de produtos e clientes, recorrência, ticket médio,
              clientes novos/perdidos e gera texto explicando o motivo do crescimento ou queda.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {selected.map(v => (
              <VendedorCard
                key={v}
                vendedor={v}
                baseSales={baseSales}
                canonCliente={canonCliente}
                inicio={inicio}
                fim={fim}
                cStart={cStart}
                cEnd={cEnd}
                hasComp={hasComp}
                reativacaoDias={reativacaoDias}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VendedorCard({
  vendedor, baseSales, canonCliente, inicio, fim, cStart, cEnd, hasComp, reativacaoDias,
}: {
  vendedor: string;
  baseSales: SaleRow[];
  canonCliente: (raw: string) => string;
  inicio: string; fim: string;
  cStart: string; cEnd: string;
  hasComp: boolean;
  reativacaoDias: number;
}) {
  const data = useMemo(() => {
    const atual = emptyMetrics();
    const comp = emptyMetrics();
    for (const r of baseSales) {
      if (shortVendedorName(r.vendedor) !== vendedor) continue;
      const d = String(r.data).slice(0, 10);
      if (inicio && fim && d >= inicio && d <= fim) accumulate(atual, r, canonCliente);
      if (hasComp && d >= cStart && d <= cEnd) accumulate(comp, r, canonCliente);
    }
    const tA = atual.pedidos.size > 0 ? atual.fat / atual.pedidos.size : 0;
    const tC = comp.pedidos.size > 0 ? comp.fat / comp.pedidos.size : 0;

    // Clientes novos / reativados / recorrentes usando classificação central (histórico global)
    const vendedorAtualRows = baseSales.filter(r => {
      const d = String(r.data).slice(0, 10);
      return shortVendedorName(r.vendedor) === vendedor && inicio && fim && d >= inicio && d <= fim;
    });
    const classificacao = classifyClientsForPeriod({
      todasAsVendas: baseSales,
      vendasNoPeriodoAtualFiltradas: vendedorAtualRows,
      inicio,
      fim,
      compInicio: hasComp ? cStart : undefined,
      compFim: hasComp ? cEnd : undefined,
      reativacaoDiasSemCompra: reativacaoDias,
    });
    const novos = classificacao.novos.map(c => canonCliente(c.cliente));
    const reativados = classificacao.reativados.map(c => canonCliente(c.cliente));
    const novosDetalhe = classificacao.novos;
    const reativadosDetalhe = classificacao.reativados;
    // Perdidos = compraram no comparado mas não no atual, considerando o recorte deste vendedor
    const perdidos = [...comp.clientes.keys()].filter(c => !atual.clientes.has(c));

    // clientes comparados
    const allClients = new Set<string>([...atual.clientes.keys(), ...comp.clientes.keys()]);
    const cliCompare: { nome: string; fA: number; fC: number; delta: number; varPct: number | null }[] = [];
    allClients.forEach(c => {
      const a = atual.clientes.get(c)?.fat ?? 0;
      const k = comp.clientes.get(c)?.fat ?? 0;
      cliCompare.push({ nome: c, fA: a, fC: k, delta: a - k, varPct: calcVar(a, k) });
    });
    const clientesCresceram = rankVariation(cliCompare, "growth", { variationKey: "delta", percentKey: "varPct", label: "deepVendedorClientesCresceram" });
    const clientesCairam = rankVariation(cliCompare, "drop", { variationKey: "delta", percentKey: "varPct", label: "deepVendedorClientesCairam" });

    // produtos comparados
    const allProds = new Set<string>([...atual.produtos.keys(), ...comp.produtos.keys()]);
    const prodCompare: { nome: string; fA: number; fC: number; delta: number; varPct: number | null }[] = [];
    allProds.forEach(p => {
      const a = atual.produtos.get(p)?.fat ?? 0;
      const k = comp.produtos.get(p)?.fat ?? 0;
      prodCompare.push({ nome: p, fA: a, fC: k, delta: a - k, varPct: calcVar(a, k) });
    });
    const produtosCresceram = rankVariation(prodCompare, "growth", { variationKey: "delta", percentKey: "varPct", label: "deepVendedorProdutosCresceram" });
    const produtosCairam = rankVariation(prodCompare, "drop", { variationKey: "delta", percentKey: "varPct", label: "deepVendedorProdutosCairam" });

    const seriesStart = hasComp && cStart < inicio ? cStart : inicio;
    const monthly = monthlySeries(
      baseSales.filter(r => {
        const d = String(r.data).slice(0, 10);
        return d >= seriesStart && d <= fim;
      }),
      vendedor,
    );

    return {
      atual, comp, tA, tC, novos, perdidos, reativados, novosDetalhe, reativadosDetalhe,
      clientesCresceram, clientesCairam, produtosCresceram, produtosCairam, monthly,
    };
  }, [baseSales, canonCliente, vendedor, inicio, fim, cStart, cEnd, hasComp, reativacaoDias]);

  const varFat = calcVar(data.atual.fat, data.comp.fat);

  const diagnostico = useMemo(() => buildDiagnostico({
    vendedor,
    fA: data.atual.fat, fC: data.comp.fat,
    pA: data.atual.pedidos.size, pC: data.comp.pedidos.size,
    cA: data.atual.clientes.size, cC: data.comp.clientes.size,
    tA: data.tA, tC: data.tC,
    novos: data.novos, perdidos: data.perdidos,
    clientesCresceram: data.clientesCresceram,
    clientesCairam: data.clientesCairam,
    produtosCresceram: data.produtosCresceram,
    produtosCairam: data.produtosCairam,
    hasComp,
  }), [vendedor, data, hasComp]);

  const leitura = useMemo(() => buildLeitura({
    fA: data.atual.fat, fC: data.comp.fat,
    cA: data.atual.clientes.size, cC: data.comp.clientes.size,
    pA: data.atual.pedidos.size, pC: data.comp.pedidos.size,
    hasComp, novos: data.novos.length, perdidos: data.perdidos.length,
  }), [data, hasComp]);

  const alertas = useMemo(() => buildAlertas({
    fA: data.atual.fat, fC: data.comp.fat,
    cA: data.atual.clientes.size, cC: data.comp.clientes.size,
    pA: data.atual.pedidos.size, pC: data.comp.pedidos.size,
    tA: data.tA, tC: data.tC,
    novos: data.novos.length, perdidos: data.perdidos.length,
    hasComp,
  }), [data, hasComp]);

  const tone = !hasComp
    ? "border-muted"
    : (varFat ?? 0) > 5 ? "border-green-500/40"
    : (varFat ?? 0) < -5 ? "border-red-500/40"
    : "border-amber-500/40";

  return (
    <Card className={`border-2 ${tone}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <span className="truncate">{vendedor}</span>
          </CardTitle>
          {hasComp && (
            <Badge variant="outline" className="text-[10px]">
              {(varFat ?? 0) > 0 ? <TrendingUp className="h-3 w-3 mr-1 text-green-600" /> : <TrendingDown className="h-3 w-3 mr-1 text-red-500" />}
              Variação: <VarBadge value={varFat} />
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <MiniKpi title="Faturamento" atual={R$(data.atual.fat)} comp={hasComp ? R$(data.comp.fat) : undefined} variation={calcVar(data.atual.fat, data.comp.fat)} icon={DollarSign} />
          <MiniKpi title="Pedidos" atual={num(data.atual.pedidos.size)} comp={hasComp ? num(data.comp.pedidos.size) : undefined} variation={calcVar(data.atual.pedidos.size, data.comp.pedidos.size)} icon={ShoppingCart} />
          <MiniKpi title="Clientes Ativos" atual={num(data.atual.clientes.size)} comp={hasComp ? num(data.comp.clientes.size) : undefined} variation={calcVar(data.atual.clientes.size, data.comp.clientes.size)} icon={Users} />
          <MiniKpi title="Ticket Médio" atual={R$(data.tA)} comp={hasComp ? R$(data.tC) : undefined} variation={calcVar(data.tA, data.tC)} icon={Target} />
          <MiniKpi title="Volume (kg)" atual={num(data.atual.qty)} comp={hasComp ? num(data.comp.qty) : undefined} variation={calcVar(data.atual.qty, data.comp.qty)} icon={Activity} />
          <MiniKpi title="SKUs (Mix)" atual={num(data.atual.produtos.size)} comp={hasComp ? num(data.comp.produtos.size) : undefined} variation={calcVar(data.atual.produtos.size, data.comp.produtos.size)} icon={Package} />
        </div>

        <div className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Diagnóstico</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground">{diagnostico}</p>
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Leitura Estratégica</span>
          </div>
          <p className="text-xs leading-relaxed">{leitura}</p>
        </div>

        {alertas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {alertas.map((a, i) => (
              <Badge
                key={i}
                variant={a.severidade === "alta" ? "destructive" : a.severidade === "media" ? "secondary" : "outline"}
                className="text-[10px]"
              >
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {a.tipo}
              </Badge>
            ))}
          </div>
        )}

        {data.monthly.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Evolução do Faturamento</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => R$(v)} />
                  <Line type="monotone" dataKey="fat" name="Faturamento" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Clientes Ativos & Pedidos</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis yAxisId="left" fontSize={10} />
                  <YAxis yAxisId="right" orientation="right" fontSize={10} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="clientes" name="Clientes" stroke="#10b981" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="pedidos" name="Pedidos" stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {hasComp && (data.clientesCresceram.length > 0 || data.clientesCairam.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-md border p-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Clientes que mais cresceram
              </p>
              {data.clientesCresceram.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nenhum cliente cresceu.</p>
              ) : (
                <div className="overflow-x-auto -mx-3">
                  <Table className="table-fixed w-full min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] h-7">Cliente</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Atual</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Anterior</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.clientesCresceram.slice(0, 8).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[11px] py-1 truncate" title={p.nome}>{p.nome}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{R$(p.fA)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right text-muted-foreground tabular-nums whitespace-nowrap">{R$(p.fC)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right text-green-600 font-semibold tabular-nums whitespace-nowrap">+{R$(p.delta)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <div className="rounded-md border p-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-2 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Clientes que mais caíram
              </p>
              {data.clientesCairam.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nenhum cliente caiu.</p>
              ) : (
                <div className="overflow-x-auto -mx-3">
                  <Table className="table-fixed w-full min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] h-7">Cliente</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Atual</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Anterior</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.clientesCairam.slice(0, 8).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[11px] py-1 truncate" title={p.nome}>{p.nome}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{R$(p.fA)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right text-muted-foreground tabular-nums whitespace-nowrap">{R$(p.fC)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right text-red-500 font-semibold tabular-nums whitespace-nowrap">{R$(p.delta)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        {hasComp && (data.produtosCresceram.length > 0 || data.produtosCairam.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-md border p-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Produtos que mais cresceram
              </p>
              <div className="overflow-x-auto -mx-3">
                <Table className="table-fixed w-full min-w-[340px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] h-7">Produto</TableHead>
                      <TableHead className="text-[10px] h-7 text-right w-[90px]">Atual</TableHead>
                      <TableHead className="text-[10px] h-7 text-right w-[90px]">Δ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.produtosCresceram.slice(0, 6).map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] py-1 truncate" title={formatProductDisplay(p.nome)}>{formatProductDisplay(p.nome)}</TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{R$(p.fA)}</TableCell>
                        <TableCell className="text-[11px] py-1 text-right text-green-600 font-semibold tabular-nums whitespace-nowrap">+{R$(p.delta)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="rounded-md border p-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-2 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Produtos que mais caíram
              </p>
              <div className="overflow-x-auto -mx-3">
                <Table className="table-fixed w-full min-w-[340px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] h-7">Produto</TableHead>
                      <TableHead className="text-[10px] h-7 text-right w-[90px]">Atual</TableHead>
                      <TableHead className="text-[10px] h-7 text-right w-[90px]">Δ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.produtosCairam.slice(0, 6).map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[11px] py-1 truncate" title={formatProductDisplay(p.nome)}>{formatProductDisplay(p.nome)}</TableCell>
                        <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{R$(p.fA)}</TableCell>
                        <TableCell className="text-[11px] py-1 text-right text-red-500 font-semibold tabular-nums whitespace-nowrap">{R$(p.delta)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {(data.novos.length > 0 || data.reativados.length > 0 || (hasComp && data.perdidos.length > 0)) && (
          <ClientesNovosPerdidosBlock
            novos={data.novos}
            reativados={data.reativados}
            perdidos={data.perdidos}
            novosDetalhe={data.novosDetalhe}
            reativadosDetalhe={data.reativadosDetalhe}
            baseSales={baseSales}
            canonCliente={canonCliente}
            inicio={inicio}
            fim={fim}
            cStart={cStart}
            cEnd={cEnd}
            reativacaoDias={reativacaoDias}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ClientesNovosPerdidosBlock({
  novos, reativados, perdidos, novosDetalhe, reativadosDetalhe,
  baseSales, canonCliente, inicio, fim, cStart, cEnd, reativacaoDias,
}: {
  novos: string[];
  reativados: string[];
  perdidos: string[];
  novosDetalhe: ClientClassificationResult[];
  reativadosDetalhe: ClientClassificationResult[];
  baseSales: SaleRow[];
  canonCliente: (raw: string) => string;
  inicio: string; fim: string; cStart: string; cEnd: string;
  reativacaoDias: number;
}) {
  const [openNovos, setOpenNovos] = useState(false);
  const [openReativados, setOpenReativados] = useState(false);
  const [openPerdidos, setOpenPerdidos] = useState(false);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {novos.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenNovos(true)}
            className="text-left rounded-md border border-green-500/30 bg-green-500/5 p-3 hover:bg-green-500/10 hover:border-green-500/50 transition group cursor-pointer"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 mb-1 flex items-center gap-1">
              <UserCheck className="h-3 w-3" /> Clientes novos ({novos.length})
              <Search className="h-3 w-3 ml-auto opacity-50 group-hover:opacity-100" />
            </p>
            <p className="text-[10px] text-muted-foreground mb-1">Primeira compra na história da base.</p>
            <div className="flex flex-wrap gap-1">
              {novos.slice(0, 30).map((c, i) => (
                <Badge key={i} variant="outline" className="text-[10px] border-green-500/40">{c}</Badge>
              ))}
              {novos.length > 30 && <span className="text-[10px] text-muted-foreground">+{novos.length - 30}</span>}
            </div>
            <p className="text-[10px] text-green-700/80 mt-2 underline">Ver detalhes →</p>
          </button>
        )}
        {reativados.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenReativados(true)}
            className="text-left rounded-md border border-blue-500/30 bg-blue-500/5 p-3 hover:bg-blue-500/10 hover:border-blue-500/50 transition group cursor-pointer"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 mb-1 flex items-center gap-1">
              <UserCheck className="h-3 w-3" /> Clientes reativados ({reativados.length})
              <Search className="h-3 w-3 ml-auto opacity-50 group-hover:opacity-100" />
            </p>
            <p className="text-[10px] text-muted-foreground mb-1">≥ {reativacaoDias} dias sem comprar antes de voltar.</p>
            <div className="flex flex-wrap gap-1">
              {reativados.slice(0, 30).map((c, i) => (
                <Badge key={i} variant="outline" className="text-[10px] border-blue-500/40">{c}</Badge>
              ))}
              {reativados.length > 30 && <span className="text-[10px] text-muted-foreground">+{reativados.length - 30}</span>}
            </div>
            <p className="text-[10px] text-blue-700/80 mt-2 underline">Ver detalhes →</p>
          </button>
        )}
        {perdidos.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenPerdidos(true)}
            className="text-left rounded-md border border-red-500/30 bg-red-500/5 p-3 hover:bg-red-500/10 hover:border-red-500/50 transition group cursor-pointer"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-1 flex items-center gap-1">
              <UserMinus className="h-3 w-3" /> Clientes que deixaram de comprar ({perdidos.length})
              <Search className="h-3 w-3 ml-auto opacity-50 group-hover:opacity-100" />
            </p>
            <div className="flex flex-wrap gap-1">
              {perdidos.slice(0, 30).map((c, i) => (
                <Badge key={i} variant="outline" className="text-[10px] border-red-500/40">{c}</Badge>
              ))}
              {perdidos.length > 30 && <span className="text-[10px] text-muted-foreground">+{perdidos.length - 30}</span>}
            </div>
            <p className="text-[10px] text-red-600/80 mt-2 underline">Ver detalhes dos {perdidos.length} clientes →</p>
          </button>
        )}
      </div>
      <ClientesDetalhesDialog
        open={openNovos}
        onOpenChange={setOpenNovos}
        tipo="novos"
        clientes={novos}
        baseSales={baseSales}
        canonCliente={canonCliente}
        inicio={inicio}
        fim={fim}
        cStart={cStart}
        cEnd={cEnd}
      />
      <ClientesDetalhesDialog
        open={openReativados}
        onOpenChange={setOpenReativados}
        tipo="novos"
        clientes={reativados}
        baseSales={baseSales}
        canonCliente={canonCliente}
        inicio={inicio}
        fim={fim}
        cStart={cStart}
        cEnd={cEnd}
      />
      <ClientesDetalhesDialog
        open={openPerdidos}
        onOpenChange={setOpenPerdidos}
        tipo="perdidos"
        clientes={perdidos}
        baseSales={baseSales}
        canonCliente={canonCliente}
        inicio={inicio}
        fim={fim}
        cStart={cStart}
        cEnd={cEnd}
      />
    </>
  );
}
