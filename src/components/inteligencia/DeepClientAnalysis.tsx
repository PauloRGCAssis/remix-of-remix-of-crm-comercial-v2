import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import {
  Brain, Users, ShoppingCart, DollarSign, Package, TrendingUp, TrendingDown,
  AlertTriangle, Calendar, Target, ArrowUpRight, ArrowDownRight, Minus, Sparkles, Activity,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { SaleRow, cleanProductName, shortVendedorName } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { buildClientConsolidation } from "@/lib/clientConsolidation";
import { PeriodComparisonBadge } from "./PeriodComparisonBadge";
import { DiagnosticoBlock, type DiagnosticoSection } from "./DiagnosticoBlock";
import { formatProductDisplay } from "@/lib/productDisplay";
import { rankVariation } from "@/lib/variationRanking";

// ============== Helpers ==============
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

function normalizeClienteBase(raw: string): string {
  if (!raw) return "(sem cliente)";
  let s = String(raw).trim();
  while (true) {
    const next = s.replace(/\s*\([^()]{0,12}\)\s*$/u, "").trim();
    if (next === s) break;
    s = next;
  }
  return normalizeClientName(s) || s || "(sem cliente)";
}

interface ClientMetrics {
  fat: number;
  qty: number;
  pedidos: Set<number>;
  diasAtivos: Set<string>;
  produtos: Map<string, { fat: number; qty: number }>;
}

function emptyMetrics(): ClientMetrics {
  return { fat: 0, qty: 0, pedidos: new Set(), diasAtivos: new Set(), produtos: new Map() };
}

function accumulate(target: ClientMetrics, r: SaleRow) {
  target.fat += Number(r.preco_total);
  target.qty += Number(r.quantidade);
  target.pedidos.add(r.codigo_venda);
  target.diasAtivos.add(String(r.data).slice(0, 10));
  const p = cleanProductName(r.descricao);
  if (p) {
    const e = target.produtos.get(p) ?? { fat: 0, qty: 0 };
    e.fat += Number(r.preco_total);
    e.qty += Number(r.quantidade);
    target.produtos.set(p, e);
  }
}

function avgIntervalDays(diasAtivos: Set<string>): number | null {
  if (diasAtivos.size < 2) return null;
  const sorted = [...diasAtivos].sort();
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1] + "T00:00:00").getTime();
    const b = new Date(sorted[i] + "T00:00:00").getTime();
    total += (b - a) / 86400000;
  }
  return total / (sorted.length - 1);
}

