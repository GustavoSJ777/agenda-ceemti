import { describe, expect, it } from "vitest";
import { mensagemErroDb } from "./erros-db";

describe("mensagemErroDb", () => {
  it("RLS vira mensagem de permissão", () => {
    expect(mensagemErroDb({ code: "42501", message: 'new row violates row-level security policy for table "eventos"' })).toBe(
      "Você não tem permissão para realizar esta ação.",
    );
  });
  it("42501 de função própria preserva o texto", () => {
    expect(mensagemErroDb({ code: "42501", message: "Você não pode alterar o próprio papel nem desativar a própria conta." })).toContain("próprio papel");
  });
  it("matrícula duplicada", () => {
    expect(mensagemErroDb({ code: "23505", message: 'duplicate key value violates unique constraint "alunos_matricula_key"' })).toBe("Já existe um aluno com esta matrícula.");
  });
  it("recuperação concluída sem nota", () => {
    expect(mensagemErroDb({ code: "23514", message: 'violates check constraint "rec_concluida_nota_ck"' })).toContain("nota da recuperação");
  });
  it("não vaza detalhes internos de erros desconhecidos", () => {
    expect(mensagemErroDb({ code: "XX000", message: "segredo interno do servidor" })).toBe("Não foi possível concluir a operação.");
  });
});
