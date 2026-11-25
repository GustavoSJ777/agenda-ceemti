import { describe, expect, it } from "vitest";
import { esquemaTurma, esquemaSerie } from "./turmas";

describe("validação de turmas", () => {
  it("aceita turma válida e converte o ano", () => {
    const r = esquemaTurma.parse({ nome: "1A", serie_id: "00000000-0000-4000-8000-000000000501", turno: "integral", ano_letivo: "2026" });
    expect(r.ano_letivo).toBe(2026);
  });
  it("recusa turno inexistente", () => {
    expect(esquemaTurma.safeParse({ nome: "1A", serie_id: "00000000-0000-4000-8000-000000000501", turno: "madrugada", ano_letivo: 2026 }).success).toBe(false);
  });
  it("recusa ano fora do intervalo do banco", () => {
    expect(esquemaTurma.safeParse({ nome: "1A", serie_id: "00000000-0000-4000-8000-000000000501", turno: "integral", ano_letivo: 1999 }).success).toBe(false);
  });
  it("ordem da série padrão 0", () => expect(esquemaSerie.parse({ nome: "1ª Série" }).ordem).toBe(0));
});
