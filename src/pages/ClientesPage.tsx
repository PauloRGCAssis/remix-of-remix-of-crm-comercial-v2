import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Users, Filter, TrendingDown, Clock, AlertTriangle, RotateCcw, Loader2, ShoppingBag, Power, ChevronDown, Trash2, CalendarPlus } from "lucide-react";
import { NovaVisitaDialog } from "@/components/agenda/NovaVisitaDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useSalesData, shortVendedorName, cleanProductName, isExcludedProduct, getLastPurchaseByClient, getFirstPurchaseByClient, getUniqueVendedores, getVendorDebugRows, getProdutosComerciaisValidos } from "@/hooks/useSalesData";
import { useClientStatusOverride } from "@/hooks/useClientStatusOverride";
import { useClientAliases } from "@/hooks/useClientAliases";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { calcularStatusCliente } from "@/lib/clientStatusRule";
import { ProductFilterPopover } from "@/components/clientes/ProductFilterPopover";
import { MissingProductsCell } from "@/components/clientes/MissingProductsCell";
import { DuplicatesBanner } from "@/components/clientes/DuplicatesBanner";
import { toast } from "sonner";
import { usePersistentState } from "@/hooks/usePersistentState";


interface ClientRow {
  nome: string;
  vendedor: string;
  status: "ativo" | "atencao" | "critico" | "inativo";
  diasSemComprar: number;
  dataUltimaCompra: string;
  dataPrimeiraCompra: string;
  totalCompras: number;
  totalKg: number;
  totalFat: number;
  ticketMedio: number;
  mediaKg: number;
  isPrimeiraVenda: boolean;
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function StatusBadge({ status }: { status: ClientRow["status"] }) {
  if (status === "ativo") return <Badge className="bg-success/20 text-success border-success/50 hover:bg-success/30 text-xs font-semibold">Em dia</Badge>;
  if (status === "atencao") return <Badge className="bg-warning/25 text-warning border-warning/60 hover:bg-warning/35 text-xs font-semibold">Atenção</Badge>;
  if (status === "critico") return <Badge className="bg-destructive/20 text-destructive border-destructive/50 hover:bg-destructive/30 text-xs font-semibold">Crítico</Badge>;
  return <Badge className="bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/25 text-xs font-semibold">Inativo</Badge>;
}

// Tag clicável abaixo do nome — permite override manual do status operacional do cliente.
// Ao escolher uma opção, o status (tag + coluna Status + filtros + cores) muda em conjunto.
type ManualOverride = "ativo" | "atencao" | "inativo";

function ClienteStatusTag({
  status,
  onChange,
}: {
  status: ClientRow["status"];
  onChange: (value: ManualOverride) => void;
}) {
  const isAtivo = status === "ativo";
  const isAtencao = status === "atencao";
  const label = status === "ativo" ? "Ativo"
    : status === "atencao" ? "Atenção"
    : "Inativo";

  const options: { value: ManualOverride; label: string; tone: string }[] = [
    { value: "ativo", label: "Ativo", tone: "text-success" },
    { value: "atencao", label: "Atenção", tone: "text-warning" },
    { value: "inativo", label: "Inativo", tone: "text-destructive" },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors hover:opacity-90",
            isAtivo
              ? "bg-success/20 text-success border-success/50 hover:bg-success/30"
              : isAtencao
                ? "bg-warning/25 text-warning border-warning/60 hover:bg-warning/35"
                : "bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/25"
          )}
          title="Clique para alterar manualmente o status do cliente"
        >
          <Power className="h-2.5 w-2.5" />
          {label}
          <ChevronDown className="h-2.5 w-2.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">
          Alterar status
        </div>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
              (document.activeElement as HTMLElement | null)?.blur();
            }}
            className={cn(
              "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors flex items-center gap-2",
              opt.tone,
            )}
          >
            <Power className="h-3 w-3" />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

