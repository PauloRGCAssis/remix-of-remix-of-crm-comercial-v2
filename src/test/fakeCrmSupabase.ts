// Supabase simulado em memória para crm_leads / crm_visitas (dados fictícios).
// Reproduz o comportamento relevante do PostgREST:
// - INSERT bloqueado pela RLS devolve erro 42501;
// - UPDATE/DELETE bloqueados pela RLS não devolvem erro: afetam 0 linhas;
// - queda de rede devolve erro "Failed to fetch";
// - o banco define a própria versão (atualizado_em) a cada gravação.

type Linha = { id: string; payload: Record<string, unknown>; atualizado_em: string; [coluna: string]: unknown };
type Erro = { code: string; message: string };

export interface FakeDb {
  tabelas: Record<string, Map<string, Linha>>;
  usuario: string | null;
  rede: boolean;
  /** Ids bloqueados pela RLS por operação ("*" = todos). */
  negar: { insert: Set<string>; update: Set<string>; delete: Set<string> };
  /** Erro fixo por operação (ex.: 23505 no insert). */
  erroFixo: { insert?: Erro };
  chamadas: string[];
  /** Executado antes de cada gravação (permite simular logout no meio). */
  antesDeGravar?: () => void;
  relogio: number;
}

export function criarFakeDb(): FakeDb {
  return {
    tabelas: { crm_leads: new Map(), crm_visitas: new Map() },
    usuario: "usuario-ficticio",
    rede: true,
    negar: { insert: new Set(), update: new Set(), delete: new Set() },
    erroFixo: {},
    chamadas: [],
    relogio: 0,
  };
}

const ERRO_REDE: Erro = { code: "", message: "TypeError: Failed to fetch" };

function versao(db: FakeDb) {
  db.relogio += 1;
  return new Date(Date.UTC(2026, 9, 27, 12, 0, db.relogio)).toISOString();
}

function negado(conjunto: Set<string>, id: string) {
  return conjunto.has("*") || conjunto.has(id);
}

/** Grava diretamente no banco, como se outro usuário tivesse alterado o registro. */
export function gravarComoOutroUsuario(db: FakeDb, tabela: string, payload: Record<string, unknown>) {
  const linha = { id: String(payload.id), payload, atualizado_em: versao(db) };
  db.tabelas[tabela].set(linha.id, linha);
  return linha;
}

export function criarFakeSupabase(db: FakeDb) {
  function from(tabela: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let dados: Record<string, unknown> | Record<string, unknown>[] | null = null;
    const filtros: Record<string, unknown> = {};

    const executar = (): { data: unknown; error: Erro | null } => {
      const linhas = db.tabelas[tabela];
      if (op !== "select") {
        db.antesDeGravar?.();
        db.chamadas.push(`${tabela}:${op}:${String(filtros.id ?? (Array.isArray(dados) ? dados.map((d) => d.id).join(",") : (dados as Record<string, unknown> | null)?.id))}`);
      }
      if (!db.rede) return { data: null, error: ERRO_REDE };
      const casa = (l: Linha) => Object.entries(filtros).every(([c, v]) => l[c] === v);
      if (op === "select") return { data: [...linhas.values()].filter(casa), error: null };
      if (op === "insert") {
        const novas = (Array.isArray(dados) ? dados : [dados]) as Record<string, unknown>[];
        if (db.erroFixo.insert) return { data: null, error: db.erroFixo.insert };
        for (const n of novas) {
          if (negado(db.negar.insert, String(n.id))) {
            return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "' + tabela + '"' } };
          }
          if (linhas.has(String(n.id))) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        const gravadas = novas.map((n) => {
          const linha = { ...n, id: String(n.id), payload: n.payload as Record<string, unknown>, atualizado_em: versao(db) } as Linha;
          linhas.set(linha.id, linha);
          return linha;
        });
        return { data: gravadas, error: null };
      }
      const alvo = [...linhas.values()].filter(casa).filter((l) => !negado(op === "update" ? db.negar.update : db.negar.delete, l.id));
      if (op === "update") {
        const atualizadas = alvo.map((l) => {
          const linha = { ...l, ...(dados as Record<string, unknown>), id: l.id, atualizado_em: versao(db) } as Linha;
          linhas.set(l.id, linha);
          return linha;
        });
        return { data: atualizadas, error: null };
      }
      for (const l of alvo) linhas.delete(l.id);
      return { data: alvo, error: null };
    };

    const query = {
      select: () => query,
      insert: (d: Record<string, unknown> | Record<string, unknown>[]) => { op = "insert"; dados = d; return query; },
      update: (d: Record<string, unknown>) => { op = "update"; dados = d; return query; },
      delete: () => { op = "delete"; return query; },
      eq: (coluna: string, valor: unknown) => { filtros[coluna] = valor; return query; },
      maybeSingle: () => {
        const r = executar();
        const lista = r.data as unknown[] | null;
        return Promise.resolve({ data: lista?.[0] ?? null, error: r.error });
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(executar()).then(resolve, reject),
    };
    return query;
  }

  return {
    from,
    auth: { getUser: () => Promise.resolve({ data: { user: db.usuario ? { id: db.usuario } : null }, error: null }) },
  };
}
