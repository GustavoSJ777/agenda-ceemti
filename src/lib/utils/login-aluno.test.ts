import { describe, expect, it } from "vitest";
import { emailDaMatricula, emailDeLogin, matriculaValidaParaLogin } from "./login-aluno";

describe("login por matrícula", () => {
  it("converte matrícula em e-mail interno", () => {
    expect(emailDeLogin("2026001")).toBe("2026001@aluno.ceemti.example.com");
    expect(emailDeLogin("  AB-123 ")).toBe("ab-123@aluno.ceemti.example.com");
    expect(emailDaMatricula("X1")).toBe("x1@aluno.ceemti.example.com");
  });
  it("mantém e-mail real e valida o formato", () => {
    expect(emailDeLogin("Ana@Escola.com")).toBe("ana@escola.com");
    expect(emailDeLogin("ana@")).toBeNull();
  });
  it("recusa vazio e caracteres perigosos", () => {
    expect(emailDeLogin("")).toBeNull();
    expect(emailDeLogin("a b")).toBeNull();
    expect(emailDeLogin("../x")).toBeNull();
    expect(matriculaValidaParaLogin("2026/001")).toBe(false);
    expect(matriculaValidaParaLogin("2026001")).toBe(true);
  });
});