type SortKey =
  | "days"
  | "daysAsc"
  | "alpha"
  | "alphaDesc"
  | "avgKg"
  | "ticketMedio"
  | "lastOld"
  | "lastNew";
type FirstSaleFilter = "todos" | "primeira_venda" | "recorrentes";

const SORT_STORAGE_KEY = "clientes:sortBy";
const isValidSortKey = (v: string): v is SortKey =>
  ["days", "daysAsc", "alpha", "alphaDesc", "avgKg", "ticketMedio", "lastOld", "lastNew"].includes(v);

export default function ClientesPage() {
  const { data: allSales, isLoading } = useSalesData();
  
  const [search, setSearch] = usePersistentState("clientes:search", "");
  const [statusFilter, setStatusFilter] = usePersistentState("clientes:statusFilter", "todos");
  const [vendedorFilter, setVendedorFilter] = usePersistentState("clientes:vendedorFilter", "todos");
  const [inactivityFilter, setInactivityFilter] = usePersistentState("clientes:inactivityFilter", "all");
  const [maxInactivityFilter, setMaxInactivityFilter] = usePersistentState("clientes:maxInactivityFilter", "all");
  const [sortBy, setSortByState] = usePersistentState<SortKey>("clientes:sortBy", () => {
    if (typeof window === "undefined") return "days";
    try {
      const stored = window.sessionStorage.getItem(SORT_STORAGE_KEY);
      if (stored && isValidSortKey(stored)) return stored;
    } catch { /* noop */ }
    return "days";
  });
  const setSortBy = (value: SortKey) => {
    setSortByState(value);
    try { window.sessionStorage.setItem(SORT_STORAGE_KEY, value); } catch { /* noop */ }
  };
  const [buyProducts, setBuyProducts] = usePersistentState<string[]>("clientes:buyProducts", []);
  const [dontBuyProducts, setDontBuyProducts] = usePersistentState<string[]>("clientes:dontBuyProducts", []);
  const [firstSaleFilter, setFirstSaleFilter] = usePersistentState<FirstSaleFilter>("clientes:firstSaleFilter", "todos");
  type AtivoFilter = "todos" | "ativos" | "inativos" | "ativo" | "atencao" | "critico";
  const [ativoFilter, setAtivoFilter] = usePersistentState<AtivoFilter>("clientes:ativoFilter", "todos");
  const [agendarClienteNome, setAgendarClienteNome] = useState<string | null>(null);

  const resetAllFilters = () => {
    setSearch("");
    setStatusFilter("todos");
    setVendedorFilter("todos");
    setInactivityFilter("all");
    setMaxInactivityFilter("all");
    setSortBy("days");
    setBuyProducts([]);
    setDontBuyProducts([]);
    setFirstSaleFilter("todos");
    setAtivoFilter("todos");
  };

  const today = useMemo(() => new Date(), []);
  const { overrides, setOverride } = useClientStatusOverride();
  const { excludeClient } = useClientAliases();
  // Módulo somente de acesso: as ações seguem os módulos donos dos dados (regra aprovada).
  const podeExcluirDasAnalises = useModuleCrud("clientes_duplicados", "clientes duplicados").podeExcluir;
  const podeAgendarVisita = useModuleCrud("agenda_visitas", "visitas").podeCriar;

  const clients = useMemo(() => {
    if (!allSales || allSales.length === 0) return [];

    const lastPurchase = getLastPurchaseByClient(allSales);
    const firstPurchase = getFirstPurchaseByClient(allSales);

    // Build per-client aggregation using Pedidos_Agregados logic
    const clientMap = new Map<string, {
      vendedor: string;
      orderCodes: Set<number>;
      totalKg: number;
      totalFat: number;
    }>();

    allSales.forEach((sale) => {
      const existing = clientMap.get(sale.cliente);

      if (!existing) {
        clientMap.set(sale.cliente, {
          vendedor: shortVendedorName(sale.vendedor),
          orderCodes: new Set([sale.codigo_venda]),
          totalKg: Number(sale.quantidade),
          totalFat: Number(sale.preco_total),
        });
        return;
      }

      existing.orderCodes.add(sale.codigo_venda);
      existing.totalKg += Number(sale.quantidade);
      existing.totalFat += Number(sale.preco_total);
      existing.vendedor = shortVendedorName(sale.vendedor);
    });

    const rows: ClientRow[] = [];
    clientMap.forEach((data, nome) => {
      const lastDate = lastPurchase.get(nome)!;
      const firstDate = firstPurchase.get(nome)!;
      const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      // totalCompras = COUNT DISTINCT codigo_venda (pedidos únicos, não linhas)
      const totalCompras = data.orderCodes.size;

      // Régua oficial: 0-15 = Em dia, 16-59 = Atenção, >= 60 = Crítico
      let status: ClientRow["status"] = calcularStatusCliente(diffDays);

      // Override manual prevalece sobre o cálculo automático.
      const manual = overrides[nome];
      if (manual === "ativo") status = "ativo";
      else if (manual === "atencao") status = "atencao";
      else if (manual === "inativo") status = "inativo";

      // Ticket médio = faturamento / pedidos (não dividir por linhas)
      const ticketMedio = totalCompras > 0 ? data.totalFat / totalCompras : 0;
      // Média kg = volume / pedidos
      const mediaKg = totalCompras > 0 ? data.totalKg / totalCompras : 0;

      rows.push({
        nome,
        vendedor: data.vendedor,
        status,
        diasSemComprar: diffDays,
        dataUltimaCompra: formatDateBR(lastDate),
        dataPrimeiraCompra: formatDateBR(firstDate),
        totalCompras,
        totalKg: Math.round(data.totalKg),
        totalFat: data.totalFat,
        ticketMedio,
        mediaKg: Math.round(mediaKg),
        isPrimeiraVenda: totalCompras === 1,
      });
    });

    return rows;
  }, [allSales, today, overrides]);

  const allProducts = useMemo(() => getProdutosComerciaisValidos(allSales), [allSales]);

  const clientProducts = useMemo(() => {
    if (!allSales) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    allSales.forEach((sale) => {
      const product = cleanProductName(sale.descricao);
      if (!map.has(sale.cliente)) map.set(sale.cliente, new Set());
      map.get(sale.cliente)!.add(product);
    });
    return map;
  }, [allSales]);

  const vendedores = useMemo(() => (allSales ? getUniqueVendedores(allSales) : []), [allSales]);

  const normalizeSearch = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const filteredClients = useMemo(() => {
    const searchNorm = normalizeSearch(search);
    let filtered = clients.filter((client) => {
      const matchSearch = !searchNorm || normalizeSearch(client.nome).includes(searchNorm);
      const matchStatus = true;
      const matchVendedor = vendedorFilter === "todos" || client.vendedor === vendedorFilter;
      const matchFirstSale =
        firstSaleFilter === "todos" ||
        (firstSaleFilter === "primeira_venda" && client.isPrimeiraVenda) ||
        (firstSaleFilter === "recorrentes" && !client.isPrimeiraVenda);

      const isClienteAtivo = client.status === "ativo" || client.status === "atencao";
      const matchAtivo =
        ativoFilter === "todos" ||
        (ativoFilter === "ativos" && isClienteAtivo) ||
        (ativoFilter === "inativos" && !isClienteAtivo) ||
        (ativoFilter === "ativo" && client.status === "ativo") ||
        (ativoFilter === "atencao" && client.status === "atencao") ||
        (ativoFilter === "critico" && (client.status === "critico" || client.status === "inativo"));

      return matchSearch && matchStatus && matchVendedor && matchFirstSale && matchAtivo;
    });

    if (inactivityFilter !== "all") {
      filtered = filtered.filter((client) => client.diasSemComprar > Number(inactivityFilter));
    }
    if (maxInactivityFilter !== "all") {
      filtered = filtered.filter((client) => client.diasSemComprar <= Number(maxInactivityFilter));
    }

    if (buyProducts.length > 0) {
      filtered = filtered.filter((client) => {
        const products = clientProducts.get(client.nome);
        if (!products) return false;
        return buyProducts.every((product) => products.has(product));
      });
    }
    if (dontBuyProducts.length > 0) {
      filtered = filtered.filter((client) => {
        const products = clientProducts.get(client.nome);
        if (!products) return true;
        return dontBuyProducts.every((product) => !products.has(product));
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "days": return b.diasSemComprar - a.diasSemComprar;
        case "daysAsc": return a.diasSemComprar - b.diasSemComprar;
        case "alpha": return a.nome.localeCompare(b.nome, "pt-BR");
        case "alphaDesc": return b.nome.localeCompare(a.nome, "pt-BR");
        case "avgKg": return b.mediaKg - a.mediaKg;
        case "ticketMedio": return b.ticketMedio - a.ticketMedio;
        case "lastOld": return b.diasSemComprar - a.diasSemComprar;
        case "lastNew": return a.diasSemComprar - b.diasSemComprar;
        default: return 0;
      }
    });

    return filtered;
  }, [clients, search, statusFilter, vendedorFilter, inactivityFilter, maxInactivityFilter, sortBy, buyProducts, dontBuyProducts, clientProducts, firstSaleFilter, ativoFilter]);

  const stats = useMemo(() => {
    const base = vendedorFilter === "todos" ? clients : clients.filter((client) => client.vendedor === vendedorFilter);
    return {
      total: base.length,
      primeiraVenda: base.filter((client) => client.isPrimeiraVenda).length,
      ativos: base.filter((client) => client.status === "ativo" || client.status === "atencao").length,
      atencao: base.filter((client) => client.status === "atencao").length,
      criticos: base.filter((client) => client.status === "critico").length,
    };
  }, [clients, vendedorFilter]);

  const hasActiveFilters =
    search ||
    statusFilter !== "todos" ||
    vendedorFilter !== "todos" ||
    inactivityFilter !== "all" ||
    maxInactivityFilter !== "all" ||
    sortBy !== "days" ||
    buyProducts.length > 0 ||
    dontBuyProducts.length > 0 ||
    firstSaleFilter !== "todos" ||
    ativoFilter !== "todos";

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando dados...</span>
        </div>
      </AppLayout>
    );
  }

  if (!allSales || allSales.length === 0) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <h2 className="text-xl font-bold font-heading mb-2">Nenhum dado de vendas encontrado</h2>
          <p className="text-muted-foreground">Importe uma planilha na aba "Importar" para visualizar os dados.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 w-full max-w-full min-w-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading">Análise de Clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">Baseado no histórico real de compras importado</p>
        </div>
        <DuplicatesBanner />


        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 w-full min-w-0">
          <div className="relative overflow-hidden bg-card rounded-xl p-3 sm:p-4 min-w-0 border border-border shadow-sm">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-primary/5" />
            <div className="relative z-10">
              <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20 w-fit mb-2">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total de Clientes</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground leading-none mt-1 truncate">{stats.total}</p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-card rounded-xl p-3 sm:p-4 min-w-0 border border-info/30 shadow-sm">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-info/10" />
            <div className="relative z-10">
              <div className="p-2 rounded-lg bg-info/15 ring-1 ring-info/25 w-fit mb-2">
                <ShoppingBag className="h-4 w-4 text-info" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Primeira Venda</p>
              <p className="text-xl sm:text-2xl font-bold text-info leading-none mt-1 truncate">{stats.primeiraVenda}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Clientes para pós-venda</p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-card rounded-xl p-3 sm:p-4 min-w-0 border border-success/30 shadow-sm">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-success/5" />
            <div className="relative z-10">
              <div className="p-2 rounded-lg bg-success/10 ring-1 ring-success/20 w-fit mb-2">
                <TrendingDown className="h-4 w-4 text-success" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ativos</p>
              <p className="text-xl sm:text-2xl font-bold text-success leading-none mt-1 truncate">{stats.ativos}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Em dia + Atenção</p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-card rounded-xl p-3 sm:p-4 min-w-0 border border-warning/30 shadow-sm">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-warning/10" />
            <div className="relative z-10">
              <div className="p-2 rounded-lg bg-warning/20 ring-1 ring-warning/30 w-fit mb-2">
                <Clock className="h-4 w-4 text-warning" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Atenção</p>
              <p className="text-xl sm:text-2xl font-bold text-warning leading-none mt-1 truncate">{stats.atencao}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">16 a 59 dias</p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-card rounded-xl p-3 sm:p-4 min-w-0 border border-destructive/30 shadow-sm">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-destructive/5" />
            <div className="relative z-10">
              <div className="p-2 rounded-lg bg-destructive/10 ring-1 ring-destructive/20 w-fit mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Críticos</p>
              <p className="text-xl sm:text-2xl font-bold text-destructive leading-none mt-1 truncate">{stats.criticos}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">60+ dias sem comprar</p>
            </div>
          </div>
        </div>

        {stats.primeiraVenda > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-sm">
            <ShoppingBag className="h-4 w-4 text-info" />
            <span className="font-medium text-foreground">{stats.primeiraVenda} cliente(s) em primeira venda</span>
            <span className="text-muted-foreground">Use o filtro “Primeira venda” para ver quem precisa de pós-venda.</span>
          </div>
        )}

        <Card className="shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-stretch gap-3 w-full min-w-0">
              <div className="relative flex-1 basis-full sm:basis-72 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome do cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                <SelectTrigger className="w-full sm:w-48 min-w-0">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Vendedores</SelectItem>
                  {vendedores.filter(v => v !== "").map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={firstSaleFilter} onValueChange={(value) => setFirstSaleFilter(value as FirstSaleFilter)}>
                <SelectTrigger className="w-full sm:w-48 min-w-0">
                  <ShoppingBag className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Primeira venda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as compras</SelectItem>
                  <SelectItem value="primeira_venda">Só primeira venda</SelectItem>
                  <SelectItem value="recorrentes">Só recorrentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-stretch gap-3 w-full min-w-0">
              <Select value={ativoFilter} onValueChange={(v) => setAtivoFilter(v as AtivoFilter)}>
                <SelectTrigger className="w-full sm:w-56 min-w-0">
                  <Power className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Só ativos (Em dia + Atenção)</SelectItem>
                  <SelectItem value="inativos">Só inativos (Crítico + Inativo)</SelectItem>
                  <SelectItem value="ativo">Em dia</SelectItem>
                  <SelectItem value="atencao">Atenção</SelectItem>
                  <SelectItem value="critico">Críticos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={inactivityFilter} onValueChange={setInactivityFilter}>
                <SelectTrigger className="w-full sm:w-44 min-w-0">
                  <SelectValue placeholder="Mínimo de dias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sem mínimo</SelectItem>
                  <SelectItem value="7">Mais de 7 dias</SelectItem>
                  <SelectItem value="15">Mais de 15 dias</SelectItem>
                  <SelectItem value="30">Mais de 30 dias</SelectItem>
                  <SelectItem value="60">Mais de 60 dias</SelectItem>
                  <SelectItem value="90">Mais de 90 dias</SelectItem>
                </SelectContent>
              </Select>
              <Select value={maxInactivityFilter} onValueChange={setMaxInactivityFilter}>
                <SelectTrigger className="w-full sm:w-44 min-w-0">
                  <SelectValue placeholder="Máximo de dias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sem máximo</SelectItem>
                  <SelectItem value="7">Até 7 dias</SelectItem>
                  <SelectItem value="15">Até 15 dias</SelectItem>
                  <SelectItem value="30">Até 30 dias</SelectItem>
                  <SelectItem value="60">Até 60 dias</SelectItem>
                  <SelectItem value="90">Até 90 dias</SelectItem>
                  <SelectItem value="120">Até 120 dias</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={value => setSortBy(value as SortKey)}>
                <SelectTrigger className="w-full sm:w-56 min-w-0">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Maior tempo sem comprar → Menor</SelectItem>
                  <SelectItem value="daysAsc">Menor tempo sem comprar → Maior</SelectItem>
                  <SelectItem value="alpha">Cliente A → Z</SelectItem>
                  <SelectItem value="alphaDesc">Cliente Z → A</SelectItem>
                  <SelectItem value="lastOld">Última compra mais antiga</SelectItem>
                  <SelectItem value="lastNew">Última compra mais recente</SelectItem>
                  <SelectItem value="avgKg">Média kg (maior → menor)</SelectItem>
                  <SelectItem value="ticketMedio">Ticket médio (maior → menor)</SelectItem>
                </SelectContent>
              </Select>
              <div className="w-full sm:w-auto min-w-0">
                <ProductFilterPopover
                  label="Compram (produto)"
                  products={allProducts}
                  selected={buyProducts}
                  onApply={setBuyProducts}
                />
              </div>
              <div className="w-full sm:w-auto min-w-0">
                <ProductFilterPopover
                  label="Não compram (produto)"
                  products={allProducts}
                  selected={dontBuyProducts}
                  onApply={setDontBuyProducts}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!allSales || allSales.length === 0) {
                    toast.info("Sem dados de vendas para auditar.");
                    return;
                  }
                  const lastByClient = getLastPurchaseByClient(allSales);
                  const divergencias: { cliente: string; exibida: string; real: string }[] = [];
                  clients.forEach((c) => {
                    const real = lastByClient.get(c.nome);
                    if (!real) return;
                    const realStr = formatDateBR(real);
                    if (realStr !== c.dataUltimaCompra) {
                      divergencias.push({ cliente: c.nome, exibida: c.dataUltimaCompra, real: realStr });
                    }
                  });
                  const ultimaBase = allSales.reduce((m, s) => {
                    const d = new Date(s.data);
                    return d > m ? d : m;
                  }, new Date(0));
                  if (divergencias.length === 0) {
                    toast.success(
                      `Auditoria OK — ${clients.length} clientes validados. ` +
                      `Venda mais recente na base: ${formatDateBR(ultimaBase)}. ` +
                      `Se você espera uma venda mais recente que não aparece, ela ainda não foi importada.`,
                    );
                  } else {
                    console.warn("[Auditoria Última Compra] Divergências:", divergencias);
                    toast.error(
                      `${divergencias.length} divergência(s) encontradas. Veja o console (F12) para detalhes.`,
                    );
                  }
                }}
                className="gap-2 whitespace-nowrap h-10"
                title="Recalcula a última compra de cada cliente direto das vendas importadas e lista divergências"
              >
                <AlertTriangle className="h-4 w-4" />
                Validar últimas compras
              </Button>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetAllFilters} className="gap-2 whitespace-nowrap h-10">
                  <RotateCcw className="h-4 w-4" />
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {allSales && allSales.length > 0 && (() => {
          const lastDate = allSales.reduce((max, sale) => {
            const date = new Date(sale.data);
            return date > max ? date : max;
          }, new Date(0));
          return (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Última atualização dos dados:</span>
              <span className="font-semibold text-foreground">{formatDateBR(lastDate)}</span>
            </div>
          );
        })()}

        <p className="text-sm text-muted-foreground">{filteredClients.length} clientes encontrados</p>

        {search.trim() && filteredClients.length === 0 && (() => {
          const q = normalizeSearch(search);
          const tokens = q.split(/\s+/).filter(t => t.length >= 3);
          const suggestions = clients
            .map(c => ({ c, n: normalizeSearch(c.nome) }))
            .filter(({ n }) => tokens.length === 0 ? n.includes(q.slice(0, 3)) : tokens.some(t => n.includes(t)))
            .slice(0, 8);
          if (suggestions.length === 0) return null;
          return (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs space-y-1">
              <div className="font-medium text-amber-900 dark:text-amber-200">Nenhum cliente exato. Possíveis correspondências:</div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map(s => (
                  <button
                    key={s.c.nome}
                    onClick={() => setSearch(s.c.nome)}
                    className="px-2 py-0.5 rounded bg-background border hover:bg-muted text-foreground"
                  >
                    {s.c.nome}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <Card className="shadow-card overflow-hidden">
          <div className="overflow-auto max-h-[70vh] relative">
             <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow className="bg-background">
                   <TableHead className="font-semibold min-w-[160px] sticky top-0 left-0 z-30 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">Cliente</TableHead>
                   <TableHead className="font-semibold text-center min-w-[65px] sticky top-0 z-20 bg-background">Status</TableHead>
                   <TableHead className="font-semibold text-center min-w-[75px] sticky top-0 z-20 bg-background">Vendedor</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Dias s/ Comprar</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Últ. Compra</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">1ª Compra</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Produtos Faltando</TableHead>
                   <TableHead className="font-semibold text-center sticky top-0 z-20 bg-background">Compras</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Total (kg)</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Média (kg)</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Ticket Médio</TableHead>
                   <TableHead className="font-semibold text-center whitespace-nowrap sticky top-0 z-20 bg-background">Fat. Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map(client => (
                  <TableRow key={client.nome} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="sticky left-0 z-10 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm flex-1">{client.nome}</p>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {podeAgendarVisita && <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-primary"
                              title="Agendar visita para este cliente"
                              onClick={() => setAgendarClienteNome(client.nome)}
                            >
                              <CalendarPlus className="h-3 w-3" />
                            </Button>}
                            {podeExcluirDasAnalises && <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  title="Excluir cliente das análises"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir cliente das análises?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <strong>{client.nome}</strong> será ocultado de todas as análises (clientes, vendas,
                                  inteligência comercial, ABC, etc.). Os dados originais de vendas são preservados —
                                  você pode restaurar o cliente a qualquer momento em <em>Clientes Duplicados</em>.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    excludeClient.mutate(
                                      { nome: client.nome },
                                      {
                                        onSuccess: () =>
                                          toast.success(`"${client.nome}" excluído das análises.`),
                                        onError: (e: unknown) =>
                                          toast.error("Falha: " + (e instanceof Error ? e.message : String(e))),
                                      },
                                    )
                                  }
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ClienteStatusTag
                            status={client.status}
                            onChange={(value) => setOverride(client.nome, value)}
                          />
                          {client.isPrimeiraVenda && (
                            <Badge className="bg-info/10 text-info border-info/20 text-[10px]">
                              Primeira venda
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={client.status} />
                    </TableCell>
                    <TableCell className="text-center text-sm">{client.vendedor}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-semibold text-sm",
                        client.diasSemComprar <= 15 ? "text-success" :
                        client.diasSemComprar <= 59 ? "text-warning" :
                        "text-destructive"
                      )}>
                        {client.diasSemComprar} dias
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {client.dataUltimaCompra}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {client.dataPrimeiraCompra}
                    </TableCell>
                    <TableCell className="text-center">
                      <MissingProductsCell clienteNome={client.nome} allSales={allSales!} />
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {client.totalCompras}
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {client.totalKg.toLocaleString("pt-BR")} kg
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {client.mediaKg.toLocaleString("pt-BR")} kg
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      R$ {client.ticketMedio.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      R$ {client.totalFat.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <NovaVisitaDialog
        open={!!agendarClienteNome}
        onOpenChange={(o) => { if (!o) setAgendarClienteNome(null); }}
        initialClientName={agendarClienteNome ?? undefined}
      />
    </AppLayout>
  );
}
