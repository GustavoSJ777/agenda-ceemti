import "server-only";
import ExcelJS from "exceljs";
import { ErroNegocio } from "@/lib/actions/resultado";
import { CABECALHOS, normaliza, type LinhaBruta } from "@/lib/horario/planilha";

export const BUCKET_HORARIOS = "horarios";
export const LIMITE_PDF = 5 * 1024 * 1024;
export const LIMITE_PLANILHA = 2 * 1024 * 1024;
export const MAX_LINHAS_HORARIO = 2000;

const texto = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text ?? "").trim();
  }
  return String(v).trim();
};

/** Lê a planilha de horário (1ª aba; cabeçalho: Turma, Dia, Aula, Matéria, Professor, Sala). */
export async function lerPlanilhaHorario(buffer: Buffer): Promise<LinhaBruta[]> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new ErroNegocio("Arquivo inválido. Envie uma planilha .xlsx."); }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErroNegocio("A planilha está vazia.");
  const col: Partial<Record<keyof typeof CABECALHOS, number>> = {};
  ws.getRow(1).eachCell((c, n) => {
    const k = normaliza(texto(c.value));
    for (const [campo, nomes] of Object.entries(CABECALHOS)) if ((nomes as readonly string[]).includes(k) && !(campo in col)) col[campo as keyof typeof CABECALHOS] = n;
  });
  const faltam = (["turma", "dia", "aula", "materia"] as const).filter((c) => !col[c]);
  if (faltam.length) throw new ErroNegocio("A primeira linha precisa ter as colunas: Turma, Dia, Aula e Matéria (Professor e Sala são opcionais).");
  const linhas: LinhaBruta[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const v = (c?: number) => (c ? texto(r.getCell(c).value) : "");
    const l = { linha: i, turma: v(col.turma), dia: v(col.dia), aula: v(col.aula), materia: v(col.materia), professor: v(col.professor), sala: v(col.sala) };
    if (!l.turma && !l.dia && !l.aula && !l.materia) continue;
    linhas.push(l);
    if (linhas.length > MAX_LINHAS_HORARIO) throw new ErroNegocio(`A planilha tem mais de ${MAX_LINHAS_HORARIO} linhas.`);
  }
  if (!linhas.length) throw new ErroNegocio("Nenhuma aula encontrada na planilha.");
  return linhas;
}

export async function gerarModeloHorario(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Horário");
  ws.addRow(["Turma", "Dia", "Aula", "Matéria", "Professor", "Sala"]).font = { bold: true };
  ws.columns = [{ width: 24 }, { width: 14 }, { width: 8 }, { width: 24 }, { width: 24 }, { width: 16 }];
  const ajuda = wb.addWorksheet("Como preencher");
  [
    "Uma linha por aula. Preencha Turma, Dia, Aula e Matéria; Professor e Sala são opcionais.",
    "Turma: o mesmo código usado no horário (turmas novas são criadas automaticamente).",
    "Dia: segunda, terça, quarta, quinta ou sexta (também vale seg, ter, qua, qui, sex).",
    "Aula: número de 1 a 9 (1ª = 07h30 ... 7ª = 14h10 ... 9ª = 16h10).",
    "Cada combinação Turma + Dia + Aula só pode aparecer uma vez.",
  ].forEach((t) => ajuda.addRow([t]));
  ajuda.getColumn(1).width = 110;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
