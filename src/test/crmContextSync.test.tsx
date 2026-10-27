import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { criarFakeDb, criarFakeSupabase, gravarComoOutroUsuario, type FakeDb } from "./fakeCrmSupabase";

// CrmProvider real + Supabase simulado (dados fictícios): a tela só reflete
// o que o banco confirmou ou o que ainda está pendente, nunca um falso sucesso.
const mocks = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  auth: { user: { id: "usuario-ficticio" } as { id: string } | null },
  toasts: [] as { title: string; variant?: string }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() { return criarFakeSupabase(mocks.db); },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ nome: "Usuário Fictício" }) }));
vi.mock("@/hooks/useVendorScope", () => ({ useVendorScope: () => ({ vendedorPadrao: "VENDEDOR A", travado: true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title: string; variant?: string }) => mocks.toasts.push(t) }));

import { CrmProvider, useCrm } from "@/contexts/CrmContext";

const T0 = "2026-10-27T09:00:00.000Z";
const leadNoBanco = (id: string, nome: string) =>
  gravarComoOutroUsuario(mocks.db, "crm_leads", {
    id, nome_fantasia: nome, status_pipeline: "AGUARDANDO_AGENDAMENTO", proxima_visita_em: null,
    ultima_visita_status: null, negocio_status: null, negocio_justificativa_id: null, negocio_valor_estimado: null,
    criado_em: T0, atualizado_em: T0,
  });

function montar() {
  const wrapper = ({ children }: { children: ReactNode }) => <CrmProvider>{children}</CrmProvider>;
  return renderHook(() => useCrm(), { wrapper });
}
async function carregado(view: ReturnType<typeof montar>) {
  await waitFor(() => expect(view.result.current.sincronizacao.fase).toBe("sincronizado"));
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  mocks.db = criarFakeDb();
  mocks.auth.user = { id: "usuario-ficticio" };
  mocks.toasts = [];
});

describe("CrmContext — gravação confirmada", () => {
  it("carrega só da nuvem do usuário (sem leads fixos nem cache local)", async () => {
    leadNoBanco("l-500", "Padaria Fictícia");
    localStorage.setItem("crm_snapshot_v1", JSON.stringify({ leads: [{ id: "l-1", nome_fantasia: "Cache de outro vendedor" }], visitas: [] }));
    const view = montar();
    await carregado(view);
    expect(view.result.current.leads.map((l) => l.nome_fantasia)).toEqual(["Padaria Fictícia"]);
  });

  it("criação aceita: aparece como salva na nuvem", async () => {
    const view = montar();
    await carregado(view);
    act(() => { view.result.current.addLead({ nome_fantasia: "Café Fictício" }); });
    await waitFor(() => expect(mocks.db.tabelas.crm_leads.size).toBe(1));
    await waitFor(() => expect(view.result.current.sincronizacao.fase).toBe("sincronizado"));
  });

  it("criação recusada pela RLS: sai da tela e avisa o usuário", async () => {
    mocks.db.negar.insert.add("*");
    const view = montar();
    await carregado(view);
    act(() => { view.result.current.addLead({ nome_fantasia: "Café Fictício" }); });
    await waitFor(() => expect(view.result.current.leads).toHaveLength(0));
    expect(mocks.toasts).toContainEqual(expect.objectContaining({ title: "Não salvo na nuvem: Café Fictício", variant: "destructive" }));
    expect(view.result.current.sincronizacao.fase).not.toBe("salvando");
  });

  it("exclusão do lead e das visitas chega ao banco", async () => {
    leadNoBanco("l-500", "Padaria Fictícia");
    const view = montar();
    await carregado(view);
    act(() => { view.result.current.agendarVisita("l-500", "2026-10-30"); });
    await waitFor(() => expect(mocks.db.tabelas.crm_visitas.size).toBe(1));
    act(() => { view.result.current.deleteLead("l-500", "teste"); });
    await waitFor(() => expect(mocks.db.tabelas.crm_leads.size).toBe(0));
    expect(mocks.db.tabelas.crm_visitas.size).toBe(0);
  });

  it("logout limpa os dados da tela e encerra a sincronização", async () => {
    leadNoBanco("l-500", "Padaria Fictícia");
    const view = montar();
    await carregado(view);
    mocks.auth.user = null;
    view.rerender();
    await waitFor(() => expect(view.result.current.leads).toHaveLength(0));
    expect(mocks.db.tabelas.crm_leads.size).toBe(1);
  });

  it("falha ao carregar a nuvem: nada é gravado e o indicador avisa", async () => {
    mocks.db.rede = false;
    const view = montar();
    await waitFor(() => expect(view.result.current.sincronizacao.fase).toBe("indisponivel"));
    mocks.db.rede = true;
    act(() => { view.result.current.addLead({ nome_fantasia: "Café Fictício" }); });
    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.db.chamadas).toEqual([]);
    expect(mocks.toasts[0]).toMatchObject({ variant: "destructive" });
  });

  it("justificativas padrão não são apagadas ao carregar a nuvem", async () => {
    const view = montar();
    await carregado(view);
    expect(view.result.current.justificativas.length).toBeGreaterThan(0);
  });
});
