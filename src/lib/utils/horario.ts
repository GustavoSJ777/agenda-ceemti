export interface AulaHorario {
  id: string;
  turma_codigo: string;
  dia_semana: number;
  aula: number;
  inicio: string;
  fim: string;
  disciplina: string;
  professor: string | null;
  sala: string | null;
  vigente_desde: string;
}

/** 1 = segunda ... 7 = domingo (o JS usa 0 = domingo). */
export const diaIso = (diaJs: number) => (diaJs === 0 ? 7 : diaJs);

/** Aulas do dia (vigência mais recente que já começou, por turma), em ordem de aula. */
export function aulasDoDia(todas: AulaHorario[], data: string, diaJs: number, codigos?: Set<string>): AulaHorario[] {
  const dia = diaIso(diaJs);
  const doDia = todas.filter((a) => a.dia_semana === dia && a.vigente_desde <= data && (!codigos || codigos.has(a.turma_codigo)));
  const vigencia = new Map<string, string>();
  for (const a of doDia) if ((vigencia.get(a.turma_codigo) ?? "") < a.vigente_desde) vigencia.set(a.turma_codigo, a.vigente_desde);
  return doDia.filter((a) => vigencia.get(a.turma_codigo) === a.vigente_desde)
    .sort((x, y) => x.turma_codigo.localeCompare(y.turma_codigo) || x.aula - y.aula);
}

/** Vigência mais recente que já começou (ou a mais antiga, se nenhuma começou). */
export function vigenciaDoDia(aulas: AulaHorario[], data: string): string | undefined {
  const v = [...new Set(aulas.map((a) => a.vigente_desde))].sort();
  return [...v].reverse().find((x) => x <= data) ?? v[0];
}

/** Matérias distintas, na ordem das aulas (ex.: ["MAT", "LP", "BIO"]). Ignora eletivas/clube/sem aula. */
export function materiasDoDia(aulas: AulaHorario[]): string[] {
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const a of aulas) {
    if (/^(ELETIVA|CLUBE|REUNIÃO GERAL)/i.test(a.disciplina)) continue;
    const k = a.disciplina.trim();
    if (!vistos.has(k)) { vistos.add(k); r.push(k); }
  }
  return r;
}

export const horaCurta = (t: string) => t.slice(0, 5).replace(":", "h").replace(/h00$/, "h");
