import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVendorScope, vendorScopeKey } from "@/hooks/useVendorScope";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { normKey, type BonificacaoCadastro, type BonificacaoRow } from "@/lib/bonificacaoLogic";
import { isBonificacao, type CommissionBatch, type CommissionRow } from "@/lib/commissionImport";

export function useBonificacaoCadastro() {
  const scope = useVendorScope();
  return useQuery({
    queryKey: ["bonificacao_cadastro", vendorScopeKey(scope)],
    select: useCallback((rows: BonificacaoCadastro[]) => scope.filtrar(rows, (r) => r.vendedor ?? null), [scope]),
    queryFn: async (): Promise<BonificacaoCadastro[]> => {
      const { data, error } = await (supabase as any)
        .from("bonificacao_cadastro")
        .select("*")
        .eq("ativo", true)
        .order("cliente", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        preco_anterior: r.preco_anterior == null ? null : Number(r.preco_anterior),
        preco_atual: Number(r.preco_atual ?? 0),
        produtos_bonificados: Number(r.produtos_bonificados ?? 0),
        pct_negociacao: r.pct_negociacao == null ? null : Number(r.pct_negociacao),
      })) as BonificacaoCadastro[];

    },
    staleTime: 60_000,
  });
}

export function useBonificacaoRows() {
  const scope = useVendorScope();
  return useQuery({
    queryKey: ["bonificacao_rows", vendorScopeKey(scope)],
    select: useCallback((rows: BonificacaoRow[]) => scope.filtrar(rows, (r) => r.vendedor ?? null), [scope]),
    queryFn: async (): Promise<BonificacaoRow[]> => {
      const pageSize = 1000;
      const out: BonificacaoRow[] = [];
      for (let page = 0; page < 20; page++) {
        const { data, error } = await (supabase as any)
          .from("bonificacao_rows")
          .select("*")
          .order("data", { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as any[];
        out.push(
          ...rows.map((r) => ({
            ...r,
            quantidade: Number(r.quantidade ?? 0),
            custo: Number(r.custo ?? 0),
          })) as BonificacaoRow[],
        );
        if (rows.length < pageSize) break;
      }
      return out;
    },
    staleTime: 60_000,
  });
}

/** Vínculos manuais bonificação -> pedido (corrige conciliações que o automático não resolve). */
export function useBonificacaoVinculos() {
  return useQuery({
    queryKey: ["bonificacao_vinculos"],
    queryFn: async (): Promise<Map<number, { codigoVenda: string | null; desvinculado: boolean }>> => {
      const { data, error } = await (supabase as any).from("bonificacao_vinculos").select("*");
      if (error) throw error;
      const map = new Map<number, { codigoVenda: string | null; desvinculado: boolean }>();
      for (const r of (data ?? []) as any[]) {
        map.set(Number(r.bonificacao_row_id), {
          codigoVenda: r.codigo_venda ?? null,
          desvinculado: !!r.desvinculado,
        });
      }
      return map;
    },
    staleTime: 60_000,
  });
}

export function useBonificacaoVinculoMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["bonificacao_vinculos"] });
  // Vincular, marcar "sem pedido" e voltar à conciliação automática ajustam a conciliação: editar.
  const { exigir } = useModuleCrud("bonificacoes", "vínculos de bonificação");

  const vincular = useMutation({
    mutationFn: async (input: { rowId: number; codigoVenda: string | null; desvinculado?: boolean }) => {
      exigir("editar");
      const { error } = await (supabase as any).from("bonificacao_vinculos").upsert(
        {
          bonificacao_row_id: input.rowId,
          codigo_venda: input.codigoVenda,
          desvinculado: input.desvinculado ?? false,
        },
        { onConflict: "bonificacao_row_id" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Remove o vínculo manual e devolve a bonificação à conciliação automática. */
  const limparVinculo = useMutation({
    mutationFn: async (rowId: number) => {
      exigir("editar");
      const { error } = await (supabase as any)
        .from("bonificacao_vinculos")
        .delete()
        .eq("bonificacao_row_id", rowId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { vincular, limparVinculo };
}

export function useBonificacaoMutations() {

  const qc = useQueryClient();
  const { exigir } = useModuleCrud("bonificacoes", "bonificações");
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bonificacao_cadastro"] });
    qc.invalidateQueries({ queryKey: ["bonificacao_rows"] });
  };

  const salvarCadastro = useMutation({
    mutationFn: async (input: Partial<BonificacaoCadastro> & { cliente: string; produto: string }) => {
      exigir("criar"); // usado pelo formulário "Nova bonificação"
      const payload = {
        ...input,
        cliente_key: normKey(input.cliente),
        produto_key: normKey(input.produto),
      };
      const { error } = await (supabase as any)
        .from("bonificacao_cadastro")
        .upsert(payload, { onConflict: "cliente_key,produto_key" });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const excluirCadastro = useMutation({
    mutationFn: async (id: string) => {
      exigir("excluir");
      const { error } = await (supabase as any).from("bonificacao_cadastro").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Exclui todo o controle de um cliente (todos os produtos cadastrados). */
  const excluirCliente = useMutation({
    mutationFn: async (ids: string[]) => {
      exigir("excluir");
      if (!ids.length) return;
      const { error } = await (supabase as any).from("bonificacao_cadastro").update({ ativo: false }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /**
   * Atualiza a negociação do cliente: a % manual vale para todos os produtos
   * cadastrados daquele cliente e prevalece sobre a estimativa automática.
   */
  const salvarNegociacao = useMutation({
    mutationFn: async (input: {
      ids: string[];
      pct_negociacao: number | null;
      vendedor?: string | null;
      observacoes?: string | null;
      precos?: Record<string, number>;
    }) => {
      exigir("editar");
      const patch: Record<string, unknown> = { pct_negociacao: input.pct_negociacao };
      if (input.vendedor !== undefined) patch.vendedor = input.vendedor;
      if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
      if (input.ids.length) {
        const { error } = await (supabase as any).from("bonificacao_cadastro").update(patch).in("id", input.ids);
        if (error) throw error;
      }
      for (const [id, preco] of Object.entries(input.precos ?? {})) {
        const { error } = await (supabase as any)
          .from("bonificacao_cadastro")
          .update({ preco_atual: preco })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  return { salvarCadastro, excluirCadastro, excluirCliente, salvarNegociacao, invalidate };
}


/** Converte linhas de bonificação da planilha de comissão para `bonificacao_rows`. */
export function commissionRowsToBonificacaoRows(rows: CommissionRow[], sourceFile: string, yearMonth?: string) {
  const seq = new Map<string, number>();
  const out: any[] = [];
  for (const r of rows) {
    if (!isBonificacao(r.tipo)) continue;
    const clienteKey = normKey(r.cliente);
    const produtoKey = normKey(r.produto ?? "");
    const base = `${r.codigoVenda ?? "s/cod"}|${r.data ?? "s/data"}|${clienteKey}|${produtoKey}`;
    const n = (seq.get(base) ?? 0) + 1;
    seq.set(base, n);
    out.push({
      import_key: `${yearMonth ?? "sem-mes"}|${base}|${n}`,
      categoria: r.categoriaVenda || r.tipoRaw || r.tipo,
      cliente: r.cliente,
      cliente_key: clienteKey,
      cnpj_cpf: r.cnpjCpf ?? null,
      codigo_venda: r.codigoVenda ? String(r.codigoVenda) : null,
      data: r.data ? new Date(`${r.data}T12:00:00Z`).toISOString() : null,
      produto: r.produto ?? "",
      produto_key: produtoKey,
      quantidade: Number(r.quantidade ?? 0),
      custo: Number(r.custo ?? r.valor ?? 0),
      vendedor: r.vendedor ?? null,
      source_file: sourceFile,
    });
  }
  return out;
}

/** Persiste (upsert incremental por import_key) as bonificações lidas de uma planilha. */
export async function persistBonificacaoRows(rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const chunk = 300;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { data, error } = await (supabase as any)
      .from("bonificacao_rows")
      .upsert(slice, { onConflict: "import_key" })
      .select("id");
    if (error) throw error;
    total += Array.isArray(data) ? data.length : 0;
  }
  return total;
}

export async function persistBonificacoesFromCommissionBatch(batch: CommissionBatch): Promise<number> {
  return persistBonificacaoRows(commissionRowsToBonificacaoRows(batch.rows, batch.fileName));
}

/** Todas as categorias de bonificação já existentes na base (para seletores dinâmicos). */
export function useBonificacaoCategorias() {
  return useQuery({
    queryKey: ["bonificacao_categorias"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("bonificacao_rows")
        .select("categoria")
        .limit(20000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { categoria: string | null }[]) {
        const c = (r.categoria ?? "").trim();
        if (c) set.add(c);
      }
      return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
    staleTime: 300_000,
  });
}
