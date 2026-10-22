// Validação determinística das linhas lidas da planilha mensal de comissão,
// executada ANTES de qualquer gravação. Nada é gravado se houver linha inválida.

import type { CommissionRow } from "@/lib/commissionImport";

export interface CommissionRowIssue {
  linha: number;
  aba: string;
  coluna: string;
  motivo: string;
  conteudo: string;
}

export interface CommissionValidationResult {
  ok: boolean;
  total: number;
  validas: number;
  comErro: number;
  duplicadas: number;
  issues: CommissionRowIssue[];
}

const MAX_ISSUES = 50;

function resumoLinha(r: CommissionRow): string {
  return JSON.stringify({
    vendedor: r.vendedor,
    cliente: r.cliente,
    produto: r.produto,
    quantidade: r.quantidade,
    valor: r.valor,
    data: r.data,
    tipo: r.tipoRaw ?? r.tipo,
    codigoVenda: r.codigoVenda,
  });
}

function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Valida campos obrigatórios, datas, números e duplicidades.
 * Duplicidade é apenas informativa (não bloqueia): a planilha oficial pode
 * repetir o mesmo produto no mesmo pedido.
 */
export function validateCommissionRows(rows: CommissionRow[]): CommissionValidationResult {
  const issues: CommissionRowIssue[] = [];
  const vistos = new Set<string>();
  let duplicadas = 0;
  let comErro = 0;

  rows.forEach((r, i) => {
    const linha = r.linhaPlanilha ?? i + 1;
    const aba = r.sheet ?? "—";
    const push = (coluna: string, motivo: string) => {
      comErro += 1;
      if (issues.length < MAX_ISSUES) issues.push({ linha, aba, coluna, motivo, conteudo: resumoLinha(r) });
    };

    let linhaComErro = false;
    const erro = (coluna: string, motivo: string) => {
      if (!linhaComErro) {
        linhaComErro = true;
        push(coluna, motivo);
      }
    };

    if (!String(r.vendedor ?? "").trim()) erro("Vendedor", "Vendedor ausente");
    else if (!String(r.cliente ?? "").trim()) erro("Cliente", "Cliente ausente");
    else if (typeof r.valor !== "number" || !Number.isFinite(r.valor)) erro("Valor", "Valor numérico inválido");
    else if (r.quantidade != null && !Number.isFinite(r.quantidade)) erro("Quantidade", "Quantidade numérica inválida");
    else if (r.precoUnit != null && !Number.isFinite(r.precoUnit)) erro("Preço unitário", "Preço unitário inválido");
    else if (r.data != null && String(r.data).trim() !== "" && !dataValida(String(r.data))) {
      erro("Data", `Data inválida: "${r.data}" (esperado dia/mês/ano)`);
    } else if (!r.tipo) erro("Categoria Venda", "Tipo de operação não identificado");

    const chave = [
      r.codigoVenda ?? "",
      r.data ?? "",
      r.cliente?.trim().toLowerCase(),
      r.produto?.trim().toLowerCase() ?? "",
      r.quantidade ?? "",
      r.valor,
    ].join("|");
    if (vistos.has(chave)) duplicadas += 1;
    else vistos.add(chave);
  });

  return {
    ok: comErro === 0,
    total: rows.length,
    validas: rows.length - comErro,
    comErro,
    duplicadas,
    issues,
  };
}

/** Texto pronto para exibição das primeiras linhas com problema. */
export function describeIssues(issues: CommissionRowIssue[], limit = 3): string {
  return issues
    .slice(0, limit)
    .map((i) => `Linha ${i.linha} (aba ${i.aba}) · coluna "${i.coluna}": ${i.motivo} · ${i.conteudo}`)
    .join(" | ");
}
