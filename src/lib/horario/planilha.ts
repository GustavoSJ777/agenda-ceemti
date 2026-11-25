import { z } from "zod";
import { HORARIO_AULA } from "./tipos";

export interface LinhaBruta { linha: number; turma: string; dia: string; aula: string; materia: string; professor: string; sala: string }
export interface AulaImportada { turma_codigo: string; dia_semana: number; aula: number; inicio: string; fim: string; disciplina: string; professor: string; sala: string }

export const CABECALHOS = {
  turma: ["turma", "classe"],
  dia: ["dia", "diadasemana", "diasemana"],
  aula: ["aula", "nraula", "numeroaula", "horario"],
  materia: ["materia", "disciplina", "componente"],
  professor: ["professor", "professora", "docente"],
  sala: ["sala", "local", "ambiente"],
} as const;

export const normaliza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Segunda", "seg", "2ª feira", "1" ... → 1..5 (segunda a sexta). */
export function interpretarDia(v: string): number | null {
  const n = normaliza(v);
  const mapa: [RegExp, number][] = [[/^(1|seg)/, 1], [/^(2|ter)/, 2], [/^(3|qua)/, 3], [/^(4|qui)/, 4], [/^(5|sex)/, 5]];
  // "2ª feira" = segunda no uso escolar: números 2..6 viram segunda..sexta; já "1".."5" soltos viram segunda..sexta.
  if (/^[2-6]a?feira$/.test(n) || /^[2-6]a$/.test(n)) return Number(n[0]) - 1;
  for (const [re, d] of mapa) if (re.test(n)) return d;
  return null;
}

/** "3", "3ª", "3a aula" → 3. */
export function interpretarAula(v: string): number | null {
  const m = normaliza(v).match(/^(\d{1,2})/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 9 ? n : null;
}

const esquema = z.object({
  turma: z.string().trim().min(1, "Turma vazia.").max(60, "Turma muito longa."),
  materia: z.string().trim().min(1, "Matéria vazia.").max(60, "Matéria muito longa."),
  professor: z.string().trim().max(80, "Professor muito longo."),
  sala: z.string().trim().max(60, "Sala muito longa."),
});

/** Valida as linhas lidas da planilha; repetição de turma+dia+aula é recusada (a primeira vale). */
export function interpretarLinhas(linhas: LinhaBruta[]): { validas: AulaImportada[]; ignoradas: { linha: number; motivo: string }[] } {
  const validas: AulaImportada[] = [];
  const ignoradas: { linha: number; motivo: string }[] = [];
  const vistos = new Set<string>();
  for (const l of linhas) {
    const dia = interpretarDia(l.dia);
    const aula = interpretarAula(l.aula);
    const v = esquema.safeParse(l);
    const motivo = !v.success ? v.error.issues[0].message : dia === null ? "Dia inválido (use segunda a sexta)." : aula === null ? "Aula inválida (1 a 9)." : null;
    if (motivo || !v.success || dia === null || aula === null) { ignoradas.push({ linha: l.linha, motivo: motivo ?? "Linha inválida." }); continue; }
    const k = `${v.data.turma}|${dia}|${aula}`;
    if (vistos.has(k)) { ignoradas.push({ linha: l.linha, motivo: "Turma, dia e aula repetidos." }); continue; }
    vistos.add(k);
    validas.push({ turma_codigo: v.data.turma, dia_semana: dia, aula, inicio: HORARIO_AULA[aula][0], fim: HORARIO_AULA[aula][1], disciplina: v.data.materia, professor: v.data.professor, sala: v.data.sala });
  }
  return { validas, ignoradas };
}
