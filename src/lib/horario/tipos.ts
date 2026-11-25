/** Grade regular: segunda a sexta, aulas 1..7 (8ª e 9ª são eletivas/clube e não são geradas). */
export const DIAS_UTEIS = [1, 2, 3, 4, 5] as const;
export const AULAS_REGULARES = [1, 2, 3, 4, 5, 6, 7] as const;
export const NOME_DIA = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/** Horários fixos das aulas (50 min), conforme o horário oficial. */
export const HORARIO_AULA: Record<number, [string, string]> = {
  1: ["07:30", "08:20"], 2: ["08:20", "09:10"], 3: ["09:30", "10:20"], 4: ["10:20", "11:10"], 5: ["11:10", "12:00"],
  6: ["13:20", "14:10"], 7: ["14:10", "15:00"], 8: ["15:20", "16:10"], 9: ["16:10", "17:00"],
};

export interface Demanda { id: string; turma_codigo: string; disciplina: string; professor: string; aulas_semana: number; sala: string | null }
export interface Indisponibilidade { id?: string; professor: string; dia_semana: number; aula_de: number; aula_ate: number; motivo?: string | null }
export interface TurmaGrade { codigo: string; sala_base: string | null }
export interface AulaGerada { turma_codigo: string; dia_semana: number; aula: number; disciplina: string; professor: string; sala: string | null }
export interface NaoAlocada { demanda: Demanda; faltam: number; motivo: string }

/** Nome de professor normalizado (sem acento/pontos, maiúsculo) para comparar. */
export const chaveProf = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
/** "CLEIDE / ABRAÃO" → ["CLEIDE","ABRAAO"] */
export const professoresDe = (s: string | null | undefined) => (s ? s.split("/").map(chaveProf).filter(Boolean) : []);
export const salaCompartilhada = (s: string | null | undefined) => !s || /^(QUADRA|BIBLIOTECA|CLUBE|SAL[ÃA]O)/i.test(s.trim());
export const chaveSala = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export function indisponivel(ind: Indisponibilidade[], prof: string, dia: number, aula: number) {
  const k = chaveProf(prof);
  return ind.some((i) => chaveProf(i.professor) === k && i.dia_semana === dia && aula >= i.aula_de && aula <= i.aula_ate);
}
