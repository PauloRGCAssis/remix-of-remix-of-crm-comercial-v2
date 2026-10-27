import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFakeDb, criarFakeSupabase, gravarComoOutroUsuario, type FakeDb } from "./fakeCrmSupabase";
import type { Lead, Visita } from "@/types/crm";

// Sincronização de leads/visitas: estado local × pendente × confirmado,
// contra um Supabase simulado em memória (dados fictícios).
const mocks = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() { return criarFakeSupabase(mocks.db); },
}));

import {
  aplicarReconciliacao,
  CrmCloudSync,
  type FalhaSync,
  type ReconciliacaoCrm,
  type EstadoSync,
} from "@/lib/crmCloudSync";

const T0 = "2026-10-27T10:00:00.000Z";
const T1 = "2026-10-27T10:05:00.000Z";
const T2 = "2026-10-27T10:10:00.000Z";

const lead = (id: string, atualizado_em = T0, extra: Partial<Lead> = {}): Lead => ({
  id, nome_fantasia: `Cliente ${id}`, status_pipeline: "AGUARDANDO_AGENDAMENTO", proxima_visita_em: null,
  ultima_visita_status: null, negocio_status: null, negocio_justificativa_id: null, negocio_valor_estimado: null,
  criado_em: T0, atualizado_em, ...extra,
});
const visita = (id: string, lead_id: string, atualizado_em = T0): Visita => ({
  id, lead_id, data_visita: "2026-10-30", status: "AGENDADA", criado_em: T0, atualizado_em,
});
const nomeNoBanco = (id: string) => (mocks.db.tabelas.crm_leads.get(id)?.payload as unknown as Lead | undefined)?.nome_fantasia;

let falhas: FalhaSync[];
let recs: ReconciliacaoCrm[];
let estados: EstadoSync[];

async function iniciar(...leadsNoBanco: Lead[]) {
  for (const l of leadsNoBanco) gravarComoOutroUsuario(mocks.db, "crm_leads", l as never);
  const sync = new CrmCloudSync("usuario-ficticio", {
    onFalha: (f) => falhas.push(f),
    onReconciliar: (r) => recs.push(r),
    onEstado: (e) => estados.push(e),
  });
  const snap = await sync.carregar();
  return { sync, snap };
}

beforeEach(() => {
  mocks.db = criarFakeDb();
  falhas = [];
  recs = [];
  estados = [];
});
afterEach(() => vi.useRealTimers());

describe("crmCloudSync — criação", () => {
  it("Supabase aceita a criação: confirmado, sem falha", async () => {
    const { sync } = await iniciar();
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(mocks.db.tabelas.crm_leads.has("l-1")).toBe(true);
    expect(sync.confirmado("lead", "l-1", T0)).toBe(true);
    expect(sync.estadoAtual.fase).toBe("sincronizado");
    expect(falhas).toEqual([]);
  });
  it("Supabase rejeita a criação (RLS): falha de permissão e remoção local", async () => {
    const { sync } = await iniciar();
    mocks.db.negar.insert.add("*");
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(falhas.map((f) => [f.tipo, f.operacao, f.id])).toEqual([["permissao", "criar", "l-1"]]);
    expect(recs[0]).toEqual({ entidade: "lead", remover: [{ id: "l-1", seAtualizadoEm: T0 }], restaurar: [] });
    expect(sync.confirmado("lead", "l-1")).toBe(false);
  });
});

