import { describe, expect, it } from "vitest";
import { esquemaRelatorio } from "./relatorios";

describe("validação de relatórios", () => {
  it("período é obrigatório para provas", () => {
    expect(esquemaRelatorio.safeParse({ tipo: "provas" }).success).toBe(false);
    expect(esquemaRelatorio.safeParse({ tipo: "provas", inicio: "2026-01-01", fim: "2026-12-31" }).success).toBe(true);
  });
  it("recusa período invertido", () => {
    expect(esquemaRelatorio.safeParse({ tipo: "eventos", inicio: "2026-05-02", fim: "2026-05-01" }).success).toBe(false);
  });
  it("alunos não exige período e aceita filtros vazios", () => {
    const r = esquemaRelatorio.safeParse({ tipo: "alunos", ano: "2026", turma: "", sit: "" });
    expect(r.success).toBe(true);
  });
  it("recusa tipo desconhecido e UUID inválido", () => {
    expect(esquemaRelatorio.safeParse({ tipo: "x" }).success).toBe(false);
    expect(esquemaRelatorio.safeParse({ tipo: "alunos", turma: "abc" }).success).toBe(false);
  });
});
