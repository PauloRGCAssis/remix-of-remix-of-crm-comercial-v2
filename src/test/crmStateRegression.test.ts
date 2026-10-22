import { describe, expect, it } from "vitest";

import { chooseReliableSnapshot, type CrmSnapshot } from "@/lib/crmPersistence";
import { repairCrmSnapshot } from "@/lib/crmSnapshotRepair";
import type { Lead } from "@/types/crm";

function createLead(overrides: Partial<Lead>): Lead {
  return {
    id: "l-1",
    nome_fantasia: "Cliente Teste",
    status_pipeline: "EM_NEGOCIACAO",
    proxima_visita_em: null,
    ultima_visita_status: "REALIZADA",
    negocio_status: null,
    negocio_justificativa_id: null,
    negocio_valor_estimado: null,
    criado_em: "2026-03-20T10:00:00.000Z",
    atualizado_em: "2026-03-20T10:00:00.000Z",
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<CrmSnapshot>): CrmSnapshot {
  return {
    leads: [],
    visitas: [],
    justificativas: [],
    leadsExcluidos: [],
    idCounter: 100,
    savedAt: "2026-03-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("chooseReliableSnapshot", () => {
  it("preserves the newest pipeline state when a lead moves backward", () => {
    const olderSnapshot = createSnapshot({
      leads: [
        createLead({
          id: "l-144",
          nome_fantasia: "Colégio Magnum Cidade Nova",
          status_pipeline: "EM_NEGOCIACAO",
          atualizado_em: "2026-03-24T09:00:00.000Z",
        }),
      ],
      savedAt: "2026-03-24T09:00:00.000Z",
    });

    const newerSnapshot = createSnapshot({
      leads: [
        createLead({
          id: "l-144",
          nome_fantasia: "Colégio Magnum Cidade Nova",
          status_pipeline: "AGUARDANDO_AGENDAMENTO",
          ultima_visita_status: null,
          atualizado_em: "2026-03-25T09:00:00.000Z",
        }),
      ],
      savedAt: "2026-03-25T09:00:00.000Z",
    });

    const chosen = chooseReliableSnapshot([olderSnapshot, newerSnapshot]);

    expect(chosen?.leads[0].status_pipeline).toBe("AGUARDANDO_AGENDAMENTO");
  });
});

describe("repairCrmSnapshot", () => {
  it("removes duplicate lead ids while keeping the latest variant", () => {
    const repaired = repairCrmSnapshot(
      createSnapshot({
        leads: [
          createLead({
            id: "l-501",
            nome_fantasia: "Colégio Magnum Cid Nova",
            status_pipeline: "NEGOCIACAO_CONCRETIZADA",
            ultima_visita_status: "CONCLUIDA_SUCESSO",
            negocio_status: "FECHADO",
            atualizado_em: "2026-03-24T09:00:00.000Z",
          }),
          createLead({
            id: "l-777",
            nome_fantasia: "Colégio Magnum Cidade Nova",
            status_pipeline: "AGUARDANDO_AGENDAMENTO",
            ultima_visita_status: null,
            negocio_status: null,
            atualizado_em: "2026-03-25T09:00:00.000Z",
          }),
        ],
      }),
    );

    const canonicalNames = repaired.leads.map((lead) => lead.nome_fantasia);
    expect(new Set(canonicalNames).size).toBe(repaired.leads.length);
  });

  it("merges duplicate client names and keeps the newest scheduled state", () => {
    const repaired = repairCrmSnapshot(
      createSnapshot({
        leads: [
          createLead({
            id: "l-100",
            nome_fantasia: "Xino Sambô",
            status_pipeline: "AGUARDANDO_AGENDAMENTO",
            ultima_visita_status: null,
            proxima_visita_em: null,
            atualizado_em: "2026-03-20T09:00:00.000Z",
          }),
          createLead({
            id: "l-200",
            nome_fantasia: "Xino Sambo",
            status_pipeline: "AGENDADO",
            ultima_visita_status: "AGENDADA",
            proxima_visita_em: "2026-03-28",
            atualizado_em: "2026-03-21T09:00:00.000Z",
          }),
        ],
        visitas: [
          {
            id: "v-1",
            lead_id: "l-200",
            data_visita: "2026-03-28",
            horario_visita: "09:00",
            status: "AGENDADA",
            criado_em: "2026-03-21T09:00:00.000Z",
            atualizado_em: "2026-03-21T09:00:00.000Z",
          },
        ],
      }),
    );

    expect(repaired.leads).toHaveLength(1);
    expect(repaired.leads[0].status_pipeline).toBe("AGENDADO");
    expect(repaired.leads[0].proxima_visita_em).toBe("2026-03-28");
    expect(repaired.visitas[0].lead_id).toBe(repaired.leads[0].id);
  });

  it("keeps the manual stage when the newest duplicate moved back to aguardando", () => {
    const repaired = repairCrmSnapshot(
      createSnapshot({
        leads: [
          createLead({
            id: "l-300",
            nome_fantasia: "Colégio Magnum Cidade Nova",
            status_pipeline: "AGENDADO",
            ultima_visita_status: "AGENDADA",
            proxima_visita_em: "2026-03-28",
            atualizado_em: "2026-03-20T09:00:00.000Z",
          }),
          createLead({
            id: "l-301",
            nome_fantasia: "Colégio Magnum Cid Nova",
            status_pipeline: "AGUARDANDO_AGENDAMENTO",
            ultima_visita_status: null,
            proxima_visita_em: null,
            atualizado_em: "2026-03-21T09:00:00.000Z",
          }),
        ],
        visitas: [
          {
            id: "v-2",
            lead_id: "l-300",
            data_visita: "2026-03-28",
            horario_visita: "10:00",
            status: "AGENDADA",
            criado_em: "2026-03-20T09:00:00.000Z",
            atualizado_em: "2026-03-20T09:00:00.000Z",
          },
        ],
      }),
    );

    expect(repaired.leads).toHaveLength(1);
    expect(repaired.leads[0].status_pipeline).toBe("AGUARDANDO_AGENDAMENTO");
    expect(repaired.leads[0].proxima_visita_em).toBeNull();
    expect(repaired.leads[0].ultima_visita_status).toBeNull();
    expect(repaired.visitas[0].status).toBe("AGENDADA");
  });

  it("keeps agendado leads in place even when there is no active scheduled visit", () => {
    const repaired = repairCrmSnapshot(
      createSnapshot({
        leads: [
          createLead({
            id: "l-900",
            nome_fantasia: "Cafeteria Expresso Café",
            status_pipeline: "AGENDADO",
            ultima_visita_status: "AGENDADA",
            proxima_visita_em: "2026-04-01",
            atualizado_em: "2026-03-27T18:51:12.898Z",
          }),
        ],
        visitas: [
          {
            id: "v-900",
            lead_id: "l-900",
            data_visita: "2026-04-01",
            status: "CANCELADA",
            criado_em: "2026-03-27T18:51:12.898Z",
            atualizado_em: "2026-03-27T18:51:12.898Z",
          },
        ],
      }),
    );

    expect(repaired.leads[0].status_pipeline).toBe("AGENDADO");
    expect(repaired.leads[0].proxima_visita_em).toBe("2026-04-01");
    expect(repaired.leads[0].ultima_visita_status).toBe("AGENDADA");
  });

  it("does not promote a lead when the visit history is ahead of the saved pipeline", () => {
    const repaired = repairCrmSnapshot(
      createSnapshot({
        leads: [
          createLead({
            id: "l-698",
            nome_fantasia: "Escola da Serra",
            status_pipeline: "AGENDADO",
            ultima_visita_status: "AGENDADA",
            proxima_visita_em: "2026-03-18",
            atualizado_em: "2026-03-17T18:05:52.088Z",
          }),
        ],
        visitas: [
          {
            id: "v-698-a",
            lead_id: "l-698",
            data_visita: "2026-03-18",
            status: "AGENDADA",
            criado_em: "2026-03-17T18:05:52.088Z",
            atualizado_em: "2026-03-17T18:05:52.088Z",
          },
          {
            id: "v-698-b",
            lead_id: "l-698",
            data_visita: "2026-03-25",
            status: "REALIZADA",
            criado_em: "2026-03-25T18:52:52.261Z",
            atualizado_em: "2026-03-25T18:52:52.261Z",
          },
        ],
      }),
    );

    expect(repaired.leads[0].status_pipeline).toBe("AGENDADO");
    expect(repaired.leads[0].ultima_visita_status).toBe("AGENDADA");
    expect(repaired.leads[0].proxima_visita_em).toBe("2026-03-18");
  });

  it("keeps the newest visit version when the same visit id appears in multiple snapshots", () => {
    const olderSnapshot = createSnapshot({
      leads: [
        createLead({
          id: "l-800",
          nome_fantasia: "Padaria Sarah",
          status_pipeline: "AGENDADO",
          ultima_visita_status: "AGENDADA",
          proxima_visita_em: "2026-03-19",
          atualizado_em: "2026-03-17T18:11:00.279Z",
        }),
      ],
      visitas: [
        {
          id: "v-800",
          lead_id: "l-800",
          data_visita: "2026-03-19",
          status: "AGENDADA",
          criado_em: "2026-03-17T18:11:00.279Z",
          atualizado_em: "2026-03-17T18:11:00.279Z",
        },
      ],
      savedAt: "2026-03-17T18:11:00.279Z",
    });

    const newerSnapshot = createSnapshot({
      leads: [
        createLead({
          id: "l-800",
          nome_fantasia: "Padaria Sarah",
          status_pipeline: "AGENDADO",
          ultima_visita_status: "AGENDADA",
          proxima_visita_em: "2026-03-19",
          atualizado_em: "2026-03-17T18:11:00.279Z",
        }),
      ],
      visitas: [
        {
          id: "v-800",
          lead_id: "l-800",
          data_visita: "2026-03-19",
          status: "REALIZADA",
          criado_em: "2026-03-17T18:11:00.279Z",
          atualizado_em: "2026-03-19T19:00:00.000Z",
        },
      ],
      savedAt: "2026-03-19T19:00:00.000Z",
    });

    const chosen = chooseReliableSnapshot([olderSnapshot, newerSnapshot]);

    expect(chosen?.visitas).toHaveLength(1);
    expect(chosen?.visitas[0].status).toBe("REALIZADA");
    expect(chosen?.leads[0].status_pipeline).toBe("AGENDADO");
  });
});
