import { describe, expect, it } from "vitest";

import { getCommercialWeeks } from "../lib/commercialWeeks";

describe("getCommercialWeeks", () => {
  it("considera 30/03 a 03/04 como semana 1 de abril", () => {
    const weeks = getCommercialWeeks("2020-04");

    expect(weeks[0]).toMatchObject({
      index: 1,
      monday: "2020-03-30",
      friday: "2020-04-03",
      label: "Semana 1 — 30/03 a 03/04",
    });
  });

  it("mantém 27/04 a 01/05 em abril, então maio começa em 04/05", () => {
    const aprilWeeks = getCommercialWeeks("2020-04");
    const mayWeeks = getCommercialWeeks("2020-05");

    expect(aprilWeeks[aprilWeeks.length - 1]).toMatchObject({
      monday: "2020-04-27",
      friday: "2020-05-01",
    });
    expect(mayWeeks[0]).toMatchObject({
      index: 1,
      monday: "2020-05-04",
      friday: "2020-05-08",
      label: "Semana 1 — 04/05 a 08/05",
    });
    expect(mayWeeks.some((week) => week.monday === "2020-04-27")).toBe(false);
  });
});
