import { describe, expect, it } from "vitest";
import { menuDoPapel, podeAcessar, rotuloDoMenu } from "./index";

describe("permissões de menu", () => {
  it("aluno não acessa usuários nem relatórios", () => {
    expect(podeAcessar("aluno", "usuarios")).toBe(false);
    expect(podeAcessar("aluno", "relatorios")).toBe(false);
  });
  it("apenas a direção acessa usuários", () => {
    expect(podeAcessar("direcao", "usuarios")).toBe(true);
    expect(podeAcessar("secretaria", "usuarios")).toBe(false);
    expect(podeAcessar("professor", "usuarios")).toBe(false);
  });
  it("professor acessa alunos e anotações; secretaria não vê recuperações como escrita (só rota)", () => {
    expect(podeAcessar("professor", "alunos")).toBe(true);
    expect(podeAcessar("professor", "anotacoes")).toBe(true);
    expect(podeAcessar("secretaria", "recuperacoes")).toBe(true);
  });
  it("coordenador gerencia o horário e não acessa áreas administrativas", () => {
    expect(podeAcessar("coordenador", "horario")).toBe(true);
    expect(podeAcessar("direcao", "horario")).toBe(true);
    for (const x of ["usuarios", "alunos", "relatorios", "turmas"]) expect(podeAcessar("coordenador", x)).toBe(false);
    for (const x of ["professor", "aluno", "secretaria"] as const) expect(podeAcessar(x, "horario")).toBe(false);
  });
  it("o menu do aluno não inclui áreas administrativas", () => {
    const ids = menuDoPapel("aluno").map((m) => m.id);
    expect(ids).toContain("dashboard");
    for (const proibido of ["alunos", "turmas", "relatorios", "usuarios", "anotacoes"]) expect(ids).not.toContain(proibido);
  });
  it("professor vê 'Minhas turmas' em vez de 'Turmas e Disciplinas'", () => {
    const item = menuDoPapel("professor").find((m) => m.id === "turmas")!;
    expect(rotuloDoMenu(item, "professor")).toBe("Minhas turmas");
    expect(rotuloDoMenu(item, "direcao")).toBe("Turmas e Disciplinas");
  });
});
