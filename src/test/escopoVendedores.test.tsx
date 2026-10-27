import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

// Escopo de vendedores e clientes (Problema 5) com os hooks reais
// useVendorScope / useClientScope e o helper de gravação. Permissões,
// fichas, vendas e Supabase são simulados (dados fictícios).
type Linha = { id: string; vendedor: string | null; cliente?: string; nome?: string };
const mocks = vi.hoisted(() => ({
  perms: {
    loading: false,
    vendedoresPermitidos: [] as string[] | null,
    clientesPermitidos: null as string[] | null,
    regioesPermitidas: null as string[] | null,
    gruposBloqueiam: false,
  },
  fichas: [] as { nome: string; vendedor: string | null }[],
  vendas: [] as { cliente: string; vendedor: string }[],
  banco: {} as Record<string, Linha[]>,
  regioes: [] as { nome: string; nome_fantasia: string | null; regiao: string }[],
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.perms }));
vi.mock("@/hooks/useClientProfiles", () => ({ useClientProfiles: () => ({ data: mocks.fichas }) }));
vi.mock("@/hooks/useSalesData", () => ({ useSalesData: () => ({ data: mocks.vendas }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const filtros: { col?: string; valores?: unknown[] } = {};
      const query = {
        select: () => query,
        in: (col: string, valores: unknown[]) => { filtros.col = col; filtros.valores = valores; return query; },
        then: (resolve: (v: unknown) => unknown) => {
          if (tabela === "client_profiles" && filtros.col === "regiao") {
            return Promise.resolve({ data: mocks.regioes.filter((r) => filtros.valores!.includes(r.regiao)), error: null }).then(resolve);
          }
          const linhas = (mocks.banco[tabela] ?? []).filter((l) => filtros.valores!.includes(l.id));
          return Promise.resolve({ data: linhas, error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

import { useVendorScope, ForaDoEscopoError } from "@/hooks/useVendorScope";
import { useClientScope } from "@/hooks/useClientScope";
import { sameVendor } from "@/hooks/useUserRole";
import { exigirEscopoRegistros } from "@/lib/escopoGravacao";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const escopo = () => renderHook(() => ({ v: useVendorScope(), c: useClientScope() }), { wrapper });

// Registros fictícios de Degustações (com e sem vendedor).
const DEGUSTACOES: Linha[] = [
  { id: "d-a", vendedor: "VENDEDOR A", cliente: "PADARIA SAO JOSE" },
  { id: "d-b", vendedor: "VENDEDOR B", cliente: "PADARIA SAO JOSE" }, // homônimo / compartilhado com B
  { id: "d-b2", vendedor: "VENDEDOR B", cliente: "CAFE EXCLUSIVO B" },
  { id: "d-legado", vendedor: null, cliente: "PADARIA SAO JOSE" },
  { id: "d-legado-b", vendedor: null, cliente: "CAFE EXCLUSIVO B" },
];
const VENDAS = [
  { cliente: "PADARIA SAO JOSE", vendedor: "VENDEDOR A" },
  { cliente: "CAFE EXCLUSIVO B", vendedor: "VENDEDOR B" },
];
const ids = (rows: Linha[]) => rows.map((r) => r.id);

function carteira(vendedores: string[] | null) {
  mocks.perms.vendedoresPermitidos = vendedores;
  // Fichas e vendas chegam ao useClientScope já filtradas pela carteira.
  mocks.vendas = vendedores === null ? VENDAS : VENDAS.filter((v) => vendedores.includes(v.vendedor));
}

beforeEach(() => {
  cleanup();
  Object.assign(mocks.perms, { loading: false, vendedoresPermitidos: [], clientesPermitidos: null, regioesPermitidas: null, gruposBloqueiam: false });
  mocks.fichas = [];
  mocks.vendas = [];
  mocks.banco = { degustacoes: DEGUSTACOES };
  mocks.regioes = [];
});

describe("escopo — carteiras", () => {
  it("vendedor A vê só a carteira autorizada", () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    expect(ids(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente))).toEqual(["d-a", "d-legado"]);
  });
  it("vendedor B não vê registros exclusivos de A", () => {
    carteira(["VENDEDOR B"]);
    const { result } = escopo();
    const vis = ids(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente));
    expect(vis).not.toContain("d-a");
    expect(vis).toEqual(["d-b", "d-b2", "d-legado-b"]);
  });
  it("usuário autorizado a A e B vê as duas carteiras", () => {
    carteira(["VENDEDOR A", "VENDEDOR B"]);
    const { result } = escopo();
    expect(ids(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente))).toEqual(ids(DEGUSTACOES));
  });
  it("escopo da empresa vê tudo", () => {
    carteira(null);
    const { result } = escopo();
    expect(result.current.v.semRestricao).toBe(true);
    expect(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente)).toHaveLength(DEGUSTACOES.length);
  });
  it("usuário sem carteira não ganha acesso irrestrito", () => {
    carteira([]);
    const { result } = escopo();
    expect(result.current.v.todos).toBe(false);
    expect(result.current.v.filtrar([{ vendedor: "VENDEDOR A" }], (r) => r.vendedor)).toEqual([]);
    expect(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente)).toEqual([]);
  });
});

describe("escopo — clientes", () => {
  it("cliente compartilhado: cada vendedor vê só os registros do próprio vendedor", () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    const vis = ids(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente));
    expect(vis).toContain("d-a");
    expect(vis).not.toContain("d-b"); // antes: visível pelo nome do cliente
  });
  it("clientes homônimos com donos diferentes não se misturam pelo nome", () => {
    carteira(["VENDEDOR B"]);
    const { result } = escopo();
    expect(result.current.c.podeVerRegistro("VENDEDOR A", "PADARIA SAO JOSE")).toBe(false);
  });
  it("registro sem vendedor segue a regra legada por nome do cliente", () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    expect(result.current.c.podeVerRegistro(null, "PADARIA SAO JOSE")).toBe(true);
    expect(result.current.c.podeVerRegistro(null, "CAFE EXCLUSIVO B")).toBe(false);
  });
  it("escopo personalizado com clientes restringe mesmo com a empresa inteira", () => {
    carteira(null);
    mocks.perms.clientesPermitidos = ["Cafe Exclusivo B"];
    const { result } = escopo();
    expect(result.current.v.semRestricao).toBe(false);
    expect(ids(result.current.c.filtrarRegistros(DEGUSTACOES, (r) => r.vendedor, (r) => r.cliente))).toEqual(["d-b2", "d-legado-b"]);
    expect(result.current.v.filtrar(VENDAS, (r) => r.vendedor, (r) => r.cliente)).toEqual([VENDAS[1]]);
  });
  it("escopo personalizado por região libera os clientes das fichas da região", async () => {
    carteira(null);
    mocks.perms.regioesPermitidas = ["NORTE"];
    mocks.regioes = [{ nome: "PADARIA SAO JOSE", nome_fantasia: null, regiao: "NORTE" }];
    const { result } = escopo();
    expect(result.current.v.filtrar(VENDAS, (r) => r.vendedor, (r) => r.cliente)).toEqual([]); // carregando: nada a mais
    await waitFor(() => expect(result.current.v.filtrar(VENDAS, (r) => r.vendedor, (r) => r.cliente)).toEqual([VENDAS[0]]));
  });
  it("escopo com grupos econômicos bloqueia em vez de liberar tudo", () => {
    carteira(null);
    mocks.perms.gruposBloqueiam = true;
    const { result } = escopo();
    expect(result.current.v.filtrar(VENDAS, (r) => r.vendedor, (r) => r.cliente)).toEqual([]);
  });
});

