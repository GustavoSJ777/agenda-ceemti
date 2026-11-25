import { describe, expect, it } from "vitest";
import { esquemaAviso } from "./avisos";

const base = { titulo: "Reunião de pais", conteudo: "Sábado às 8h", data_publicacao: "2026-05-01" };

describe("validação de avisos", () => {
  it("turma específica exige turma", () => {
    expect(esquemaAviso.safeParse({ ...base, publico: "turma" }).success).toBe(false);
  });
  it("descarta turma quando o público não é turma", () => {
    const r = esquemaAviso.parse({ ...base, publico: "todos", turma_id: "00000000-0000-4000-8000-000000000701" });
    expect(r.turma_id).toBeUndefined();
  });
  it("validade não pode anteceder a publicação", () => {
    expect(esquemaAviso.safeParse({ ...base, publico: "todos", validade: "2026-04-01" }).success).toBe(false);
  });
});
