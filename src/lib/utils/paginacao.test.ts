import { describe, expect, it } from "vitest";
import { intervalo, lerPagina, termoSeguro } from "./paginacao";

describe("paginação", () => {
  it("lê página inválida como 1", () => {
    expect(lerPagina("abc")).toBe(1);
    expect(lerPagina("-3")).toBe(1);
    expect(lerPagina("2")).toBe(2);
  });
  it("calcula o intervalo", () => expect(intervalo(3, 20)).toEqual([40, 59]));
  it("neutraliza caracteres de filtro PostgREST", () => {
    expect(termoSeguro("ana),nome.eq.x")).not.toMatch(/[,()]/);
  });
});
