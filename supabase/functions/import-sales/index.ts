import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKeyText(value: string): string {
  return normalizeSpaces(value).toLowerCase();
}

function getProductImportToken(descricao: string): string {
  const match = normalizeSpaces(descricao).match(/^(\d+)\s*-/);
  return match?.[1] ?? normalizeKeyText(descricao);
}

// Chave canônica por DIA (não por minuto). Diferentes exportações do mesmo
// pedido frequentemente divergem no horário (ex.: "09:50" vs "00:00"), o que
// antes fazia o UPSERT tratá-las como linhas distintas e duplicar faturamento.
// A chave por dia garante que a mesma venda colapse independentemente do
// arquivo, mantendo a `sequence` para diferenciar linhas repetidas legítimas.
// O NOME DO CLIENTE NÃO ENTRA NA CHAVE: o sistema de origem renomeia clientes
// entre exportações (ex.: "Sorveteria Universal (GR)" → "(IM)") e isso fazia a
// mesma venda ser inserida duas vezes, inflando o faturamento.
function buildImportKey(row: { codigo_venda: number; data: string; descricao: string; sequence?: number }): string {
  return [
    String(row.codigo_venda ?? 0),
    new Date(row.data).toISOString().slice(0, 10),
    getProductImportToken(row.descricao),
    String(row.sequence ?? 1),
  ].join("|");
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toInteger(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// Grupo canônico = pedido + dia + produto (sem o nome do cliente, que muda
// entre exportações do sistema de origem).
function groupKey(row: { codigo_venda: number; data: string; descricao: string }): string {
  return [
    String(row.codigo_venda ?? 0),
    new Date(row.data).toISOString().slice(0, 10),
    getProductImportToken(row.descricao),
  ].join("|");
}

function toRawRow(row: any, fallbackIndex: number) {
  const precoVenda = toNumber(row?.preco_venda ?? row?.preco_unitario);
  const precoVendaTotal = toNumber(row?.preco_venda_total ?? row?.preco_total);
  const sequence = Math.max(1, toInteger(row?.sequence ?? 1));
  const rawRow = {
    original_row_number: toInteger(row?.original_row_number ?? fallbackIndex + 2),
    codigo_venda: toInteger(row?.codigo_venda),
    data: new Date(row?.data).toISOString(),
    quantidade: toNumber(row?.quantidade),
    descricao: String(row?.descricao ?? ""),
    cnpj_cpf: row?.cnpj_cpf ? String(row.cnpj_cpf) : null,
    cliente: String(row?.cliente ?? ""),
    vendedor: String(row?.vendedor ?? ""),
    preco_venda: precoVenda,
    preco_venda_total: precoVendaTotal,
    preco_unitario: precoVenda,
    preco_total: precoVendaTotal,
    nome_arquivo_importado: row?.nome_arquivo_importado ? String(row.nome_arquivo_importado) : null,
    data_importacao: new Date().toISOString(),
  };
  const import_key = buildImportKey({ ...rawRow, sequence });
  return { ...rawRow, sequence, import_key };
}

function rowsAreEquivalent(existing: any, incoming: any): boolean {
  return toInteger(existing?.codigo_venda) === toInteger(incoming.codigo_venda)
    && new Date(existing?.data).toISOString() === new Date(incoming.data).toISOString()
    && toNumber(existing?.quantidade) === toNumber(incoming.quantidade)
    && normalizeSpaces(String(existing?.descricao ?? "")) === normalizeSpaces(String(incoming.descricao ?? ""))
    && normalizeSpaces(String(existing?.cnpj_cpf ?? "")) === normalizeSpaces(String(incoming.cnpj_cpf ?? ""))
    && normalizeSpaces(String(existing?.cliente ?? "")) === normalizeSpaces(String(incoming.cliente ?? ""))
    && normalizeSpaces(String(existing?.vendedor ?? "")) === normalizeSpaces(String(incoming.vendedor ?? ""))
    && toNumber(existing?.preco_venda ?? existing?.preco_unitario) === toNumber(incoming.preco_venda)
    && toNumber(existing?.preco_venda_total ?? existing?.preco_total) === toNumber(incoming.preco_venda_total)
    && toNumber(existing?.preco_unitario ?? existing?.preco_venda) === toNumber(incoming.preco_unitario)
    && toNumber(existing?.preco_total ?? existing?.preco_venda_total) === toNumber(incoming.preco_total);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function uniqueValues<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function sumRows(rows: any[]): number {
  return rows.reduce((sum, row) => sum + toNumber(row?.preco_venda_total ?? row?.preco_total), 0);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

async function fetchActiveRowsInRange(supabase: any, minDate: Date, maxDate: Date): Promise<any[]> {
  const rows: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("sales_raw_rows")
      .select("id, codigo_venda, data, cliente, descricao, vendedor, preco_venda_total, preco_total, nome_arquivo_importado")
      .eq("active", true)
      .gte("data", minDate.toISOString())
      .lte("data", maxDate.toISOString())
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Consulta de registros ativos falhou: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function makeResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const mode: "preview" | "chunk" = body?.mode === "preview" ? "preview" : "chunk";
    // A ausência só tem significado quando o frontend confirmou que o arquivo
    // possui totalizador e que esse total bate com a soma das linhas. Arquivos
    // parciais nunca enviam esta opção e, portanto, não desativam outras vendas.
    const syncFullReport = body?.syncFullReport === true;

    const rows: any[] = body?.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return makeResponse({ error: "No rows provided" }, 400);
    }

    const rawRows = rows.map((row, index) => toRawRow(row, index));
    const timestamps = rawRows.map((r) => new Date(r.data).getTime()).filter((t) => !Number.isNaN(t));
    const codigos = rawRows.map((r) => toInteger(r.codigo_venda)).filter((c) => c > 0);
    if (timestamps.length === 0) {
      return makeResponse({ error: "Nenhuma data válida nos registros" }, 400);
    }
    // O espelho substitui todo o intervalo de DIAS presente na planilha, não
    // apenas os horários mínimo/máximo. Assim versões antigas com horário
    // diferente não sobrevivem fora da janela e não inflam o total.
    const minDate = new Date(Math.min(...timestamps));
    minDate.setUTCHours(0, 0, 0, 0);
    const maxDate = new Date(Math.max(...timestamps));
    maxDate.setUTCHours(23, 59, 59, 999);
    const minCodigoVenda = codigos.length ? Math.min(...codigos) : 0;
    const maxCodigoVenda = codigos.length ? Math.max(...codigos) : 0;

    // Sem colapso: cada linha da planilha é uma unidade de comparação independente.
    // A "sequência" já garante unicidade entre linhas legítimas repetidas.
    const rowsToProcess = rawRows;

    // Busca candidatos existentes por (codigo_venda + faixa de data) para casar
    // por GRUPO (codigo_venda + minuto + cliente + produto), pareando por ordem
    // (id ASC ↔ sequence ASC). Isso preserva 100% das linhas da planilha e é
    // compatível com registros legados que possuem import_key no formato antigo.
    const activeRowsBefore = (await fetchActiveRowsInRange(supabase, minDate, maxDate))
      .filter((row) => {
        if (syncFullReport) return true;
        const codigo = toInteger(row.codigo_venda);
        return !minCodigoVenda || (codigo >= minCodigoVenda && codigo <= maxCodigoVenda);
      });

    const existingByGroup = new Map<string, any[]>();
    const codigoVendas = uniqueValues(rowsToProcess.map((row) => toInteger(row.codigo_venda)));
    for (const codes of chunkArray(codigoVendas, 200)) {
      const { data: existing, error } = await supabase
        .from("sales_raw_rows")
        .select("id, import_key, active, original_row_number, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_venda, preco_venda_total, preco_unitario, preco_total, nome_arquivo_importado")
        // Janela ampliada: o SIGE pode mudar a data do pedido (emissão → faturamento)
        // entre exportações; o mesmo codigo_venda precisa ser reconciliado.
        .gte("data", new Date(minDate.getTime() - 90 * 86400000).toISOString())
        .lte("data", new Date(maxDate.getTime() + 90 * 86400000).toISOString())
        .in("codigo_venda", codes);
      if (error) throw new Error(`Consulta de registros existentes falhou: ${error.message}`);
      for (const row of existing ?? []) {
        const key = groupKey({
          codigo_venda: toInteger(row.codigo_venda),
          data: new Date(row.data).toISOString(),
          descricao: String(row.descricao ?? ""),
        });
        const bucket = existingByGroup.get(key);
        if (bucket) bucket.push(row);
        else existingByGroup.set(key, [row]);
      }
    }
    for (const bucket of existingByGroup.values()) {
      bucket.sort((a, b) => {
        if (a.active !== false && b.active === false) return -1;
        if (a.active === false && b.active !== false) return 1;
        return a.id - b.id;
      });
    }

    // Agrupa incoming por mesmo grupo, ordenando por sequência
    const incomingByGroup = new Map<string, any[]>();
    for (const row of rowsToProcess) {
      const key = groupKey(row);
      const bucket = incomingByGroup.get(key);
      if (bucket) bucket.push(row);
      else incomingByGroup.set(key, [row]);
    }
    for (const bucket of incomingByGroup.values()) bucket.sort((a, b) => (a.sequence ?? 1) - (b.sequence ?? 1));

    const rowsToInsert: any[] = [];
    const rowsToUpdate: any[] = [];
    const rowsToDeactivate: any[] = [];
    let unchanged = 0;
    for (const [key, incomingBucket] of incomingByGroup) {
      const existingBucket = existingByGroup.get(key) ?? [];
      const usedExistingIndexes = new Set<number>();
      for (let i = 0; i < incomingBucket.length; i++) {
        const incoming = incomingBucket[i];

        // Primeiro procura qualquer registro já idêntico dentro do grupo.
        // Isso evita que uma reimportação atualize uma linha legada enquanto
        // mantém outra linha equivalente, criando sobra de faturamento.
        const equivalentIndex = existingBucket.findIndex((existing, index) =>
          !usedExistingIndexes.has(index) && rowsAreEquivalent(existing, incoming)
        );
        if (equivalentIndex >= 0) {
          const equivalent = existingBucket[equivalentIndex];
          usedExistingIndexes.add(equivalentIndex);
          if (equivalent.active === false) rowsToUpdate.push({ ...incoming, id: equivalent.id });
          else unchanged++;
          continue;
        }

        // Sem equivalência exata, usa a posição ordinal disponível como alvo de
        // atualização. Se a posição já tiver sido usada, pega o próximo registro
        // livre do grupo. Só insere quando não existe nenhum candidato livre.
        const positionalIndex = !usedExistingIndexes.has(i)
          ? i
          : existingBucket.findIndex((_existing, index) => !usedExistingIndexes.has(index));
        const existing = positionalIndex >= 0 ? existingBucket[positionalIndex] : undefined;

        if (!existing) {
          rowsToInsert.push(incoming);
        } else {
          usedExistingIndexes.add(positionalIndex);
          rowsToUpdate.push({ ...incoming, id: existing.id });
        }
      }

      // O arquivo traz o pedido inteiro: sobras ativas no mesmo grupo são
      // duplicidades de importações anteriores e saem do conjunto vigente.
      for (let i = 0; i < existingBucket.length; i++) {
        const existing = existingBucket[i];
        if (!usedExistingIndexes.has(i) && existing.active !== false) {
          rowsToDeactivate.push(existing);
        }
      }
    }

    // ATENÇÃO: nunca desativar linhas apenas por estarem "ausentes" no arquivo
    // dentro de um intervalo de datas — isso já apagou meses inteiros.
    // A reconciliação acontece SOMENTE dentro dos PEDIDOS presentes no arquivo:
    // o relatório sempre traz o pedido completo, então um item ativo de um
    // pedido importado que não aparece mais no arquivo foi removido/alterado na
    // origem (ou é resíduo de chave antiga) e deve sair do conjunto vigente.
    const incomingPedidos = new Set(
      rowsToProcess.map((row) => `${toInteger(row.codigo_venda)}`),
    );
    const deactivatedIds = new Set(rowsToDeactivate.map((row) => row.id));
    for (const [key, bucket] of existingByGroup) {
      if (incomingByGroup.has(key)) continue;
      for (const existing of bucket) {
        if (existing.active === false || deactivatedIds.has(existing.id)) continue;
        const pedido = `${toInteger(existing.codigo_venda)}`;
        if (!incomingPedidos.has(pedido)) continue;
        deactivatedIds.add(existing.id);
        rowsToDeactivate.push(existing);
      }
    }

    // Um relatório completo é a fonte de verdade do intervalo exportado. Além
    // das sobras dentro de pedidos presentes, desativa pedidos/itens antigos que
    // não existem mais no arquivo. Nunca apaga: mantém o histórico como inativo.
    if (syncFullReport) {
      const incomingGroups = new Set(incomingByGroup.keys());
      for (const existing of activeRowsBefore) {
        if (deactivatedIds.has(existing.id)) continue;
        const key = groupKey({
          codigo_venda: toInteger(existing.codigo_venda),
          data: new Date(existing.data).toISOString(),
          descricao: String(existing.descricao ?? ""),
        });
        if (incomingGroups.has(key)) continue;
        deactivatedIds.add(existing.id);
        rowsToDeactivate.push(existing);
      }
    }




    const audit = {
      totalRowsRead: rawRows.length,
      acceptedRows: rowsToProcess.length,
      ignoredRows: 0,
      ignoredReasons: {},
      sheetTotal: sumRows(rowsToProcess),
      validFileTotal: sumRows(rowsToProcess),
      activeTotalBefore: sumRows(activeRowsBefore),
      toInsert: rowsToInsert.length,
      toUpdate: rowsToUpdate.length,
      unchanged,
      toDeactivate: rowsToDeactivate.length,
      staleTotal: sumRows(rowsToDeactivate),
    };

    console.log("[import-sales:audit]", JSON.stringify({ mode, syncFullReport, rangeStart: minDate.toISOString(), rangeEnd: maxDate.toISOString(), minCodigoVenda, maxCodigoVenda, ...audit }));


    if (mode === "preview") {
      return makeResponse(
        {
          mode,
          total: rawRows.length,
          newCount: rowsToInsert.length,
          updateCount: rowsToUpdate.length,
          unchangedCount: unchanged,
          staleCount: rowsToDeactivate.length,
          audit,
          rangeStart: minDate.toISOString(),
          rangeEnd: maxDate.toISOString(),
          minCodigoVenda,
          maxCodigoVenda,
        },
      );
    }

    const errors: string[] = [];
    let inserted = 0;
    let updated = 0;
    const subBatch = 250;
    // Remove campos que não existem na tabela (sequence é usado apenas em memória).
    const stripSequence = ({ sequence: _seq, ...rest }: any) => ({
      ...rest,
      active: true,
      superseded_at: null,
      superseded_by_file: null,
      superseded_reason: null,
    });
    for (let i = 0; i < rowsToInsert.length; i += subBatch) {
      const slice = rowsToInsert.slice(i, i + subBatch).map(stripSequence);
      const { error } = await supabase
        .from("sales_raw_rows")
        .upsert(slice, { onConflict: "import_key" });
      if (error) errors.push(`Insert: ${error.message}`);
      else inserted += slice.length;
    }

    // Atualização em lote: milhares de requests sequenciais excediam o tempo da
    // função e deixavam a sincronização pela metade, apesar do preview correto.
    for (let i = 0; i < rowsToUpdate.length; i += subBatch) {
      const slice = rowsToUpdate.slice(i, i + subBatch).map(stripSequence);
      const { error } = await supabase
        .from("sales_raw_rows")
        .upsert(slice, { onConflict: "id" });
      if (error) errors.push(`Update lote ${i / subBatch + 1}: ${error.message}`);
      else updated += slice.length;
    }

    let deactivated = 0;
    for (const rows of chunkArray(rowsToDeactivate, 250)) {
      const ids = rows.map((row) => row.id);
      const { error } = await supabase
        .from("sales_raw_rows")
        .update({
          active: false,
          superseded_at: new Date().toISOString(),
          superseded_by_file: rawRows[0]?.nome_arquivo_importado ?? null,
          superseded_reason: "Substituída por versão mais recente do mesmo item no arquivo importado",
        })
        .in("id", ids);
      if (error) errors.push(`Deactivate: ${error.message}`);
      else deactivated += ids.length;
    }

    const postRows: any[] = [];
    for (const codes of chunkArray(codigoVendas, 200)) {
      const { data: existing, error } = await supabase
        .from("sales_raw_rows")
        .select("id, codigo_venda, data, quantidade, descricao, cliente, vendedor, preco_venda_total, preco_total, active, import_key")
        .eq("active", true)
        .gte("data", minDate.toISOString())
        .lte("data", maxDate.toISOString())
        .in("codigo_venda", codes);
      if (error) errors.push(`Validação pós-importação: ${error.message}`);
      postRows.push(...(existing ?? []));
    }

    const postByGroup = new Map<string, any[]>();
    for (const row of postRows) {
      const key = groupKey({
        codigo_venda: toInteger(row.codigo_venda),
        data: new Date(row.data).toISOString(),
        
        descricao: String(row.descricao ?? ""),
      });
      const bucket = postByGroup.get(key);
      if (bucket) bucket.push(row);
      else postByGroup.set(key, [row]);
    }

    const validationErrors: string[] = [];
    let postActiveRowsForIncoming = 0;
    let postActiveTotalForIncoming = 0;
    for (const [key, incomingBucket] of incomingByGroup) {
      const activeBucket = postByGroup.get(key) ?? [];
      postActiveRowsForIncoming += activeBucket.length;
      postActiveTotalForIncoming += sumRows(activeBucket);
      const expectedRows = incomingBucket.length;
      const actualRows = activeBucket.length;
      if (actualRows !== expectedRows) {
        validationErrors.push(`Grupo ${key}: esperado ${expectedRows} item(ns) ativo(s), encontrado ${actualRows}.`);
      }
      const expectedTotal = money(sumRows(incomingBucket));
      const actualTotal = money(sumRows(activeBucket));
      if (Math.abs(expectedTotal - actualTotal) > 0.01) {
        validationErrors.push(`Grupo ${key}: total ativo ${actualTotal.toFixed(2)} diferente da planilha ${expectedTotal.toFixed(2)}.`);
      }
    }

    const validation = {
      totalLidoArquivo: rawRows.length,
      totalValidoArquivo: money(sumRows(rowsToProcess)),
      totalSalvoGruposImportados: money(postActiveTotalForIncoming),
      totalAtivoGruposImportados: money(postActiveTotalForIncoming),
      totalApresentadoInteligencia: money(postActiveTotalForIncoming),
      registrosLidos: rawRows.length,
      inseridos: inserted,
      atualizados: updated,
      ignorados: 0,
      desativados: deactivated,
      duplicados: validationErrors.filter((e) => e.includes("encontrado") && !e.includes("esperado 0")).length,
      registrosAtivosGruposImportados: postActiveRowsForIncoming,
      ok: errors.length === 0 && validationErrors.length === 0 && Math.abs(money(sumRows(rowsToProcess)) - money(postActiveTotalForIncoming)) <= 0.01,
      errors: validationErrors,
    };

    if (syncFullReport) {
      const activeRangeTotal = money(sumRows(postRows));
      const fileTotal = money(sumRows(rowsToProcess));
      if (postRows.length !== rowsToProcess.length) {
        validationErrors.push(`Espelho completo: ${postRows.length} registros ativos para ${rowsToProcess.length} linhas da planilha.`);
      }
      if (Math.abs(activeRangeTotal - fileTotal) > 0.01) {
        validationErrors.push(`Espelho completo: total ativo ${activeRangeTotal.toFixed(2)} diferente da planilha ${fileTotal.toFixed(2)}.`);
      }
      validation.ok = errors.length === 0 && validationErrors.length === 0;
      validation.errors = validationErrors;
    }

    if (!validation.ok) {
      return makeResponse(
        {
          mode,
          inserted,
          updated,
          unchanged,
          deactivated,
          total: rawRows.length,
          errors: [...errors, ...validationErrors],
          audit: { ...audit, deactivated, validation },
          validation,
          rangeStart: minDate.toISOString(),
          rangeEnd: maxDate.toISOString(),
          minCodigoVenda,
          maxCodigoVenda,
        },
        409,
      );
    }


    return makeResponse(
      {
        mode,
        inserted,
        updated,
        unchanged,
        deactivated,
        total: rawRows.length,
        errors,
        audit: { ...audit, deactivated, validation },
        validation,
        rangeStart: minDate.toISOString(),
        rangeEnd: maxDate.toISOString(),
        minCodigoVenda,
        maxCodigoVenda,
      },
    );
  } catch (err) {
    return makeResponse({ error: (err as Error).message }, 500);
  }
});
