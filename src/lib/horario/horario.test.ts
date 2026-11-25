import { describe, expect, it } from "vitest";
import { gerarHorario } from "./gerador";
import { detectarConflitos, sugerirSolucoes, type AulaGrade } from "./conflitos";
import type { Demanda, Indisponibilidade } from "./tipos";

const dm = (id: string, turma: string, disc: string, prof: string, n: number, sala: string | null = null): Demanda => ({ id, turma_codigo: turma, disciplina: disc, professor: prof, aulas_semana: n, sala });

describe("gerador de horário", () => {
  const turmas = [{ codigo: "T1", sala_base: "SALA 01" }, { codigo: "T2", sala_base: "SALA 02" }];
  const demandas = [dm("1", "T1", "MAT", "ANA", 4), dm("2", "T1", "LP", "BIA", 3), dm("3", "T2", "MAT", "ANA", 4), dm("4", "T2", "LP", "BIA", 3)];

  it("aloca tudo sem choques de turma, professor ou sala", () => {
    const r = gerarHorario({ turmas, demandas, indisp: [], salas: [] });
    expect(r.naoAlocadas).toEqual([]);
    expect(r.aulas).toHaveLength(14);
    const vistos = new Set<string>();
    for (const a of r.aulas) for (const k of [`t|${a.turma_codigo}|${a.dia_semana}|${a.aula}`, `p|${a.professor}|${a.dia_semana}|${a.aula}`, `s|${a.sala}|${a.dia_semana}|${a.aula}`]) {
      expect(vistos.has(k)).toBe(false); vistos.add(k);
    }
  });
  it("respeita a indisponibilidade do professor (só trabalha à tarde na segunda)", () => {
    const ind: Indisponibilidade[] = [{ professor: "ana", dia_semana: 1, aula_de: 1, aula_ate: 5 }];
    const r = gerarHorario({ turmas, demandas, indisp: ind, salas: [] });
    expect(r.aulas.filter((a) => a.professor === "ANA" && a.dia_semana === 1 && a.aula <= 5)).toEqual([]);
    expect(r.naoAlocadas).toEqual([]);
  });
  it("é determinístico para a mesma semente", () => {
    const a = gerarHorario({ turmas, demandas, indisp: [], salas: [], semente: 7 });
    const b = gerarHorario({ turmas, demandas, indisp: [], salas: [], semente: 7 });
    expect(a.aulas).toEqual(b.aulas);
  });
  it("relata o que não coube e avisa excesso de carga", () => {
    const r = gerarHorario({ turmas: [turmas[0]], demandas: [dm("1", "T1", "MAT", "ANA", 20), dm("2", "T1", "LP", "BIA", 20)], indisp: [], salas: [] });
    expect(r.naoAlocadas.length).toBeGreaterThan(0);
    expect(r.avisos[0]).toMatch(/comporta 35/);
  });
  it("usa a sala fixa da disciplina e não deixa duas turmas nela ao mesmo tempo", () => {
    const r = gerarHorario({ turmas, demandas: [dm("1", "T1", "LAB", "ANA", 5, "LAB. MAT"), dm("2", "T2", "LAB", "BIA", 5, "LAB. MAT")], indisp: [], salas: [] });
    const slots = r.aulas.map((a) => `${a.dia_semana}|${a.aula}`);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe("conflitos e sugestões", () => {
  const g = (id: string, turma: string, dia: number, aula: number, disc: string, prof: string, sala = "SALA 01"): AulaGrade => ({ id, turma_codigo: turma, dia_semana: dia, aula, disciplina: disc, professor: prof, sala });
  const ind: Indisponibilidade[] = [{ professor: "XAVIER", dia_semana: 1, aula_de: 1, aula_ate: 5 }];

  it("detecta professor fora da disponibilidade e professor em duas turmas", () => {
    const aulas = [g("a", "T1", 1, 2, "MAT", "XAVIER"), g("b", "T1", 2, 1, "LP", "BIA"), g("c", "T2", 2, 1, "LP", "BIA", "SALA 02")];
    const c = detectarConflitos(aulas, ind);
    expect(c.some((x) => x.tipo === "professor_indisponivel" && x.aulaId === "a")).toBe(true);
    expect(c.filter((x) => x.tipo === "professor_duplo")).toHaveLength(2);
  });
  it("detecta sala usada por duas turmas, mas tolera espaços compartilhados", () => {
    const dupla = detectarConflitos([g("a", "T1", 1, 1, "X", "P1"), g("b", "T2", 1, 1, "Y", "P2")], []);
    expect(dupla.filter((x) => x.tipo === "sala_duplo")).toHaveLength(2);
    expect(detectarConflitos([g("a", "T1", 1, 1, "X", "P1", "QUADRA"), g("b", "T2", 1, 1, "Y", "P2", "QUADRA")], [])).toEqual([]);
  });
  it("sugere mover para horário livre em que o professor pode e trocar com outra aula", () => {
    const aulas = [g("a", "T1", 1, 2, "MAT", "XAVIER"), g("b", "T1", 1, 6, "LP", "BIA"), g("c", "T1", 1, 7, "FIL", "CAIO")];
    const s = sugerirSolucoes("a", aulas, ind);
    const mover = s.filter((x) => x.tipo === "mover");
    expect(mover.length).toBeGreaterThan(0);
    // nunca sugere horário em que o professor é indisponível
    for (const m of mover) if (m.tipo === "mover") expect(m.dia === 1 && m.aula <= 5).toBe(false);
    // trocar com a aula da tarde de segunda é válido (XAVIER só trabalha à tarde)
    expect(s.some((x) => x.tipo === "trocar" && x.com === "b")).toBe(true);
  });
});
