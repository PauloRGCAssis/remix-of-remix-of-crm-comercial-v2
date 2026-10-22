import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Lightbulb, Target, AlertCircle, CheckCircle2 } from "lucide-react";
import type { AbcItem } from "@/hooks/useInteligenciaData";
import { MetasAcaoPanel } from "./MetasAcaoPanel";

interface AbcResumo { classe: "A" | "B" | "C"; faturamento: number; qtd: number; participacao: number; }

interface LeituraEstrategicaTabProps {
  abcClientes: AbcItem[];
  abcResumoClientes?: AbcResumo[];
  concentracaoTop10: number;
  concentracaoTop20: number;
  totalClientesAbc: number;
  clientesA: number;
  clientesB: number;
  clientesC: number;
  periodoLabel?: string;
  vendedorLabel?: string;
}

const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export function LeituraEstrategicaTab(props: LeituraEstrategicaTabProps) {
  const { abcClientes, abcResumoClientes, concentracaoTop10, concentracaoTop20, totalClientesAbc, clientesA, clientesB, clientesC, periodoLabel, vendedorLabel } = props;

  const totalFat = abcClientes.reduce((s, c) => s + c.faturamento, 0);
  const pctA = abcResumoClientes?.find(r => r.classe === "A")?.participacao ?? 0;
  const pctB = abcResumoClientes?.find(r => r.classe === "B")?.participacao ?? 0;
  const pctC = abcResumoClientes?.find(r => r.classe === "C")?.participacao ?? 0;

  // Classificação automática
  let nivelConc: "Alta" | "Média" | "Baixa";
  let nivelDesc: string;
  let nivelColor: string;
  if (pctA > 70) {
    nivelConc = "Alta";
    nivelDesc = "uma pequena parte da carteira é responsável pela maior parte da receita";
    nivelColor = "text-red-600 bg-red-50 border-red-200";
  } else if (pctA >= 50) {
    nivelConc = "Média";
    nivelDesc = "a base é moderadamente concentrada nos principais clientes";
    nivelColor = "text-yellow-700 bg-yellow-50 border-yellow-200";
  } else {
    nivelConc = "Baixa";
    nivelDesc = "o faturamento está bem distribuído entre os clientes";
    nivelColor = "text-green-700 bg-green-50 border-green-200";
  }

  // Quantos clientes representam ~80%
  const clientesAte80 = abcClientes.findIndex(c => c.acumulado >= 80) + 1 || abcClientes.length;
  const fatTop10 = abcClientes.slice(0, 10).reduce((s, c) => s + c.faturamento, 0);

  if (totalClientesAbc === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Sem dados suficientes para gerar a leitura estratégica. Selecione um período com vendas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Painel de Metas e Plano de Ação — primeiro bloco da Leitura Estratégica */}
      <MetasAcaoPanel vendedorFiltro={vendedorLabel} />

      {/* Bloco principal — Análise de Concentração */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Análise de Concentração de Receita
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">
            Atualmente, os principais <strong>{Math.min(10, totalClientesAbc)} clientes</strong> da base representam aproximadamente{" "}
            <strong className="text-primary">{concentracaoTop10.toFixed(1)}%</strong> do faturamento total da empresa
            ({R$(fatTop10)} de {R$(totalFat)}).
          </p>

          <div className={`flex items-center gap-2 p-3 rounded-lg border ${nivelColor}`}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">
              Isso indica um nível de concentração <strong>{nivelConc.toUpperCase()}</strong> — {nivelDesc}.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">A distribuição atual está da seguinte forma:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge className="bg-green-100 text-green-700 border-green-300 w-10 justify-center">A</Badge>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span><strong>{clientesA}</strong> clientes</span>
                    <span className="font-semibold">{pctA.toFixed(1)}% do faturamento</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${pctA}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 w-10 justify-center">B</Badge>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span><strong>{clientesB}</strong> clientes</span>
                    <span className="font-semibold">{pctB.toFixed(1)}% do faturamento</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500" style={{ width: `${pctB}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-muted text-muted-foreground border-border w-10 justify-center">C</Badge>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span><strong>{clientesC}</strong> clientes</span>
                    <span className="font-semibold">{pctC.toFixed(1)}% do faturamento</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-muted-foreground/60" style={{ width: `${pctC}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm font-semibold mb-2">Esse cenário mostra que:</p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Os clientes mais importantes têm grande impacto no resultado</li>
              <li>• {nivelConc === "Alta" ? "Existe forte" : nivelConc === "Média" ? "Existe alguma" : "Há pouca"} dependência dos clientes principais</li>
              <li>• Há oportunidade de crescimento desenvolvendo clientes Classe B</li>
              <li>• Apenas <strong>{clientesAte80}</strong> clientes já representam 80% do faturamento</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Bloco — Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-600" />
            Principais Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
            <span className="text-base">💡</span>
            <span>Poucos clientes concentram grande parte do faturamento — a saída de um único cliente Classe A pode impactar até <strong>{(pctA / Math.max(clientesA, 1)).toFixed(1)}%</strong> da receita.</span>
          </div>
          <div className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
            <span className="text-base">⚠️</span>
            <span>A perda de qualquer cliente da Classe A (top {clientesA}) pode impactar significativamente o resultado mensal.</span>
          </div>
          <div className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
            <span className="text-base">📈</span>
            <span>Existe potencial real de crescimento na base Classe B ({clientesB} clientes) — pequenos aumentos de ticket aqui geram impacto relevante.</span>
          </div>
          <div className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
            <span className="text-base">📊</span>
            <span>A base Classe C ({clientesC} clientes) tem baixa representatividade individual, mas serve como pipeline de futuros Classe B.</span>
          </div>
          {concentracaoTop20 > 0 && (
            <div className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
              <span className="text-base">🎯</span>
              <span>Os top 20 clientes respondem por <strong>{concentracaoTop20.toFixed(1)}%</strong> do faturamento — foco aqui multiplica resultado.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco — Recomendações de Ação */}
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-green-700" />
            Recomendações de Ação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span><strong>Priorizar relacionamento</strong> com os {clientesA} clientes Classe A — visitas frequentes, atendimento premium e prevenção de perda.</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span><strong>Desenvolver clientes Classe B</strong> ({clientesB}) com ações de upsell e mix de produtos para promovê-los à Classe A.</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span><strong>Aumentar ticket médio</strong> dos clientes intermediários através de combos, lançamentos e produtos de maior margem.</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span><strong>Reduzir dependência</strong> diversificando o crescimento — meta: trazer mais clientes para a Classe A nos próximos 90 dias.</span>
          </div>
          {nivelConc === "Alta" && (
            <div className="flex items-start gap-2 text-sm bg-red-50 p-2 rounded border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <span><strong>Atenção crítica:</strong> a alta concentração representa risco. Crie plano de retenção formal para os clientes Classe A.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo Numérico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Resumo da Carteira
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{totalClientesAbc}</p>
              <p className="text-xs text-muted-foreground">Total de clientes</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{R$(totalFat)}</p>
              <p className="text-xs text-muted-foreground">Faturamento total</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-primary">{concentracaoTop10.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">Top 10 representa</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{clientesAte80}</p>
              <p className="text-xs text-muted-foreground">Clientes = 80%</p>
            </div>
          </div>
          {(periodoLabel || vendedorLabel) && (
            <p className="mt-3 text-[11px] text-muted-foreground text-center">
              Baseado no período: <strong>{periodoLabel ?? "—"}</strong>
              {vendedorLabel ? <> · Vendedor: <strong>{vendedorLabel}</strong></> : null}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
