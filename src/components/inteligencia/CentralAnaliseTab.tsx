import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SaleRow, getVendedoresWith2026Sales, cleanProductName } from "@/hooks/useSalesData";
import { EQUIPE_COMISSAO_JULIANO } from "@/lib/comissaoEquipe";
import type { BonificacaoRow } from "@/lib/centralAnalise/factPack";
import {
  resolveComparison,
  calcularAtalho,
  ATALHO_LABELS,
  type AtalhoComparacao,
  type ComparisonConfig,
} from "@/lib/centralAnalise/comparisonModes";
import {
  buildAnalysisContext,
  compactAnalysisContext,
  versaoDosDados,
  invalidarCacheAnalise,
  type ProgressoEtapa,
} from "@/lib/centralAnalise/analysisContext";
import { detectarGruposEconomicos } from "@/lib/centralAnalise/economicGroups";
import { chaveProduto, nomeCompletoProduto } from "@/lib/centralAnalise/productCatalog";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { normalizeSearchText } from "@/lib/clientSearch";
import { MultiSelectFiltro, type OpcaoFiltro } from "@/components/inteligencia/MultiSelectFiltro";
import {
  useAnalysisSessions,
  useAnalysisMessages,
  useCentralAnaliseActions,
  chamarCentralAnalise,
  type AnaliseEstruturada,
  type AnaliseBloco,
  type AnalysisMessage,
  type AnalysisSession,
  type AnalysisFiltros,
} from "@/hooks/useCentralAnalise";
import { classificarIntencao, responderSemIA } from "@/lib/centralAnalise/queryMotor";
import { gerarPdfExecutivo, gerarPdfApresentacao } from "@/lib/centralAnalisePdf";
import { ApresentacaoExecutiva } from "@/components/inteligencia/ApresentacaoExecutiva";
import { savePdfDoc, preopenPdfTab } from "@/lib/pdfDownload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Send, Sparkles, CheckCircle2, FileDown, Plus, History, ChevronDown, Pencil, Search,
  AlertTriangle, Loader2, User, Lightbulb, TrendingUp, ShieldAlert, ListChecks, Presentation, GitCompare,
  Database, Cpu,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const SUGESTOES = [
  "Analise o desempenho comercial deste período",
  "Quais produtos estão caindo e por quê?",
  "Quais clientes e grupos econômicos estão reduzindo compras?",
  "A migração 101/104 → 1531/1858 está funcionando?",
  "Compare minha equipe com a empresa",
  "Monte a apresentação executiva completa para a diretoria",
];

const CORES = ["hsl(32, 90%, 50%)", "hsl(210, 70%, 50%)", "hsl(142, 60%, 40%)", "hsl(0, 72%, 51%)"];


function fmtData(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function TextoMarkdown({ texto }: { texto: string }) {
  const linhas = String(texto ?? "").split("\n").filter((l) => l.trim() !== "");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
      {linhas.map((linha, i) => {
        const limpa = linha.replace(/^#+\s*/, "").trim();
        const bullet = /^[-*•]\s+/.test(limpa);
        const conteudo = limpa.replace(/^[-*•]\s+/, "");
        const partes = conteudo.split(/(\*\*[^*]+\*\*)/g);
        const render = partes.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
        );
        return bullet ? (
          <div key={i} className="flex gap-2">
            <span className="text-primary mt-0.5">•</span>
            <p>{render}</p>
          </div>
        ) : (
          <p key={i}>{render}</p>
        );
      })}
    </div>
  );
}

