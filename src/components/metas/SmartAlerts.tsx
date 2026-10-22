import { useMemo, useState } from "react";
import { AlertTriangle, TrendingUp, ArrowUp, ArrowDown, Users, ChevronRight } from "lucide-react";
import {
  type VendorPerformanceSummary,
  useVendorHistory,
  COMMISSION_LEVELS,
} from "@/hooks/usePerformanceData";
import { type SaleRow, shortVendedorName } from "@/hooks/useSalesData";
import { RecompraPendingDrawer, type RecompraPendingClient } from "./RecompraPendingDrawer";

function levelPct(level: number): number {
  return COMMISSION_LEVELS.find((l) => l.level === level)?.pct ?? 5;
}

interface Props {
  performances: VendorPerformanceSummary[];
  sales?: SaleRow[];
  selectedYear: number;
  selectedMonth: number; // 0-11
  /** Days since last purchase to flag a client as awaiting recompra */
  recompraThresholdDays?: number;
}

type AlertItem =
  | {
      kind: "info";
      icon: React.ReactNode;
      label: string;
      tone: "warning" | "destructive" | "success" | "info";
    }
  | {
      kind: "recompra";
      icon: React.ReactNode;
      label: string;
      tone: "warning" | "destructive";
      vendedor: string;
      clients: RecompraPendingClient[];
    };

const toneClasses: Record<string, string> = {
  warning: "border-warning/40 bg-warning/5 text-foreground hover:bg-warning/10",
  destructive: "border-destructive/40 bg-destructive/5 text-foreground hover:bg-destructive/10",
  success: "border-success/40 bg-success/5 text-foreground hover:bg-success/10",
  info: "border-info/40 bg-info/5 text-foreground hover:bg-info/10",
};

const iconToneClasses: Record<string, string> = {
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-success",
  info: "text-info",
};

const MESES_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * NOVA REGRA — Clientes aguardando recompra:
 * Considera APENAS clientes que entraram no MÊS ANTERIOR ao selecionado e que NÃO compraram
 * no mês selecionado. "Entrou no mês anterior" = primeira compra histórica do cliente
 * (com este vendedor) ocorreu naquele mês.
 *
 * NÃO considera clientes antigos da base. NÃO considera clientes que já compraram no mês atual.
 */
function computeRecompraPending(
  sales: SaleRow[],
  vendedor: string,
  selectedYear: number,
  selectedMonth: number,
  _thresholdDays: number, // mantido por compatibilidade da assinatura
): RecompraPendingClient[] {
  const vendorSales = sales.filter((s) => shortVendedorName(s.vendedor) === vendedor);
  if (vendorSales.length === 0) return [];

  // Mês anterior (entrada) e mês atual (recompra esperada)
  let prevMonth = selectedMonth - 1;
  let prevYear = selectedYear;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }
  const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  const currKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

  // Reference date: end of selected month (or today if it's the current month)
  const today = new Date();
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
  const refDate =
    today.getFullYear() === selectedYear && today.getMonth() === selectedMonth ? today : monthEnd;

  // Group by client, keep all sales rows for analysis
  const byClient = new Map<
    string,
    { dates: Date[]; months: Set<string>; orders: Map<number, number>; total: number }
  >();

  for (const s of vendorSales) {
    const d = new Date(s.data);
    if (d > refDate) continue;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = byClient.get(s.cliente) ?? {
      dates: [],
      months: new Set<string>(),
      orders: new Map<number, number>(),
      total: 0,
    };
    entry.dates.push(d);
    entry.months.add(mk);
    entry.orders.set(s.codigo_venda, (entry.orders.get(s.codigo_venda) ?? 0) + Number(s.preco_total ?? 0));
    entry.total += Number(s.preco_total ?? 0);
    byClient.set(s.cliente, entry);
  }

  const pending: RecompraPendingClient[] = [];
  for (const [cliente, data] of byClient.entries()) {
    // Primeira compra histórica do cliente com este vendedor
    const sortedAsc = [...data.dates].sort((a, b) => a.getTime() - b.getTime());
    const firstPurchase = sortedAsc[0];
    const firstKey = `${firstPurchase.getFullYear()}-${String(firstPurchase.getMonth() + 1).padStart(2, "0")}`;

    // REGRA 1: precisa ter entrado exatamente no mês anterior
    if (firstKey !== prevKey) continue;
    // REGRA 2: não pode ter comprado no mês selecionado
    if (data.months.has(currKey)) continue;

    const ultimaCompra = sortedAsc[sortedAsc.length - 1];
    const diasSemComprar = Math.floor(
      (refDate.getTime() - ultimaCompra.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Last order value
    const lastOrderCode = vendorSales
      .filter((s) => s.cliente === cliente)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]?.codigo_venda;
    const valorUltimaCompra = lastOrderCode ? data.orders.get(lastOrderCode) ?? 0 : 0;

    const totalPedidos = data.orders.size;
    const ticketMedio = totalPedidos > 0 ? data.total / totalPedidos : 0;

    pending.push({
      cliente,
      ultimaCompra,
      diasSemComprar,
      valorUltimaCompra,
      totalPedidos,
      ticketMedio,
      faturamentoHistorico: data.total,
      mesEntrada: `${MESES_ABBR[prevMonth]}/${prevYear}`,
    });
  }

  return pending;
}

