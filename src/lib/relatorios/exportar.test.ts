import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gerarExcel, gerarPDF, neutralizarFormula, nomeArquivo } from "./exportar";
import ExcelJS from "exceljs";

const rel = { titulo: "Teste", filtros: "Turma: todas", colunas: ["Nome", "Obs"], linhas: [["Ana", "=CMD()"], ["Bia", "ok"]] };

describe("exportação", () => {
  it("neutraliza fórmulas do Excel", () => {
    expect(neutralizarFormula("=1+1")).toBe("'=1+1");
    expect(neutralizarFormula("@SOMA(A1)")).toBe("'@SOMA(A1)");
    expect(neutralizarFormula("João")).toBe("João");
  });
  it("gera nome de arquivo sem acentos", () => {
    expect(nomeArquivo("Relação de alunos por turma — 2026", "2026-11-23", "pdf")).toBe("relacao-de-alunos-por-turma-2026-2026-11-23.pdf");
  });
  it("gera PDF válido", () => {
    const buf = gerarPDF(rel, "Fulano");
    expect(Buffer.from(buf).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("gera Excel legível com fórmulas neutralizadas", async () => {
    const buf = await gerarExcel(rel, "Fulano");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet("Relatório")!;
    expect(ws.getRow(6).getCell(1).value).toBe("Nome");
    expect(ws.getRow(7).getCell(2).value).toBe("'=CMD()");
  });
});
