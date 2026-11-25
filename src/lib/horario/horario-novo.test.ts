import { describe, expect, it } from "vitest";
import { descreverDisponibilidade, disponibilidadeParaRestricoes } from "./disponibilidade";
import { interpretarAula, interpretarDia, interpretarLinhas } from "./planilha";
import { indisponivel } from "./tipos";

describe("disponibilidade do professor", () => {
  it("só após as 13h (6ª aula) e de segunda a quinta", () => {
    const r = disponibilidadeParaRestricoes([1, 2, 3, 4], 6, 7);
    const ind = r.map((x) => ({ professor: "CHARLES", ...x }));
    expect(indisponivel(ind, "charles", 1, 5)).toBe(true);   // segunda de manhã: não pode
    expect(indisponivel(ind, "charles", 1, 6)).toBe(false);  // segunda à tarde: pode
    expect(indisponivel(ind, "charles", 4, 7)).toBe(false);
    expect(indisponivel(ind, "charles", 5, 6)).toBe(true);   // sexta: dia todo bloqueado
    expect(indisponivel(ind, "charles", 5, 1)).toBe(true);
  });
  it("limita também o fim do dia", () => {
    const r = disponibilidadeParaRestricoes([1, 2, 3, 4, 5], 1, 5);
    expect(r).toHaveLength(5);
    expect(r.every((x) => x.aula_de === 6 && x.aula_ate === 7)).toBe(true);
  });
  it("sem restrição quando está livre toda a semana", () => {
    expect(disponibilidadeParaRestricoes([1, 2, 3, 4, 5], 1, 7)).toEqual([]);
  });
  it("descreve em texto", () => {
    expect(descreverDisponibilidade([1, 2, 3, 4], 6, 7)).toBe("Disponibilidade: Seg a Qui, a partir das 13h20");
    expect(descreverDisponibilidade([2, 4], 1, 5)).toBe("Disponibilidade: Ter, Qui, até 12h");
  });
});

describe("planilha de horário", () => {
  it("interpreta dia e aula", () => {
    expect(interpretarDia("Segunda")).toBe(1);
    expect(interpretarDia("sex")).toBe(5);
    expect(interpretarDia("3ª feira")).toBe(2);
    expect(interpretarDia("sábado")).toBeNull();
    expect(interpretarAula("3ª")).toBe(3);
    expect(interpretarAula("10")).toBeNull();
  });
  it("separa linhas válidas das inválidas e repetidas", () => {
    const b = (o: Partial<Record<string, string>>, linha = 2) => ({ linha, turma: "T1", dia: "seg", aula: "1", materia: "MAT", professor: "ANA", sala: "SALA 1", ...o });
    const r = interpretarLinhas([b({}), b({ materia: "LP" }, 3), b({ dia: "dom" }, 4), b({ materia: "" }, 5), b({ aula: "2", professor: "" }, 6)]);
    expect(r.validas.map((x) => `${x.dia_semana}|${x.aula}|${x.disciplina}`)).toEqual(["1|1|MAT", "1|2|MAT"]);
    expect(r.validas[0].inicio).toBe("07:30");
    expect(r.ignoradas.map((x) => x.linha)).toEqual([3, 4, 5]);
  });
});
