import { useState } from "react";
import { calcPlanoEsforco } from "@/lib/planoVendedor";
import { shortVendedorName } from "@/lib/vendorRegistry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Users, Fuel, Award, TrendingUp,
  Star, Crown, Zap, ArrowUp, ArrowDown

} from "lucide-react";
import {
  type VendorPerformanceSummary, type TierInfo,
  type VendorMonthlyHistory,
  type ClientClassification,
  PERFORMANCE_TIERS,
  COMMISSION_LEVELS,
  calcProgressiveTierFill,

  commissionLevelName,
  computeCommissionStreaks,
} from "@/hooks/usePerformanceData";
import { type VendedorMeta } from "@/hooks/useMetasData";
import { PremiacaoBadge } from "./PremiacaoBadge";
import { ClientesNovosDialog, type ClienteNovoLinha } from "@/components/ClientesNovosDialog";

function fmt(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtShort(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}k`;
  return fmt(val);
}

interface Props {
  perf: VendorPerformanceSummary;
  meta: VendedorMeta;
  diasUteis: { passados: number; restantes: number; total: number };
  derivedHistory?: Pick<VendorMonthlyHistory, "vendedor" | "year_month" | "faturamento" | "meta_atingida">[];
  classifications?: ClientClassification[];
  onUpdateOverride: (value: number | null) => void;
}

export function VendedorPerformanceCard({ perf, meta, diasUteis, derivedHistory, classifications = [], onUpdateOverride }: Props) {

  const [dialogOpen, setDialogOpen] = useState<null | "novo" | "recorrente" | "reativado" | "sem_recompra">(null);
  const tierColor = perf.tier.color;
  const tierFill = calcProgressiveTierFill(meta.faturamentoMes, meta.metaImpulso, meta.metaPerformance, meta.metaAceleracao, meta.metaExcelencia);
  // Build streak from REAL derived history (sales-based).
  const streaks = computeCommissionStreaks((derivedHistory ?? []) as VendorMonthlyHistory[]);

  // % atingido SIMPLES por nível (faturamento / metaNivel) — sem ranges progressivos.
  const pctImpulso = meta.metaImpulso > 0 ? (meta.faturamentoMes / meta.metaImpulso) * 100 : 0;
  const pctPerformance = meta.metaPerformance > 0 ? (meta.faturamentoMes / meta.metaPerformance) * 100 : 0;
  const pctAceleracao = meta.metaAceleracao > 0 ? (meta.faturamentoMes / meta.metaAceleracao) * 100 : 0;
  const pctExcelencia = meta.metaExcelencia > 0 ? (meta.faturamentoMes / meta.metaExcelencia) * 100 : 0;

  // Metas hierárquicas/cumulativas conquistadas no mês (faturamento + clientes novos válidos)
  const conquistados = perf.tiersConquistados ?? {
    impulso: false, performance: false, aceleracao: false, excelencia: false, metaMedia: false,
  };


  // Build categorized lists for the dialog
  const buildLinha = (c: ClientClassification): ClienteNovoLinha => ({
    cliente: c.cliente,
    primeiraCompra: new Date(c.firstPurchase),
    valorPrimeiraCompra: c.firstPurchaseValor ?? 0,
    vendedorPrimeiraCompra: c.firstPurchaseVendedor ?? "",
    totalNoPeriodo: c.totalNoMes ?? 0,
    totalNoPeriodoAnterior: c.totalNoMesAnterior ?? 0,
    pedidosNoPeriodo: c.pedidosNoMes ?? 0,
    temHistoricoAnterior: c.temHistoricoAnterior ?? false,
  });
  const novosItens = classifications.filter(c => c.type === "novo").map(buildLinha);
  const recorrentesItens = classifications.filter(c => c.type === "recorrente").map(buildLinha);
  const reativadosItens = classifications.filter(c => c.type === "reativado").map(buildLinha);
  const semRecompraItens = classifications.filter(c => c.type === "sem_recompra").map(buildLinha);

  const dialogConfig = {
    novo: { title: `Clientes Novos — ${perf.vendedor}`, desc: "Primeira compra global ocorre dentro do mês selecionado.", itens: novosItens },
    recorrente: { title: `Clientes Recorrentes — ${perf.vendedor}`, desc: "Compraram no mês anterior E no mês atual.", itens: recorrentesItens },
    reativado: { title: `Clientes Reativados — ${perf.vendedor}`, desc: "Têm histórico anterior global, mas NÃO compraram no mês anterior; voltaram no mês atual.", itens: reativadosItens },
    sem_recompra: { title: `Clientes Sem Recompra — ${perf.vendedor}`, desc: "Compraram com este vendedor no mês anterior, porém NÃO compraram no mês atual.", itens: semRecompraItens },
  };
  const activeDialog = dialogOpen ? dialogConfig[dialogOpen] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-2" style={{ borderColor: tierColor + "40" }}>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{perf.vendedor}</h2>
                <Badge style={{ backgroundColor: tierColor + "20", color: tierColor, borderColor: tierColor + "40" }} className="border text-sm">
                  {perf.tier.icon} {tierFill.nivelAtual}
                </Badge>
                <PremiacaoBadge perf={perf} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {perf.pctMeta.toFixed(1)}% da meta • {streaks.currentName} ({streaks.currentPct}%) • {perf.consecutiveMonths} meses consecutivos
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">{fmt(perf.faturamento)}</p>
              <p className="text-xs text-muted-foreground">faturamento acumulado</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Escada de Metas - Progressive */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-warning" /> Escada de Metas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: "impulso", label: "Meta Média", fill: pctImpulso, color: "#eab308", icon: "🔥", metaValor: meta.metaImpulso },
              { key: "performance", label: "Meta Combustível", fill: pctPerformance, color: "#f97316", icon: "⚡", metaValor: meta.metaPerformance },
              { key: "aceleracao", label: "Meta 0,5%", fill: pctAceleracao, color: "#22c55e", icon: "🚀", metaValor: meta.metaAceleracao },
              { key: "excelencia", label: "Meta 1%", fill: pctExcelencia, color: "#3b82f6", icon: "👑", metaValor: meta.metaExcelencia },
            ].map((tier) => {
              // Degraus são CUMULATIVOS: conquistar um nível superior conquista os anteriores.
              const conquistada = conquistados[tier.key as keyof typeof conquistados] === true;
              const faturamentoOk = tier.fill >= 100;
              return (
                <div key={tier.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground flex items-center gap-1">
                      {tier.icon} {tier.label}
                    </span>
                    <span className="text-xs font-bold" style={{ color: tier.color }}>
                      {tier.fill.toFixed(1)}%
                      {conquistada ? " ✓" : faturamentoOk ? " ⚠" : ""}
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(tier.fill, 100)}%`, backgroundColor: tier.color }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    {tier.label}: {fmt(tier.metaValor)}
                  </p>
                </div>
              );
            })}

            {/* Próxima meta necessária */}
            {(() => {
              const niveis = [
                { label: "Meta Média", valor: meta.metaImpulso, color: "#eab308" },
                { label: "Meta Combustível", valor: meta.metaPerformance, color: "#f97316" },
                { label: "Meta 0,5%", valor: meta.metaAceleracao, color: "#22c55e" },
                { label: "Meta 1%", valor: meta.metaExcelencia, color: "#3b82f6" },
              ].filter(n => n.valor > 0);
              const proxima = niveis.find(n => meta.faturamentoMes < n.valor);
              if (!proxima) {
                return (
                  <div className="rounded-md border border-success/40 bg-success/10 p-2 text-[11px] text-success font-semibold text-center">
                    🏆 Todas as metas atingidas neste mês
                  </div>
                );
              }
              const falta = proxima.valor - meta.faturamentoMes;
              return (
                <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: proxima.color + "55", backgroundColor: proxima.color + "0d" }}>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Próxima meta</span>
                    <span className="font-bold" style={{ color: proxima.color }}>{proxima.label}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Falta</span>
                    <span className="font-semibold text-foreground">{fmt(falta)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Meta não configurada */}
            {(meta.metaImpulso <= 0 || meta.metaPerformance <= 0 || meta.metaAceleracao <= 0 || meta.metaExcelencia <= 0) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  Meta não configurada para este vendedor neste mês. Cadastre os valores fixos em <strong>Configurar Metas</strong>.
                </AlertDescription>
              </Alert>
            )}

            {/* Debug summary */}
            <div className="pt-2 border-t border-border space-y-1 text-[10px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Faturamento do mês</span>
                <span className="font-semibold text-foreground">{fmt(meta.faturamentoMes)}</span>
              </div>
              <div className="flex justify-between">
                <span>% vs Meta Combustível</span>
                <span className="font-bold text-foreground">{pctPerformance.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>% vs Meta 0,5%</span>
                <span className="font-bold text-foreground">{pctAceleracao.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>% vs Meta 1%</span>
                <span className="font-bold text-foreground">{pctExcelencia.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Nível Atual</span>
                <span className="font-bold" style={{ color: perf.tier.color }}>{tierFill.nivelAtual}</span>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Clientes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Clientes do Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <ClickableKpi label="Novos" value={perf.clientesNovos} color="text-success" onClick={() => setDialogOpen("novo")} />
              <ClickableKpi label="Recorrentes" value={perf.clientesRecorrentes} color="text-primary" onClick={() => setDialogOpen("recorrente")} />
              <ClickableKpi label="Reativados" value={perf.clientesReativados} color="text-warning" onClick={() => setDialogOpen("reativado")} />
              <ClickableKpi label="Sem Recompra" value={perf.clientesSemRecompra} color="text-destructive" onClick={() => setDialogOpen("sem_recompra")} />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Clique em um card para ver e validar a lista</p>
            {!perf.tierValid && perf.faltaClientes > 0 && (
              <Alert className="mt-2">
                <AlertTriangle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  {perf.faltaClientes === 1
                    ? "Falta 1 cliente novo válido."
                    : `Faltam ${perf.faltaClientes} clientes novos válidos.`}
                </AlertDescription>
              </Alert>
            )}

          </CardContent>
        </Card>
        <ClientesNovosDialog
          open={dialogOpen !== null}
          onOpenChange={(o) => setDialogOpen(o ? dialogOpen : null)}
          titulo={activeDialog?.title}
          descricao={activeDialog?.desc}
          itens={activeDialog?.itens ?? []}
          mostrarPrimeiraCompra={dialogOpen === "novo"}
        />

        {/* Comissão */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-warning" /> Comissão & Benefícios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Current level highlight */}
            <div className="rounded-lg border border-border p-3 bg-muted/40">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nível atual</p>
                  <p className="text-base font-bold text-foreground">{streaks.currentName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Comissão atual</p>
                  <p className="text-2xl font-bold text-primary leading-none">{streaks.currentPct}%</p>
                </div>
              </div>
            </div>

            {/* Commission ladder (5% → 10%) */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Escada de Comissão</p>
              <div className="flex gap-1">
                {COMMISSION_LEVELS.map((l) => {
                  const isCurrent = l.level === streaks.currentLevel;
                  const isReached = l.level <= streaks.currentLevel;
                  return (
                    <div
                      key={l.level}
                      title={`${l.name} — ${l.pct}%`}
                      className={`flex-1 h-7 rounded flex flex-col items-center justify-center text-[10px] font-bold ${
                        isCurrent
                          ? "bg-primary text-primary-foreground ring-2 ring-primary"
                          : isReached
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <span>{l.pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                <span>Recuperação</span>
                <span>Elite</span>
              </div>
            </div>

            {/* Streak history (progressão / regressão) */}
            <div className="space-y-1.5 text-xs border-t border-border pt-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ArrowUp className="h-3 w-3 text-success" /> Batendo a Meta Média
                </span>
                <span className="font-semibold text-foreground">
                  {streaks.hitStreak}/2 meses consecutivos
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ArrowDown className="h-3 w-3 text-destructive" /> Sem bater a Meta Média
                </span>
                <span className="font-semibold text-foreground">
                  {streaks.missStreak}/2 meses consecutivos
                </span>
              </div>
              {streaks.nextLevelUp != null && (
                <p className="text-[10px] text-success">
                  Faltam {streaks.monthsToLevelUp} mês{streaks.monthsToLevelUp === 1 ? "" : "es"} batendo a Meta Média para subir para {streaks.nextLevelUp}%
                </p>
              )}
              {streaks.nextLevelDown != null && (
                <p className="text-[10px] text-destructive">
                  Faltam {streaks.monthsToLevelDown} mês{streaks.monthsToLevelDown === 1 ? "" : "es"} sem a Meta Média para cair para {streaks.nextLevelDown}%
                </p>
              )}
              {streaks.nextLevelDown == null && (
                <p className="text-[10px] text-muted-foreground">Nível mínimo atingido (piso de 5%)</p>
              )}
            </div>

            {/* Final commission with tier bonus */}
            <div className="space-y-1.5 text-xs border-t border-border pt-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Comissão base</span>
                <span className="font-semibold">{perf.commissionBasePct}%</span>
              </div>
              {perf.commissionBonusPct > 0 && (
                <div className="flex justify-between text-success">
                  <span>Bônus {perf.tier.label}</span>
                  <span className="font-semibold">+{perf.commissionBonusPct}%</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-semibold text-foreground">Comissão Final</span>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-foreground">{perf.commissionFinalPct}%</span>
                  <ManualOverrideInput
                    currentValue={perf.overrideComissao}
                    onSave={onUpdateOverride}
                    suffix="%"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-2 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1"><Fuel className="h-3 w-3" /> Voucher Combustível</span>
                {perf.voucherLiberado ? (
                  <span className="font-semibold text-success">{fmt(perf.voucherGasolina)}</span>
                ) : (
                  <span className="font-semibold text-destructive text-[11px]">Não liberado (meta não batida)</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Bônus Constância</span>
                <span className="font-semibold">{perf.constanciaBonus > 0 ? fmt(perf.constanciaBonus) : "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>




        {/* Constância */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Crown className="h-4 w-4 text-warning" /> Trilha de Constância
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { months: 3, bonus: 100 },
                { months: 6, bonus: 250 },
                { months: 9, bonus: 500 },
                { months: 12, bonus: 800 },
              ].map((milestone) => {
                const reached = perf.consecutiveMonths >= milestone.months;
                const progress = Math.min((perf.consecutiveMonths / milestone.months) * 100, 100);
                return (
                  <div key={milestone.months} className="flex items-center gap-2">
                    <span className={`text-xs w-14 ${reached ? "text-success font-bold" : "text-muted-foreground"}`}>
                      {milestone.months} meses
                    </span>
                    <div className="flex-1">
                      <Progress value={progress} className="h-2" />
                    </div>
                    <span className={`text-xs w-16 text-right ${reached ? "text-success font-bold" : "text-muted-foreground"}`}>
                      {reached ? "✓" : ""} R$ {milestone.bonus}
                    </span>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                {perf.consecutiveMonths} meses consecutivos batendo meta
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Previsão */}
        {(() => {
          // Plano de esforço: dias operacionais para a maioria dos vendedores e
          // ROTAS RESTANTES para vendedores configurados por rota (ex.: Ednei).
          const plano = calcPlanoEsforco(shortVendedorName(perf.vendedor), new Date());
          const porRota = plano.tipo === "rotas";
          const diasPassados = Math.max(1, diasUteis.passados);
          const diasTotal = Math.max(1, diasUteis.total);
          const falta = Math.max(0, perf.metaGasolina - perf.faturamento);

          const unidadesRestantes = plano.unidadesRestantes;
          const unidadesPassadas = Math.max(1, plano.unidadesTotais - unidadesRestantes);
          const mediaPorUnidade = porRota
            ? perf.faturamento / unidadesPassadas
            : perf.mediaDiaria;
          const projecaoExibida = porRota
            ? mediaPorUnidade * Math.max(1, plano.unidadesTotais)
            : perf.projecao;

          const mediaLabel = porRota ? "Média por Rota" : "Média Diária";
          const mediaValor = mediaPorUnidade;
          const necessarioLabel = plano.unidadeSingular;
          const necessarioValor = falta / (unidadesRestantes || 1);


          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" /> Previsão de Fechamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-muted">
                    <p className="text-[10px] text-muted-foreground uppercase">{mediaLabel}</p>
                    <p className="text-sm font-bold text-foreground">{fmtShort(mediaValor)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted">
                    <p className="text-[10px] text-muted-foreground uppercase">Projeção</p>
                    <p className={`text-sm font-bold ${projecaoExibida >= perf.metaGasolina ? "text-success" : "text-destructive"}`}>
                      {fmtShort(projecaoExibida)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted">
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {porRota ? "Rotas restantes" : "Dias Passados"}
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {porRota
                        ? `${unidadesRestantes} / ${plano.unidadesTotais}`
                        : `${diasUteis.passados} / ${diasUteis.total}`}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted">
                    <p className="text-[10px] text-muted-foreground uppercase">Falta p/ Meta</p>
                    <p className="text-sm font-bold text-foreground">{fmtShort(falta)}</p>
                  </div>
                </div>
                {porRota && (
                  <p className="text-[10px] text-muted-foreground">{plano.notaCalendario}</p>
                )}
                {projecaoExibida < perf.metaGasolina && perf.metaGasolina > 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      Projeção abaixo da meta. Precisa {fmtShort(necessarioValor)}/{necessarioLabel}.
                    </AlertDescription>
                  </Alert>
                )}
                {porRota && (
                  <p className="text-[10px] italic text-muted-foreground">
                    {plano.explicacao}
                  </p>
                )}

              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-2 rounded-lg bg-muted text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ClickableKpi({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 rounded-lg bg-muted text-center hover:ring-2 hover:ring-primary/40 transition cursor-pointer"
      title={`Clique para ver lista de ${label}`}
    >
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </button>
  );
}

function ManualOverrideInput({ currentValue, onSave, suffix }: { currentValue: number | null; onSave: (v: number | null) => void; suffix: string }) {
  return (
    <div className="relative group">
      <Input
        type="number"
        className="w-14 h-6 text-[10px] text-right px-1 opacity-50 group-hover:opacity-100 transition-opacity"
        placeholder="manual"
        value={currentValue ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onSave(v ? Number(v) : null);
        }}
      />
    </div>
  );
}
