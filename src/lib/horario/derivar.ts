import { AULAS_REGULARES, salaCompartilhada } from "./tipos";

/** Aula da grade já gravada (só o que importa para deduzir as matérias de cada turma). */
export interface AulaOrigem { turma_codigo: string; aula: number; disciplina: string | null; professor: string | null; sala: string | null }

export interface DemandaDerivada { turma_codigo: string; disciplina: string; professor: string; aulas_semana: number; sala: string | null }
export interface ResultadoDerivacao {
  demandas: DemandaDerivada[];
  salaBase: Map<string, string>;
  salas: string[];
  /** Matérias que só existem na 8ª/9ª aula (eletivas, clube): não entram no gerador. */
  ignoradasFora7: number;
  semProfessor: number;
  variosProfessores: number;
}

const limpa = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Valor mais frequente; em empate, o primeiro encontrado (ordem estável). */
function moda(valores: string[]): string | null {
  const n = new Map<string, number>();
  for (const v of valores) n.set(v, (n.get(v) ?? 0) + 1);
  let melhor: string | null = null; let max = 0;
  for (const [v, c] of n) if (c > max) { melhor = v; max = c; }
  return melhor;
}

/**
 * Deduz, a partir de uma grade pronta, o que o passo “Criar horário” pede:
 * matérias por turma (professor mais frequente, aulas/semana de 1ª a 7ª), sala de cada turma e salas usadas.
 */
export function derivarDaGrade(aulas: AulaOrigem[]): ResultadoDerivacao {
  const regular = new Set<number>(AULAS_REGULARES);
  const grupos = new Map<string, AulaOrigem[]>();
  const porTurma = new Map<string, AulaOrigem[]>();
  for (const a of aulas) {
    const disc = limpa(a.disciplina);
    if (!disc || !a.turma_codigo) continue;
    const k = `${a.turma_codigo}\u0000${disc}`;
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
    porTurma.set(a.turma_codigo, [...(porTurma.get(a.turma_codigo) ?? []), a]);
  }

  const salaBase = new Map<string, string>();
  const salas = new Set<string>();
  for (const [turma, lista] of porTurma) {
    const salasDaTurma = lista.map((a) => limpa(a.sala)).filter((s) => s && !salaCompartilhada(s));
    const base = moda(salasDaTurma);
    if (base) salaBase.set(turma, base);
    for (const s of salasDaTurma) salas.add(s);
  }

  const demandas: DemandaDerivada[] = [];
  let ignoradasFora7 = 0; let semProfessor = 0; let variosProfessores = 0;
  for (const [k, lista] of grupos) {
    const [turma, disc] = k.split("\u0000");
    const regulares = lista.filter((a) => regular.has(a.aula));
    if (!regulares.length) { ignoradasFora7++; continue; }
    const profs = regulares.map((a) => limpa(a.professor)).filter(Boolean);
    const professor = moda(profs);
    if (!professor) { semProfessor++; continue; }
    if (new Set(profs).size > 1) variosProfessores++;
    const sala = moda(regulares.map((a) => limpa(a.sala)).filter(Boolean));
    const base = salaBase.get(turma);
    demandas.push({
      turma_codigo: turma, disciplina: disc, professor,
      aulas_semana: Math.min(regulares.length, 20),
      // Só vira “sala específica” quando difere da sala da turma (laboratório, quadra…).
      sala: sala && sala !== base ? sala : null,
    });
  }
  demandas.sort((a, b) => a.turma_codigo.localeCompare(b.turma_codigo) || a.disciplina.localeCompare(b.disciplina));
  return { demandas, salaBase, salas: [...salas].sort(), ignoradasFora7, semProfessor, variosProfessores };
}
