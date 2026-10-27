import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVendorScope, vendorScopeKey } from "@/hooks/useVendorScope";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { exigirEscopoRegistros } from "@/lib/escopoGravacao";
import { isExcludedClientName, normalizeClientName, setDynamicAliases } from "@/lib/clientNameNormalization";
import type { ClientProfile, ClientProfileInput, Contato, ProdutoNegociadoFicha } from "@/types/clientProfile";

const QK = ["client_profiles"] as const;

function rowToProfile(row: any): ClientProfile {
  return {
    id: row.id,
    nome: row.nome,
    nome_fantasia: row.nome_fantasia ?? undefined,
    cnpj: row.cnpj ?? undefined,
    tipo_documento: row.tipo_documento === "CPF" ? "CPF" : "CNPJ",
    inscricao_estadual: row.inscricao_estadual ?? undefined,
    inscricao_municipal: row.inscricao_municipal ?? undefined,
    segmento: row.segmento ?? undefined,
    ramo_atividade: row.ramo_atividade ?? undefined,
    empresa: row.empresa ?? undefined,
    vendedor: row.vendedor ?? undefined,
    cep: row.cep ?? undefined,
    rua: row.rua ?? undefined,
    numero: row.numero ?? undefined,
    complemento: row.complemento ?? undefined,
    bairro: row.bairro ?? undefined,
    cidade: row.cidade ?? undefined,
    estado: row.estado ?? undefined,
    regiao: row.regiao ?? undefined,
    entrega_mesmo_endereco: row.entrega_mesmo_endereco ?? true,
    entrega_cep: row.entrega_cep ?? undefined,
    entrega_rua: row.entrega_rua ?? undefined,
    entrega_numero: row.entrega_numero ?? undefined,
    entrega_complemento: row.entrega_complemento ?? undefined,
    entrega_bairro: row.entrega_bairro ?? undefined,
    entrega_cidade: row.entrega_cidade ?? undefined,
    entrega_estado: row.entrega_estado ?? undefined,
    horario_manha_inicio: row.horario_manha_inicio ?? undefined,
    horario_manha_fim: row.horario_manha_fim ?? undefined,
    horario_tarde_inicio: row.horario_tarde_inicio ?? undefined,
    horario_tarde_fim: row.horario_tarde_fim ?? undefined,
    dias_rota: Array.isArray(row.dias_rota) ? (row.dias_rota as string[]) : [],
    formas_pagamento: Array.isArray(row.formas_pagamento) ? (row.formas_pagamento as string[]) : [],
    prazo_pagamento: row.prazo_pagamento ?? undefined,
    contatos: Array.isArray(row.contatos) ? (row.contatos as Contato[]) : [],
    produtos_negociados: Array.isArray(row.produtos_negociados)
      ? (row.produtos_negociados as ProdutoNegociadoFicha[])
      : [],
    observacoes: row.observacoes ?? undefined,
    telefone: row.telefone ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    codigo_cliente: row.codigo_cliente ?? undefined,
    is_ponto_venda: row.is_ponto_venda ?? false,
    pdv_ativo: row.pdv_ativo ?? true,
    pdv_tipo: row.pdv_tipo ?? undefined,
    pdv_atualizado_por: row.pdv_atualizado_por ?? undefined,
    pdv_atualizado_em: row.pdv_atualizado_em ?? undefined,
    pdv_removido_por: row.pdv_removido_por ?? undefined,
    pdv_removido_em: row.pdv_removido_em ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function profileToRow(input: Partial<ClientProfileInput>) {
  // Mantém somente strings vazias como null para compatibilidade do índice único de CNPJ
  const cleanCnpj = input.cnpj?.trim();
  return {
    nome: input.nome,
    nome_fantasia: input.nome_fantasia || null,
    cnpj: cleanCnpj ? cleanCnpj : null,
    tipo_documento: input.tipo_documento === "CPF" ? "CPF" : "CNPJ",
    inscricao_estadual: input.inscricao_estadual || null,
    inscricao_municipal: input.inscricao_municipal || null,
    segmento: input.segmento || null,
    ramo_atividade: input.ramo_atividade || null,
    empresa: input.empresa || null,
    vendedor: input.vendedor || null,
    cep: input.cep || null,
    rua: input.rua || null,
    numero: input.numero || null,
    complemento: input.complemento || null,
    bairro: input.bairro || null,
    cidade: input.cidade || null,
    estado: input.estado || null,
    regiao: input.regiao || null,
    entrega_mesmo_endereco: input.entrega_mesmo_endereco ?? true,
    entrega_cep: input.entrega_cep || null,
    entrega_rua: input.entrega_rua || null,
    entrega_numero: input.entrega_numero || null,
    entrega_complemento: input.entrega_complemento || null,
    entrega_bairro: input.entrega_bairro || null,
    entrega_cidade: input.entrega_cidade || null,
    entrega_estado: input.entrega_estado || null,
    horario_manha_inicio: input.horario_manha_inicio || null,
    horario_manha_fim: input.horario_manha_fim || null,
    horario_tarde_inicio: input.horario_tarde_inicio || null,
    horario_tarde_fim: input.horario_tarde_fim || null,
    dias_rota: input.dias_rota ?? [],
    formas_pagamento: input.formas_pagamento ?? [],
    prazo_pagamento: input.prazo_pagamento || null,
    contatos: input.contatos ?? [],
    produtos_negociados: input.produtos_negociados ?? [],
    observacoes: input.observacoes || null,
    telefone: input.telefone || null,
    whatsapp: input.whatsapp || null,
    codigo_cliente: input.codigo_cliente || null,
    is_ponto_venda: input.is_ponto_venda ?? false,
    pdv_ativo: input.pdv_ativo ?? true,
    pdv_tipo: input.pdv_tipo || null,
  };
}

function normKey(value: string | null | undefined): string {
  return normalizeClientName(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function syncAliasesForProfiles() {
  const { data, error } = await supabase
    .from("client_aliases" as any)
    .select("alias_name, canonical_name");
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as any[]) {
    if (row?.alias_name && row?.canonical_name) map[row.alias_name] = row.canonical_name;
  }
  setDynamicAliases(map);
}

function mergeArrays<T>(a: T[], b: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...a, ...b]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergeProfile(base: ClientProfile, duplicate: ClientProfile, canonicalName: string): ClientProfile {
  const merged: ClientProfile = { ...duplicate, ...base, nome: canonicalName };
  const scalarKeys: Array<keyof ClientProfile> = [
    "nome_fantasia", "cnpj", "inscricao_estadual", "inscricao_municipal", "segmento", "ramo_atividade",
    "empresa", "vendedor", "cep", "rua", "numero", "complemento", "bairro", "cidade", "estado", "regiao",
    "entrega_cep", "entrega_rua", "entrega_numero", "entrega_complemento", "entrega_bairro", "entrega_cidade",
    "entrega_estado", "horario_manha_inicio", "horario_manha_fim", "horario_tarde_inicio", "horario_tarde_fim",
    "prazo_pagamento", "observacoes", "telefone", "whatsapp", "codigo_cliente", "pdv_tipo",
  ];
  for (const key of scalarKeys) {
    if (!merged[key] && duplicate[key]) (merged as any)[key] = duplicate[key];
  }
  merged.dias_rota = mergeArrays(base.dias_rota ?? [], duplicate.dias_rota ?? []);
  merged.formas_pagamento = mergeArrays(base.formas_pagamento ?? [], duplicate.formas_pagamento ?? []);
  merged.contatos = mergeArrays(base.contatos ?? [], duplicate.contatos ?? []);
  merged.produtos_negociados = mergeArrays(base.produtos_negociados ?? [], duplicate.produtos_negociados ?? []);
  merged.is_ponto_venda = Boolean(base.is_ponto_venda || duplicate.is_ponto_venda);
  merged.pdv_ativo = Boolean(base.pdv_ativo || duplicate.pdv_ativo);
  merged.created_at = base.created_at < duplicate.created_at ? base.created_at : duplicate.created_at;
  merged.updated_at = base.updated_at > duplicate.updated_at ? base.updated_at : duplicate.updated_at;
  return merged;
}

function consolidateProfiles(profiles: ClientProfile[]): ClientProfile[] {
  const byCanonical = new Map<string, ClientProfile>();
  for (const profile of profiles) {
    const canonical = normalizeClientName(profile.nome || profile.nome_fantasia || "");
    if (!canonical || isExcludedClientName(canonical)) continue;
    const key = normKey(canonical);
    const normalizedProfile: ClientProfile = { ...profile, nome: canonical };
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, normalizedProfile);
      continue;
    }
    const existingIsCanonical = normKey(existing.nome) === key;
    const currentIsCanonical = normKey(profile.nome) === key;
    const base = currentIsCanonical && !existingIsCanonical ? normalizedProfile : existing;
    const duplicate = base === existing ? normalizedProfile : existing;
    byCanonical.set(key, mergeProfile(base, duplicate, canonical));
  }
  return [...byCanonical.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Busca pontual da ficha (endereço/contato) de um cliente que não está na lista
 * já carregada — usado no preenchimento automático de formulários.
 */
export async function fetchClientProfileByIdentity(
  nome: string,
  cnpj?: string,
): Promise<ClientProfile | undefined> {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  if (digits.length >= 11) {
    const { data } = await (supabase as any)
      .from("client_profiles")
      .select("*")
      .ilike("cnpj", `%${digits}%`)
      .limit(1);
    if (data?.length) return rowToProfile(data[0]);
  }
  const termo = (nome ?? "").trim().replace(/[%,()*]/g, " ");
  if (!termo) return undefined;
  const { data } = await (supabase as any)
    .from("client_profiles")
    .select("*")
    .or(`nome.ilike.${termo},nome_fantasia.ilike.${termo}`)
    .limit(1);
  return data?.length ? rowToProfile(data[0]) : undefined;
}

/** Localiza uma ficha existente pelo CNPJ, ignorando pontuação/máscara. */
export async function findClientProfileByCnpj(cnpj: string): Promise<ClientProfile | null> {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  if (digits.length < 11) return null;
  const { data, error } = await (supabase as any)
    .from("client_profiles")
    .select("*")
    .not("cnpj", "is", null);
  if (error) throw error;
  const hit = (data ?? []).find((row: any) => String(row.cnpj ?? "").replace(/\D/g, "") === digits);
  return hit ? rowToProfile(hit) : null;
}

function isEmptyValue(v: any) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Atualiza uma ficha existente sem apagar dados já salvos:
 * apenas campos preenchidos no formulário sobrescrevem o cadastro.
 */
export function useMergeUpdateClientProfile() {
  const qc = useQueryClient();
  const scope = useVendorScope();
  return useMutation({
    mutationFn: async (payload: { id: string; data: Partial<ClientProfileInput> }) => {
      await exigirEscopoRegistros(scope, "fichas de clientes", { tabela: "client_profiles", ids: [payload.id], novosVendedores: [payload.data.vendedor] });
      const { data: currentRow, error: currentErr } = await (supabase as any)
        .from("client_profiles")
        .select("*")
        .eq("id", payload.id)
        .single();
      if (currentErr) throw currentErr;
      const current = rowToProfile(currentRow);
      const row = profileToRow(payload.data) as Record<string, any>;
      // Listas relacionadas: acrescenta sem duplicar e sem apagar o que já existe
      row.contatos = mergeArrays(current.contatos ?? [], payload.data.contatos ?? []);
      row.produtos_negociados = mergeArrays(
        current.produtos_negociados ?? [],
        payload.data.produtos_negociados ?? [],
      );
      row.dias_rota = mergeArrays(current.dias_rota ?? [], payload.data.dias_rota ?? []);
      row.formas_pagamento = mergeArrays(current.formas_pagamento ?? [], payload.data.formas_pagamento ?? []);
      const patch: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === "boolean") {
          patch[key] = value;
          continue;
        }
        if (!isEmptyValue(value)) patch[key] = value;
      }
      const { data, error } = await (supabase as any)
        .from("client_profiles")
        .update(patch)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return rowToProfile(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useClientProfiles() {
  const scope = useVendorScope();
  return useQuery({
    queryKey: [...QK, vendorScopeKey(scope)],
    select: useCallback((rows: ClientProfile[]) => scope.filtrar(rows, (r) => r.vendedor ?? null, (r) => r.nome), [scope]),
    queryFn: async (): Promise<ClientProfile[]> => {
      await syncAliasesForProfiles();
      const { data, error } = await (supabase as any)
        .from("client_profiles")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return consolidateProfiles((data ?? []).map(rowToProfile));
    },
  });
}

export function useUpsertClientProfile() {
  const qc = useQueryClient();
  const scope = useVendorScope();
  return useMutation({
    mutationFn: async (payload: { id?: string; data: ClientProfileInput }) => {
      await exigirEscopoRegistros(scope, "fichas de clientes", { tabela: "client_profiles", ids: payload.id ? [payload.id] : [], novosVendedores: [payload.data.vendedor] });
      const row = profileToRow(payload.data);
      if (payload.id) {
        const { data, error } = await (supabase as any)
          .from("client_profiles")
          .update(row)
          .eq("id", payload.id)
          .select()
          .single();
        if (error) throw error;
        return rowToProfile(data);
      }
      const { data, error } = await (supabase as any)
        .from("client_profiles")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return rowToProfile(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

/**
 * Atualização parcial de uma ficha (usada por Ponto de Venda e importação de endereços).
 * Não sobrescreve campos não informados.
 */
export function usePatchClientProfile() {
  const qc = useQueryClient();
  const scope = useVendorScope();
  return useMutation({
    mutationFn: async (payload: { id: string; patch: Record<string, any> }) => {
      await exigirEscopoRegistros(scope, "fichas de clientes", { tabela: "client_profiles", ids: [payload.id], novosVendedores: [payload.patch.vendedor] });
      const { error } = await (supabase as any)
        .from("client_profiles")
        .update(payload.patch)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useBulkPatchClientProfiles() {
  const qc = useQueryClient();
  const scope = useVendorScope();
  return useMutation({
    mutationFn: async (updates: Array<{ id: string; patch: Record<string, any> }>) => {
      await exigirEscopoRegistros(scope, "fichas de clientes", {
        tabela: "client_profiles",
        ids: updates.map((u) => u.id),
        novosVendedores: updates.map((u) => u.patch.vendedor),
      });
      for (const u of updates) {
        const { error } = await (supabase as any)
          .from("client_profiles")
          .update(u.patch)
          .eq("id", u.id);
        if (error) throw error;
      }
      return updates.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}


export function useDeleteClientProfile() {
  const qc = useQueryClient();
  const { exigir } = useModuleCrud("cadastro_clientes", "fichas de clientes");
  const scope = useVendorScope();
  return useMutation({
    mutationFn: async (id: string) => {
      exigir("excluir"); // individual e em lote
      await exigirEscopoRegistros(scope, "fichas de clientes", { tabela: "client_profiles", ids: [id] });
      const { error } = await (supabase as any).from("client_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

/**
 * Criação em lote de fichas a partir da planilha comercial "PDV Atuais".
 * Recebe linhas já no formato da tabela (nome, cnpj, codigo_cliente, ...).
 */
export function useCreateClientProfilesRaw() {
  const qc = useQueryClient();
  const scope = useVendorScope();
  return useMutation({
    mutationFn: async (rows: Array<Record<string, any>>) => {
      await exigirEscopoRegistros(scope, "fichas de clientes", { novosVendedores: rows.map((r) => r.vendedor) });
      const created: Array<{ id: string; nome: string }> = [];
      const size = 200;
      for (let i = 0; i < rows.length; i += size) {
        const { data, error } = await (supabase as any)
          .from("client_profiles")
          .insert(rows.slice(i, i + size))
          .select("id, nome");
        if (error) throw error;
        created.push(...((data ?? []) as Array<{ id: string; nome: string }>));
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
