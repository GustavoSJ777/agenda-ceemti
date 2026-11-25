import { describe, expect, it } from "vitest";
import { intervaloDoModo, itensDoDia, mover, type ItemCalendario } from "./calendario";

describe("calendário", () => {
  it("mês cobre 42 dias começando no domingo", () => {
    const [ini, fim] = intervaloDoModo("mes", "2026-11-23");
    expect(ini).toBe("2026-11-01"); // 01/11/2026 é domingo
    expect(fim).toBe("2026-12-12");
  });
  it("semana vai de domingo a sábado", () => {
    expect(intervaloDoModo("semana", "2026-11-25")).toEqual(["2026-11-22", "2026-11-28"]);
  });
  it("move meses atravessando o ano", () => {
    expect(mover("mes", "2026-12-15", 1)).toBe("2027-01-01");
    expect(mover("mes", "2026-01-31", -1)).toBe("2025-12-01");
  });
  it("move dias e semanas", () => {
    expect(mover("dia", "2026-02-28", 1)).toBe("2026-03-01");
    expect(mover("semana", "2026-11-23", -1)).toBe("2026-11-16");
  });
  it("evento de vários dias aparece em todos os dias do período", () => {
    const item = { origem: "evento", id: "1", titulo: "Recesso", descricao: null, categoria: "recesso", data: "2026-07-01", data_fim: "2026-07-05", hora: null, turma_id: null, disciplina_id: null, professor_id: null, bruto: {} } as ItemCalendario;
    expect(itensDoDia([item], "2026-07-03")).toHaveLength(1);
    expect(itensDoDia([item], "2026-07-06")).toHaveLength(0);
  });
});