describe("escopo — nomes de vendedor", () => {
  it("nome curto e completo do mesmo vendedor casam", () => {
    expect(sameVendor("Juliano", "JULIANO CARNEIRO DA SILVA")).toBe(true);
    expect(sameVendor("João Paulo", "JOAO PAULO SOUZA")).toBe(true);
  });
  it("prefixo de outro vendedor não amplia a carteira", () => {
    expect(sameVendor("Joao", "JOAO PAULO SOUZA")).toBe(false);
    expect(sameVendor("Juliano", "EDNEI JULIANO")).toBe(false);
  });
});

describe("escopo — alteração de carteira na sessão", () => {
  it("nova carteira passa a valer assim que as permissões são relidas", () => {
    carteira(["VENDEDOR A"]);
    const view = escopo();
    expect(view.result.current.v.podeVer("VENDEDOR B")).toBe(false);
    carteira(["VENDEDOR A", "VENDEDOR B"]);
    view.rerender();
    expect(view.result.current.v.podeVer("VENDEDOR B")).toBe(true);
    carteira([]);
    view.rerender();
    expect(view.result.current.v.podeVer("VENDEDOR A")).toBe(false);
  });
});

describe("escopo — gravação fora da carteira", () => {
  it("editar registro de outro vendedor é recusado (vendedor lido do banco)", async () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    await expect(exigirEscopoRegistros(result.current.v, "degustações", { tabela: "degustacoes", ids: ["d-b"] }))
      .rejects.toBeInstanceOf(ForaDoEscopoError);
  });
  it("excluir registro legado de cliente de outra carteira é recusado", async () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    await expect(exigirEscopoRegistros(result.current.v, "degustações", {
      tabela: "degustacoes", ids: ["d-legado-b"], campoCliente: "cliente", podeVerRegistro: result.current.c.podeVerRegistro,
    })).rejects.toBeInstanceOf(ForaDoEscopoError);
  });
  it("registro que o login não consegue ler conta como fora do escopo", async () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    await expect(exigirEscopoRegistros(result.current.v, "degustações", { tabela: "degustacoes", ids: ["nao-existe"] }))
      .rejects.toBeInstanceOf(ForaDoEscopoError);
  });
  it("atribuir o registro a vendedor de outra carteira é recusado", async () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    await expect(exigirEscopoRegistros(result.current.v, "degustações", { tabela: "degustacoes", ids: ["d-a"], novosVendedores: ["VENDEDOR B"] }))
      .rejects.toBeInstanceOf(ForaDoEscopoError);
  });
  it("editar registro próprio é permitido", async () => {
    carteira(["VENDEDOR A"]);
    const { result } = escopo();
    await expect(exigirEscopoRegistros(result.current.v, "degustações", {
      tabela: "degustacoes", ids: ["d-a", "d-legado"], campoCliente: "cliente", podeVerRegistro: result.current.c.podeVerRegistro,
    })).resolves.toBeUndefined();
  });
});
