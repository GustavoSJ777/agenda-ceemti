import { describe, expect, it } from "vitest";
import { aulasDoDia, diaIso, materiasDoDia, horaCurta, vigenciaDoDia, type AulaHorario } from "./horario";

const a = (o: Partial<AulaHorario>): AulaHorario => ({
  id: Math.random().toString(), turma_codigo: "T1", dia_semana: 1, aula: 1, inicio: "07:30:00", fim: "08:20:00",
  disciplina: "MAT", professor: null, sala: null, vigente_desde: "2026-03-02", ...o,
});

describe("horário do dia", () => {
  it("segunda = 1 e domingo = 7", () => { expect(diaIso(1)).toBe(1); expect(diaIso(0)).toBe(7); });
  it("filtra por dia, turma e vigência e ordena por aula", () => {
    const lista = [a({ aula: 2, disciplina: "LP" }), a({ aula: 1 }), a({ dia_semana: 2 }), a({ turma_codigo: "T2" }), a({ vigente_desde: "2027-01-01" })];
    const r = aulasDoDia(lista, "2026-11-23", 1, new Set(["T1"]));
    expect(r.map((x) => x.disciplina)).toEqual(["MAT", "LP"]);
  });
  it("usa só a vigência mais recente que já começou", () => {
    const lista = [a({ disciplina: "VELHA" }), a({ disciplina: "NOVA", vigente_desde: "2026-08-03" })];
    expect(aulasDoDia(lista, "2026-09-01", 1).map((x) => x.disciplina)).toEqual(["NOVA"]);
    expect(aulasDoDia(lista, "2026-05-04", 1).map((x) => x.disciplina)).toEqual(["VELHA"]);
  });
  it("lista matérias distintas na ordem e ignora eletiva/clube", () => {
    const l = [a({ aula: 1, disciplina: "MAT" }), a({ aula: 2, disciplina: "LP" }), a({ aula: 3, disciplina: "MAT" }), a({ aula: 8, disciplina: "ELETIVA" }), a({ aula: 9, disciplina: "CLUBE" })];
    expect(materiasDoDia(l)).toEqual(["MAT", "LP"]);
  });
  it("escolhe a vigência em vigor (ou a mais antiga se nenhuma começou)", () => {
    const l = [a({ vigente_desde: "2026-03-02" }), a({ vigente_desde: "2026-08-03" })];
    expect(vigenciaDoDia(l, "2026-05-01")).toBe("2026-03-02");
    expect(vigenciaDoDia(l, "2026-09-01")).toBe("2026-08-03");
    expect(vigenciaDoDia(l, "2026-01-01")).toBe("2026-03-02");
    expect(vigenciaDoDia([], "2026-01-01")).toBeUndefined();
  });
  it("formata hora", () => { expect(horaCurta("07:30:00")).toBe("07h30"); expect(horaCurta("13:00:00")).toBe("13h"); });
});
