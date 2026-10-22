import type { CommissionRow } from "./commissionImport";

/**
 * Converte linhas de VENDA da planilha de comissão para o formato aceito pela
 * edge function `import-sales` (que popula `sales_raw_rows`).
 *
 * Bonificações NÃO são incluídas — elas ficam apenas no batch local.
 *
 * Linhas sem `codigoVenda` ou `data` válidos são descartadas (a edge function
 * exige essas chaves para o UPSERT incremental por `import_key`).
 */
export interface SalesImportPayload {
  codigo_venda: number;
  data: string;
  quantidade: number;
  descricao: string;
  cnpj_cpf: string | null;
  cliente: string;
  vendedor: string;
  preco_venda: number;
  preco_venda_total: number;
  nome_arquivo_importado: string;
  sequence?: number;
}

export interface ConversionResult {
  payload: SalesImportPayload[];
  skipped: number;
  reasons: { semCodigo: number; semData: number };
}

export function commissionRowsToSalesPayload(
  rows: CommissionRow[],
  nomeArquivo: string,
): ConversionResult {
  const payload: SalesImportPayload[] = [];
  let semCodigo = 0;
  let semData = 0;
  // Sequence counter per (codigo_venda|data|cliente|produto) to preserve duplicates
  const seqMap = new Map<string, number>();

  for (const r of rows) {
    if (r.tipo !== "VENDA") continue;
    const codigo = Number(r.codigoVenda ?? 0);
    if (!Number.isFinite(codigo) || codigo <= 0) { semCodigo++; continue; }
    if (!r.data) { semData++; continue; }
    // data pode vir como "YYYY-MM-DD"; normalize para ISO
    const iso = new Date(r.data).toISOString();
    if (isNaN(new Date(iso).getTime())) { semData++; continue; }

    const key = `${codigo}|${iso.slice(0, 16)}|${r.cliente.trim().toLowerCase()}|${(r.produto ?? "").trim().toLowerCase()}`;
    const seq = (seqMap.get(key) ?? 0) + 1;
    seqMap.set(key, seq);

    const precoUnit = Number(r.precoUnit ?? 0);
    const precoTotal = Number(r.valor ?? 0);
    payload.push({
      codigo_venda: codigo,
      data: iso,
      quantidade: Number(r.quantidade ?? 0),
      descricao: r.produto ?? "",
      cnpj_cpf: null,
      cliente: r.cliente,
      vendedor: r.vendedor,
      preco_venda: precoUnit || (Number(r.quantidade) ? precoTotal / Number(r.quantidade) : precoTotal),
      preco_venda_total: precoTotal,
      nome_arquivo_importado: nomeArquivo,
      sequence: seq,
    });
  }

  return { payload, skipped: semCodigo + semData, reasons: { semCodigo, semData } };
}
