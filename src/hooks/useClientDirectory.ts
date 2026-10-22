import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExcludedClientName, normalizeClientName } from "@/lib/clientNameNormalization";
import { clientMatchScore, digitsOnly, matchesClientQuery, normalizeSearchText } from "@/lib/clientSearch";

/**
 * Base OFICIAL e COMPLETA de clientes para qualquer campo de busca do sistema.
 * Fonte: view `client_directory` = cadastro (client_profiles)
 *      + clientes com vendas importadas (SIGE / sales_raw_rows ativas)
 *      + nomes alternativos (client_aliases).
 * Sem filtro por vendedor, período, faturamento ou existência de ação.
 *
 * A busca é feita no servidor (a base tem milhares de clientes e o retorno da API
 * é limitado), garantindo que qualquer cliente existente seja encontrado.
 */
export interface ClientDirectoryEntry {
  nome: string;
  nomeFantasia?: string;
  cnpj?: string;
  vendedor?: string;
  cidade?: string;
  bairro?: string;
  origens: Set<"cadastro" | "vendas" | "alias">;
  aliases: string[];
  ultimaCompra?: string;
}

interface Row {
  nome: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  vendedor: string | null;
  cidade: string | null;
  bairro: string | null;
  origem: "cadastro" | "vendas" | "alias";
  ultima_compra: string | null;
  canonical: string | null;
}

const COLUMNS = "nome, nome_fantasia, cnpj, vendedor, cidade, bairro, origem, ultima_compra, canonical";

function escapeIlike(term: string) {
  return term.replace(/[%,()*]/g, " ").trim();
}

/**
 * @param search termo digitado pelo usuário (opcional). Sem termo, retorna uma
 * amostra inicial apenas para exibir a lista antes da digitação.
 */
export function useClientDirectory(search = "") {
  // Debounce curto: evita uma requisição por tecla digitada.
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const term = normalizeSearchText(debounced);
  const tokens = term.split(" ").filter((t) => t.length >= 2).slice(0, 4);
  const digits = digitsOnly(debounced);

  const query = useQuery({
    queryKey: ["client-directory", tokens.join("+"), digits.length >= 3 ? digits : ""],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = (supabase as any).from("client_directory").select(COLUMNS).limit(600);

      for (const token of tokens) {
        const safe = escapeIlike(token);
        if (!safe) continue;
        q = q.or(
          [
            `nome.ilike.%${safe}%`,
            `nome_fantasia.ilike.%${safe}%`,
            `cidade.ilike.%${safe}%`,
            `canonical.ilike.%${safe}%`,
          ].join(","),
        );
      }
      if (!tokens.length && digits.length >= 3) {
        q = q.ilike("cnpj", `%${digits}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const entries = useMemo<ClientDirectoryEntry[]>(() => {
    const map = new Map<string, ClientDirectoryEntry>();

    for (const row of query.data ?? []) {
      const raw = (row.nome ?? "").trim();
      if (!raw) continue;

      // Aliases apontam para o cadastro principal (clientes unificados).
      const canonical = (row.canonical ?? "").trim() || normalizeClientName(raw) || raw;
      if (isExcludedClientName(canonical)) continue;

      const key = canonical.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = { nome: canonical, origens: new Set(), aliases: [] };
        map.set(key, entry);
      }
      entry.origens.add(row.origem);
      if (raw.toLowerCase() !== key && !entry.aliases.includes(raw)) entry.aliases.push(raw);
      if (!entry.nomeFantasia && row.nome_fantasia) entry.nomeFantasia = row.nome_fantasia;
      if (!entry.cnpj && row.cnpj) entry.cnpj = row.cnpj;
      if (!entry.vendedor && row.vendedor) entry.vendedor = row.vendedor;
      if (!entry.cidade && row.cidade) entry.cidade = row.cidade;
      if (!entry.bairro && row.bairro) entry.bairro = row.bairro;
      if (row.ultima_compra && (!entry.ultimaCompra || row.ultima_compra > entry.ultimaCompra)) {
        entry.ultimaCompra = row.ultima_compra;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [query.data]);

  return { entries, isLoading: query.isLoading, error: query.error };
}

/** Refina localmente o resultado já trazido do servidor. */
export function searchClientDirectory(
  entries: ClientDirectoryEntry[],
  term: string,
  limit = 60,
): ClientDirectoryEntry[] {
  const q = term.trim();
  const list = q
    ? entries.filter((e) =>
        matchesClientQuery(q, [e.nome, e.nomeFantasia, ...e.aliases, e.cidade, e.vendedor], e.cnpj),
      )
    : entries;

  if (!q) return list.slice(0, limit);

  return [...list]
    .sort((a, b) => {
      const diff = clientMatchScore(q, b.nome) - clientMatchScore(q, a.nome);
      if (diff !== 0) return diff;
      return a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, limit);
}

/**
 * Base COMPLETA (sem termo de busca) usada para cruzamentos em lote — por exemplo
 * a associação automática dos registros de endereço com o cadastro oficial.
 */
export function useFullClientDirectory() {
  return useQuery({
    queryKey: ["client-directory-full"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const all: Row[] = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await (supabase as any)
          .from("client_directory")
          .select(COLUMNS)
          .range(from, from + size - 1);
        if (error) throw error;
        const rows = (data ?? []) as Row[];
        all.push(...rows);
        if (rows.length < size) break;
      }
      return all;
    },
  });
}
