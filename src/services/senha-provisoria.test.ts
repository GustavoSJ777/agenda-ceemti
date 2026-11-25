import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gerarSenhaProvisoria } from "./senha-provisoria";

describe("senha provisória", () => {
  it("tem 10 caracteres, letras e números, sem ambíguos", () => {
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toHaveLength(10);
      expect(s).toMatch(/[A-Za-z]/);
      expect(s).toMatch(/[0-9]/);
      expect(s).not.toMatch(/[0OIl1]/);
    }
  });
  it("não repete entre gerações", () => {
    const set = new Set(Array.from({ length: 500 }, () => gerarSenhaProvisoria()));
    expect(set.size).toBe(500);
  });
});