describe("crmCloudSync — edição e exclusão", () => {
  it("Supabase rejeita a edição (RLS, 0 linhas): restaura a versão confirmada", async () => {
    const { sync } = await iniciar(lead("l-1"));
    mocks.db.negar.update.add("l-1");
    await sync.sincronizar({ leads: [lead("l-1", T1, { nome_fantasia: "Editado" })], visitas: [] });
    expect(falhas.map((f) => [f.tipo, f.operacao])).toEqual([["permissao", "editar"]]);
    expect(recs[0].restaurar[0]).toMatchObject({ item: { id: "l-1", nome_fantasia: "Cliente l-1" }, seAtualizadoEm: T1 });
    expect(nomeNoBanco("l-1")).toBe("Cliente l-1");
    expect(sync.confirmado("lead", "l-1", T1)).toBe(false);
  });
  it("Supabase rejeita a exclusão (RLS, 0 linhas): registro volta para a tela", async () => {
    const { sync } = await iniciar(lead("l-1"));
    mocks.db.negar.delete.add("l-1");
    sync.registrarExclusao("lead", ["l-1"]);
    await sync.sincronizar({ leads: [], visitas: [] });
    expect(falhas.map((f) => [f.tipo, f.operacao])).toEqual([["permissao", "excluir"]]);
    expect(recs[0].restaurar[0]).toMatchObject({ item: { id: "l-1" }, seAtualizadoEm: null });
    expect(mocks.db.tabelas.crm_leads.has("l-1")).toBe(true);
  });
  it("exclusão aceita remove do banco (antes nunca era enviada)", async () => {
    const { sync } = await iniciar(lead("l-1"));
    sync.registrarExclusao("lead", ["l-1"]);
    await sync.sincronizar({ leads: [], visitas: [] });
    expect(mocks.db.tabelas.crm_leads.has("l-1")).toBe(false);
    expect(falhas).toEqual([]);
  });
  it("lead que sumiu da lista sem exclusão explícita (ex.: junção por nome) não é apagado", async () => {
    const { sync } = await iniciar(lead("l-1"), lead("l-2"));
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(mocks.db.tabelas.crm_leads.has("l-2")).toBe(true);
  });
  it("só os registros alterados são enviados", async () => {
    const { sync } = await iniciar(lead("l-1"), lead("l-2"));
    mocks.db.chamadas = [];
    await sync.sincronizar({ leads: [lead("l-1"), lead("l-2", T1)], visitas: [] });
    expect(mocks.db.chamadas).toEqual(["crm_leads:update:l-2"]);
  });
});

describe("crmCloudSync — rede e sessão", () => {
  it("conexão cai: fica pendente, nada é desfeito, e é reenviado quando volta", async () => {
    const { sync } = await iniciar();
    mocks.db.rede = false;
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(falhas.map((f) => f.tipo)).toEqual(["rede"]);
    expect(recs).toEqual([]);
    expect(sync.estadoAtual).toMatchObject({ fase: "pendente", pendentes: 1 });
    expect(sync.confirmado("lead", "l-1")).toBe(false);

    mocks.db.rede = true;
    await sync.tentarNovamente();
    expect(sync.confirmado("lead", "l-1", T0)).toBe(true);
    expect(sync.estadoAtual.fase).toBe("sincronizado");
    sync.encerrar();
  });
  it("conexão cai: nova tentativa automática agendada", async () => {
    vi.useFakeTimers();
    const { sync } = await iniciar();
    mocks.db.rede = false;
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    mocks.db.rede = true;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sync.confirmado("lead", "l-1", T0)).toBe(true);
  });
  it("usuário sai da conta antes da gravação: nada é gravado", async () => {
    const { sync } = await iniciar();
    mocks.db.usuario = null;
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(mocks.db.chamadas).toEqual([]);
    expect(falhas.map((f) => f.tipo)).toEqual(["autenticacao"]);
    expect(sync.estadoAtual.fase).toBe("erro");
  });
  it("outro usuário entra no mesmo navegador: dados do anterior não vão para a conta dele", async () => {
    const { sync } = await iniciar();
    mocks.db.usuario = "outro-usuario";
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(mocks.db.tabelas.crm_leads.size).toBe(0);
  });
  it("usuário sai durante a gravação: os passos seguintes não são executados", async () => {
    const { sync } = await iniciar();
    mocks.db.antesDeGravar = () => {
      if (mocks.db.chamadas.length === 0) sync.encerrar();
    };
    await sync.sincronizar({ leads: [lead("l-1"), lead("l-2")], visitas: [] });
    expect(mocks.db.chamadas).toEqual(["crm_leads:insert:l-1"]);
  });
  it("sem carga inicial da nuvem nada é gravado", async () => {
    mocks.db.rede = false;
    const sync = new CrmCloudSync("usuario-ficticio", { onEstado: (e) => estados.push(e) });
    expect(await sync.carregar()).toBeNull();
    mocks.db.rede = true;
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(mocks.db.chamadas).toEqual([]);
    expect(sync.estadoAtual.fase).toBe("indisponivel");
  });
});

