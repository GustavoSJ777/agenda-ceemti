import { describe, expect, it } from "vitest";
import { listarProfessores } from "@/lib/horario/professores";
import { descreverDisponibilidade, disponibilidadeParaRestricoes, restricoesParaDisponibilidade } from "@/lib/horario/disponibilidade";

describe("listarProfessores", () => {
  it("junta cadastro, matérias, grade e restrições sem repetir", () => {
    const r = listarProfessores({
      cadastrados: [{ id: "1", nome: "Charles" }],
      demandas: [{ professor: "CHARLES" }, { professor: "CLEIDE / ABRAÃO" }],
      aulas: [{ professor: "DANIEL." }, { professor: "Daniel" }, { professor: null }],
      indisp: [{ professor: "abraão" }],
    });
    expect(r.map((p) => p.nome)).toEqual(["ABRAÃO", "CLEIDE", "Charles", "DANIEL"].sort((a, b) => a.localeCompare(b, "pt-BR")));
    const charles = r.find((p) => p.nome === "Charles")!;
    expect(charles).toMatchObject({ cadastroId: "1", materias: 1 });
    expect(r.find((p) => p.nome.startsWith("DANIEL"))!.aulasNaGrade).toBe(2);
  });
});

describe("restricoesParaDisponibilidade", () => {
  it("devolve o que foi informado (Charles: seg a qui, a partir da 6ª)", () => {
    const faixas = disponibilidadeParaRestricoes([1, 2, 3, 4], 6, 7);
    expect(restricoesParaDisponibilidade(faixas)).toEqual({ dias: [1, 2, 3, 4], de: 6, ate: 7 });
    expect(descreverDisponibilidade([1, 2, 3, 4], 6, 7)).toContain("a partir das 13h20");
  });
  it("faixa que termina cedo e sem restrições", () => {
    expect(restricoesParaDisponibilidade(disponibilidadeParaRestricoes([2, 4], 1, 5))).toEqual({ dias: [2, 4], de: 1, ate: 5 });
    expect(restricoesParaDisponibilidade([])).toEqual({ dias: [1, 2, 3, 4, 5], de: 1, ate: 7 });
  });
});
