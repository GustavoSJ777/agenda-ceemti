import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => ({}) }));
import { gerarPdfCredenciais, lerPlanilha } from "./importar-alunos";

async function planilha(linhas: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("A");
  linhas.forEach((l) => ws.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("importação de alunos", () => {
  it("lê cabeçalhos com acento/variações e pula linhas vazias", async () => {
    const b = await planilha([["Matrícula", "Nome do Aluno", "Turma"], [2026001, "Ana Souza", "1A"], [], ["2026002", "Bruno Lima", ""]]);
    const l = await lerPlanilha(b);
    expect(l).toEqual([
      { linha: 2, matricula: "2026001", nome: "Ana Souza", turma: "1A" },
      { linha: 4, matricula: "2026002", nome: "Bruno Lima", turma: "" },
    ]);
  });
  it("exige colunas Matrícula e Nome", async () => {
    await expect(lerPlanilha(await planilha([["Foo", "Bar"], [1, 2]]))).rejects.toThrow(/Matrícula/);
  });
  it("recusa arquivo que não é xlsx", async () => {
    await expect(lerPlanilha(Buffer.from("texto qualquer"))).rejects.toThrow(/inválido/);
  });
  it("gera PDF", () => {
    const pdf = gerarPdfCredenciais([{ matricula: "1", nome: "Ana Souza", turma: "1A", senha: "Ab3dEf7hJk" }], "Admin", "2026-11-24");
    expect(new TextDecoder().decode(new Uint8Array(pdf).slice(0, 5))).toBe("%PDF-");
  });
});