export function SmartAlerts({
  performances,
  sales,
  selectedYear,
  selectedMonth,
  recompraThresholdDays = 15,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [activeClients, setActiveClients] = useState<RecompraPendingClient[]>([]);

  // Fetch full history once to determine consecutive hit/miss for level transitions
  const { data: history = [] } = useVendorHistory();

  const prevYM = useMemo(() => {
    let pm = selectedMonth - 1;
    let py = selectedYear;
    if (pm < 0) {
      pm = 11;
      py -= 1;
    }
    return `${py}-${String(pm + 1).padStart(2, "0")}`;
  }, [selectedYear, selectedMonth]);

  // Mês corrente (ou futuro) ainda não fechou a competência
  const mesEmAndamento = useMemo(() => {
    const today = new Date();
    return (
      selectedYear > today.getFullYear() ||
      (selectedYear === today.getFullYear() && selectedMonth >= today.getMonth())
    );
  }, [selectedYear, selectedMonth]);

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];

    for (const p of performances) {
      // Missing tier requirements (premiação pendente já tratada via tag — manter alerta resumido)
      if (!p.tierValid && p.pctMeta >= 105 && p.faltaClientes > 0) {
        out.push({
          kind: "info",
          icon: <AlertTriangle className="h-3.5 w-3.5" />,
          label:
            p.faltaClientes === 1
              ? `${p.vendedor} — falta 1 cliente novo válido para ${p.tier.label}`
              : `${p.vendedor} — faltam ${p.faltaClientes} clientes novos válidos para ${p.tier.label}`,
          tone: "warning",
        });
      }


      // ----- Level transition: Queda / Risco / Subida -----
      // Use historical record of previous month + current performance
      const prevRecord = history.find(
        (h) => h.vendedor === p.vendedor && h.year_month === prevYM,
      );
      const prevHit = prevRecord?.meta_atingida ?? null;
      // Hierarquia cumulativa: conquistar qualquer degrau superior já cumpre a Meta Média.
      const currHit = p.metaMediaAtingida;

      const baseLevel = prevRecord?.commission_level ?? p.commissionLevel;

      if (!currHit && prevHit === false) {
        // Mês corrente ainda ABERTO: não conta como mês fechado sem meta — só alerta de risco.
        if (mesEmAndamento) {
          out.push({
            kind: "info",
            icon: <AlertTriangle className="h-3.5 w-3.5" />,
            label: `${p.vendedor} — Meta Média ainda não atingida no mês (risco de cair para ${levelPct(Math.max(baseLevel - 1, 0))}% no fechamento)`,
            tone: "warning",
          });
        } else {
          // QUEDA: dois meses FECHADOS consecutivos sem atingir a Meta Média → desce 1 nível
          const newLevel = Math.max(baseLevel - 1, 0);
          if (newLevel !== baseLevel) {
            out.push({
              kind: "info",
              icon: <ArrowDown className="h-3.5 w-3.5" />,
              label: `${p.vendedor} — Queda de nível: Nível ${baseLevel} (${levelPct(baseLevel)}%) → Nível ${newLevel} (${levelPct(newLevel)}%)`,
              tone: "destructive",
            });
          }
        }
      } else if (!currHit && prevHit === true) {
        // RISCO: primeiro mês sem atingir a Meta Média após sequência positiva
        out.push({
          kind: "info",
          icon: <AlertTriangle className="h-3.5 w-3.5" />,
          label: `${p.vendedor} — Meta Média ainda não atingida no mês (1º mês sem meta)`,
          tone: "warning",
        });
      } else if (currHit && prevHit === true && !mesEmAndamento) {
        // SUBIDA: dois meses FECHADOS consecutivos atingindo a Meta Média → sobe 1 nível
        const newLevel = Math.min(baseLevel + 1, 5);
        if (newLevel !== baseLevel) {
          out.push({
            kind: "info",
            icon: <ArrowUp className="h-3.5 w-3.5" />,
            label: `${p.vendedor} — Subiu de nível: Nível ${baseLevel} (${levelPct(baseLevel)}%) → Nível ${newLevel} (${levelPct(newLevel)}%)`,
            tone: "success",
          });
        }
      }


      // Aproximação para Excelência (mantido — informativo)
      if (p.pctMeta >= 115 && p.pctMeta < 120) {
        out.push({
          kind: "info",
          icon: <TrendingUp className="h-3.5 w-3.5" />,
          label: `${p.vendedor} — ${(120 - p.pctMeta).toFixed(1)}% para Excelência`,
          tone: "info",
        });
      }

      // Recompra pending — compute live from sales (regra: clientes novos do mês anterior sem compra no atual)
      if (sales && sales.length > 0) {
        const pending = computeRecompraPending(
          sales,
          p.vendedor,
          selectedYear,
          selectedMonth,
          recompraThresholdDays,
        );
        if (pending.length > 0) {
          const hasCritical = pending.some((c) => c.diasSemComprar >= 30);
          out.push({
            kind: "recompra",
            icon: <Users className="h-3.5 w-3.5" />,
            label: `${p.vendedor} — ${pending.length} ${pending.length === 1 ? "cliente aguardando" : "clientes aguardando"} recompra`,
            tone: hasCritical ? "destructive" : "warning",
            vendedor: p.vendedor,
            clients: pending,
          });
        }
      }
    }

    return out;
  }, [performances, sales, selectedYear, selectedMonth, recompraThresholdDays, history, prevYM, mesEmAndamento]);

  if (alerts.length === 0) return null;

  const shown = alerts.slice(0, 12);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {shown.map((a, i) => {
          const clickable = a.kind === "recompra";
          const Tag = clickable ? "button" : "div";
          return (
            <Tag
              key={i}
              type={clickable ? "button" : undefined}
              onClick={
                clickable
                  ? () => {
                      setActiveVendor(a.vendedor);
                      setActiveClients(a.clients);
                      setDrawerOpen(true);
                    }
                  : undefined
              }
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                toneClasses[a.tone]
              } ${clickable ? "cursor-pointer" : ""}`}
            >
              <span className={`shrink-0 ${iconToneClasses[a.tone]}`}>{a.icon}</span>
              <span className="flex-1 leading-tight line-clamp-2">{a.label}</span>
              {clickable && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </Tag>
          );
        })}
      </div>

      <RecompraPendingDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        vendedor={activeVendor}
        clients={activeClients}
      />
    </>
  );
}
