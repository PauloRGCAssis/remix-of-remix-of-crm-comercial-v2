import { describe, expect, it } from "vitest";
import { optimizeRoute, type RouteItem } from "@/lib/routeOptimization";

function createVisita(id: string, bairro: string, horario?: string): RouteItem {
  return {
    id,
    lead_id: `lead-${id}`,
    data_visita: "2026-03-18",
    horario_visita: horario,
    status: "AGENDADA",
    criado_em: "2026-03-17T10:00:00.000Z",
    atualizado_em: "2026-03-17T10:00:00.000Z",
    lead: {
      id: `lead-${id}`,
      nome_fantasia: `Cliente ${bairro}`,
      bairro,
      status_pipeline: "AGENDADO",
      criado_em: "2026-03-17T10:00:00.000Z",
      atualizado_em: "2026-03-17T10:00:00.000Z",
    },
  };
}

describe("optimizeRoute", () => {
  it("mantém Zona Sul e Centro-Sul antes de Nova Granada", () => {
    const route = optimizeRoute([
      createVisita("1", "Nova Granada", "13:00"),
      createVisita("2", "Centro"),
      createVisita("3", "Serra"),
      createVisita("4", "Mangabeiras", "09:01"),
      createVisita("5", "Savassi"),
      createVisita("6", "Funcionários"),
    ]);

    expect(route.map((item) => item.lead?.bairro)).toEqual([
      "Mangabeiras",
      "Serra",
      "Savassi",
      "Funcionários",
      "Centro",
      "Nova Granada",
    ]);
  });

  it("finaliza clientes próximos do Oeste antes de empurrar Pampulha e regiões mais distantes", () => {
    const route = optimizeRoute([
      createVisita("1", "Pampulha"),
      createVisita("2", "Calafate"),
      createVisita("3", "Nova Granada"),
      createVisita("4", "Buritis"),
    ]);

    expect(route.map((item) => item.lead?.bairro)).toEqual([
      "Calafate",
      "Nova Granada",
      "Buritis",
      "Pampulha",
    ]);
  });
});
