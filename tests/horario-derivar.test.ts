import { describe, expect, it } from "vitest";
import { derivarDaGrade, type AulaOrigem } from "@/lib/horario/derivar";

const a = (turma_codigo: string, aula: number, disciplina: string | null, professor: string | null, sala: string | null): AulaOrigem =>
  ({ turma_codigo, aula, disciplina, professor, sala });

describe("derivarDaGrade", () => {
  it("conta aulas por semana, escolhe professor e sala da turma", () => {
    const r = derivarDaGrade([
      a("1A", 1, "MATEMÁTICA", "ANA", "SALA 01"), a("1A", 2, "MATEMÁTICA", "ANA", "SALA 01"), a("1A", 3, "MATEMÁTICA", "ANA", "SALA 01"),
      a("1A", 4, "QUÍMICA", "BRUNO", "LAB 1"), a("1A", 5, "HISTÓRIA", "CAMILA", "SALA 01"),
    ]);
    expect(r.salaBase.get("1A")).toBe("SALA 01");
    const mat = r.demandas.find((d) => d.disciplina === "MATEMÁTICA")!;
    expect(mat).toMatchObject({ professor: "ANA", aulas_semana: 3, sala: null });
    expect(r.demandas.find((d) => d.disciplina === "QUÍMICA")!.sala).toBe("LAB 1");
    expect(r.salas).toEqual(["LAB 1", "SALA 01"]);
  });

  it("ignora 8ª/9ª, linhas sem professor e conta professores diferentes", () => {
    const r = derivarDaGrade([
      a("1A", 8, "ELETIVA", "DIOGO", "SALA 02"),
      a("1A", 1, "ARTE", null, "SALA 01"),
      a("1A", 2, "FÍSICA", "LEO", "SALA 01"), a("1A", 3, "FÍSICA", "LEO", "SALA 01"), a("1A", 4, "FÍSICA", "LUCAS", "SALA 01"),
    ]);
    expect(r.ignoradasFora7).toBe(1);
    expect(r.semProfessor).toBe(1);
    expect(r.variosProfessores).toBe(1);
    expect(r.demandas).toHaveLength(1);
    expect(r.demandas[0]).toMatchObject({ disciplina: "FÍSICA", professor: "LEO", aulas_semana: 3 });
  });

  it("espaços compartilhados não viram sala da turma, mas ficam como sala da matéria", () => {
    const r = derivarDaGrade([a("1A", 1, "ED. FÍSICA", "RAFAEL", "QUADRA"), a("1A", 2, "BIOLOGIA", "SIMONE", "SALA 05"), a("1A", 3, "BIOLOGIA", "SIMONE", "SALA 05")]);
    expect(r.salaBase.get("1A")).toBe("SALA 05");
    expect(r.salas).toEqual(["SALA 05"]);
    expect(r.demandas.find((d) => d.disciplina === "ED. FÍSICA")!.sala).toBe("QUADRA");
  });
});
