import { beforeEach, describe, expect, it } from "vitest";

import {
  applyChanges,
  changedVendors,
  diffChanges,
  findClearedFields,
  legacyMetaDraftKey,
  loadMetaDraft,
  metaDraftKey,
  quarantineDraftKey,
  rebaseValues,
  writeMetaDraft,
  type VendorDraftMap,
} from "@/lib/metaConfigDraft";

const global = {
  pctGasolina: "5", pctVerde: "10", pctRoxa: "10", pctAzul: "20",
  fixoGasolina: "", fixoVerde: "", fixoAzul: "",
};
const row = (g: string, v = "2,00", a = "3,00", z = "4,00") => ({ gasolina: g, verde: v, aceleracao: a, azul: z });

// Valores reais de outubro/2026 (Meta Média) como base de banco.
const db: VendorDraftMap = {
  Ednei: row("114.422,68", "117.855,36", "129.640,89", "141.426,43"),
  Henrique: row("89.979,65", "92.679,04", "101.946,94", "111.214,85"),
  Juliano: row("293.177,76", "296.109,54", "299.070,63", "307.953,92"),
  Vinicius: row("7.000,00", "8.000,00", "9.000,00", "10.000,00"),
};

describe("rascunho de metas — proteção dos valores salvos", () => {
  beforeEach(() => localStorage.clear());

  it("alterar um campo do Ednei grava só esse campo no rascunho", () => {
    const edited = { ...db, Ednei: { ...db.Ednei, gasolina: "120.000,00" } };
    const ch = diffChanges(db, edited, global, global);
    expect(Object.keys(ch.vendor)).toEqual(["Ednei"]);
    expect(Object.keys(ch.vendor.Ednei)).toEqual(["gasolina"]);
  });

  it("aplicar o rascunho muda só o campo alterado; demais vendedores ficam intactos", () => {
    const edited = { ...db, Ednei: { ...db.Ednei, gasolina: "120.000,00" } };
    writeMetaDraft("u1", "2026-10", diffChanges(db, edited, global, global));
    const loaded = loadMetaDraft("u1", "2026-10", db, global);
    expect(loaded.kind).toBe("apply");
    if (loaded.kind !== "apply") return;
    const out = applyChanges(db, global, loaded.changes).vendor;
    expect(out.Ednei.gasolina).toBe("120.000,00");
    expect(out.Ednei.verde).toBe("117.855,36");
    expect(out.Henrique).toEqual(db.Henrique);
    expect(out.Juliano).toEqual(db.Juliano);
    expect(out.Vinicius).toEqual(db.Vinicius);
  });

  it("rascunho com R$ 10.000,00 repetido em vários vendedores não é aplicado", () => {
    const corrupted: VendorDraftMap = Object.fromEntries(
      Object.keys(db).map((v) => [v, row("10.000,00", "10.000,00", "10.000,00", "10.000,00")]),
    );
    localStorage.setItem(
      metaDraftKey("u1", "2026-10"),
      JSON.stringify({ global, vendor: corrupted, baseGlobal: global, baseVendor: db, savedAt: 1, userId: "u1", yearMonth: "2026-10" }),
    );
    const loaded = loadMetaDraft("u1", "2026-10", db, global);
    expect(loaded.kind).toBe("review");
    if (loaded.kind !== "review") return;
    expect(loaded.review.repeatedValue).toBe("10.000,00");
    // o rascunho fica guardado em quarentena, não é apagado
    expect(localStorage.getItem(quarantineDraftKey("u1", "2026-10"))).not.toBeNull();
    expect(localStorage.getItem(metaDraftKey("u1", "2026-10"))).toBeNull();
  });

  it("no rascunho suspeito, a alteração individual legítima é identificada", () => {
    const corrupted: VendorDraftMap = Object.fromEntries(
      Object.keys(db).map((v) => [v, row("10.000,00", "10.000,00", "10.000,00", "10.000,00")]),
    );
    corrupted.Ednei.gasolina = "125.000,00";
    localStorage.setItem(
      metaDraftKey("u1", "2026-10"),
      JSON.stringify({ global, vendor: corrupted, baseGlobal: global, baseVendor: db, savedAt: 1 }),
    );
    const loaded = loadMetaDraft("u1", "2026-10", db, global);
    if (loaded.kind !== "review") throw new Error("esperava revisão");
    expect(loaded.review.individualChanges.vendor).toEqual({
      Ednei: { gasolina: { value: "125.000,00", base: "114.422,68" } },
    });
  });

  it("rascunho antigo sem valores originais nunca é aplicado automaticamente", () => {
    localStorage.setItem(
      legacyMetaDraftKey("2026-10"),
      JSON.stringify({ global, vendor: { ...db, Ednei: { ...db.Ednei, gasolina: "1,00" } }, savedAt: 1 }),
    );
    const loaded = loadMetaDraft("u1", "2026-10", db, global);
    expect(loaded.kind).toBe("review");
  });

  it("separa rascunhos por usuário e por mês", () => {
    const edited = { ...db, Ednei: { ...db.Ednei, gasolina: "1.000,00" } };
    writeMetaDraft("u1", "2026-10", diffChanges(db, edited, global, global));
    expect(loadMetaDraft("u2", "2026-10", db, global).kind).toBe("none");
    expect(loadMetaDraft("u1", "2026-11", db, global).kind).toBe("none");
    expect(loadMetaDraft("u1", "2026-10", db, global).kind).toBe("apply");
  });

  it("valor parcialmente digitado é preservado exatamente", () => {
    const edited = { ...db, Henrique: { ...db.Henrique, azul: "12" } };
    writeMetaDraft("u1", "2026-10", diffChanges(db, edited, global, global));
    const loaded = loadMetaDraft("u1", "2026-10", db, global);
    if (loaded.kind !== "apply") throw new Error("esperava aplicar");
    expect(applyChanges(db, global, loaded.changes).vendor.Henrique.azul).toBe("12");
  });

  it("valores carregados do banco depois de abrir não apagam o que foi digitado", () => {
    const empty: VendorDraftMap = Object.fromEntries(Object.keys(db).map((v) => [v, row("", "", "", "")]));
    const typed = { ...empty, Ednei: { ...empty.Ednei, gasolina: "50,00" } };
    const out = rebaseValues(empty, typed, db);
    expect(out.Ednei.gasolina).toBe("50,00");
    expect(out.Ednei.verde).toBe("117.855,36");
    expect(out.Juliano).toEqual(db.Juliano);
  });

  it("salvar envia somente os vendedores alterados", () => {
    const edited = { ...db, Ednei: { ...db.Ednei, gasolina: "120.000,00" } };
    expect(changedVendors(db, edited)).toEqual(["Ednei"]);
  });

  it("campo esvaziado que tinha meta salva é bloqueado no salvamento", () => {
    const edited = { ...db, Juliano: { ...db.Juliano, verde: "" } };
    expect(findClearedFields(db, edited)).toEqual([{ vendedor: "Juliano", field: "verde" }]);
  });
});