describe("crmCloudSync — sequência e conflitos", () => {
  it("duas alterações em sequência são confirmadas na ordem", async () => {
    const { sync } = await iniciar(lead("l-1"));
    const a = sync.sincronizar({ leads: [lead("l-1", T1, { nome_fantasia: "Primeira" })], visitas: [] });
    const b = sync.sincronizar({ leads: [lead("l-1", T2, { nome_fantasia: "Segunda" })], visitas: [] });
    await Promise.all([a, b]);
    expect(nomeNoBanco("l-1")).toBe("Segunda");
    expect(sync.confirmado("lead", "l-1", T2)).toBe(true);
    expect(falhas).toEqual([]);
  });
  it("snapshot antigo não regrava sobre versão mais nova confirmada", async () => {
    const { sync } = await iniciar(lead("l-1"));
    await sync.sincronizar({ leads: [lead("l-1", T2, { nome_fantasia: "Nova" })], visitas: [] });
    mocks.db.chamadas = [];
    await sync.sincronizar({ leads: [lead("l-1", T1, { nome_fantasia: "Antiga" })], visitas: [] });
    expect(mocks.db.chamadas).toEqual([]);
    expect(nomeNoBanco("l-1")).toBe("Nova");
  });
  it("alteração de outro usuário não é sobrescrita: conflito, vale a versão do banco", async () => {
    const { sync } = await iniciar(lead("l-1"));
    gravarComoOutroUsuario(mocks.db, "crm_leads", lead("l-1", T1, { nome_fantasia: "Do outro usuário" }) as never);
    await sync.sincronizar({ leads: [lead("l-1", T2, { nome_fantasia: "Minha" })], visitas: [] });
    expect(nomeNoBanco("l-1")).toBe("Do outro usuário");
    expect(falhas.map((f) => [f.tipo, f.operacao])).toEqual([["conflito", "editar"]]);
    expect(recs[0].restaurar[0]).toMatchObject({ item: { nome_fantasia: "Do outro usuário" }, seAtualizadoEm: T2 });
  });
  it("gravação recusada (outro erro) não aparece como confirmada nem é reenviada sem mudança", async () => {
    const { sync } = await iniciar();
    mocks.db.erroFixo.insert = { code: "23505", message: "duplicate key value violates unique constraint" };
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(falhas.map((f) => f.tipo)).toEqual(["outro"]);
    expect(sync.confirmado("lead", "l-1")).toBe(false);
    expect(sync.estadoAtual.fase).toBe("erro");
    expect(recs).toEqual([]); // o registro continua na tela, marcado como não salvo
    mocks.db.chamadas = [];
    await sync.sincronizar({ leads: [lead("l-1")], visitas: [] });
    expect(mocks.db.chamadas).toEqual([]);
  });
  it("visita é gravada com o vendedor do lead", async () => {
    const { sync } = await iniciar();
    await sync.sincronizar({ leads: [lead("l-1", T0, { vendedor: "VENDEDOR A" })], visitas: [visita("v-1", "l-1")] });
    expect(mocks.db.tabelas.crm_visitas.get("v-1")).toMatchObject({ lead_id: "l-1", vendedor: "VENDEDOR A" });
  });
});

describe("aplicarReconciliacao — não desfaz alteração válida mais nova", () => {
  const rec = (r: Partial<ReconciliacaoCrm>): ReconciliacaoCrm => ({ entidade: "lead", remover: [], restaurar: [], ...r });
  it("restaura quando o local ainda está na versão recusada", () => {
    const out = aplicarReconciliacao([lead("l-1", T1, { nome_fantasia: "Recusado" })], rec({ restaurar: [{ item: lead("l-1"), seAtualizadoEm: T1 }] }));
    expect(out[0].nome_fantasia).toBe("Cliente l-1");
  });
  it("não restaura se houve edição local mais nova depois", () => {
    const out = aplicarReconciliacao([lead("l-1", T2, { nome_fantasia: "Mais nova" })], rec({ restaurar: [{ item: lead("l-1"), seAtualizadoEm: T1 }] }));
    expect(out[0].nome_fantasia).toBe("Mais nova");
  });
  it("remove criação recusada só na mesma versão", () => {
    expect(aplicarReconciliacao([lead("l-1", T0)], rec({ remover: [{ id: "l-1", seAtualizadoEm: T0 }] }))).toEqual([]);
    expect(aplicarReconciliacao([lead("l-1", T1)], rec({ remover: [{ id: "l-1", seAtualizadoEm: T0 }] }))).toHaveLength(1);
  });
  it("devolve registro excluído só se ainda estiver ausente", () => {
    expect(aplicarReconciliacao([], rec({ restaurar: [{ item: lead("l-1"), seAtualizadoEm: null }] }))).toHaveLength(1);
  });
});
