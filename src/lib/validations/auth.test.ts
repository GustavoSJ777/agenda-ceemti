import { describe, expect, it } from "vitest";
import { esquemaLogin, esquemaNovaSenha } from "./auth";

describe("validação de autenticação", () => {
  it("normaliza o e-mail", () => {
    expect(esquemaLogin.parse({ email: "  Pessoa@Escola.COM ", senha: "x" }).email).toBe("pessoa@escola.com");
  });
  it("recusa e-mail malformado ou login vazio", () => {
    expect(esquemaLogin.safeParse({ email: "abc@", senha: "x" }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: "a b", senha: "x" }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: "  ", senha: "x" }).success).toBe(false);
  });
  it("aceita matrícula e converte para o e-mail interno", () => {
    expect(esquemaLogin.parse({ email: "2026001", senha: "x" }).email).toBe("2026001@aluno.ceemti.example.com");
  });
  it("nova senha exige 8 caracteres e confirmação igual", () => {
    expect(esquemaNovaSenha.safeParse({ senha: "1234567", senha2: "1234567" }).success).toBe(false);
    expect(esquemaNovaSenha.safeParse({ senha: "12345678", senha2: "12345679" }).success).toBe(false);
    expect(esquemaNovaSenha.safeParse({ senha: "12345678", senha2: "12345678" }).success).toBe(true);
  });
});