function monthlySeries(rows: SaleRow[], cliente: string, canon: (raw: string) => string) {
  const map = new Map<string, { fat: number; pedidos: Set<number> }>();
  for (const r of rows) {
    if (canon(r.cliente) !== cliente) continue;
    const ym = String(r.data).slice(0, 7);
    const e = map.get(ym) ?? { fat: 0, pedidos: new Set() };
    e.fat += Number(r.preco_total);
    e.pedidos.add(r.codigo_venda);
    map.set(ym, e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({
      mes,
      fat: v.fat,
      pedidos: v.pedidos.size,
      ticket: v.pedidos.size > 0 ? v.fat / v.pedidos.size : 0,
    }));
}

// ============== Diagnostic (structured) ==============

function buildDiagnosticoSections(args: {
  cliente: string;
  fA: number; fC: number;
  pA: number; pC: number;
  qA: number; qC: number;
  tA: number; tC: number;
  skusA: number; skusC: number;
  intervaloA: number | null; intervaloC: number | null;
  produtosPerdidos: string[];
  produtosNovos: string[];
  produtosCresceram: { nome: string; deltaFat: number }[];
  produtosCairam: { nome: string; deltaFat: number }[];
  hasComp: boolean;
}): DiagnosticoSection[] {
  const { cliente, fA, fC, pA, pC, tA, tC, skusA, skusC, intervaloA, intervaloC,
    produtosPerdidos, produtosNovos, produtosCresceram, produtosCairam, hasComp } = args;

  const sections: DiagnosticoSection[] = [];

  if (!hasComp) {
    if (fA <= 0) {
      sections.push({ title: "Sem vendas no período", tone: "warn", items: [`${cliente} não apresentou compras no período selecionado.`] });
      return sections;
    }
    sections.push({
      title: "Resumo do período",
      tone: "neutral",
      items: [
        `Faturamento: ${R$(fA)} em ${pA} pedidos`,
        `Ticket médio: ${R$(tA)}`,
        `Mix de produtos: ${skusA} SKUs ativos`,
        intervaloA ? `Intervalo médio entre compras: ${num1(intervaloA)} dias` : "Apenas 1 dia ativo no período",
        "Defina um período comparativo para uma análise de evolução.",
      ],
    });
    return sections;
  }

  const variacao = calcVar(fA, fC);

  if (fA <= 0 && fC > 0) {
    sections.push({
      title: "PERDA TOTAL — Cliente parou de comprar",
      tone: "down",
      items: [
        `Faturava ${R$(fC)} em ${pC} pedidos no período anterior`,
        `No período atual: ${R$(0)} (0 pedidos)`,
        "Ação imediata recomendada — entender motivo da parada",
      ],
    });
    return sections;
  }
  if (fC <= 0 && fA > 0) {
    sections.push({
      title: "Cliente novo / reativado",
      tone: "up",
      items: [
        `Não comprava no período anterior; agora faturou ${R$(fA)}`,
        `${pA} pedidos, ${skusA} SKUs, ticket médio ${R$(tA)}`,
      ],
    });
    return sections;
  }

  const cresceu = (variacao ?? 0) > 0;
  sections.push({
    title: cresceu ? "Crescimento" : "Queda",
    tone: cresceu ? "up" : "down",
    items: [
      `Variação: ${pct(variacao)} (${R$(fA - fC)})`,
      `Atual: ${R$(fA)} em ${pA} pedidos · Anterior: ${R$(fC)} em ${pC} pedidos`,
    ],
  });

  // Causas
  const varMix = calcVar(skusA, skusC);
  const varPedidos = calcVar(pA, pC);
  const varTicket = calcVar(tA, tC);
  const varIntervalo = intervaloA !== null && intervaloC !== null && intervaloC > 0
    ? ((intervaloA - intervaloC) / intervaloC) * 100
    : null;

  const causas: string[] = [];
  if (cresceu) {
    if (varMix !== null && varMix > 15) causas.push(`Aumento do mix de produtos (${skusC} → ${skusA} SKUs)`);
    if (varPedidos !== null && varPedidos > 15) causas.push(`Aumento da frequência de pedidos (${pC} → ${pA})`);
    if (varTicket !== null && varTicket > 15) causas.push(`Aumento do ticket médio (${R$(tC)} → ${R$(tA)})`);
    if (varIntervalo !== null && varIntervalo < -15) causas.push(`Redução do intervalo entre compras (${num1(intervaloC!)}d → ${num1(intervaloA!)}d)`);
  } else {
    if (varMix !== null && varMix < -15) causas.push(`Redução do mix de produtos (${skusC} → ${skusA} SKUs)`);
    if (varPedidos !== null && varPedidos < -15) causas.push(`Queda na frequência de pedidos (${pC} → ${pA})`);
    if (varTicket !== null && varTicket < -15) causas.push(`Queda do ticket médio (${R$(tC)} → ${R$(tA)})`);
    if (varIntervalo !== null && varIntervalo > 15) causas.push(`Aumento do intervalo entre compras (${num1(intervaloC!)}d → ${num1(intervaloA!)}d) — perda de recorrência`);
  }
  if (causas.length === 0) causas.push("Mix, frequência e ticket permaneceram estáveis");
  sections.push({
    title: cresceu ? "Principais motivos do crescimento" : "Principais motivos da queda",
    tone: "insight",
    items: causas,
  });

  if (cresceu && produtosCresceram.length > 0) {
    sections.push({
      title: "Produtos que mais impulsionaram",
      tone: "up",
      items: produtosCresceram.slice(0, 5).map(p => `${formatProductDisplay(p.nome)} (+${R$(p.deltaFat)})`),
    });
  }
  if (!cresceu && produtosCairam.length > 0) {
    sections.push({
      title: "Produtos que mais perderam participação",
      tone: "down",
      items: produtosCairam.slice(0, 5).map(p => `${formatProductDisplay(p.nome)} (${R$(p.deltaFat)})`),
    });
  }
  if (produtosPerdidos.length > 0) {
    sections.push({
      title: `Produtos abandonados (${produtosPerdidos.length})`,
      tone: "warn",
      items: produtosPerdidos.slice(0, 8),
    });
  }
  if (produtosNovos.length > 0) {
    sections.push({
      title: `Novos produtos adicionados (${produtosNovos.length})`,
      tone: "up",
      items: produtosNovos.slice(0, 8),
    });
  }

  return sections;
}

function buildLeituraSections(args: {
  fA: number; fC: number;
  pA: number; pC: number;
  skusA: number; skusC: number;
  intervaloA: number | null; intervaloC: number | null;
  hasComp: boolean;
}): DiagnosticoSection[] {
  const { fA, fC, skusA, skusC, intervaloA, hasComp } = args;
  if (!hasComp) {
    return [{ title: "Configurar comparação", tone: "neutral", items: ["Defina um período comparativo para gerar a leitura estratégica completa."] }];
  }
  const variacao = calcVar(fA, fC) ?? 0;
  if (fA <= 0 && fC > 0) {
    return [{ title: "Cliente PERDIDO", tone: "down", items: [
      "Priorizar reaproximação imediata",
      "Entender motivo da parada",
      "Oferecer condições de reativação",
    ] }];
  }
  if (fC <= 0 && fA > 0) {
    return [{ title: "Cliente NOVO / REATIVADO", tone: "up", items: [
      "Momento ideal para fidelizar",
      "Ampliar mix oferecido",
      "Estabelecer recorrência de pedidos",
    ] }];
  }
  if (variacao > 25) {
    return [{ title: "Crescimento ACELERADO", tone: "up", items: [
      "Cliente em expansão — proteger a conta",
      "Oferecer condições especiais",
      "Ampliar mix com produtos complementares",
    ] }];
  }
  if (variacao > 5) {
    return [{ title: "Cliente saudável", tone: "up", items: [
      "Oportunidade de cross-sell",
      "Aumento gradual do ticket médio",
      "Expansão de mix",
    ] }];
  }
  if (variacao > -5) {
    return [{ title: "Cliente ESTABILIZADO", tone: "neutral", items: [
      "Manter relacionamento",
      "Identificar oportunidades de aumento de mix",
    ] }];
  }
  if (variacao > -25) {
    const items: string[] = [];
    if (skusC > 0 && skusA / Math.max(skusC, 1) < 0.7) items.push("Perda relevante de mix — reapresentar produtos descontinuados");
    if (intervaloA && intervaloA > 20) items.push("Perda de recorrência — contato comercial para gerar pedido");
    if (items.length === 0) items.push("Mapear causa antes que a queda se aprofunde");
    return [{ title: "Cliente em ALERTA", tone: "warn", items }];
  }
  return [{ title: "RISCO CRÍTICO", tone: "down", items: [
    "Queda estrutural — combinação de perda de mix, frequência ou ticket",
    "Plano de recuperação urgente",
  ] }];
}

function buildAlertas(args: {
  fA: number; fC: number;
  pA: number; pC: number;
  skusA: number; skusC: number;
  intervaloA: number | null; intervaloC: number | null;
  produtosPerdidos: string[];
  hasComp: boolean;
}): { tipo: string; severidade: "alta" | "media" | "baixa" }[] {
  const out: { tipo: string; severidade: "alta" | "media" | "baixa" }[] = [];
  if (!args.hasComp) return out;
  const { fA, fC, skusA, skusC, intervaloA, intervaloC, produtosPerdidos } = args;
  const variacao = calcVar(fA, fC);

  if (fA <= 0 && fC > 0) out.push({ tipo: "Cliente PERDIDO no período", severidade: "alta" });
  if (fC <= 0 && fA > 0) out.push({ tipo: "Cliente novo / reativado", severidade: "baixa" });
  if (variacao !== null && variacao <= -25) out.push({ tipo: "Forte queda de faturamento", severidade: "alta" });
  if (variacao !== null && variacao >= 25) out.push({ tipo: "Crescimento acelerado", severidade: "baixa" });
  if (skusC > 0 && skusA < skusC * 0.6) out.push({ tipo: "Forte perda de mix de produtos", severidade: "alta" });
  if (skusC > 0 && skusA > skusC * 1.4) out.push({ tipo: "Ganho relevante de mix", severidade: "baixa" });
  if (intervaloA && intervaloC && intervaloA > intervaloC * 1.5) out.push({ tipo: "Perda de recorrência (intervalo aumentou)", severidade: "media" });
  if (produtosPerdidos.length >= 3) out.push({ tipo: `${produtosPerdidos.length} produtos abandonados`, severidade: "media" });
  if (skusA > 0 && skusA <= 2 && fA > 0) out.push({ tipo: "Dependência excessiva de poucos produtos", severidade: "media" });

  return out;
}

// ============== Component ==============

interface Props {
  sales: SaleRow[];
  inicio: string;
  fim: string;
  compInicio: string;
  compFim: string;
  vendedoresFilter: string[];
}

export function DeepClientAnalysis({ sales, inicio, fim, compInicio, compFim, vendedoresFilter }: Props) {
  // Filtro de vendedor agora obedece estritamente ao filtro GLOBAL do cabeçalho.
  // O filtro local foi removido a pedido do usuário para evitar duplicidade.
  const baseSales = useMemo(() => {
    if (vendedoresFilter.length === 0) return sales;
    return sales.filter(s =>
      vendedoresFilter.includes(s.vendedor) || vendedoresFilter.includes(shortVendedorName(s.vendedor))
    );
  }, [sales, vendedoresFilter]);

  // Consolidation
  const consolidation = useMemo(() => {
    const names = new Set<string>();
    for (const s of baseSales) names.add(s.cliente ?? "");
    return buildClientConsolidation(names);
  }, [baseSales]);

  const canon = useMemo(() => {
    const m = consolidation.map;
    return (raw: string) => m.get(raw) ?? normalizeClienteBase(raw);
  }, [consolidation]);

  const allClients = useMemo(() => {
    const set = new Set<string>();
    for (const s of baseSales) set.add(canon(s.cliente));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [baseSales, canon]);

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
          Análise Profunda por Cliente
          <Badge variant="outline" className="text-[10px] font-normal">
            <Sparkles className="h-2.5 w-2.5 mr-1" />Diagnóstico inteligente
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Selecione 1 ou mais clientes para gerar diagnóstico comercial completo — entender POR QUE cresceu ou caiu,
          identificar perda/ganho de mix, recorrência, ticket e produtos críticos.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              Cliente(s) — o filtro de vendedor segue o cabeçalho
              {vendedoresFilter.length > 0 && (
                <> (<strong>{vendedoresFilter.join(", ")}</strong>)</>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(allClients)}
                className="text-[11px] underline text-primary hover:text-primary/80"
                disabled={allClients.length === 0}
              >
                Analisar TODOS ({allClients.length})
              </button>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-[11px] underline text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
          <SearchableCombobox
            options={allClients}
            value={selected}
            onValueChange={setSelected}
            placeholder="Buscar cliente..."
            searchPlaceholder="Digite o nome do cliente..."
            allLabel="Limpar seleção"
            applyMode={false}
            selectionMode="multiple"
            closeOnSelect={false}
          />
          <p className="text-[11px] text-muted-foreground">
            {selected.length === 0
              ? "Nenhum cliente selecionado — use a busca ou clique em \"Analisar TODOS\"."
              : `${selected.length} cliente${selected.length > 1 ? "s" : ""} em análise`}
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
            <p className="text-sm">Selecione um cliente para começar o diagnóstico.</p>
            <p className="text-[11px] max-w-md">
              A análise mostra evolução, mix de produtos, recorrência, ticket médio,
              produtos novos/perdidos e gera texto explicando o motivo do crescimento ou queda.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {selected.map(cli => (
              <ClienteCard
                key={cli}
                cliente={cli}
                baseSales={baseSales}
                canon={canon}
                inicio={inicio}
                fim={fim}
                cStart={cStart}
                cEnd={cEnd}
                hasComp={hasComp}
                compMethod={hasComp ? (hasUserComp ? "manual" : "auto-previous") : "none"}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============== Per-client card ==============

function ClienteCard({
  cliente, baseSales, canon, inicio, fim, cStart, cEnd, hasComp, compMethod,
}: {
  cliente: string;
  baseSales: SaleRow[];
  canon: (raw: string) => string;
  inicio: string; fim: string;
  cStart: string; cEnd: string;
  hasComp: boolean;
  compMethod: "manual" | "auto-previous" | "none";
}) {
  const data = useMemo(() => {
    const atual = emptyMetrics();
    const comp = emptyMetrics();
    // Última venda observada por produto (em qualquer momento) — usado para status.
    const prodLastSale = new Map<string, string>();
    for (const r of baseSales) {
      if (canon(r.cliente) !== cliente) continue;
      const d = String(r.data).slice(0, 10);
      const p = cleanProductName(r.descricao);
      if (p) {
        const prev = prodLastSale.get(p);
        if (!prev || d > prev) prodLastSale.set(p, d);
      }
      if (inicio && fim && d >= inicio && d <= fim) accumulate(atual, r);
      if (hasComp && d >= cStart && d <= cEnd) accumulate(comp, r);
    }

    const tA = atual.pedidos.size > 0 ? atual.fat / atual.pedidos.size : 0;
    const tC = comp.pedidos.size > 0 ? comp.fat / comp.pedidos.size : 0;
    const intA = avgIntervalDays(atual.diasAtivos);
    const intC = avgIntervalDays(comp.diasAtivos);

    // produtos comparados — inclui produtos que zeraram (perdidos) E os que existem apenas no comparativo.
    const allProds = new Set<string>([...atual.produtos.keys(), ...comp.produtos.keys(), ...prodLastSale.keys()]);
    const today = fim || new Date().toISOString().slice(0, 10);
    const todayT = new Date(today + "T00:00:00").getTime();
    type ProdRow = { nome: string; fA: number; fC: number; deltaFat: number; varPct: number | null; ultimaVenda: string | null; diasSemVenda: number | null; status: "abandonado" | "forte-queda" | "queda-leve" | "sem-venda-recente" | "estavel" };
    const prodCompare: ProdRow[] = [];
    allProds.forEach(nome => {
      const a = atual.produtos.get(nome)?.fat ?? 0;
      const c = comp.produtos.get(nome)?.fat ?? 0;
      const ultima = prodLastSale.get(nome) ?? null;
      const diasSem = ultima ? Math.max(0, Math.round((todayT - new Date(ultima + "T00:00:00").getTime()) / 86400000)) : null;
      const varPct = calcVar(a, c);
      let status: ProdRow["status"] = "estavel";
      if (a === 0 && c > 0) status = "abandonado";
      else if (varPct !== null && varPct <= -40) status = "forte-queda";
      else if (varPct !== null && varPct < 0) status = "queda-leve";
      else if (a === 0 && diasSem !== null && diasSem >= 60) status = "sem-venda-recente";
      prodCompare.push({ nome, fA: a, fC: c, deltaFat: a - c, varPct, ultimaVenda: ultima, diasSemVenda: diasSem, status });
    });
    const cresceram = rankVariation(prodCompare, "growth", { variationKey: "deltaFat", percentKey: "varPct", label: "deepClienteProdutosCresceram" });
    const cairam = rankVariation(prodCompare, "drop", { variationKey: "deltaFat", percentKey: "varPct", label: "deepClienteProdutosCairam" });
    const perdidos = prodCompare.filter(p => p.fC > 0 && p.fA === 0).map(p => p.nome);
    const novos = prodCompare.filter(p => p.fA > 0 && p.fC === 0).map(p => p.nome);

    // monthly series (combine both periods)
    const seriesStart = hasComp && cStart < inicio ? cStart : inicio;
    const monthly = monthlySeries(
      baseSales.filter(r => {
        const d = String(r.data).slice(0, 10);
        return d >= seriesStart && d <= fim;
      }),
      cliente,
      canon,
    );

    return {
      atual, comp, tA, tC, intA, intC,
      prodCompare, cresceram, cairam, perdidos, novos, monthly,
    };
  }, [baseSales, canon, cliente, inicio, fim, cStart, cEnd, hasComp]);

  const varFat = calcVar(data.atual.fat, data.comp.fat);

  const diagnosticoSections = useMemo(() => buildDiagnosticoSections({
    cliente,
    fA: data.atual.fat, fC: data.comp.fat,
    pA: data.atual.pedidos.size, pC: data.comp.pedidos.size,
    qA: data.atual.qty, qC: data.comp.qty,
    tA: data.tA, tC: data.tC,
    skusA: data.atual.produtos.size, skusC: data.comp.produtos.size,
    intervaloA: data.intA, intervaloC: data.intC,
    produtosPerdidos: data.perdidos,
    produtosNovos: data.novos,
    produtosCresceram: data.cresceram,
    produtosCairam: data.cairam,
    hasComp,
  }), [cliente, data, hasComp]);

  const leituraSections = useMemo(() => buildLeituraSections({
    fA: data.atual.fat, fC: data.comp.fat,
    pA: data.atual.pedidos.size, pC: data.comp.pedidos.size,
    skusA: data.atual.produtos.size, skusC: data.comp.produtos.size,
    intervaloA: data.intA, intervaloC: data.intC,
    hasComp,
  }), [data, hasComp]);

  const alertas = useMemo(() => buildAlertas({
    fA: data.atual.fat, fC: data.comp.fat,
    pA: data.atual.pedidos.size, pC: data.comp.pedidos.size,
    skusA: data.atual.produtos.size, skusC: data.comp.produtos.size,
    intervaloA: data.intA, intervaloC: data.intC,
    produtosPerdidos: data.perdidos,
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
            <Users className="h-4 w-4 text-primary" />
            <span className="truncate">{cliente}</span>
          </CardTitle>
          {hasComp && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {(varFat ?? 0) > 0 ? <TrendingUp className="h-3 w-3 mr-1 text-green-600" /> : <TrendingDown className="h-3 w-3 mr-1 text-red-500" />}
                Variação: <VarBadge value={varFat} />
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <PeriodComparisonBadge
          inicio={inicio}
          fim={fim}
          compInicio={hasComp ? cStart : undefined}
          compFim={hasComp ? cEnd : undefined}
          method={compMethod}
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <MiniKpi title="Faturamento" atual={R$(data.atual.fat)} comp={hasComp ? R$(data.comp.fat) : undefined} variation={calcVar(data.atual.fat, data.comp.fat)} icon={DollarSign} />
          <MiniKpi title="Pedidos" atual={num(data.atual.pedidos.size)} comp={hasComp ? num(data.comp.pedidos.size) : undefined} variation={calcVar(data.atual.pedidos.size, data.comp.pedidos.size)} icon={ShoppingCart} />
          <MiniKpi title="Ticket Médio" atual={R$(data.tA)} comp={hasComp ? R$(data.tC) : undefined} variation={calcVar(data.tA, data.tC)} icon={Target} />
          <MiniKpi title="SKUs (Mix)" atual={num(data.atual.produtos.size)} comp={hasComp ? num(data.comp.produtos.size) : undefined} variation={calcVar(data.atual.produtos.size, data.comp.produtos.size)} icon={Package} />
          <MiniKpi title="Volume (kg)" atual={num(data.atual.qty)} comp={hasComp ? num(data.comp.qty) : undefined} variation={calcVar(data.atual.qty, data.comp.qty)} icon={Activity} />
          <MiniKpi
            title="Intervalo médio"
            atual={data.intA !== null ? `${num1(data.intA)} d` : "—"}
            comp={hasComp ? (data.intC !== null ? `${num1(data.intC)} d` : "—") : undefined}
            variation={data.intA !== null && data.intC !== null ? calcVar(data.intA, data.intC) : null}
            icon={Calendar}
          />
        </div>

        <DiagnosticoBlock sections={diagnosticoSections} variant="diagnostico" />
        <DiagnosticoBlock sections={leituraSections} variant="leitura" />

        {/* Alertas */}
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

        {/* Charts */}
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Faturamento & Pedidos</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis yAxisId="left" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" fontSize={10} />
                  <Tooltip formatter={(v: number, name) => name === "Faturamento" ? R$(v) : num(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="fat" name="Faturamento" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="pedidos" name="Pedidos" stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}


        {/* Produtos cresceram / cairam */}
        {hasComp && (data.cresceram.length > 0 || data.cairam.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-md border p-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Produtos que mais cresceram
              </p>
              {data.cresceram.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nenhum produto cresceu.</p>
              ) : (
                <div className="overflow-x-auto -mx-3">
                  <Table className="table-fixed w-full min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] h-7">Produto</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Atual</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Anterior</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Δ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.cresceram.slice(0, 8).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[11px] py-1 truncate" title={formatProductDisplay(p.nome)}>{formatProductDisplay(p.nome)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{R$(p.fA)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right text-muted-foreground tabular-nums whitespace-nowrap">{R$(p.fC)}</TableCell>
                          <TableCell className="text-[11px] py-1 text-right text-green-600 font-semibold tabular-nums whitespace-nowrap">+{R$(p.deltaFat)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <div className="rounded-md border p-3 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-2 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Produtos que mais caíram
              </p>
              {data.cairam.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nenhum produto caiu.</p>
              ) : (
                <div className="overflow-x-auto -mx-3">
                  <Table className="table-fixed w-full min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] h-7">Produto</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[80px]">Atual</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[80px]">Anterior</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[80px]">Δ</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[70px]">% queda</TableHead>
                        <TableHead className="text-[10px] h-7 text-right w-[90px]">Última venda</TableHead>
                        <TableHead className="text-[10px] h-7 w-[110px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.cairam.slice(0, 10).map((p, i) => {
                        const statusLabel = p.status === "abandonado" ? "Produto abandonado"
                          : p.status === "forte-queda" ? "Forte queda"
                          : p.status === "sem-venda-recente" ? "Sem venda recente"
                          : p.status === "queda-leve" ? "Queda leve" : "—";
                        const statusCls = p.status === "abandonado" || p.status === "forte-queda"
                          ? "border-red-500/50 text-red-600 bg-red-500/5"
                          : p.status === "sem-venda-recente" ? "border-amber-500/50 text-amber-700 bg-amber-500/5"
                          : "border-muted text-muted-foreground";
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-[11px] py-1 truncate" title={formatProductDisplay(p.nome)}>{formatProductDisplay(p.nome)}</TableCell>
                            <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{R$(p.fA)}</TableCell>
                            <TableCell className="text-[11px] py-1 text-right text-muted-foreground tabular-nums whitespace-nowrap">{R$(p.fC)}</TableCell>
                            <TableCell className="text-[11px] py-1 text-right text-red-500 font-semibold tabular-nums whitespace-nowrap">{R$(p.deltaFat)}</TableCell>
                            <TableCell className="text-[11px] py-1 text-right tabular-nums whitespace-nowrap">{p.varPct !== null ? `${p.varPct.toFixed(0)}%` : "—"}</TableCell>
                            <TableCell className="text-[11px] py-1 text-right whitespace-nowrap text-muted-foreground">{p.diasSemVenda !== null ? `há ${p.diasSemVenda}d` : "—"}</TableCell>
                            <TableCell className="py-1"><Badge variant="outline" className={`text-[9px] ${statusCls}`}>{statusLabel}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Perdidos / Novos lists */}
        {hasComp && (data.perdidos.length > 0 || data.novos.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.perdidos.length > 0 && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-1">
                  Produtos abandonados ({data.perdidos.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {data.perdidos.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-red-500/40">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.novos.length > 0 && (
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 mb-1">
                  Produtos novos ({data.novos.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {data.novos.map((p, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] border-green-500/40">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
