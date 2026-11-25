import { chaveProf, professoresDe } from "./tipos";

export interface ProfessorListado {
  chave: string;
  nome: string;
  /** Id do cadastro em horario_professores, se existir. */
  cadastroId: string | null;
  materias: number;
  aulasNaGrade: number;
}

interface Fontes {
  cadastrados: { id: string; nome: string }[];
  demandas: { professor: string }[];
  aulas: { professor: string | null }[];
  indisp: { professor: string }[];
  sistema?: string[];
}

/**
 * Junta todos os professores conhecidos (cadastro, matérias, grade, restrições, usuários do sistema) em uma lista sem repetição.
 * “DANIEL.” e “Daniel” viram um só; “CLEIDE / ABRAÃO” conta para os dois.
 */
export function listarProfessores(f: Fontes): ProfessorListado[] {
  const mapa = new Map<string, ProfessorListado>();
  const garantir = (nome: string) => {
    const limpo = nome.replace(/\s+/g, " ").replace(/[.]+$/, "").trim();
    const k = chaveProf(limpo);
    if (!k) return null;
    let p = mapa.get(k);
    if (!p) { p = { chave: k, nome: limpo, cadastroId: null, materias: 0, aulasNaGrade: 0 }; mapa.set(k, p); }
    return p;
  };
  for (const c of f.cadastrados) { const p = garantir(c.nome); if (p) { p.cadastroId = c.id; p.nome = c.nome.trim(); } }
  for (const d of f.demandas) for (const n of d.professor.split("/")) { const p = garantir(n); if (p) p.materias++; }
  for (const a of f.aulas) for (const n of (a.professor ?? "").split("/")) { const p = garantir(n); if (p) p.aulasNaGrade++; }
  for (const i of f.indisp) for (const n of i.professor.split("/")) garantir(n);
  for (const n of f.sistema ?? []) garantir(n);
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Professores citados em um texto de matéria (“A / B”), já normalizados para comparação. */
export const chavesDoTexto = (s: string) => professoresDe(s);
