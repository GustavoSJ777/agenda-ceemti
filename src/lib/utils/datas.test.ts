import { describe, expect, it } from "vitest";
import { addDias, diaDaSemana, fmtData, hojeISO } from "./datas";

describe("datas", () => {
  it("formata sem deslocar o dia", () => expect(fmtData("2026-03-01")).toBe("01/03/2026"));
  it("trata vazio", () => expect(fmtData(null)).toBe("—"));
  it("soma dias atravessando o mês", () => expect(addDias("2026-01-31", 1)).toBe("2026-02-01"));
  it("dia da semana", () => expect(diaDaSemana("2026-11-23")).toBe(1));
  it("hoje usa o fuso de Brasília", () => {
    // 02:00 UTC de 24/11 ainda é 23/11 em Brasília (UTC-3)
    expect(hojeISO(new Date("2026-11-24T02:00:00Z"))).toBe("2026-11-23");
  });
});
