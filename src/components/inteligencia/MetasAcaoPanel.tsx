import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Target, Rocket, Lightbulb, Calendar, Sparkles, Star, Info, Eye, Printer, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { savePdfDoc, preopenPdfTab } from "@/lib/pdfDownload";
import { PlanoAcaoReport, type PlanoAcaoReportData } from "./PlanoAcaoReport";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSalesData, shortVendedorName } from "@/hooks/useSalesData";
import { useCommissionImport } from "@/hooks/useCommissionImport";
import {
  useMetaConfig,
  useVendorMetas,
  computeVendedorMetas,
  TEAM_VENDEDORES,
  type VendedorMeta,
} from "@/hooks/useMetasData";
import { calcProjecaoMensal } from "@/lib/projecaoMensal";
import { calcProjecaoMeta } from "@/lib/projecaoMeta";
import { formatDiaMes } from "@/lib/diasOperacionais";
import { calcPlanoEsforco } from "@/lib/planoVendedor";
import { calcComparativoMesmoPonto } from "@/lib/comparativoMesAnterior";

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

interface MetasAcaoPanelProps {
  /** Filtro de vendedor selecionado na Inteligência Comercial (nome curto). Vazio = equipe inteira */
  vendedorFiltro?: string;
}

interface MetaLinha {
  nome: string;
  cor: string;
  meta: number;
  realizado: number;
  pctAtingido: number;
  falta: number;
}

