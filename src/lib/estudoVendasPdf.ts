import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Relatório individual do Estudo de Vendas (A4 retrato, texto vetorial e leve).
 * IMPORTANTE: este módulo NÃO recalcula vendas. Ele apenas formata os dados já
 * consolidados e exibidos na tela do Estudo de Vendas.
 */

export interface EstudoPdfMonthData {
  qty: number;
  fat: number;
  pctQty: number | null;
}

export interface EstudoPdfProduct {
  productName: string;
  months: Record<string, EstudoPdfMonthData>;
}

export interface EstudoPdfInput {
  clientName: string;
  vendedor: string;
  visibleMonths: string[];
  products: EstudoPdfProduct[];
  /** 'critical' | 'warning' | 'positive' | 'neutral' — mesma regra da tela. */
  status: string;
  alertCount: number;
}

const STATUS_LABEL: Record<string, string> = {
  critical: "Queda Crítica",
  warning: "Atenção / Em queda",
  positive: "Crescimento",
  neutral: "Normal",
};

const fmtQty = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const fmtMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;

/** Sinal textual para o relatório continuar legível em preto e branco. */
const pctMark = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "";
  if (v <= -30) return " (queda forte)";
  if (v < 0) return " (queda)";
  if (v > 0) return " (alta)";
  return "";
};

export function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildEstudoPdfFileName(input: EstudoPdfInput): string {
  const periodo = input.visibleMonths.length
    ? `-${sanitizeFileName(input.visibleMonths[0])}-a-${sanitizeFileName(input.visibleMonths[input.visibleMonths.length - 1])}`
    : "";
  return `Estudo-de-Vendas-${sanitizeFileName(input.clientName)}${periodo}.pdf`;
}

function totalsByMonth(input: EstudoPdfInput) {
  return input.visibleMonths.map((m, idx) => {
    const qty = input.products.reduce((s, p) => s + (p.months[m]?.qty ?? 0), 0);
    const fat = input.products.reduce((s, p) => s + (p.months[m]?.fat ?? 0), 0);
    let pct: number | null = null;
    if (idx > 0) {
      const prevM = input.visibleMonths[idx - 1];
      const prevQty = input.products.reduce((s, p) => s + (p.months[prevM]?.qty ?? 0), 0);
      if (prevQty > 0) pct = ((qty - prevQty) / prevQty) * 100;
    }
    return { month: m, qty, fat, pct };
  });
}

export function buildEstudoVendasPdf(input: EstudoPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageWidth = 210;
  const marginX = 14;
  const contentW = pageWidth - marginX * 2;
  const periodo = input.visibleMonths.length
    ? `${input.visibleMonths[0]} a ${input.visibleMonths[input.visibleMonths.length - 1]}`
    : "—";

  // ----- Cabeçalho principal -----
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("PÃO DE QUEIJO TI DELSO", marginX, 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Estudo de Vendas — Relatório do Cliente", marginX, 17);
  doc.setTextColor(0);

  let y = 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(doc.splitTextToSize(input.clientName, contentW), marginX, y);
  y += 6 * doc.splitTextToSize(input.clientName, contentW).length;

  const totals = totalsByMonth(input);
  const totalQty = totals.reduce((s, t) => s + t.qty, 0);
  const totalFat = totals.reduce((s, t) => s + t.fat, 0);
  const ultimo = totals[totals.length - 1];

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.8, lineColor: [220, 220, 220] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, fillColor: [250, 248, 243] } },
    body: [
      ["Vendedor", input.vendedor || "—"],
      ["Período analisado", periodo],
      ["Data de geração", new Date().toLocaleDateString("pt-BR")],
      ["Quantidade total vendida", fmtQty(totalQty)],
      ["Faturamento total", fmtMoney(totalFat)],
      ["Variação do último mês", ultimo ? `${fmtPct(ultimo.pct)}${pctMark(ultimo.pct)}` : "—"],
      ["Quantidade de alertas", String(input.alertCount)],
      ["Situação", STATUS_LABEL[input.status] ?? "Normal"],
    ],
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ----- Resumo por mês (visão geral do cliente) -----
  autoTable(doc, {
    startY: y,
    theme: "striped",
    head: [["Mês", "Quantidade", "Faturamento", "Variação"]],
    body: totals.map((t) => [
      t.month,
      t.qty > 0 ? fmtQty(t.qty) : "—",
      t.qty > 0 ? fmtMoney(t.fat) : "—",
      `${fmtPct(t.pct)}${pctMark(t.pct)}`,
    ]),
    headStyles: { fillColor: [64, 64, 64], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 1.8 },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ----- Blocos por produto -----
  input.products.forEach((product) => {
    const rows = input.visibleMonths.map((m) => {
      const d = product.months[m];
      const qty = d?.qty ?? 0;
      return [
        m,
        qty > 0 ? fmtQty(qty) : "—",
        qty > 0 ? fmtMoney(d?.fat ?? 0) : "—",
        `${fmtPct(d?.pctQty)}${pctMark(d?.pctQty)}`,
      ];
    });

    // Mantém título + tabela do produto na mesma página sempre que couber.
    const estimatedHeight = 10 + (rows.length + 1) * 6;
    if (y + estimatedHeight > 280) {
      doc.addPage();
      y = 24;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const titleLines = doc.splitTextToSize(product.productName, contentW);
    doc.text(titleLines, marginX, y);
    y += 4.5 * titleLines.length + 1;

    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Mês", "Quantidade", "Faturamento", "Variação"]],
      body: rows,
      headStyles: { fillColor: [120, 113, 108], fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 1.5, lineColor: [225, 225, 225] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 28 } },
      margin: { left: marginX, right: marginX, top: 24 },
    });
    y = (doc as any).lastAutoTable.finalY + 7;
  });

  // ----- Cabeçalho simplificado + rodapé em todas as páginas -----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("Pão de Queijo Ti Delso — Estudo de Vendas", marginX, 10);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(`Cliente: ${input.clientName}`, contentW)[0], marginX, 15);
      doc.setDrawColor(220);
      doc.line(marginX, 17, pageWidth - marginX, 17);
      doc.setTextColor(0);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, 290, { align: "right" });
    doc.text(periodo, marginX, 290);
    doc.setTextColor(0);
  }

  return doc;
}
