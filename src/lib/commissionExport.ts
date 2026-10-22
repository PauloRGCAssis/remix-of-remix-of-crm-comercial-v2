import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { savePdfBlob } from "./pdfDownload";
import { bonifCategoria, type AcertoResult } from "./commissionCalc";
import { BONIFICACAO_VALUE_COLUMN, TIPO_LABEL } from "./commissionImport";

/**
 * Exporta o PDF a partir do MESMO nó DOM da Visualização,
 * garantindo que Tela de Resumo = Visualização = PDF exportado.
 */
export type PdfQuality = "padrao" | "alta";

export async function exportAcertoPDFFromNode(
  node: HTMLElement,
  fileName: string,
  preopened?: Window | null,
  quality: PdfQuality = "padrao"
) {
  await (document as any).fonts?.ready;

  const sourceId = `pdf-source-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const previousSourceId = node.dataset.pdfExportSourceId;
  node.dataset.pdfExportSourceId = sourceId;

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const width = node.scrollWidth;
  const height = node.scrollHeight;
  // Limites de canvas dos navegadores: acima disso toDataURL retorna "data:," (vazio),
  // o que fazia o jsPDF acusar "wrong PNG signature".
  const MAX_SIDE = 8000;
  const MAX_AREA = 24_000_000;
  // ~120 DPI no padrão (suficiente para leitura/impressão comum) e ~192 DPI na alta.
  let scale = quality === "alta" ? 2 : 1.25;
  scale = Math.min(scale, MAX_SIDE / Math.max(width, 1), MAX_SIDE / Math.max(height, 1));
  scale = Math.min(scale, Math.sqrt(MAX_AREA / Math.max(width * height, 1)));
  scale = Math.max(1, Number(scale.toFixed(3)));

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width,
      height,
      windowWidth: Math.max(document.documentElement.clientWidth, width),
      windowHeight: Math.max(document.documentElement.clientHeight, height),
      onclone: (clonedDocument) => {
        const clonedNode = clonedDocument.querySelector<HTMLElement>(
          `[data-pdf-export-source-id="${sourceId}"]`
        );
        neutralizeUnsupportedImages(clonedNode ?? clonedDocument);
        reinforceMissedRewardStrike(clonedNode ?? clonedDocument);
      },
    });
  } finally {
    if (previousSourceId) node.dataset.pdfExportSourceId = previousSourceId;
    else delete node.dataset.pdfExportSourceId;
  }

  // A4 em mm
  const pdfWidth = 210;
  const pdfHeight = 297;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  // Fatiamento real: cada página recebe seu próprio recorte, evitando um
  // dataURL gigantesco (principal causa de imagem inválida).
  const pageSlicePx = Math.floor((canvas.width * pdfHeight) / pdfWidth);
  let offset = 0;
  let pageIndex = 0;

  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageSlicePx, canvas.height - offset);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem do relatório.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const image = encodeCanvas(slice, quality);
    if (image) {
      if (pageIndex > 0) doc.addPage();
      const imgHeight = (sliceHeight * pdfWidth) / canvas.width;
      doc.addImage(image.data, image.format, 0, 0, pdfWidth, imgHeight, undefined, "FAST");
      pageIndex += 1;
    }
    // Libera a fatia intermediária para não manter bitmaps na memória.
    slice.width = 0;
    slice.height = 0;

    offset += sliceHeight;
  }

  if (pageIndex === 0) {
    throw new Error("Não foi possível converter a visualização em imagem para o PDF.");
  }

  savePdfBlob(doc.output("blob") as Blob, fileName, {
    preopened,
    onError: (message) => {
      throw new Error(message);
    },
  });
}

/** Converte o canvas validando a assinatura real do arquivo antes de entregar ao jsPDF. */
function encodeCanvas(
  canvas: HTMLCanvasElement,
  quality: PdfQuality = "padrao"
): { data: string; format: "PNG" | "JPEG" } | null {
  // JPEG comprimido primeiro: o relatório não usa transparência e o PNG gerava
  // arquivos muito pesados. PNG fica apenas como fallback.
  const candidates: Array<{ mime: string; format: "PNG" | "JPEG"; quality?: number }> = [
    { mime: "image/jpeg", format: "JPEG", quality: quality === "alta" ? 0.85 : 0.7 },
    { mime: "image/png", format: "PNG" },
  ];

  for (const candidate of candidates) {
    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL(candidate.mime, candidate.quality);
    } catch {
      continue;
    }
    const detected = detectImageFormat(dataUrl);
    if (detected) return { data: dataUrl, format: detected };
  }
  return null;
}

/** Lê os bytes iniciais do base64 para saber o formato REAL (PNG/JPEG). */
function detectImageFormat(dataUrl: string): "PNG" | "JPEG" | null {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:image/") || commaIndex < 0) return null;
  const base64 = dataUrl.slice(commaIndex + 1);
  if (base64.length < 16) return null;
  try {
    const head = atob(base64.slice(0, 16));
    const bytes = Array.from(head).map((c) => c.charCodeAt(0));
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "PNG";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPEG";
  } catch {
    return null;
  }
  return null;
}

/**
 * Remove do clone imagens que o html2canvas não consegue converter (WEBP/SVG remotos,
 * URLs quebradas). O PDF continua sendo gerado sem elas.
 */
function neutralizeUnsupportedImages(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const src = img.currentSrc || img.src || "";
    const broken = !src || (img.complete && img.naturalWidth === 0);
    const risky = /^data:image\/(webp|svg\+xml)/i.test(src) || /\.(webp|svg)(\?|$)/i.test(src);
    if (broken || risky) img.remove();
  });
}


function reinforceMissedRewardStrike(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("[data-missed-reward-value]").forEach((el) => {
    el.style.display = "inline";
    el.style.whiteSpace = "nowrap";
    el.style.textDecorationLine = "line-through";
    el.style.textDecorationColor = "#dc2626";
    el.style.textDecorationThickness = "2px";
    el.style.textDecorationSkipInk = "none";
  });
}


export interface MetaLine {
  nome: string;
  alvo: number;
  realizado: number;
  atingida: boolean;
  premiacao: number;
  /**
   * 'sim_nao'    = mostra apenas SIM/NÃO, não soma na comissão.
   * 'valor'      = soma na comissão quando atingida.
   * 'combustivel'= benefício fixo (ex.: R$ 300,00). Aparece na DRE para conferência,
   *                mas NÃO soma na comissão líquida.
   */
  tipo: "sim_nao" | "valor" | "combustivel";
}

export function exportAcertoExcel(acerto: AcertoResult, yearMonth: string, metas: MetaLine[] = []) {
  const wb = XLSX.utils.book_new();

  const resumo: (string | number)[][] = [
    ["Vendedor", acerto.vendedor],
    ["Mês", yearMonth],
    [],
    ["FATURAMENTO BRUTO", acerto.faturamentoBruto],
    ["(-) BONIFICAÇÕES", -acerto.bonificacoesDescontadas],
    ["(=) FATURAMENTO LÍQUIDO", acerto.faturamentoLiquido],
    ["COMISSÃO BRUTA", acerto.comissaoBruta],
    ["(-) CORTESIAS", -acerto.cortesia],
    ["(-) DESCONTOS COMISSÃO POR CLIENTE", -acerto.descontoClienteTotal],
    ...acerto.ajustesManuais.map((a) => [`(-) ${a.descricao || "Ajuste manual"}`, -a.valor] as (string | number)[]),
    ...metas.map((m) => {
      if (m.tipo === "sim_nao") return [`${m.atingida ? "✓" : "✗"} ${m.nome}`, m.atingida ? "SIM" : "NÃO"] as (string | number)[];
      if (m.tipo === "combustivel") return [`${m.atingida ? "✓" : "✗"} ${m.nome}`, m.atingida ? m.premiacao : "NÃO"] as (string | number)[];
      return [`${m.atingida ? "✓" : "✗"} ${m.nome}`, m.atingida ? m.premiacao : "NÃO"] as (string | number)[];
    }),
    [],
    ["COMISSÃO LÍQUIDA", acerto.comissaoLiquida],
    [],
    ["Resumo de Bonificações por Tipo"],
    ["Categoria Venda", "Total", "Coluna usada"],
    ...acerto.bonificacoesResumoPorTipo.map((b) => [b.categoria, b.total, b.colunaUsada] as (string | number)[]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

  const detalhamento = [
    ["Data", "Cliente", "Produto", "Qtd", "Preço", "Valor", "Comissão %", "Valor Comissão"],
    ...acerto.vendasRows.map((r) => {
      const pct = r.pctComissao ?? null;
      return [
        r.data ?? "",
        r.cliente,
        r.produto ?? "",
        r.quantidade ?? "",
        r.precoUnit ?? "",
        r.valor,
        pct ?? "",
        pct != null ? r.valor * (pct / 100) : "",
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalhamento), "Detalhamento");

  const bonifs = [
    ["Data", "Cliente", "Tipo", "Categoria Venda", "Produto", "Valor calculado", "Coluna usada", "Preço Venda Total (ignorado)"],
    ...acerto.bonificacoesRows.map((r) => [r.data ?? "", r.cliente, TIPO_LABEL[r.tipo], r.categoriaVenda ?? r.tipoRaw ?? "", r.produto ?? "", Number(r.custo ?? 0), BONIFICACAO_VALUE_COLUMN, r.precoVendaTotal ?? ""]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bonifs), "Bonificações");

  const descontos = [
    ["Cliente", "% Padrão", "% Acordado", "% Desconto", "Faturamento", "Valor Descontado"],
    ...acerto.descontosCliente.map((d) => [d.cliente, d.pctPadrao, d.pctAcordado, d.pctDesconto, d.faturamentoCliente, d.valorDescontado]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(descontos), "Descontos Cliente");

  XLSX.writeFile(wb, `Acerto_${acerto.vendedor}_${yearMonth}.xlsx`);
}


// ===================== Excel Resumo / Completo =====================
// Usa EXATAMENTE os mesmos valores já calculados que alimentam o PDF Resumo/Completo.

export interface AcertoExcelOptions {
  pctPadrao: number;
  metas: MetaLine[];
  participaPremiacao?: boolean;
  metasAcumulativas?: boolean;
  ajudaCusto?: number;
  outrosCreditos?: { id: string; descricao: string; valor: number }[];
  comissaoEquipe?: { pct: number; valor: number; base: number; membros: { vendedor: string; faturamentoLiquido: number }[] } | null;
  tiposDescontoFaturamento?: string[];
  tiposDescontoComissao?: string[];
}

const FMT_BRL = '"R$" #,##0.00;-"R$" #,##0.00';
const FMT_PCT = '0.00"%"';
const FMT_NUM = '#,##0.###';

type Cell = string | number | null;
type ColFmt = Record<number, string>;

function sheetFrom(rows: Cell[][], fmts: ColFmt, widths: number[], fmtFromRow = 0): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (c == null ? "" : c))));
  rows.forEach((r, ri) => {
    if (ri < fmtFromRow) return;
    r.forEach((v, ci) => {
      if (typeof v !== "number" || !fmts[ci]) return;
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
      if (cell) cell.z = fmts[ci];
    });
  });
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

function resumoRows(acerto: AcertoResult, yearMonth: string, o: AcertoExcelOptions): Cell[][] {
  const fatSet = new Set(o.tiposDescontoFaturamento ?? []);
  const rows: Cell[][] = [
    ["Vendedor", acerto.vendedor],
    ["Mês", yearMonth],
    [],
    ["FATURAMENTO BRUTO", acerto.faturamentoBruto],
    ["(−) BONIFICAÇÕES (deduções)", -acerto.bonificacoesDescontadas],
    ...acerto.bonificacoesResumoPorTipo
      .filter((b) => fatSet.has(b.categoria) && b.total !== 0)
      .map((b) => [`   ↳ ${b.categoria}`, -b.total] as Cell[]),
    ["(=) FATURAMENTO LÍQUIDO", acerto.faturamentoLiquido],
    [`COMISSÃO BRUTA (${o.pctPadrao}%)`, acerto.comissaoBruta],
    ["(−) CORTESIAS", -acerto.cortesia],
    ["(−) DESCONTOS COMISSÃO", -acerto.descontoClienteTotal],
    ...acerto.descontosCliente.map((d) => [`   ↳ ${d.cliente} (${d.pctAcordado}% acordado)`, -d.valorDescontado] as Cell[]),
    ["(−) DESCONTOS MANUAIS", -acerto.ajustesManuaisTotal],
    ...acerto.ajustesManuais.map((a) => [`   ↳ ${a.descricao || "Ajuste manual"}`, -a.valor] as Cell[]),
    [],
  ];
  if (o.participaPremiacao === false) {
    rows.push(["METAS", "Vendedor não participa do Programa de Premiações neste mês"]);
  } else {
    rows.push(["METAS (acumulativas)", o.metasAcumulativas ? "SIM" : "NÃO"]);
    for (const m of o.metas) {
      const res: Cell = m.tipo === "sim_nao" ? (m.atingida ? "SIM" : "NÃO") : m.atingida ? m.premiacao : "NÃO";
      rows.push([`${m.atingida ? "✓ Atingida" : "✗ Não atingida"} — ${m.nome} (meta ${m.alvo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`, res]);
    }
  }
  if (o.comissaoEquipe) rows.push([`(+) COMISSÃO EQUIPE (${o.comissaoEquipe.pct}%)`, o.comissaoEquipe.valor]);
  if ((o.ajudaCusto ?? 0) > 0) rows.push(["(+) AJUDA DE CUSTO", o.ajudaCusto ?? 0]);
  for (const c of o.outrosCreditos ?? []) if ((c.valor ?? 0) !== 0) rows.push([`(+) ${c.descricao || "Outro crédito"}`, c.valor]);
  rows.push([], ["COMISSÃO LÍQUIDA", acerto.comissaoLiquida]);
  return rows;
}

export function exportAcertoExcelResumo(acerto: AcertoResult, yearMonth: string, o: AcertoExcelOptions) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(resumoRows(acerto, yearMonth, o), { 1: FMT_BRL }, [60, 20]), "Resumo");
  XLSX.writeFile(wb, `Acerto_Resumo_${acerto.vendedor}_${yearMonth}.xlsx`);
}

export function exportAcertoExcelCompleto(acerto: AcertoResult, yearMonth: string, o: AcertoExcelOptions) {
  const wb = XLSX.utils.book_new();
  const fatSet = new Set(o.tiposDescontoFaturamento ?? []);
  const comSet = new Set(o.tiposDescontoComissao ?? []);
  const cat = bonifCategoria;

  XLSX.utils.book_append_sheet(wb, sheetFrom(resumoRows(acerto, yearMonth, o), { 1: FMT_BRL }, [60, 20]), "Resumo");

  const vendas: Cell[][] = [["Data", "Cliente", "Produto", "Qtd", "Preço venda", "Preço venda total", "Com. %", "Valor comissão"]];
  for (const r of acerto.vendasRows) {
    const pct = r.pctComissao ?? o.pctPadrao;
    vendas.push([r.data ?? "", r.cliente, r.produto ?? "", r.quantidade ?? null, r.precoUnit ?? null, r.valor, pct, r.valor * (pct / 100)]);
  }
  vendas.push(["TOTAL", "", "", null, null, acerto.faturamentoBruto, null, acerto.comissaoBruta + acerto.cortesia + acerto.descontoClienteTotal]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(vendas, { 3: FMT_NUM, 4: FMT_BRL, 5: FMT_BRL, 6: FMT_PCT, 7: FMT_BRL }, [12, 40, 40, 8, 14, 16, 8, 16], 1), "Vendas");

  const bon: Cell[][] = [["Data", "Cliente", "Produto", "Categoria", "Preço venda total", "Custo", "Desc. Fat.", "Desc. Com."]];
  for (const r of acerto.bonificacoesRows) {
    const c = cat(r);
    bon.push([r.data ?? "", r.cliente, r.produto ?? "", c, r.precoVendaTotal ?? null, Number(r.custo ?? 0), fatSet.has(c) ? "SIM" : "—", comSet.has(c) ? "SIM" : "—"]);
  }
  XLSX.utils.book_append_sheet(wb, sheetFrom(bon, { 4: FMT_BRL, 5: FMT_BRL }, [12, 40, 40, 24, 16, 14, 10, 10], 1), "Bonificações");

  const tipo: Cell[][] = [["Categoria", "Qtd. linhas", "Total (Custo)", "Desc. Fat.", "Desc. Com."]];
  for (const b of acerto.bonificacoesResumoPorTipo) tipo.push([b.categoria, b.count, b.total, fatSet.has(b.categoria) ? "SIM" : "—", comSet.has(b.categoria) ? "SIM" : "—"]);
  tipo.push(["TOTAL", null, acerto.bonificacoesResumoPorTipo.reduce((s, b) => s + b.total, 0), "", ""]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(tipo, { 2: FMT_BRL }, [30, 12, 16, 10, 10], 1), "Bonif. por Tipo");

  const desc: Cell[][] = [["Cliente", "% Padrão", "% Acordado", "Diferença", "Faturamento", "Valor descontado"]];
  for (const d of acerto.descontosCliente) desc.push([d.cliente, d.pctPadrao, d.pctAcordado, d.pctDesconto, d.faturamentoCliente, d.valorDescontado]);
  desc.push(["TOTAL DESCONTADO", null, null, null, null, acerto.descontoClienteTotal]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(desc, { 1: FMT_PCT, 2: FMT_PCT, 3: FMT_PCT, 4: FMT_BRL, 5: FMT_BRL }, [40, 10, 10, 10, 16, 16], 1), "Descontos Cliente");

  const man: Cell[][] = [["Descrição", "Cliente", "Observação", "Valor"]];
  for (const a of acerto.ajustesManuais) man.push([a.descricao || "—", a.cliente || "—", a.observacao || "—", a.valor]);
  man.push(["TOTAL", "", "", acerto.ajustesManuaisTotal]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(man, { 3: FMT_BRL }, [30, 30, 40, 14], 1), "Descontos Manuais");

  const cred: Cell[][] = [["Descrição", "Valor"], ["Ajuda de Custo", Number(o.ajudaCusto ?? 0)]];
  if (o.comissaoEquipe) {
    cred.push([`Comissão Equipe (${o.comissaoEquipe.pct}%) — base`, o.comissaoEquipe.base]);
    for (const mb of o.comissaoEquipe.membros) cred.push([`   ↳ ${mb.vendedor} — Faturamento líquido`, mb.faturamentoLiquido]);
    cred.push([`Comissão Equipe (${o.comissaoEquipe.pct}%)`, o.comissaoEquipe.valor]);
  }
  for (const c of o.outrosCreditos ?? []) cred.push([c.descricao || "Outro crédito", Number(c.valor ?? 0)]);
  cred.push(["TOTAL CRÉDITOS", Number(o.ajudaCusto ?? 0) + Number(o.comissaoEquipe?.valor ?? 0) + (o.outrosCreditos ?? []).reduce((s, c) => s + Number(c.valor ?? 0), 0)]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(cred, { 1: FMT_BRL }, [50, 16], 1), "Créditos");

  const metas: Cell[][] = [["Meta", "Tipo", "Alvo", "Realizado", "Atingida", "Premiação"]];
  for (const m of o.metas) metas.push([m.nome, m.tipo === "sim_nao" ? "Sim/Não" : m.tipo === "combustivel" ? "Benefício fixo" : "Valor", m.alvo, m.realizado, m.atingida ? "SIM" : "NÃO", m.tipo === "sim_nao" ? null : m.premiacao]);
  XLSX.utils.book_append_sheet(wb, sheetFrom(metas, { 2: FMT_BRL, 3: FMT_BRL, 5: FMT_BRL }, [30, 16, 16, 16, 10, 14], 1), "Metas");

  XLSX.writeFile(wb, `Acerto_Completo_${acerto.vendedor}_${yearMonth}.xlsx`);
}