export function MetasAcaoPanel({ vendedorFiltro }: MetasAcaoPanelProps) {
  const { data: sales } = useSalesData();
  const { data: config } = useMetaConfig();

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const previousRef = new Date(year, month - 1, 1);
  const previousYm = `${previousRef.getFullYear()}-${String(previousRef.getMonth() + 1).padStart(2, "0")}`;
  const { batch: previousCommissionBatch } = useCommissionImport(previousYm);

  const { data: vendorOverrides } = useVendorMetas(ym);

  const metas = useMemo<VendedorMeta[]>(() => {
    if (!sales || !config) return [];
    return computeVendedorMetas(sales, config, year, month, vendorOverrides ?? undefined);
  }, [sales, config, year, month, vendorOverrides]);

  // FONTE ÚNICA: projeção do mês vem de `calcProjecaoMensal` — mesma função
  // que a aba "Previsão" da Inteligência Comercial usa. Isso garante que
  // faturamento acumulado, média diária, dias úteis e projeção sejam
  // BIT-A-BIT idênticos entre as telas para o mesmo vendedor.
  const refDate = useMemo(() => new Date(year, month, 15), [year, month]);


  // Decide se o painel é por vendedor ou agregado da equipe
  const vendedorAlvo = useMemo(() => {
    if (!vendedorFiltro) return null;
    const short = shortVendedorName(vendedorFiltro);
    return TEAM_VENDEDORES.includes(short) ? short : null;
  }, [vendedorFiltro]);

  const escopo = useMemo(() => {
    if (vendedorAlvo) {
      const vm = metas.find((v) => v.vendedor === vendedorAlvo);
      if (!vm) return null;
      return {
        titulo: `Metas de ${vendedorAlvo}`,
        faturamento: vm.faturamentoMes,
        linhas: [
          { nome: "Meta Média", cor: "bg-amber-100 text-amber-800 border-amber-200", meta: vm.metaImpulso, realizado: vm.faturamentoMes, pctAtingido: vm.metaImpulso > 0 ? (vm.faturamentoMes / vm.metaImpulso) * 100 : 0, falta: vm.faltaImpulso },
          { nome: "Meta Combustível", cor: "bg-green-100 text-green-800 border-green-200", meta: vm.metaPerformance, realizado: vm.faturamentoMes, pctAtingido: vm.metaPerformance > 0 ? (vm.faturamentoMes / vm.metaPerformance) * 100 : 0, falta: vm.faltaPerformance },
          { nome: "Meta 0,5%", cor: "bg-purple-100 text-purple-800 border-purple-200", meta: vm.metaAceleracao, realizado: vm.faturamentoMes, pctAtingido: vm.metaAceleracao > 0 ? (vm.faturamentoMes / vm.metaAceleracao) * 100 : 0, falta: vm.faltaAceleracao },
          { nome: "Meta 1%", cor: "bg-blue-100 text-blue-800 border-blue-200", meta: vm.metaExcelencia, realizado: vm.faturamentoMes, pctAtingido: vm.metaExcelencia > 0 ? (vm.faturamentoMes / vm.metaExcelencia) * 100 : 0, falta: vm.faltaExcelencia },
        ] as MetaLinha[],
      };
    }
    // Agregado equipe (somatório)
    const team = metas.filter((m) => TEAM_VENDEDORES.includes(m.vendedor));
    if (team.length === 0) return null;
    const sum = (key: keyof VendedorMeta) =>
      team.reduce((acc, v) => acc + (typeof v[key] === "number" ? (v[key] as number) : 0), 0);
    const fat = sum("faturamentoMes");
    const linhas: MetaLinha[] = [
      { nome: "Meta Média", cor: "bg-amber-100 text-amber-800 border-amber-200", meta: sum("metaImpulso"), realizado: fat, pctAtingido: 0, falta: 0 },
      { nome: "Meta Combustível", cor: "bg-green-100 text-green-800 border-green-200", meta: sum("metaPerformance"), realizado: fat, pctAtingido: 0, falta: 0 },
      { nome: "Meta 0,5%", cor: "bg-purple-100 text-purple-800 border-purple-200", meta: sum("metaAceleracao"), realizado: fat, pctAtingido: 0, falta: 0 },
      { nome: "Meta 1%", cor: "bg-blue-100 text-blue-800 border-blue-200", meta: sum("metaExcelencia"), realizado: fat, pctAtingido: 0, falta: 0 },
    ];
    linhas.forEach((l) => {
      l.pctAtingido = l.meta > 0 ? (l.realizado / l.meta) * 100 : 0;
      l.falta = Math.max(0, l.meta - l.realizado);
    });
    return { titulo: "Metas da Equipe", faturamento: fat, linhas };
  }, [metas, vendedorAlvo]);

  // Ticket médio do mês para tradução em pedidos
  const ticketMedio = useMemo(() => {
    if (!sales) return 0;
    const inicio = new Date(year, month, 1);
    const fim = new Date(year, month + 1, 0, 23, 59, 59);
    const filtered = sales.filter((s) => {
      const d = new Date(s.data);
      if (d < inicio || d > fim) return false;
      if (vendedorAlvo) return shortVendedorName(s.vendedor) === vendedorAlvo;
      return true;
    });
    const pedidos = new Set(filtered.map((s) => `${s.codigo_venda}-${s.cliente}`));
    const fat = filtered.reduce((acc, s) => acc + s.preco_total, 0);
    return pedidos.size > 0 ? fat / pedidos.size : 0;
  }, [sales, year, month, vendedorAlvo]);

  // Projeção — fonte única. Deve ficar ANTES de qualquer early return
  // para manter a ordem de hooks estável entre renderizações.
  const projecaoInfo = useMemo(
    () => calcProjecaoMensal(sales ?? [], refDate, vendedorAlvo ?? undefined),
    [sales, refDate, vendedorAlvo],
  );

  // Plano de esforço — "dias" (padrão) ou "rotas" (vendedores configurados
  // como Ednei). FONTE ÚNICA em `planoVendedor.ts`.
  const plano = useMemo(
    () => calcPlanoEsforco(vendedorAlvo, refDate),
    [vendedorAlvo, refDate],
  );

  // Comparativo compacto com o mesmo ponto operacional do mês anterior.
  const comparativo = useMemo(
    () => {
      const previousCycleSales = previousCommissionBatch?.rows
        .filter((row) => row.tipo === "VENDA")
        .map((row, index) => ({
          id: index,
          codigo_venda: Number(row.codigoVenda ?? 0),
          data: String(row.data ?? ""),
          quantidade: Number(row.quantidade ?? 0),
          descricao: String(row.produto ?? ""),
          cnpj_cpf: row.cnpjCpf ?? null,
          cliente: String(row.cliente ?? ""),
          vendedor: String(row.vendedor ?? ""),
          preco_unitario: Number(row.precoUnit ?? 0),
          preco_total: Number(row.precoVendaTotal ?? row.valor ?? 0),
        }));
      return escopo
        ? calcComparativoMesmoPonto({
            sales: sales ?? [],
            previousCycleSales,
            refDate,
            vendedorShort: vendedorAlvo,
            faturamentoAtual: escopo.faturamento,
          })
        : null;
    },
    [sales, previousCommissionBatch, refDate, vendedorAlvo, escopo],
  );

  // Visualização / impressão / PDF do Plano de Ação
  const [previewOpen, setPreviewOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const hiddenReportRef = useRef<HTMLDivElement>(null);

  if (!escopo) {
    return (
      <Card className="border-primary/30">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sem dados de metas configuradas para o período atual.
        </CardContent>
      </Card>
    );
  }

  const dias = {
    passados: projecaoInfo.diasUteisDecorridos,
    restantes: projecaoInfo.diasUteisRestantes,
    total: projecaoInfo.diasUteisTotal,
  };
  const diasEntrega = projecaoInfo.diasEntrega;
  const ultimoDiaMes = projecaoInfo.ultimoDiaMes;

  const isPorRotas = plano.tipo === "rotas";
  const divisor = plano.unidadesRestantes;
  const notaCalendario = plano.notaCalendario;
  const explicacaoCompleta = plano.explicacao;

  // FONTE ÚNICA de ritmo e projeção: a MESMA unidade de esforço usada no
  // "necessário por unidade" (dias operacionais restantes ou rotas restantes).
  const unidadesDecorridas = Math.max(0, plano.unidadesTotais - divisor);
  const mediaDiariaUtil = unidadesDecorridas > 0 ? escopo.faturamento / unidadesDecorridas : 0;
  const projecao = escopo.faturamento + mediaDiariaUtil * divisor;

  const projecoesPorMeta = new Map(
    escopo.linhas.map((l) => [
      l.nome,
      calcProjecaoMeta({
        meta: l.meta,
        realizado: l.realizado,
        unidadesRestantes: divisor,
        unidadesDecorridas,
      }),
    ]),
  );

  const metaFoco =
    escopo.linhas.find((l) => l.realizado < l.meta) ?? escopo.linhas[escopo.linhas.length - 1];
  const necessarioPorUnidade = projecoesPorMeta.get(metaFoco.nome)?.necessarioPorUnidade ?? 0;
  const pedidosPorUnidade = ticketMedio > 0 && necessarioPorUnidade > 0 ? Math.ceil(necessarioPorUnidade / ticketMedio) : 0;

  // Dados do relatório — MESMOS valores exibidos na tela (sem recálculo).
  const periodoLabel = refDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const reportData: PlanoAcaoReportData = {
    vendedorLabel: vendedorAlvo ?? "Equipe",
    periodoLabel: `${periodoLabel} (até ${ultimoDiaMes.toLocaleDateString("pt-BR")})`,
    faturamento: escopo.faturamento,
    projecao,
    mediaDiariaAtual: mediaDiariaUtil,
    ticketMedio,
    diasDecorridos: dias.passados,
    diasRestantes: dias.restantes,
    unidadesRestantes: divisor,
    unidadeSingular: plano.unidadeSingular,
    unidadePlural: plano.unidadePlural,
    isPorRotas,
    notaCalendario,
    explicacao: explicacaoCompleta,
    proximasDatas: plano.proximasDatas.map(formatDiaMes),
    geradoEm: new Date().toLocaleString("pt-BR"),
    metas: escopo.linhas.map((l) => {
      const p = projecoesPorMeta.get(l.nome)!;
      const necessarioUnidade = p.necessarioPorUnidade;
      return {
        nome: l.nome,
        meta: l.meta,
        realizado: l.realizado,
        falta: l.falta,
        pctAtingido: l.pctAtingido,
        batido: p.batido,
        projetaBate: p.projetaBate,
        projecaoFechamento: p.projecaoFechamento,
        excedenteProjetado: p.excedenteProjetado,
        pctExcedenteProjetado: p.pctExcedenteProjetado,
        deficitProjetado: p.deficitProjetado,
        necessarioUnidade,
        pedidosUnidade: ticketMedio > 0 && necessarioUnidade > 0 ? Math.ceil(necessarioUnidade / ticketMedio) : 0,
      };
    }),
  };


  const fileName = `plano-acao-${reportData.vendedorLabel.toLowerCase().replace(/\s+/g, "-")}-${projecaoInfo.yearMonth}.pdf`;

  const handleImprimir = () => {
    const node = (reportRef.current ?? hiddenReportRef.current)?.outerHTML;
    if (!node) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano de Ação Comercial</title>` +
        `<style>@page{size:A4;margin:12mm}body{margin:0;background:#fff}</style></head><body>${node}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  };

  const handlePdf = async () => {
    const preopened = preopenPdfTab();
    const node = reportRef.current ?? hiddenReportRef.current;
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.92);
    let heightLeft = imgH;
    let position = margin;
    pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
    heightLeft -= pageH - margin * 2;
    while (heightLeft > 0) {
      position = margin - (imgH - heightLeft);
      pdf.addPage();
      pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
    }
    savePdfDoc(pdf, fileName, { preopened });
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Progresso de Metas e Plano de Ação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {escopo.titulo} · Mês atual · Faturamento realizado:{" "}
            <strong className="text-foreground">{R$(escopo.faturamento)}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <Calendar className="h-3 w-3" />
              {dias.passados} dias úteis decorridos · {dias.restantes} restantes
            </Badge>
            <Badge variant="outline">Média diária: {R$(mediaDiariaUtil)}</Badge>
            <Badge variant="outline">Projeção: {R$(projecao)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* PROGRESSO DAS 4 METAS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Progresso das Metas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {escopo.linhas.map((l) => {
            const p = projecoesPorMeta.get(l.nome)!;
            const batido = p.batido;
            const pct = Math.min(100, l.pctAtingido);
            return (
              <div key={l.nome} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className={`${l.cor} w-24 justify-center`} variant="outline">
                      {l.nome}
                    </Badge>
                    <span className="text-muted-foreground">{R$(l.meta)}</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold ${batido ? "text-green-600" : ""}`}>
                      {l.pctAtingido.toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {batido ? "✓ Batida" : `Falta ${R$(l.falta)}`}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${batido ? "bg-green-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Projeção fim do mês: {R$(p.projecaoFechamento)}</span>
                  <span>{p.projetaBate ? "→ projetada bate ✓" : "→ projetada NÃO bate"}</span>
                </div>

              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* PLANO DE AÇÃO — POR META */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-700" />
            <h3 className="text-base font-semibold">
              {isPorRotas ? "Plano de Ação — Meta por rota" : "Plano de Ação — Meta diária por objetivo"}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-1" /> Visualizar
            </Button>
            <Button size="sm" variant="outline" onClick={handleImprimir}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            <Button size="sm" variant="outline" onClick={handlePdf}>
              <FileDown className="h-4 w-4 mr-1" /> Baixar PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {escopo.linhas.map((l) => {
            const p = projecoesPorMeta.get(l.nome)!;
            const batido = p.batido;
            const necessarioUnidade = p.necessarioPorUnidade;
            const pedidosUnidade = ticketMedio > 0 && necessarioUnidade > 0 ? Math.ceil(necessarioUnidade / ticketMedio) : 0;
            const projetaBate = p.projetaBate;

            return (
              <Card key={l.nome} className={`border-2 ${batido ? "border-green-300 bg-green-50/40" : projetaBate ? "border-green-200" : "border-primary/20"}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={`${l.cor} justify-center`} variant="outline">
                      {l.nome}
                    </Badge>
                    <span className={`text-xs font-semibold ${batido ? "text-green-700" : projetaBate ? "text-green-700" : "text-muted-foreground"}`}>
                      {batido ? "✓ Batida" : projetaBate ? "Projeção bate" : "Projeção não bate"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {batido ? (
                    <p className="text-green-700 font-semibold text-sm">
                      🎉 Meta atingida! Foque na próxima faixa.
                    </p>
                  ) : (
                    <>
                      {/* Linha superior: contexto */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded bg-muted/40">
                          <p className="text-[10px] uppercase text-muted-foreground">Meta</p>
                          <p className="text-sm font-semibold">{R$(l.meta)}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40">
                          <p className="text-[10px] uppercase text-muted-foreground">Realizado</p>
                          <p className="text-sm font-semibold">{R$(l.realizado)}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/40">
                          <p className="text-[10px] uppercase text-muted-foreground">
                            {isPorRotas ? "Rotas restantes" : "Falta"}
                          </p>
                          <p className="text-sm font-semibold text-orange-700">
                            {isPorRotas ? divisor : R$(l.falta)}
                          </p>
                        </div>
                      </div>

                      {/* DESTAQUE PRINCIPAL */}
                      {projetaBate ? (
                        <div className="rounded-xl border-2 border-green-400/70 bg-green-50 p-4 text-center space-y-1">
                          <p className="text-[11px] uppercase tracking-wide text-green-700 font-semibold flex items-center justify-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-green-600 text-green-600" />
                            Mantendo o ritmo atual, você atinge a meta
                          </p>
                          <p className="text-2xl font-bold text-green-700 leading-tight">
                            ✓ {R$(p.projecaoFechamento)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            projeção de fechamento · {p.pctProjetado.toFixed(0)}% da meta
                          </p>
                          <ul className="text-[11px] text-foreground/80 pt-1 space-y-0.5">
                            <li>Média atual por {plano.unidadeSingular}: <strong>{R$(p.mediaPorUnidade)}</strong></li>
                            <li>Necessário por {plano.unidadeSingular}: <strong>{R$(necessarioUnidade)}</strong></li>
                            <li>
                              Projetado acima da meta: <strong>{R$(p.excedenteProjetado)}</strong>{" "}
                              ({p.pctExcedenteProjetado.toFixed(1)}%)
                            </li>
                          </ul>
                          <p className="text-[11px] text-muted-foreground/90 flex items-center justify-center gap-1 pt-1">
                            <span>{notaCalendario}</span>
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" aria-label="Explicação" className="inline-flex">
                                    <Info className="h-3 w-3 text-muted-foreground/70" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {explicacaoCompleta}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl border-2 border-primary/50 bg-gradient-to-br from-primary/10 to-primary/5 p-4 text-center space-y-1">
                          <p className="text-[11px] uppercase tracking-wide text-primary font-semibold flex items-center justify-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                            Você precisa faturar
                          </p>
                          <p className="text-3xl font-bold text-primary leading-tight">
                            {R$(necessarioUnidade)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            por {plano.unidadeSingular} · nas próximas{" "}
                            <strong className="text-foreground">{divisor}</strong>{" "}
                            {isPorRotas ? plano.unidadePlural : "dias operacionais"}
                          </p>
                          {isPorRotas && plano.proximasDatas.length > 0 && (
                            <p className="text-[11px] text-foreground pt-1">
                              Próximas rotas: <strong>{plano.proximasDatas.map(formatDiaMes).join(", ")}</strong>
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground/90 flex items-center justify-center gap-1 pt-1">
                            <span>{notaCalendario}</span>
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" aria-label="Explicação" className="inline-flex">
                                    <Info className="h-3 w-3 text-muted-foreground/70" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {explicacaoCompleta}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </p>
                        </div>
                      )}

                      {/* Info secundária */}
                      <div className="text-xs text-muted-foreground leading-relaxed border-t pt-2">
                        Base do cálculo:
                        <ul className="mt-1 space-y-0.5">
                          {pedidosUnidade > 0 && (
                            <li>• <strong className="text-foreground">{pedidosUnidade} pedidos/{plano.unidadeSingular}</strong> para alcançar a meta</li>
                          )}
                          <li>• Ticket médio atual: <strong className="text-foreground">{R$(ticketMedio)}</strong></li>
                          <li>• Venda média atual por {plano.unidadeSingular}: <strong className="text-foreground">{R$(p.mediaPorUnidade)}</strong></li>
                          <li>• Necessário por {plano.unidadeSingular}: <strong className="text-foreground">{R$(necessarioUnidade)}</strong></li>
                          <li>• Projeção de fechamento: <strong className="text-foreground">{R$(p.projecaoFechamento)}</strong></li>
                          <li>
                            •{" "}
                            {projetaBate
                              ? <>Projetado acima da meta: <strong className="text-green-700">{R$(p.excedenteProjetado)}</strong></>
                              : <>Diferença projetada até a meta: <strong className="text-orange-700">{R$(p.deficitProjetado)}</strong></>}
                          </li>
                        </ul>
                      </div>

                      {/* Recomendação em texto */}
                      <div className="text-xs bg-muted/30 p-2 rounded leading-relaxed">
                        {projetaBate ? (
                          <>
                            Mantendo a média atual de <strong className="text-green-700">{R$(p.mediaPorUnidade)}</strong> por {plano.unidadeSingular} durante{" "}
                            {isPorRotas ? (
                              <>as próximas <strong>{divisor} {plano.unidadePlural}</strong>,</>
                            ) : (
                              <>os próximos <strong>{divisor}</strong> dias operacionais ({dias.restantes} úteis + {diasEntrega.length} de entrega),</>
                            )}{" "}
                            a <strong>{l.nome}</strong> é atingida com projeção de <strong>{R$(p.projecaoFechamento)}</strong>.
                          </>
                        ) : (
                          <>
                            Para atingir a <strong>{l.nome}</strong>, você precisa faturar aproximadamente{" "}
                            <strong className="text-primary">{R$(necessarioUnidade)}</strong> por {plano.unidadeSingular} durante{" "}
                            {isPorRotas ? (
                              <>as próximas <strong>{divisor} {plano.unidadePlural}</strong>.</>
                            ) : (
                              <>os próximos <strong>{divisor}</strong> dias operacionais ({dias.restantes} úteis + {diasEntrega.length} de entrega).</>
                            )}
                            {pedidosUnidade > 0 && (
                              <> Mantendo o ticket médio atual de <strong>{R$(ticketMedio)}</strong>, isso representa cerca de <strong>{pedidosUnidade} pedidos por {plano.unidadeSingular}</strong>.</>
                            )}
                          </>
                        )}
                      </div>

                      {isPorRotas && (
                        <p className="text-[11px] text-muted-foreground italic">
                          O planejamento do Ednei é calculado por rotas de segunda-feira para Sete Lagoas, e não por dias úteis.
                        </p>
                      )}
                    </>
                  )}

                  {comparativo && (
                    <div
                      className="border-t pt-1.5 space-y-0.5"
                      title={comparativo.cortePrevio ? `Ponto equivalente no mês anterior: ${comparativo.cortePrevio}` : undefined}
                    >
                      <p
                        className={`text-[11px] leading-tight ${comparativo.acima ? "text-green-700" : "text-red-600"}`}
                      >
                        {comparativo.modo === "rotas" ? (
                          <>
                            {comparativo.label}: Mês passado {R$(comparativo.anterior)} | Hoje {R$(comparativo.atual)} |{" "}
                            {comparativo.acima ? "▲" : "▼"} {R$(Math.abs(comparativo.delta))} ({Math.abs(comparativo.pct).toFixed(0)}%)
                            {comparativo.detalhe && (
                              <span className="text-muted-foreground"> · {comparativo.detalhe}</span>
                            )}
                          </>
                        ) : (
                          <>
                            Mesmo ponto mês passado: {R$(comparativo.anterior)} | Hoje: {R$(comparativo.atual)} |{" "}
                            {comparativo.acima ? "▲" : "▼"} {R$(Math.abs(comparativo.delta))} ({Math.abs(comparativo.pct).toFixed(0)}%)
                          </>
                        )}
                      </p>
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        {comparativo.modo === "rotas"
                          ? "Fez nas rotas restantes do mês passado: "
                          : "Fez no restante do mês passado: "}
                        {R$(comparativo.restanteAnterior)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>




      {/* SUGESTÕES INTELIGENTES */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-600" />
            Sugestões para Acelerar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
            <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <span>Subir o ticket médio com <strong>combos e mix de produtos de maior margem</strong> — pequeno aumento por pedido reduz muito a meta diária.</span>
          </div>
          <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
            <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <span>Reativar clientes <strong>Classe A</strong> sem compra recente — alto retorno por contato.</span>
          </div>
          <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
            <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <span>Aumentar a frequência semanal dos clientes recorrentes — passar de quinzenal para semanal multiplica o faturamento.</span>
          </div>
          <div className="flex items-start gap-2 p-2 rounded bg-muted/30">
            <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <span>Priorizar visitas e ligações para os <strong>clientes Classe B</strong> — promovê-los a Classe A é o caminho mais curto para a próxima meta.</span>
          </div>
        </CardContent>
      </Card>
      {/* Relatório oculto — fonte para impressão e PDF */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, width: "780px" }} aria-hidden>
        <PlanoAcaoReport ref={hiddenReportRef} data={reportData} />
      </div>

      {/* Visualização limpa (somente o Plano de Ação) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-base">Plano de Ação Comercial — visualização</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={handleImprimir}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            <Button size="sm" variant="outline" onClick={handlePdf}>
              <FileDown className="h-4 w-4 mr-1" /> Baixar PDF
            </Button>
          </div>
          <PlanoAcaoReport ref={reportRef} data={reportData} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
