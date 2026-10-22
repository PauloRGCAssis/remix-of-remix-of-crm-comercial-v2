import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnaliseEstruturada, AnaliseBloco, AnaliseSlide } from "@/hooks/useCentralAnalise";

const AMBAR: [number, number, number] = [217, 145, 32];
const GRAFITE: [number, number, number] = [45, 41, 38];
const CINZA: [number, number, number] = [120, 113, 108];

const MARGIN = 16;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface PdfContext {
  doc: jsPDF;
  y: number;
  fonte: string;
  titulo: string;
}

function limpaMarkdown(texto: string): string {
  return String(texto ?? "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
}

function novaPaginaSePreciso(ctx: PdfContext, altura: number) {
  if (ctx.y + altura > PAGE_H - 22) {
    ctx.doc.addPage();
    ctx.y = MARGIN + 6;
  }
}

function tituloSecao(ctx: PdfContext, texto: string) {
  novaPaginaSePreciso(ctx, 16);
  const { doc } = ctx;
  doc.setFillColor(...AMBAR);
  doc.rect(MARGIN, ctx.y, 3, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...GRAFITE);
  doc.text(texto.toUpperCase(), MARGIN + 6, ctx.y + 5.4);
  ctx.y += 12;
}

function paragrafo(ctx: PdfContext, texto: string, size = 9.5) {
  if (!texto?.trim()) return;
  const { doc } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(60, 56, 52);
  const linhas = doc.splitTextToSize(limpaMarkdown(texto), CONTENT_W);
  for (const linha of linhas) {
    novaPaginaSePreciso(ctx, 6);
    doc.text(linha, MARGIN, ctx.y);
    ctx.y += 4.8;
  }
  ctx.y += 3;
}

function listaBullets(ctx: PdfContext, itens: string[]) {
  for (const item of itens) {
    const { doc } = ctx;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 56, 52);
    const linhas = doc.splitTextToSize(limpaMarkdown(item), CONTENT_W - 6);
    novaPaginaSePreciso(ctx, linhas.length * 4.8 + 2);
    doc.setFillColor(...AMBAR);
    doc.circle(MARGIN + 1.4, ctx.y - 1.4, 1, "F");
    linhas.forEach((linha: string, i: number) => {
      doc.text(linha, MARGIN + 6, ctx.y + i * 4.8);
    });
    ctx.y += linhas.length * 4.8 + 1.5;
  }
  ctx.y += 3;
}

function kpiCards(ctx: PdfContext, kpis: { label: string; valor: string; sub?: string; variacao?: string }[]) {
  const porLinha = 3;
  const gap = 4;
  const w = (CONTENT_W - gap * (porLinha - 1)) / porLinha;
  for (let i = 0; i < kpis.length; i += porLinha) {
    const linha = kpis.slice(i, i + porLinha);
    novaPaginaSePreciso(ctx, 24);
    linha.forEach((kpi, idx) => {
      const x = MARGIN + idx * (w + gap);
      const { doc } = ctx;
      doc.setDrawColor(232, 226, 218);
      doc.setFillColor(252, 250, 247);
      doc.roundedRect(x, ctx.y, w, 20, 2, 2, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(...CINZA);
      doc.text(doc.splitTextToSize(String(kpi.label ?? "").toUpperCase(), w - 6)[0] ?? "", x + 3, ctx.y + 5.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...GRAFITE);
      doc.text(doc.splitTextToSize(String(kpi.valor ?? ""), w - 6)[0] ?? "", x + 3, ctx.y + 12);
      const rodape = [kpi.variacao, kpi.sub].filter(Boolean).join(" · ");
      if (rodape) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...CINZA);
        doc.text(doc.splitTextToSize(rodape, w - 6)[0] ?? "", x + 3, ctx.y + 17);
      }
    });
    ctx.y += 24;
  }
}

function tabela(ctx: PdfContext, colunas: string[], linhas: string[][]) {
  if (!colunas?.length || !linhas?.length) return;
  novaPaginaSePreciso(ctx, 20);
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [colunas],
    body: linhas.map((l) => l.map((c) => String(c ?? ""))),
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7.6, cellPadding: 1.8, textColor: [60, 56, 52] },
    headStyles: { fillColor: AMBAR, textColor: 255, fontSize: 7.6, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 248, 245] },
    theme: "grid",
  });
  ctx.y = (ctx.doc as any).lastAutoTable.finalY + 6;
}

