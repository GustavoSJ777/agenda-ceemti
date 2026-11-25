import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { NOME_SISTEMA } from "@/constants";
import { fmtDataHora } from "@/lib/utils/datas";
import type { Relatorio } from "@/services/relatorios";

/** Evita injeção de fórmula ao abrir no Excel (células que começam com = + - @). */
export const neutralizarFormula = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function nomeArquivo(titulo: string, hoje: string, ext: string) {
  const base = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base}-${hoje}.${ext}`;
}

export function gerarPDF(rel: Relatorio, emitidoPor: string): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(15); doc.setTextColor(29, 93, 147); doc.text(NOME_SISTEMA, 14, 14);
  doc.setFontSize(12); doc.setTextColor(27, 51, 80); doc.text(rel.titulo, 14, 21);
  doc.setFontSize(9); doc.setTextColor(90, 112, 136);
  doc.text(`${rel.filtros ? rel.filtros + "   |   " : ""}Emitido em ${fmtDataHora(new Date().toISOString())} por ${emitidoPor}`, 14, 27);
  autoTable(doc, {
    head: [rel.colunas], body: rel.linhas, startY: 31, styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [40, 120, 189] }, alternateRowStyles: { fillColor: [245, 250, 255] }, margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
      doc.text("Documento com dados pessoais de estudantes — uso restrito à comunidade escolar autorizada (LGPD, Lei 13.709/2018).", 14, h - 8);
      doc.text(`Página ${doc.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 30, h - 8);
    },
  });
  return doc.output("arraybuffer");
}

export async function gerarExcel(rel: Relatorio, emitidoPor: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = NOME_SISTEMA;
  const ws = wb.addWorksheet("Relatório");
  ws.addRow([NOME_SISTEMA]).font = { bold: true, size: 14 };
  ws.addRow([rel.titulo]).font = { bold: true, size: 12 };
  ws.addRow([rel.filtros]);
  ws.addRow([`Emitido em ${fmtDataHora(new Date().toISOString())} por ${emitidoPor}`]);
  ws.addRow([]);
  const cab = ws.addRow(rel.colunas);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2878BD" } }; });
  for (const l of rel.linhas) ws.addRow(l.map(neutralizarFormula));
  rel.colunas.forEach((c, i) => {
    const max = Math.max(c.length, ...rel.linhas.map((l) => (l[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 2, 10), 50);
  });
  ws.views = [{ state: "frozen", ySplit: 6 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