function BlocoRender({ bloco }: { bloco: AnaliseBloco }) {
  const dadosGrafico = useMemo(() => {
    if (!bloco.grafico) return [];
    return bloco.grafico.categorias.map((cat, i) => {
      const linha: Record<string, string | number> = { categoria: cat };
      for (const serie of bloco.grafico!.series) linha[serie.nome] = serie.valores[i] ?? 0;
      return linha;
    });
  }, [bloco.grafico]);

  const isAlerta = bloco.tipo === "alerta";
  const isDestaque = bloco.tipo === "destaque";

  return (
    <Card className={isAlerta ? "border-destructive/40" : isDestaque ? "border-primary/50" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {isAlerta && <AlertTriangle className="h-4 w-4 text-destructive" />}
          {isDestaque && <Sparkles className="h-4 w-4 text-primary" />}
          {bloco.titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {bloco.texto && <TextoMarkdown texto={bloco.texto} />}

        {!!bloco.kpis?.length && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {bloco.kpis.map((kpi, i) => (
              <div key={i} className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.valor}</p>
                {(kpi.variacao || kpi.sub) && (
                  <p
                    className={`text-[11px] ${
                      kpi.sentido === "positivo"
                        ? "text-green-600"
                        : kpi.sentido === "negativo"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {[kpi.variacao, kpi.sub].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {bloco.grafico && dadosGrafico.length > 0 && (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {bloco.grafico.tipo === "linha" ? (
                <LineChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {bloco.grafico.series.map((s, i) => (
                    <Line key={s.nome} type="monotone" dataKey={s.nome} stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {bloco.grafico.series.map((s, i) => (
                    <Bar key={s.nome} dataKey={s.nome} fill={CORES[i % CORES.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {bloco.tabela && bloco.tabela.linhas?.length > 0 && (
          <div className="overflow-auto max-h-[420px] border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {bloco.tabela.colunas.map((c, i) => (
                    <TableHead key={i} className="text-xs whitespace-nowrap">{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bloco.tabela.linhas.map((linha, i) => (
                  <TableRow key={i}>
                    {linha.map((celula, j) => (
                      <TableCell key={j} className="text-xs whitespace-nowrap">{celula}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {bloco.detalhes && bloco.detalhes.linhas?.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-7">
                Ver detalhes <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {bloco.detalhes.titulo && <p className="text-xs text-muted-foreground mb-1">{bloco.detalhes.titulo}</p>}
              <div className="overflow-auto max-h-[380px] border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {bloco.detalhes.colunas.map((c, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{c}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bloco.detalhes.linhas.map((linha, i) => (
                      <TableRow key={i}>
                        {linha.map((celula, j) => (
                          <TableCell key={j} className="text-xs whitespace-nowrap">{celula}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function ListaSecao({ titulo, itens, icon: Icon, tone }: { titulo: string; itens?: string[]; icon: any; tone?: string }) {
  if (!itens?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} /> {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {itens.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function SeloOrigem({ origem }: { origem?: "consulta" | "ia" }) {
  const comIA = origem === "ia";
  return (
    <div
      className={`rounded-md border-2 px-3 py-2 text-xs ${
        comIA ? "border-amber-500 bg-amber-500/10" : "border-green-600 bg-green-600/10"
      }`}
    >
      <p className="font-bold flex items-center gap-1.5">
        {comIA ? <>🟠 Respondido com IA</> : <>🟢 Respondido sem IA</>}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {comIA
          ? "Análise realizada com Inteligência Artificial"
          : "Fonte: Base Comercial Interna · Sem consumo de créditos de IA"}
      </p>
    </div>
  );
}

function AnaliseRender({ analise, versao }: { analise: AnaliseEstruturada; versao: number | null }) {
  return (
    <div className="space-y-3">
      <SeloOrigem origem={analise.origem} />
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">{analise.titulo}</CardTitle>
            {versao ? <Badge variant="secondary">Versão {versao}</Badge> : null}
          </div>
          {analise.periodo_descricao && (
            <p className="text-xs text-muted-foreground">{analise.periodo_descricao}</p>
          )}
        </CardHeader>
        <CardContent>
          <TextoMarkdown texto={analise.resumo_executivo} />
        </CardContent>
      </Card>

      {!!analise.alertas_dados?.length && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold text-xs mb-1">ALERTA DE DADOS</p>
            <ul className="text-xs space-y-1">
              {analise.alertas_dados.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(analise.blocos ?? []).map((b, i) => <BlocoRender key={i} bloco={b} />)}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ListaSecao titulo="Fatos (comprovados pelos dados)" itens={analise.fatos} icon={ListChecks} />
        <ListaSecao titulo="Indícios" itens={analise.indicios} icon={Lightbulb} />
        <ListaSecao titulo="Hipóteses (não comprovadas)" itens={analise.hipoteses} icon={Brain} />
        <ListaSecao titulo="Oportunidades" itens={analise.oportunidades} icon={TrendingUp} tone="text-green-600" />
        <ListaSecao titulo="Riscos e pontos de atenção" itens={analise.riscos} icon={ShieldAlert} tone="text-destructive" />
        <ListaSecao titulo="Recomendações" itens={analise.recomendacoes} icon={CheckCircle2} />
      </div>

      {analise.leitura_gerencial && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Leitura gerencial</CardTitle>
          </CardHeader>
          <CardContent><TextoMarkdown texto={analise.leitura_gerencial} /></CardContent>
        </Card>
      )}
    </div>
  );
}

const ETAPAS: ProgressoEtapa[] = [
  "Calculando indicadores",
  "Analisando produtos",
  "Analisando clientes",
  "Analisando grupos econômicos",
  "Analisando vendedores",
  "Analisando migração",
  "Montando apresentação",
];

/** Recorte vindo do cabeçalho da Inteligência Comercial (fonte única de verdade). */
export interface FiltrosHeaderCentral {
  inicio: string;
  fim: string;
  compInicio: string;
  compFim: string;
  modoLabel: string;
  /** vendedores selecionados no cabeçalho (vazio = empresa inteira) */
  vendedores: string[];
  /** clientes selecionados no cabeçalho (nomes brutos; vazio = todos) */
  clientes: string[];
  /** produtos selecionados no cabeçalho (nome limpo, sem código; vazio = todos) */
  produtos: string[];
}

export function CentralAnaliseTab({
  sales,
  filtrosHeader,
  onAplicarFiltrosHeader,
}: {
  sales: SaleRow[];
  filtrosHeader: FiltrosHeaderCentral;
  onAplicarFiltrosHeader?: (f: Partial<FiltrosHeaderCentral>) => void;
}) {
  const { toast } = useToast();

  const inicio = filtrosHeader.inicio;
  const fim = filtrosHeader.fim;
  const inicioB = filtrosHeader.compInicio;
  const fimB = filtrosHeader.compFim;

  const vendedoresSel = filtrosHeader.vendedores ?? [];
  const clientesHeader = filtrosHeader.clientes ?? [];
  const produtosHeader = filtrosHeader.produtos ?? [];

  const [gruposSel, setGruposSel] = useState<string[]>([]);

  const [pergunta, setPergunta] = useState("");
  /** Modo padrão SEMPRE consulta de dados (sem IA). */
  const [modo, setModo] = useState<"consulta" | "ia">("consulta");
  const [confirmarIA, setConfirmarIA] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<{ pergunta: string; motivo: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [etapaAtual, setEtapaAtual] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [visao, setVisao] = useState<"analise" | "apresentacao">("analise");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [filtroHistVendedor, setFiltroHistVendedor] = useState("__todos__");
  const [filtroHistData, setFiltroHistData] = useState("");
  const [renomeando, setRenomeando] = useState<AnalysisSession | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");

  const { data: sessoes } = useAnalysisSessions();
  const { data: mensagens, isLoading: carregandoMensagens } = useAnalysisMessages(sessionId);
  const { criarSessao, salvarMensagem, atualizarSessao, excluirSessao } = useCentralAnaliseActions();

  const sessaoAtual = sessoes?.find((s) => s.id === sessionId) ?? null;
  const vendedores = useMemo(() => getVendedoresWith2026Sales(sales ?? []), [sales]);

  const versaoDados = useMemo(() => versaoDosDados(sales ?? []), [sales]);
  useEffect(() => {
    invalidarCacheAnalise();
  }, [versaoDados]);

  // ------------------------------------------------- grupos econômicos (único filtro local)
  const gruposDetectados = useMemo(
    () =>
      detectarGruposEconomicos(
        (sales ?? []).map((r) => ({ nome: String(r.cliente ?? ""), cnpj: r.cnpj_cpf ?? null })),
      ),
    [sales],
  );

  const opcoesGrupos = useMemo<OpcaoFiltro[]>(
    () =>
      Array.from(gruposDetectados.grupos.values())
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((g) => ({
          value: g.grupoKey,
          label: g.nome,
          sub: `${g.unidades.length} unidade(s)`,
          termos: g.unidades.map((u) => u.nomeExibicao),
        })),
    [gruposDetectados],
  );

  const nomeGrupoSel = (key: string) => opcoesGrupos.find((o) => o.value === key)?.label ?? key;

  // clientes do cabeçalho (nomes brutos) → chaves normalizadas
  const clientesSel = useMemo(
    () => Array.from(new Set(clientesHeader.map((c) => normalizeClientName(c) || c).filter(Boolean))),
    [clientesHeader],
  );

  // produtos do cabeçalho (nome limpo) → chaves canônicas (código quando existir)
  const produtosSel = useMemo(() => {
    if (!produtosHeader.length) return [] as string[];
    const alvo = new Set(produtosHeader.map((p) => cleanProductName(p)));
    const chaves = new Set<string>();
    for (const r of sales ?? []) {
      if (alvo.has(cleanProductName(String(r.descricao ?? "")))) chaves.add(chaveProduto(r.descricao));
    }
    return Array.from(chaves).filter(Boolean);
  }, [produtosHeader, sales]);

  const resumoLista = (itens: string[], todos: string, nomear: (v: string) => string, max = 3) =>
    !itens.length ? todos : itens.length <= max ? itens.map(nomear).join(", ") : `${itens.length} selecionados`;

  const resumoVendedores = resumoLista(vendedoresSel, "Empresa inteira", (v) => v);
  const resumoClientes = resumoLista(clientesHeader, "Todos", (v) => v, 2);
  const resumoProdutos = resumoLista(produtosHeader, "Todos os produtos acabados", (v) => v, 2);
  const resumoGrupos = resumoLista(gruposSel, "Todos", nomeGrupoSel, 2);

  const comparacao = useMemo(() => {
    const temComparacao = Boolean(inicioB && fimB);
    const cfg: ComparisonConfig = {
      modo: temComparacao ? "periodo_personalizado" : "evolucao_no_periodo",
      periodoA: { inicio, fim },
      periodoB: temComparacao ? { inicio: inicioB, fim: fimB } : undefined,
    };
    return resolveComparison(cfg);
  }, [inicio, fim, inicioB, fimB]);

  const filtrosSalvos = useMemo<AnalysisFiltros>(
    () => ({
      modo: comparacao.modo,
      modoLabel: filtrosHeader.modoLabel || comparacao.modoLabel,
      periodoAtual: { inicio, fim },
      periodoComparacao: inicioB && fimB ? { inicio: inicioB, fim: fimB } : null,
      descricaoComparacao: comparacao.descricao,
      vendedores: vendedoresSel,
      clientes: clientesHeader,
      produtos: produtosHeader,
      grupos: gruposSel,
    }),
    [comparacao, filtrosHeader.modoLabel, inicio, fim, inicioB, fimB, vendedoresSel, clientesHeader, produtosHeader, gruposSel],
  );


  const { data: bonificacoes } = useQuery({
    queryKey: ["central-analise-bonificacoes"],
    queryFn: async (): Promise<BonificacaoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("bonificacao_rows")
        .select("data, categoria, cliente, produto, vendedor, quantidade, custo")
        .order("data", { ascending: false })
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as BonificacaoRow[];
    },
  });

  const versoes = (mensagens ?? []).filter((m) => m.role === "assistant" && m.payload);
  const ultimaAnalise = versoes[versoes.length - 1] ?? null;
  const analiseAprovada = sessaoAtual?.versao_aprovada
    ? versoes.find((v) => v.versao === sessaoAtual.versao_aprovada) ?? null
    : null;
  const [versaoVisivel, setVersaoVisivel] = useState<number | null>(null);
  const analiseExibida: AnalysisMessage | null =
    (versaoVisivel ? versoes.find((v) => v.versao === versaoVisivel) : null) ?? ultimaAnalise;

  const fonteDados = useMemo(
    () => `Fonte: Base Comercial Interna (planilha oficial) · ${comparacao.descricao}`,
    [comparacao],
  );

  /** Contadores reais, derivados das análises/consultas salvas no histórico. */
  const contadores = useMemo(() => {
    let consulta = 0;
    let ia = 0;
    for (const s of sessoes ?? []) {
      if (s.filtros?.origem === "consulta") consulta += 1;
      else ia += 1;
    }
    return { consulta, ia };
  }, [sessoes]);

  /** Ponto de entrada do botão principal. NUNCA chama IA sem modo IA + confirmação. */
  function submeter(texto: string) {
    const conteudo = texto.trim();
    if (!conteudo) return;
    setBloqueio(null);
    if (modo === "ia") {
      setConfirmarIA(conteudo);
      return;
    }
    const intencao = classificarIntencao(conteudo);
    if (!intencao) {
      setBloqueio({
        pergunta: conteudo,
        motivo: "Esta pergunta exige uma análise interpretativa e não pode ser respondida no modo Consulta de Dados sem IA.",
      });
      return;
    }
    void analisar(conteudo, "consulta");
  }

  async function analisar(texto: string, modoExec: "consulta" | "ia") {
    const conteudo = texto.trim();
    if (!conteudo) return;
    if (!sales?.length) {
      toast({ title: "Sem dados de vendas carregados", variant: "destructive" });
      return;
    }
    setEnviando(true);
    setErro(null);
    setEtapaAtual(ETAPAS[0]);
    const t0 = performance.now();
    let etapa = "sessao";
    let sid: string | null = sessionId;
    try {
      const filtrosDaAnalise: AnalysisFiltros = { ...filtrosSalvos, pergunta: conteudo, origem: modoExec === "ia" ? "ia" : "consulta" };
      const recorteTexto =
        `Vendedores: ${resumoVendedores}. Clientes: ${clientesHeader.length ? clientesHeader.join(", ") : "todos"}. ` +
        `Produtos: ${produtosHeader.length ? produtosHeader.join(", ") : "todos os produtos acabados"}. ` +
        `Grupos econômicos: ${gruposSel.length ? gruposSel.map(nomeGrupoSel).join(", ") : "todos"}.`;


      if (!sid) {
        const nova = await criarSessao.mutateAsync({
          titulo: conteudo.split("\n")[0].slice(0, 90) || "Nova análise",
          periodoInicio: comparacao.periodoA.inicio,
          periodoFim: comparacao.periodoA.fim,
          filtros: filtrosDaAnalise,
        });
        sid = nova.id;
        setSessionId(sid);
      }

      etapa = "registro_pergunta";
      await salvarMensagem.mutateAsync({ sessionId: sid, role: "user", content: conteudo });

      etapa = "calculo_fatos";
      const contexto = await buildAnalysisContext(
        sales,
        {
          comparacao,
          vendedores: vendedoresSel,
          clientes: clientesSel,
          produtos: produtosSel,
          grupos: gruposSel,
          equipe: [...EQUIPE_COMISSAO_JULIANO],
          equipeNome: "Equipe Juliano",
          versaoDados,
        },
        (e) => setEtapaAtual(e),
      );

      const historico = (mensagens ?? []).map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.payload
          ? `[Análise v${m.versao}] ${m.payload.titulo}\n${m.payload.resumo_executivo}\n${m.payload.leitura_gerencial ?? ""}`
          : m.content,
      }));

      let analise: AnaliseEstruturada;
      if (modoExec === "consulta") {
        // MODO CONSULTA DE DADOS — nenhuma chamada de IA acontece aqui.
        etapa = "consulta_local";
        setEtapaAtual("Montando apresentação");
        const resultado = responderSemIA(conteudo, contexto);
        if (resultado.ok === false) {
          setBloqueio({ pergunta: conteudo, motivo: resultado.motivo });
          return;
        }
        analise = { ...resultado.analise, origem: "consulta" };
      } else {
        etapa = "ia";
        setEtapaAtual("Montando apresentação");
        analise = await chamarCentralAnalise({
          pergunta:
            `${conteudo}\n\n[Configuração da análise] ${comparacao.descricao}. Recorte: ${recorteTexto} ` +
            `Toda variação deve citar explicitamente "${comparacao.referenciaTexto}".`,
          analysisContext: compactAnalysisContext(contexto),
          historico,
        });
        if (!analise || typeof analise !== "object" || !analise.resumo_executivo) {
          throw new Error("A IA não retornou uma análise estruturada válida.");
        }
        analise.origem = "ia";
      }
      analise.comparacao_descricao = comparacao.descricao;

      etapa = "persistencia_resultado";
      const proximaVersao = versoes.length + 1;
      await salvarMensagem.mutateAsync({
        sessionId: sid,
        role: "assistant",
        content: analise.resumo_executivo?.slice(0, 4000) ?? "",
        payload: analise,
        versao: proximaVersao,
      });
      await atualizarSessao.mutateAsync({
        sessionId: sid,
        patch: {
          titulo: analise.titulo?.slice(0, 120) || sessaoAtual?.titulo || "Análise",
          status: "em_construcao",
          periodo_inicio: comparacao.periodoA.inicio,
          periodo_fim: comparacao.periodoA.fim,
          filtros: filtrosDaAnalise,
        } as any,
      });
      setVersaoVisivel(null);
      setPergunta("");
    } catch (e) {
      const err = e as any;
      const original =
        (err instanceof Error ? err.message : null) ??
        err?.message ?? err?.error_description ?? err?.error ?? err?.hint ?? JSON.stringify(err ?? {});
      const code = err?.code ?? err?.status ?? err?.context?.status ?? null;
      console.error("[CentralAnalise] falha", {
        etapa,
        codigo: code,
        mensagemOriginal: original,
        duracaoMs: Math.round(performance.now() - t0),
        analiseId: sid,
      });

      const amigavel =
        etapa === "sessao" || etapa === "registro_pergunta" || etapa === "persistencia_resultado"
          ? "Não foi possível salvar a análise no banco de dados. Verifique seu acesso e tente novamente."
          : etapa === "calculo_fatos"
          ? "Não foi possível calcular os indicadores do período selecionado."
          : /timeout|timed out|aborted|excedeu/i.test(String(original))
          ? "A análise excedeu o tempo máximo de processamento. Reduza o período e tente novamente."
          : /limite de uso|429/i.test(String(original))
          ? "Limite de uso da IA atingido. Tente novamente em instantes."
          : "Não foi possível gerar a interpretação da IA.";

      setErro(amigavel);
      toast({ title: "Não foi possível concluir a análise", description: amigavel, variant: "destructive" });
    } finally {
      setEnviando(false);
      setEtapaAtual(null);
    }
  }

  async function aprovar() {
    if (!sessionId || !ultimaAnalise?.versao) return;
    await atualizarSessao.mutateAsync({
      sessionId,
      patch: { status: "aprovada", versao_aprovada: ultimaAnalise.versao } as any,
    });
    setVisao("apresentacao");
    toast({ title: `Versão ${ultimaAnalise.versao} aprovada`, description: "Apresentação executiva disponível." });
  }

  function gerarPdf(tipo: "relatorio" | "apresentacao") {
    const alvo = analiseAprovada?.payload ?? analiseExibida?.payload;
    if (!alvo) {
      toast({ title: "Gere uma análise antes de exportar o PDF", variant: "destructive" });
      return;
    }
    const preopened = preopenPdfTab();
    const doc = tipo === "apresentacao" ? gerarPdfApresentacao(alvo, fonteDados) : gerarPdfExecutivo(alvo, fonteDados);
    const ok = savePdfDoc(
      doc,
      `${tipo === "apresentacao" ? "apresentacao" : "central-analise"}-${(alvo.titulo || "analise").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`,
      { preopened, onError: (m) => toast({ title: "Erro ao gerar PDF", description: m, variant: "destructive" }) },
    );
    if (ok && sessionId && analiseAprovada) {
      atualizarSessao.mutate({ sessionId, patch: { status: "pdf_gerado", pdf_gerado_em: new Date().toISOString() } as any });
    }
  }

  function novaAnalise() {
    setSessionId(null);
    setVersaoVisivel(null);
    setPergunta("");
    setErro(null);
    setVisao("analise");
  }

  function aplicarFiltrosSalvos(f: AnalysisFiltros | null | undefined) {
    if (!f) return;
    setGruposSel(f.grupos ?? []);
    onAplicarFiltrosHeader?.({
      inicio: f.periodoAtual?.inicio || inicio,
      fim: f.periodoAtual?.fim || fim,
      compInicio: f.periodoComparacao?.inicio ?? "",
      compFim: f.periodoComparacao?.fim ?? "",
      vendedores: f.vendedores ?? [],
      clientes: f.clientes ?? [],
      produtos: f.produtos ?? [],
    });
  }


  function abrirSalva(s: AnalysisSession) {
    // Somente leitura do banco — nunca chama a IA.
    setSessionId(s.id);
    setVersaoVisivel(null);
    setVisao("analise");
    setErro(null);
    aplicarFiltrosSalvos(s.filtros);
    setMostrarHistorico(false);
  }

  function usarComoNova(s: AnalysisSession) {
    // Carrega o mesmo recorte, sem executar nada.
    setSessionId(null);
    setVersaoVisivel(null);
    setVisao("analise");
    setErro(null);
    aplicarFiltrosSalvos(s.filtros);
    setPergunta(s.filtros?.pergunta ?? "");
    setMostrarHistorico(false);
    toast({ title: "Recorte carregado", description: "Ajuste o que quiser e clique em ANALISAR." });
  }

  async function renomear() {
    if (!renomeando) return;
    const nome = novoTitulo.trim();
    if (!nome) return;
    await atualizarSessao.mutateAsync({ sessionId: renomeando.id, patch: { titulo: nome.slice(0, 120) } as any });
    setRenomeando(null);
    toast({ title: "Análise renomeada" });
  }

  const historicoFiltrado = (sessoes ?? []).filter((s) => {
    if (filtroHistVendedor !== "__todos__" && !(s.filtros?.vendedores ?? []).includes(filtroHistVendedor)) return false;
    if (filtroHistData && String(s.updated_at).slice(0, 10) !== filtroHistData) return false;
    const q = normalizeSearchText(buscaHistorico);
    if (!q) return true;
    const hay = normalizeSearchText(
      [
        s.titulo,
        s.filtros?.pergunta,
        s.filtros?.descricaoComparacao,
        s.periodo_inicio ? fmtData(s.periodo_inicio) : "",
        s.periodo_fim ? fmtData(s.periodo_fim) : "",
        ...(s.filtros?.vendedores ?? []),
        ...(s.filtros?.clientes ?? []),
        ...(s.filtros?.grupos ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return q.split(" ").every((t) => hay.includes(t));
  });

  const camposRecorte = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1 min-w-0">
        <Label className="text-xs">Grupo econômico</Label>
        <MultiSelectFiltro
          placeholderTodos="Todos os grupos"
          buscaPlaceholder="Buscar grupo econômico..."
          opcoes={opcoesGrupos}
          selecionados={gruposSel}
          onChange={setGruposSel}
          maxNomes={1}
        />
        <p className="text-[10px] text-muted-foreground">
          {opcoesGrupos.length} grupos consolidados (matriz + filiais)
          {gruposDetectados.revisao.length ? ` · ${gruposDetectados.revisao.length} par(es) em revisão manual` : ""}
        </p>
      </div>
    </div>
  );


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Central de Análise · Inteligência Comercial
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMostrarHistorico((v) => !v)}>
                <History className="h-4 w-4 mr-1" /> Histórico
              </Button>
              <Button variant="outline" size="sm" onClick={novaAnalise}>
                <Plus className="h-4 w-4 mr-1" /> Nova análise
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A Central herda automaticamente os filtros do cabeçalho (período, comparação, modo, vendedor, cliente e produto).
            Aqui você só acrescenta o Grupo econômico. A IA só é chamada no modo ANÁLISE COM IA, após sua confirmação.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {camposRecorte}

          <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 space-y-1">
            <div className="flex items-start gap-2">
              <GitCompare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-foreground uppercase tracking-wide text-[10px]">Análise configurada</p>
                <p className="font-semibold text-foreground">{comparacao.descricao}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-[11px] pl-6">
              <p><span className="text-muted-foreground">Período: </span>{fmtData(inicio)} a {fmtData(fim)}</p>
              <p>
                <span className="text-muted-foreground">Comparando com: </span>
                {inicioB && fimB ? `${fmtData(inicioB)} a ${fmtData(fimB)}` : "Sem comparativo"}
              </p>
              <p><span className="text-muted-foreground">Vendedor: </span>{resumoVendedores}</p>
              <p><span className="text-muted-foreground">Cliente: </span>{resumoClientes}</p>
              <p><span className="text-muted-foreground">Produto: </span>{resumoProdutos}</p>
              <p><span className="text-muted-foreground">Grupo econômico: </span>{resumoGrupos}</p>
            </div>
          </div>


          {/* ---------------- Seletor de modo (acima da caixa de pergunta) ---------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setModo("consulta"); setBloqueio(null); }}
              className={`text-left rounded-md border-2 p-3 transition-colors ${
                modo === "consulta" ? "border-green-600 bg-green-600/10" : "border-border hover:bg-muted/50"
              }`}
            >
              <p className="text-sm font-bold flex items-center gap-2">
                <span className="text-green-600">🟢</span> CONSULTA DE DADOS
                {modo === "consulta" && <Badge className="bg-green-600 hover:bg-green-600 text-[10px]">MODO ATIVO</Badge>}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
                Sem IA • Sem consumo de créditos
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setModo("ia"); setBloqueio(null); }}
              className={`text-left rounded-md border-2 p-3 transition-colors ${
                modo === "ia" ? "border-amber-500 bg-amber-500/10" : "border-border hover:bg-muted/50"
              }`}
            >
              <p className="text-sm font-bold flex items-center gap-2">
                <span className="text-amber-500">🟠</span> ANÁLISE COM IA
                {modo === "ia" && <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px]">MODO ATIVO</Badge>}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
                Utiliza IA • Pode consumir créditos
              </p>
            </button>
          </div>

          <Textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder={
              modo === "consulta"
                ? "Consulte os dados. Ex.: Quanto o João Paulo vendeu em agosto? Quais os 10 clientes que mais caíram?"
                : sessionId
                ? "Continue esta análise com IA... (ex.: aprofunde os Lanches Recheados por sabor, detalhe a migração)"
                : "Pergunta interpretativa. Ex.: Por que nossas vendas estão caindo e qual estratégia você recomenda?"
            }
            className="min-h-[130px] text-sm"
          />

          {bloqueio && (
            <Alert className="border-amber-500/60 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs space-y-2">
                <p>{bloqueio.motivo}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBloqueio(null)}>
                    Continuar sem IA
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-amber-500 hover:bg-amber-600"
                    onClick={() => { setModo("ia"); setConfirmarIA(bloqueio.pergunta); setBloqueio(null); }}
                  >
                    Mudar para Análise com IA
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => submeter(pergunta)}
              disabled={enviando || !pergunta.trim()}
              className={modo === "ia" ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
            >
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : modo === "ia" ? <Cpu className="h-4 w-4 mr-1" /> : <Database className="h-4 w-4 mr-1" />}
              {modo === "ia" ? "ANALISAR COM IA" : "CONSULTAR DADOS"}
            </Button>
            {modo === "consulta" ? (
              <div className="text-[11px] leading-tight text-green-700 dark:text-green-500">
                <p>✓ Sem IA</p>
                <p>✓ Consulta direta à base</p>
                <p>✓ Não consome créditos de IA</p>
              </div>
            ) : (
              <div className="text-[11px] leading-tight text-amber-600">
                <p>⚠ Utiliza inteligência artificial</p>
                <p>⚠ Esta operação pode consumir créditos</p>
              </div>
            )}
            {ultimaAnalise && sessaoAtual?.status !== "aprovada" && sessaoAtual?.status !== "pdf_gerado" && (
              <Button variant="secondary" onClick={aprovar} disabled={enviando}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar análise
              </Button>
            )}
            {sessaoAtual && (
              <Button variant="outline" onClick={() => { setRenomeando(sessaoAtual); setNovoTitulo(sessaoAtual.titulo); }}>
                <Pencil className="h-4 w-4 mr-1" /> Renomear
              </Button>
            )}
            {analiseExibida?.payload && (
              <>
                <Button variant={visao === "apresentacao" ? "default" : "outline"} onClick={() => setVisao(visao === "apresentacao" ? "analise" : "apresentacao")}>
                  <Presentation className="h-4 w-4 mr-1" /> {visao === "apresentacao" ? "Ver análise" : "Ver apresentação"}
                </Button>
                <Button variant="outline" onClick={() => gerarPdf("apresentacao")}>
                  <FileDown className="h-4 w-4 mr-1" /> PDF da apresentação
                </Button>
                <Button variant="outline" onClick={() => gerarPdf("relatorio")}>
                  <FileDown className="h-4 w-4 mr-1" /> PDF do relatório
                </Button>
              </>
            )}
            {sessaoAtual && (
              <Badge variant={sessaoAtual.status === "em_construcao" ? "outline" : "secondary"}>
                {sessaoAtual.status === "em_construcao" ? "Em construção" : sessaoAtual.status === "aprovada" ? "Análise aprovada" : "PDF gerado"}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto">{fonteDados}</span>
          </div>

          {!sessionId && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGESTOES.map((s) => (
                <Button key={s} variant="outline" size="sm" className="text-xs h-7" onClick={() => { setPergunta(s); submeter(s); }} disabled={enviando}>
                  <Sparkles className="h-3 w-3 mr-1" /> {s}
                </Button>
              ))}
            </div>
          )}

          {erro && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{erro}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-[11px]">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Controle de consumo</span>
            <span className="flex items-center gap-1"><Database className="h-3 w-3 text-green-600" /> Consultas sem IA: <strong>{contadores.consulta}</strong></span>
            <span className="flex items-center gap-1"><Cpu className="h-3 w-3 text-amber-500" /> Análises com IA: <strong>{contadores.ia}</strong></span>
            <span className="text-muted-foreground">
              Consumo de créditos de IA: não informado pela API (nenhum valor estimado é exibido).
            </span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!confirmarIA} onOpenChange={(o) => !o && setConfirmarIA(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader><DialogTitle className="text-base">Confirmar uso de Inteligência Artificial</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta pergunta será processada com Inteligência Artificial e poderá consumir créditos. Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarIA(null)}>CANCELAR</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => { const q = confirmarIA!; setConfirmarIA(null); void analisar(q, "ia"); }}
            >
              CONTINUAR COM IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!renomeando} onOpenChange={(o) => !o && setRenomeando(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle className="text-base">Nome da análise</DialogTitle></DialogHeader>
          <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Ex.: Reunião Comercial Agosto" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenomeando(null)}>Cancelar</Button>
            <Button onClick={renomear} disabled={!novoTitulo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mostrarHistorico && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico de análises</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Reabrir uma análise salva apenas carrega o resultado já gravado — não consome IA.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar análise (título, cliente, vendedor, período, pergunta)..."
                  value={buscaHistorico}
                  onChange={(e) => setBuscaHistorico(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <Select value={filtroHistVendedor} onValueChange={setFiltroHistVendedor}>
                <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todos os vendedores</SelectItem>
                  {vendedores.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={filtroHistData} onChange={(e) => setFiltroHistData(e.target.value)} className="h-9 w-[160px]" />
              {(buscaHistorico || filtroHistData || filtroHistVendedor !== "__todos__") && (
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setBuscaHistorico(""); setFiltroHistData(""); setFiltroHistVendedor("__todos__"); }}>
                  Limpar filtros
                </Button>
              )}
            </div>

            {!historicoFiltrado.length ? (
              <p className="text-xs text-muted-foreground">Nenhuma análise encontrada.</p>
            ) : (
              <div className="overflow-auto max-h-[380px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Análise</TableHead>
                      <TableHead className="text-xs">Recorte</TableHead>
                      <TableHead className="text-xs">Criada em</TableHead>
                      <TableHead className="text-xs">Origem</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historicoFiltrado.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs max-w-[260px]">
                          <p className="truncate font-medium" title={s.titulo}>{s.titulo}</p>
                          {s.filtros?.pergunta && (
                            <p className="truncate text-muted-foreground" title={s.filtros.pergunta}>{s.filtros.pergunta}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] max-w-[280px]">
                          <p>{s.filtros?.descricaoComparacao ?? (s.periodo_inicio ? `${fmtData(s.periodo_inicio)} a ${fmtData(s.periodo_fim ?? "")}` : "—")}</p>
                          <p className="text-muted-foreground truncate">
                            {(s.filtros?.vendedores?.length ? s.filtros.vendedores.join(", ") : "Empresa inteira")}
                            {" · "}
                            {(s.filtros?.clientes?.length ? `${s.filtros.clientes.length} cliente(s)` : "Todos os clientes")}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(s.created_at ?? s.updated_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {s.filtros?.origem === "consulta" ? (
                            <span className="text-green-700 dark:text-green-500">🟢 Sem IA</span>
                          ) : (
                            <span className="text-amber-600">🟠 Com IA</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant={s.status === "em_construcao" ? "outline" : "secondary"} className="text-[10px]">
                            {s.status === "em_construcao" ? "Em construção" : s.status === "aprovada" ? "Aprovada" : "PDF gerado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => abrirSalva(s)}>Abrir</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => usarComoNova(s)}>Usar como nova análise</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setRenomeando(s); setNovoTitulo(s.titulo); }}>Renomear</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => { excluirSessao.mutate(s.id); if (sessionId === s.id) novaAnalise(); }}>Excluir</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {enviando && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> {etapaAtual ?? "Calculando indicadores"}...
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ETAPAS.map((e) => {
                const idx = ETAPAS.indexOf(e);
                const atual = ETAPAS.indexOf((etapaAtual ?? ETAPAS[0]) as ProgressoEtapa);
                const feito = idx < atual;
                return (
                  <Badge key={e} variant={idx === atual ? "default" : feito ? "secondary" : "outline"} className="text-[10px]">
                    {feito ? "✓ " : ""}{e}
                  </Badge>
                );
              })}
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {sessionId && carregandoMensagens && <Skeleton className="h-40 w-full" />}

      {versoes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Versões:</span>
          {versoes.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={(versaoVisivel ?? ultimaAnalise?.versao) === v.versao ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setVersaoVisivel(v.versao ?? null)}
            >
              Versão {v.versao}
              {sessaoAtual?.versao_aprovada === v.versao && <CheckCircle2 className="h-3 w-3 ml-1" />}
            </Button>
          ))}
        </div>
      )}

      {visao === "analise" && (mensagens ?? []).filter((m) => m.role === "user").length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Conversa</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[220px] overflow-auto">
            {(mensagens ?? []).map((m) => (
              <div key={m.id} className="text-xs">
                <span className="font-semibold">{m.role === "user" ? "Você" : `IA (v${m.versao})`}: </span>
                <span className="text-muted-foreground whitespace-pre-wrap">{m.content.slice(0, 400)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {analiseExibida?.payload && visao === "apresentacao" && (
        <ApresentacaoExecutiva analise={analiseExibida.payload} fonte={fonteDados} />
      )}

      {analiseExibida?.payload && visao === "analise" && (
        <AnaliseRender analise={analiseExibida.payload} versao={analiseExibida.versao} />
      )}
    </div>
  );
}
