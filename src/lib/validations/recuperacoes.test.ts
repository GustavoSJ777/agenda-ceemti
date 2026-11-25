import { describe, expect, it } from "vitest";
import { esquemaRecuperacao } from "./recuperacoes";

const id = "00000000-0000-4000-8000-000000000701";
const base = { turma_id: id, aluno_id: id, disciplina_id: id };

describe("validação de recuperações", () => {
  it("concluída exige nota da recuperação", () => {
    expect(esquemaRecuperacao.safeParse({ ...base, situacao: "concluida" }).success).toBe(false);
    expect(esquemaRecuperacao.safeParse({ ...base, situacao: "concluida", nota_recuperacao: "7,5" }).success).toBe(true);
  });
  it("aceita vírgula decimal e converte", () => {
    expect(esquemaRecuperacao.parse({ ...base, situacao: "pendente", nota_anterior: "4,5" }).nota_anterior).toBe(4.5);
  });
  it("recusa nota maior que 10", () => {
    expect(esquemaRecuperacao.safeParse({ ...base, situacao: "pendente", nota_anterior: "11" }).success).toBe(false);
  });
  it("notas são opcionais", () => {
    expect(esquemaRecuperacao.safeParse({ ...base, situacao: "pendente" }).success).toBe(true);
  });
});
