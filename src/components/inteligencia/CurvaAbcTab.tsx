import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { AlertTriangle, Users, Package, BarChart3, Target, Calendar, PieChart as PieIcon } from "lucide-react";
import type { AbcItem, AbcAlerta } from "@/hooks/useInteligenciaData";
import { formatProductDisplay } from "@/lib/productDisplay";

interface AbcResumo { classe: "A" | "B" | "C"; faturamento: number; qtd: number; participacao: number; }
const PIE_COLORS: Record<"A" | "B" | "C", string> = {
  A: "hsl(142, 60%, 40%)",
  B: "hsl(45, 90%, 50%)",
  C: "hsl(0, 0%, 60%)",
};

function AbcPie({ resumo, totalLabel }: { resumo: AbcResumo[]; totalLabel: string }) {
  const total = resumo.reduce((s, r) => s + r.faturamento, 0);
  if (total === 0) {
    return <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem dados suficientes para exibição</div>;
  }
  const data = resumo.map(r => ({ name: `Classe ${r.classe}`, value: r.faturamento, classe: r.classe, qtd: r.qtd, pct: total > 0 ? (r.faturamento / total) * 100 : 0 }));
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(d: any) => `${d.classe}: ${d.pct.toFixed(0)}%`} labelLine={{ strokeWidth: 1 }}>
            {data.map((d, i) => <Cell key={i} fill={PIE_COLORS[d.classe]} />)}
          </Pie>
          <RechartsTooltip
            content={({ payload }) => {
              if (!payload || !payload.length) return null;
              const d: any = payload[0].payload;
              return (
                <div className="bg-background border rounded p-2 shadow text-xs space-y-0.5">
                  <p className="font-bold">Classe {d.classe}</p>
                  <p>R$ {d.value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</p>
                  <p>{d.pct.toFixed(1)}% do total</p>
                  <p>{d.qtd} {totalLabel}</p>
                </div>
              );
            }}
          />
          <Legend formatter={(v) => <span className="text-xs">{v}</span>} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const kg = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg`;

const CLASSE_COLORS = { A: "text-green-700 bg-green-100 border-green-300", B: "text-yellow-700 bg-yellow-100 border-yellow-300", C: "text-muted-foreground bg-muted border-border" };
const ALERTA_ICONS = { a_sem_pedido: "🔴", a_queda: "🔴", b_crescendo: "🟡", c_crescendo: "🟢" };

function ClasseBadge({ classe }: { classe: "A" | "B" | "C" }) {
  return <Badge className={`text-[10px] px-1.5 py-0 border ${CLASSE_COLORS[classe]}`}>{classe}</Badge>;
}

function AbcTable({ items, limit, type }: { items: AbcItem[]; limit: number; type: "clientes" | "produtos" }) {
  const display = limit === 0 ? items : items.slice(0, limit);
  return (
    <div className="overflow-auto max-h-[60vh]">
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-8 sticky top-0 z-20 bg-background">#</TableHead>
            <TableHead className="text-xs sticky top-0 z-20 bg-background">Classe</TableHead>
            <TableHead className="text-xs sticky top-0 left-0 z-30 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">{type === "clientes" ? "Cliente" : "Produto"}</TableHead>
            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Faturamento</TableHead>
            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">{type === "clientes" ? "Qtd (kg)" : "Volume"}</TableHead>
            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Pedidos</TableHead>
            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Ticket Médio</TableHead>
            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Part. %</TableHead>
            <TableHead className="text-xs text-right sticky top-0 z-20 bg-background">Acum. %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {display.map((item, i) => (
            <TableRow key={i} className={item.classe === "A" ? "bg-green-50/50" : item.classe === "B" ? "bg-yellow-50/30" : ""}>
              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
              <TableCell><ClasseBadge classe={item.classe} /></TableCell>
              <TableCell className="text-xs font-medium max-w-[200px] truncate sticky left-0 z-10 bg-background" title={formatProductDisplay(item.nome)}>{formatProductDisplay(item.nome)}</TableCell>
              <TableCell className="text-xs text-right font-semibold">{R$(item.faturamento)}</TableCell>
              <TableCell className="text-xs text-right">{kg(item.quantidade)}</TableCell>
              <TableCell className="text-xs text-right">{item.pedidos}</TableCell>
              <TableCell className="text-xs text-right">{R$(item.ticketMedio)}</TableCell>
              <TableCell className="text-xs text-right">{item.participacao.toFixed(1)}%</TableCell>
              <TableCell className="text-xs text-right font-medium">{item.acumulado.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AbcChart({ items }: { items: AbcItem[] }) {
  let acumFat = 0;
  const chartData = items.map((item, i) => {
    acumFat += item.faturamento;
    return {
      name: item.nome,
      nameShort: item.nome.length > 24 ? item.nome.substring(0, 24) + "…" : item.nome,
      acumulado: item.acumulado,
      faturamento: item.faturamento,
      acumuladoFat: acumFat,
      index: i + 1,
    };
  });

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="index" tick={{ fontSize: 10 }} label={{ value: "Itens (ordenados)", position: "insideBottom", offset: -2, fontSize: 11 }} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
          <RechartsTooltip
            wrapperStyle={{ zIndex: 50, outline: "none" }}
            allowEscapeViewBox={{ x: false, y: true }}
            content={({ payload }) => {
              if (!payload || !payload.length) return null;
              const d: any = payload[0].payload;
              return (
                <div className="bg-background border rounded p-2 shadow text-xs space-y-0.5 max-w-[260px]">
                  <p className="font-bold truncate" title={formatProductDisplay(d.name)}>{formatProductDisplay(d.name)}</p>
                  <p className="text-muted-foreground">Posição: Top {d.index}</p>
                  <p>Acumulado: <strong>{d.acumulado.toFixed(1)}%</strong></p>
                  <p>Faturamento acumulado: <strong>R$ {d.acumuladoFat.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</strong></p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="acumulado" stroke="hsl(32, 90%, 50%)" fill="hsl(32, 90%, 50%)" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CurvaAbcTabProps {
  abcClientes: AbcItem[];
  abcProdutos: AbcItem[];
  abcAlertas: AbcAlerta[];
  concentracaoTop10: number;
  concentracaoTop20: number;
  totalClientesAbc: number;
  clientesA: number;
  clientesB: number;
  clientesC: number;
  periodoLabel?: string;
  abcResumoClientes?: AbcResumo[];
  abcResumoProdutos?: AbcResumo[];
}

export function CurvaAbcTab(props: CurvaAbcTabProps) {
  const { abcClientes, abcProdutos, abcAlertas, concentracaoTop10, concentracaoTop20, totalClientesAbc, clientesA, clientesB, clientesC, periodoLabel, abcResumoClientes, abcResumoProdutos } = props;
  const [limitClientes, setLimitClientes] = useState("20");
  const [limitProdutos, setLimitProdutos] = useState("20");

  const limC = limitClientes === "todos" ? 0 : parseInt(limitClientes);
  const limP = limitProdutos === "todos" ? 0 : parseInt(limitProdutos);

  return (
    <div className="space-y-4">
      {/* Período da ABC */}
      {periodoLabel && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Período da Curva ABC: <strong className="text-foreground">{periodoLabel}</strong></span>
          <Badge variant="outline" className="text-[10px]">Últimos 3 meses</Badge>
        </div>
      )}

      {/* KPIs de concentração */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{totalClientesAbc}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Clientes Analisados</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{clientesA}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Classe A (80%)</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-yellow-700">{clientesB}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Classe B (15%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{clientesC}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Classe C (5%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{concentracaoTop10.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground uppercase">Top 10 Clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{concentracaoTop20.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground uppercase">Top 20 Clientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Regra importante */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
        <span>ℹ️</span>
        <span>Clientes com apenas 1 pedido são automaticamente rebaixados da Classe A para Classe B.</span>
      </div>

      {/* Alertas ABC */}
      {abcAlertas.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Radar Estratégico ABC ({abcAlertas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {abcAlertas.slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span>{ALERTA_ICONS[a.tipo]}</span>
                <span>{a.mensagem}</span>
              </div>
            ))}
            {abcAlertas.length > 10 && (
              <p className="text-xs text-muted-foreground">+{abcAlertas.length - 10} alertas adicionais</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="abc-clientes" className="space-y-3">
        <TabsList>
          <TabsTrigger value="abc-clientes" className="gap-1"><Users className="h-3.5 w-3.5" /> Clientes</TabsTrigger>
          <TabsTrigger value="abc-produtos" className="gap-1"><Package className="h-3.5 w-3.5" /> Produtos</TabsTrigger>
        </TabsList>

        <TabsContent value="abc-clientes" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Curva ABC de Clientes
              </CardTitle>
              <Select value={limitClientes} onValueChange={setLimitClientes}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <AbcTable items={abcClientes} limit={limC} type="clientes" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" /> Curva de Concentração — Clientes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AbcChart items={abcClientes} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieIcon className="h-4 w-4" /> Participação no Faturamento (ABC)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {abcResumoClientes ? <AbcPie resumo={abcResumoClientes} totalLabel="clientes" /> : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="abc-produtos" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Curva ABC de Produtos
              </CardTitle>
              <Select value={limitProdutos} onValueChange={setLimitProdutos}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <AbcTable items={abcProdutos} limit={limP} type="produtos" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" /> Curva de Concentração — Produtos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AbcChart items={abcProdutos} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieIcon className="h-4 w-4" /> Participação no Faturamento (ABC)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {abcResumoProdutos ? <AbcPie resumo={abcResumoProdutos} totalLabel="produtos" /> : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