/** Gráfico de barras/linhas desenhado vetorialmente (sem print de tela). */
function grafico(ctx: PdfContext, g: NonNullable<AnaliseBloco["grafico"]>) {
  const categorias = g.categorias ?? [];
  const series = (g.series ?? []).filter((s) => Array.isArray(s.valores) && s.valores.length);
  if (!categorias.length || !series.length) return;

  const h = 52;
  novaPaginaSePreciso(ctx, h + 16);
  const { doc } = ctx;
  const x0 = MARGIN + 20;
  const y0 = ctx.y + h;
  const larguraPlot = CONTENT_W - 22;
  const todos = series.flatMap((s) => s.valores);
  const max = Math.max(...todos, 0);
  const min = Math.min(...todos, 0);
  const range = max - min || 1;
  const escalaY = (v: number) => y0 - ((v - min) / range) * h;

  doc.setDrawColor(225, 220, 214);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const y = ctx.y + (h / 4) * i;
    doc.line(x0, y, x0 + larguraPlot, y);
    const valor = max - (range / 4) * i;
    doc.setFontSize(6);
    doc.setTextColor(...CINZA);
    doc.text(
      valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
      x0 - 2,
      y + 1.5,
      { align: "right" },
    );
  }

  const passo = larguraPlot / categorias.length;
  if (g.tipo === "barra") {
    const larguraBarra = Math.max(1.5, (passo * 0.6) / series.length);
    series.forEach((s, si) => {
      doc.setFillColor(si === 0 ? AMBAR[0] : 120, si === 0 ? AMBAR[1] : 130, si === 0 ? AMBAR[2] : 140);
      s.valores.forEach((v, i) => {
        const x = x0 + passo * i + passo * 0.2 + si * larguraBarra;
        const yTopo = escalaY(v);
        doc.rect(x, Math.min(yTopo, escalaY(0)), larguraBarra, Math.abs(escalaY(0) - yTopo), "F");
      });
    });
  } else {
    series.forEach((s, si) => {
      doc.setDrawColor(si === 0 ? AMBAR[0] : 120, si === 0 ? AMBAR[1] : 130, si === 0 ? AMBAR[2] : 140);
      doc.setLineWidth(0.7);
      s.valores.forEach((v, i) => {
        if (i === 0) return;
        doc.line(x0 + passo * (i - 0.5), escalaY(s.valores[i - 1]), x0 + passo * (i + 0.5), escalaY(v));
      });
    });
  }

  doc.setFontSize(6);
  doc.setTextColor(...CINZA);
  categorias.forEach((c, i) => {
    if (categorias.length > 14 && i % 2 !== 0) return;
    doc.text(String(c).slice(0, 8), x0 + passo * (i + 0.5), y0 + 4, { align: "center" });
  });
  ctx.y = y0 + 8;

  const legenda = series.map((s) => s.nome).join("  |  ") + (g.unidade ? `  (${g.unidade})` : "");
  doc.setFontSize(7);
  doc.text(legenda, MARGIN, ctx.y);
  ctx.y += 8;
}

function capa(doc: jsPDF, analise: AnaliseEstruturada, fonte: string) {
  doc.setFillColor(...GRAFITE);
  doc.rect(0, 0, PAGE_W, 92, "F");
  doc.setFillColor(...AMBAR);
  doc.rect(0, 92, PAGE_W, 3, "F");

  doc.setTextColor(...AMBAR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("INTELIGÊNCIA COMERCIAL", MARGIN, 34);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Central de Análise · Ti Delso", MARGIN, 41);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  const linhas = doc.splitTextToSize(analise.titulo || "Análise Comercial", CONTENT_W);
  doc.text(linhas.slice(0, 3), MARGIN, 62);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(210, 204, 196);
  doc.text(analise.periodo_descricao || "", MARGIN, 84);

  doc.setTextColor(...CINZA);
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, MARGIN, 106);
  doc.text(fonte, MARGIN, 111, { maxWidth: CONTENT_W });

  doc.setDrawColor(232, 226, 218);
  doc.line(MARGIN, 118, PAGE_W - MARGIN, 118);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GRAFITE);
  doc.text("RESUMO EXECUTIVO", MARGIN, 128);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 56, 52);
  const resumo = doc.splitTextToSize(limpaMarkdown(analise.resumo_executivo || ""), CONTENT_W);
  doc.text(resumo.slice(0, 28), MARGIN, 136);
}

