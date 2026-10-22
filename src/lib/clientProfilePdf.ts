import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ClientProfile } from "@/types/clientProfile";
import { formatProductDisplay } from "@/lib/productDisplay";
import { documentoLabel, formatDocumento } from "@/lib/documentoCliente";

const fmt = (v?: string) => (v && v.trim() ? v : "—");
const fmtMoney = (v?: number) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

function buildAddress(p: ClientProfile, type: "main" | "delivery") {
  const get = (key: string) =>
    type === "main" ? (p as any)[key] : (p as any)[`entrega_${key}`];
  const linha1 = [get("rua"), get("numero")].filter(Boolean).join(", ");
  const linha2 = [get("complemento")].filter(Boolean).join(" ");
  const linha3 = [get("bairro"), get("cidade") && `${get("cidade")}/${get("estado") ?? ""}`]
    .filter(Boolean).join(" - ");
  const cep = get("cep");
  return [linha1, linha2, linha3, cep && `CEP ${cep}`].filter(Boolean).join("\n");
}

function renderProfile(doc: jsPDF, profile: ClientProfile, startY: number): number {
  let y = startY;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Ficha de Cadastro de Cliente", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${(profile.nome_fantasia && profile.nome_fantasia.trim()) || profile.nome} · gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    14,
    y,
  );
  doc.setTextColor(0);
  y += 8;

  const sectionHeader = (title: string) => {
    if (y > 270) { doc.addPage(); y = 14; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(245, 158, 11);
    doc.rect(14, y - 4, 182, 6, "F");
    doc.setTextColor(255);
    doc.text(title, 16, y);
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    y += 6;
  };

  sectionHeader("Dados principais");
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2 },
    body: [
      [
        documentoLabel(profile.tipo_documento, profile.cnpj) === "CPF"
          ? "Nome completo"
          : "Nome / Razão Social",
        fmt(profile.nome),
      ],
      ["Nome fantasia", fmt(profile.nome_fantasia)],
      [
        documentoLabel(profile.tipo_documento, profile.cnpj),
        fmt(formatDocumento(profile.cnpj, profile.tipo_documento)),
      ],
      ["Inscrição Estadual", fmt(profile.inscricao_estadual)],
      ["Inscrição Municipal", fmt(profile.inscricao_municipal)],
      ["Empresa", fmt(profile.empresa)],
      ["Segmento", fmt(profile.segmento)],
      ["Ramo de atividade", fmt(profile.ramo_atividade)],
      ["Vendedor", fmt(profile.vendedor)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  sectionHeader("Endereço principal");
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2 },
    body: [
      ["Endereço", buildAddress(profile, "main") || "—"],
      ["Região", fmt(profile.regiao)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (!profile.entrega_mesmo_endereco) {
    sectionHeader("Endereço de entrega");
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.2 },
      body: [["Endereço", buildAddress(profile, "delivery") || "—"]],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  sectionHeader("Horário de entrega");
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2 },
    body: [
      ["Manhã", `${fmt(profile.horario_manha_inicio)} até ${fmt(profile.horario_manha_fim)}`],
      ["Tarde", `${fmt(profile.horario_tarde_inicio)} até ${fmt(profile.horario_tarde_fim)}`],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (profile.dias_rota && profile.dias_rota.length > 0) {
    sectionHeader("Dias da rota de entrega");
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.2 },
      body: [["Dias", profile.dias_rota.join(", ")]],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if ((profile.formas_pagamento && profile.formas_pagamento.length > 0) || profile.prazo_pagamento) {
    sectionHeader("Forma de pagamento");
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.2 },
      body: [
        ["Formas", (profile.formas_pagamento ?? []).join(", ") || "—"],
        ["Prazo", fmt(profile.prazo_pagamento)],
      ],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (profile.contatos.length > 0) {
    sectionHeader("Contatos");
    autoTable(doc, {
      startY: y,
      head: [["Nome", "Cargo", "Telefone", "WhatsApp", "E-mail"]],
      body: profile.contatos.map((c) => [
        fmt(c.nome), fmt(c.cargo), fmt(c.telefone), fmt(c.whatsapp), c.email ? c.email : "não informado",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (profile.produtos_negociados.length > 0) {
    sectionHeader("Produtos negociados");
    autoTable(doc, {
      startY: y,
      head: [["Produto", "Preço (R$/kg)", "Observação"]],
      body: profile.produtos_negociados.map((p) => [
        formatProductDisplay(p.produto_nome), fmtMoney(p.preco), fmt(p.observacao),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (profile.observacoes) {
    sectionHeader("Observações");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(profile.observacoes, 180);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 4;
  }

  return y;
}

export function buildClientProfilePdf(profile: ClientProfile): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  renderProfile(doc, profile, 14);
  return doc;
}

export function buildClientProfilesPdf(profiles: ClientProfile[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  profiles.forEach((p, idx) => {
    if (idx > 0) doc.addPage();
    renderProfile(doc, p, 14);
  });
  return doc;
}

export function slugifyClientName(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "cliente";
}
