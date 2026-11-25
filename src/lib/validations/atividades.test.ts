import { describe, expect, it } from "vitest";
import { esquemaAtividade } from "./atividades";

describe("validação de atividades", () => {
  it("prova exige data de realização", () => {
    expect(esquemaAtividade.safeParse({ tipo: "prova", titulo: "Prova 1" }).success).toBe(false);
    expect(esquemaAtividade.safeParse({ tipo: "prova", titulo: "Prova 1", data_realizacao: "2026-05-10" }).success).toBe(true);
  });
  it("trabalho exige prazo de entrega", () => {
    const r = esquemaAtividade.safeParse({ tipo: "trabalho", titulo: "Trabalho 1" });
    expect(r.success).toBe(false);
    expect(esquemaAtividade.safeParse({ tipo: "trabalho", titulo: "Trabalho 1", prazo_entrega: "2026-05-10" }).success).toBe(true);
  });
  it("recusa título curto", () => {
    expect(esquemaAtividade.safeParse({ tipo: "prova", titulo: "ab", data_realizacao: "2026-05-10" }).success).toBe(false);
  });
});