function rodapes(doc: jsPDF, fonte: string) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...CINZA);
    doc.text(fonte, MARGIN, PAGE_H - 10, { maxWidth: CONTENT_W - 20 });
    doc.text(`${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
  }
}

export function gerarPdfExecutivo(analise: AnaliseEstruturada, fonteDados: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  capa(doc, analise, fonteDados);
  doc.addPage();

  const ctx: PdfContext = { doc, y: MARGIN + 6, fonte: fonteDados, titulo: analise.titulo };

  for (const bloco of analise.blocos ?? []) {
    tituloSecao(ctx, bloco.titulo || "Análise");
    if (bloco.texto) paragrafo(ctx, bloco.texto);
    if (bloco.kpis?.length) kpiCards(ctx, bloco.kpis);
    if (bloco.grafico) grafico(ctx, bloco.grafico);
    if (bloco.tabela) tabela(ctx, bloco.tabela.colunas, bloco.tabela.linhas);
    if (bloco.detalhes) {
      paragrafo(ctx, bloco.detalhes.titulo || "Detalhamento", 9);
      tabela(ctx, bloco.detalhes.colunas, bloco.detalhes.linhas);
    }
  }

  const secoesLista: [string, string[] | undefined][] = [
    ["Fatos comprovados pelos dados", analise.fatos],
    ["Indícios observados", analise.indicios],
    ["Hipóteses (não comprovadas pelos dados)", analise.hipoteses],
    ["Oportunidades", analise.oportunidades],
    ["Riscos e pontos de atenção", analise.riscos],
    ["Recomendações", analise.recomendacoes],
    ["Alertas de dados", analise.alertas_dados],
  ];
  for (const [titulo, itens] of secoesLista) {
    if (!itens?.length) continue;
    tituloSecao(ctx, titulo);
    listaBullets(ctx, itens);
  }

  if (analise.leitura_gerencial) {
    tituloSecao(ctx, "Conclusão · Leitura gerencial");
    paragrafo(ctx, analise.leitura_gerencial, 10);
  }

  rodapes(doc, fonteDados);
  return doc;
}

// ============================================================================
// APRESENTAÇÃO EXECUTIVA (um slide por página, paisagem, padrão visual Ti Delso)
// ============================================================================

const SLIDE_W = 297;
const SLIDE_H = 210;
const SLIDE_M = 18;
const SLIDE_CONTENT_W = SLIDE_W - SLIDE_M * 2;

function slideCapa(doc: jsPDF, slide: AnaliseSlide, fonte: string) {
  doc.setFillColor(252, 250, 247);
  doc.rect(0, 0, SLIDE_W, SLIDE_H, "F");
  doc.setFillColor(...AMBAR);
  doc.rect(0, 0, SLIDE_W, 8, "F");
  doc.setTextColor(...AMBAR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("INTELIGÊNCIA COMERCIAL · TI DELSO", SLIDE_M, 40);
  doc.setTextColor(...GRAFITE);
  doc.setFontSize(30);
  const titulo = doc.splitTextToSize(slide.titulo || "Análise Comercial", SLIDE_CONTENT_W);
  doc.text(titulo.slice(0, 4), SLIDE_M, 68);
  if (slide.subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(...CINZA);
    doc.text(doc.splitTextToSize(slide.subtitulo, SLIDE_CONTENT_W).slice(0, 3), SLIDE_M, 100);
  }
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text(fonte, SLIDE_M, SLIDE_H - 22, { maxWidth: SLIDE_CONTENT_W });
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, SLIDE_M, SLIDE_H - 16);
}

function slideConteudo(doc: jsPDF, slide: AnaliseSlide, fonte: string, indice: number, total: number) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, SLIDE_W, SLIDE_H, "F");
  doc.setFillColor(...AMBAR);
  doc.rect(0, 0, SLIDE_W, 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...GRAFITE);
  const titulo = doc.splitTextToSize(slide.titulo || "", SLIDE_CONTENT_W);
  doc.text(titulo.slice(0, 2), SLIDE_M, 22);
  let y = 22 + titulo.slice(0, 2).length * 8;
  if (slide.subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...CINZA);
    doc.text(doc.splitTextToSize(slide.subtitulo, SLIDE_CONTENT_W).slice(0, 2), SLIDE_M, y);
    y += 8;
  }
  doc.setDrawColor(...AMBAR);
  doc.setLineWidth(0.8);
  doc.line(SLIDE_M, y, SLIDE_M + 40, y);
  y += 8;

  if (slide.texto) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11.5);
    doc.setTextColor(55, 51, 47);
    const linhas = doc.splitTextToSize(limpaMarkdown(slide.texto), SLIDE_CONTENT_W);
    doc.text(linhas.slice(0, 12), SLIDE_M, y);
    y += Math.min(linhas.length, 12) * 6 + 4;
  }

  if (slide.kpis?.length) {
    const porLinha = Math.min(4, slide.kpis.length);
    const gap = 6;
    const w = (SLIDE_CONTENT_W - gap * (porLinha - 1)) / porLinha;
    slide.kpis.slice(0, 8).forEach((kpi, i) => {
      const col = i % porLinha;
      const row = Math.floor(i / porLinha);
      const x = SLIDE_M + col * (w + gap);
      const yy = y + row * 32;
      doc.setDrawColor(232, 226, 218);
      doc.setFillColor(252, 250, 247);
      doc.roundedRect(x, yy, w, 28, 2.5, 2.5, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text(doc.splitTextToSize(String(kpi.label ?? "").toUpperCase(), w - 8).slice(0, 2), x + 4, yy + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...GRAFITE);
      doc.text(doc.splitTextToSize(String(kpi.valor ?? ""), w - 8)[0] ?? "", x + 4, yy + 18);
      const rodape = [kpi.variacao, kpi.sub].filter(Boolean).join(" · ");
      if (rodape) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...CINZA);
        doc.text(doc.splitTextToSize(rodape, w - 8)[0] ?? "", x + 4, yy + 24.5);
      }
    });
    y += Math.ceil(Math.min(slide.kpis.length, 8) / porLinha) * 32 + 4;
  }

  if (slide.bullets?.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11.5);
    for (const item of slide.bullets.slice(0, 10)) {
      const linhas = doc.splitTextToSize(limpaMarkdown(item), SLIDE_CONTENT_W - 8);
      doc.setFillColor(...AMBAR);
      doc.circle(SLIDE_M + 1.6, y - 1.6, 1.2, "F");
      doc.setTextColor(55, 51, 47);
      linhas.slice(0, 3).forEach((l: string, i: number) => doc.text(l, SLIDE_M + 7, y + i * 5.6));
      y += Math.min(linhas.length, 3) * 5.6 + 2.5;
    }
    y += 2;
  }

  if (slide.perguntas?.length) {
    doc.setFontSize(10.5);
    slide.perguntas.slice(0, 6).forEach((p, i) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRAFITE);
      const q = doc.splitTextToSize(`${i + 1}. ${p.pergunta}`, SLIDE_CONTENT_W);
      doc.text(q.slice(0, 2), SLIDE_M, y);
      y += q.slice(0, 2).length * 5.2;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(70, 65, 60);
      const a = doc.splitTextToSize(limpaMarkdown(p.resposta), SLIDE_CONTENT_W);
      doc.text(a.slice(0, 4), SLIDE_M + 4, y);
      y += a.slice(0, 4).length * 5.2 + 3;
    });
  }

  if (slide.tabela?.linhas?.length) {
    autoTable(doc, {
      startY: y,
      head: [slide.tabela.colunas],
      body: slide.tabela.linhas.slice(0, 16).map((l) => l.map((c) => String(c ?? ""))),
      margin: { left: SLIDE_M, right: SLIDE_M },
      tableWidth: SLIDE_CONTENT_W,
      styles: { fontSize: 9.5, cellPadding: 2.4, textColor: [55, 51, 47], overflow: "linebreak" },
      headStyles: { fillColor: AMBAR, textColor: 255, fontSize: 9.5, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 248, 245] },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (slide.grafico?.categorias?.length && slide.grafico.series?.length) {
    const alturaDisponivel = SLIDE_H - y - 22;
    if (alturaDisponivel > 30) {
      const g = slide.grafico;
      const h = Math.min(80, alturaDisponivel);
      const x0 = SLIDE_M + 24;
      const y0 = y + h;
      const larguraPlot = SLIDE_CONTENT_W - 26;
      const todos = g.series.flatMap((s) => s.valores ?? []);
      const max = Math.max(...todos, 0);
      const min = Math.min(...todos, 0);
      const range = max - min || 1;
      const escalaY = (v: number) => y0 - ((v - min) / range) * h;
      doc.setDrawColor(228, 222, 216);
      doc.setLineWidth(0.2);
      for (let i = 0; i <= 4; i++) {
        const yy = y + (h / 4) * i;
        doc.line(x0, yy, x0 + larguraPlot, yy);
        doc.setFontSize(7.5);
        doc.setTextColor(...CINZA);
        doc.text((max - (range / 4) * i).toLocaleString("pt-BR", { maximumFractionDigits: 0 }), x0 - 2, yy + 1.5, { align: "right" });
      }
      const passo = larguraPlot / g.categorias.length;
      if (g.tipo === "barra") {
        const lb = Math.max(2, (passo * 0.6) / g.series.length);
        g.series.forEach((s, si) => {
          doc.setFillColor(si === 0 ? AMBAR[0] : 90, si === 0 ? AMBAR[1] : 120, si === 0 ? AMBAR[2] : 160);
          (s.valores ?? []).forEach((v, i) => {
            const x = x0 + passo * i + passo * 0.2 + si * lb;
            const topo = escalaY(v);
            doc.rect(x, Math.min(topo, escalaY(0)), lb, Math.abs(escalaY(0) - topo), "F");
          });
        });
      } else {
        g.series.forEach((s, si) => {
          doc.setDrawColor(si === 0 ? AMBAR[0] : 90, si === 0 ? AMBAR[1] : 120, si === 0 ? AMBAR[2] : 160);
          doc.setLineWidth(0.8);
          (s.valores ?? []).forEach((v, i) => {
            if (i === 0) return;
            doc.line(x0 + passo * (i - 0.5), escalaY(s.valores[i - 1]), x0 + passo * (i + 0.5), escalaY(v));
          });
        });
      }
      doc.setFontSize(7.5);
      doc.setTextColor(...CINZA);
      g.categorias.forEach((c, i) => {
        if (g.categorias.length > 16 && i % 2 !== 0) return;
        doc.text(String(c).slice(0, 16), x0 + passo * (i + 0.5), y0 + 5, { align: "center" });
      });
      y = y0 + 10;
      doc.setFontSize(9);
      doc.text(g.series.map((s) => s.nome).join("   |   ") + (g.unidade ? `   (${g.unidade})` : ""), SLIDE_M, y);
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  doc.text(fonte, SLIDE_M, SLIDE_H - 8, { maxWidth: SLIDE_CONTENT_W - 30 });
  doc.text(`${indice} / ${total}`, SLIDE_W - SLIDE_M, SLIDE_H - 8, { align: "right" });
}

/** Apresentação executiva em PDF (paisagem), um slide por página. */
export function gerarPdfApresentacao(analise: AnaliseEstruturada, fonteDados: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const slides: AnaliseSlide[] = (analise.apresentacao?.slides ?? []).filter(
    (s) =>
      s.tipo === "capa" ||
      s.texto?.trim() ||
      s.bullets?.length ||
      s.kpis?.length ||
      s.tabela?.linhas?.length ||
      s.grafico?.categorias?.length ||
      s.perguntas?.length,
  );

  const lista: AnaliseSlide[] = slides.length
    ? slides
    : [
        { tipo: "capa", titulo: analise.titulo, subtitulo: analise.comparacao_descricao || analise.periodo_descricao },
        { tipo: "resumo", titulo: "Resumo executivo", texto: analise.resumo_executivo },
      ];

  if (lista[0]?.tipo !== "capa") {
    lista.unshift({ tipo: "capa", titulo: analise.titulo, subtitulo: analise.comparacao_descricao || analise.periodo_descricao });
  }

  lista.forEach((slide, i) => {
    if (i > 0) doc.addPage("a4", "landscape");
    if (slide.tipo === "capa") slideCapa(doc, slide, fonteDados);
    else slideConteudo(doc, slide, fonteDados, i + 1, lista.length);
  });

  return doc;
}
