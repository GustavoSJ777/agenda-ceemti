import { AULAS_REGULARES, DIAS_UTEIS, NOME_DIA, chaveSala, indisponivel, professoresDe, salaCompartilhada, type Indisponibilidade } from "./tipos";

export interface AulaGrade { id: string; turma_codigo: string; dia_semana: number; aula: number; disciplina: string; professor: string | null; sala: string | null }

export type TipoConflito = "professor_indisponivel" | "professor_duplo" | "sala_duplo";
export interface Conflito { tipo: TipoConflito; aulaId: string; mensagem: string; outras: string[] }

const rotuloSlot = (d: number, a: number) => `${NOME_DIA[d]}, ${a}ª aula`;

/** Conflitos da grade: professor fora da disponibilidade, professor em duas turmas ao mesmo tempo, sala dupla. */
export function detectarConflitos(aulas: AulaGrade[], ind: Indisponibilidade[]): Conflito[] {
  const r: Conflito[] = [];
  const porSlotProf = new Map<string, AulaGrade[]>();
  const porSlotSala = new Map<string, AulaGrade[]>();
  for (const a of aulas) {
    for (const p of professoresDe(a.professor)) {
      const k = `${p}|${a.dia_semana}|${a.aula}`;
      porSlotProf.set(k, [...(porSlotProf.get(k) ?? []), a]);
      if (indisponivel(ind, p, a.dia_semana, a.aula)) {
        r.push({ tipo: "professor_indisponivel", aulaId: a.id, outras: [],
          mensagem: `${a.professor} não está disponível em ${rotuloSlot(a.dia_semana, a.aula)} (${a.disciplina} — ${a.turma_codigo}).` });
      }
    }
    if (a.sala && !salaCompartilhada(a.sala)) {
      const k = `${chaveSala(a.sala)}|${a.dia_semana}|${a.aula}`;
      porSlotSala.set(k, [...(porSlotSala.get(k) ?? []), a]);
    }
  }
  for (const [k, l] of porSlotProf) {
    if (new Set(l.map((x) => x.turma_codigo)).size < 2) continue;
    for (const a of l) r.push({ tipo: "professor_duplo", aulaId: a.id, outras: l.filter((x) => x.id !== a.id).map((x) => x.id),
      mensagem: `${k.split("|")[0]} está em ${l.length} turmas ao mesmo tempo em ${rotuloSlot(a.dia_semana, a.aula)} (${l.map((x) => x.turma_codigo).join(", ")}).` });
  }
  for (const l of porSlotSala.values()) {
    if (new Set(l.map((x) => x.turma_codigo)).size < 2) continue;
    for (const a of l) r.push({ tipo: "sala_duplo", aulaId: a.id, outras: l.filter((x) => x.id !== a.id).map((x) => x.id),
      mensagem: `A sala ${a.sala} está em uso por ${l.length} turmas em ${rotuloSlot(a.dia_semana, a.aula)}.` });
  }
  return r;
}

export type Sugestao =
  | { tipo: "mover"; dia: number; aula: number; texto: string }
  | { tipo: "trocar"; com: string; texto: string };

/** O professor (todos, se houver mais de um) pode estar em (dia, aula), ignorando as aulas em `ignorar`? */
function profLivre(aulas: AulaGrade[], ind: Indisponibilidade[], profs: string[], dia: number, aula: number, ignorar: Set<string>) {
  for (const p of profs) {
    if (indisponivel(ind, p, dia, aula)) return false;
    if (aulas.some((x) => !ignorar.has(x.id) && x.dia_semana === dia && x.aula === aula && professoresDe(x.professor).includes(p))) return false;
  }
  return true;
}
function salaLivre(aulas: AulaGrade[], sala: string | null, dia: number, aula: number, ignorar: Set<string>) {
  if (!sala || salaCompartilhada(sala)) return true;
  return !aulas.some((x) => !ignorar.has(x.id) && x.sala && x.dia_semana === dia && x.aula === aula && chaveSala(x.sala) === chaveSala(sala));
}

/** Soluções para uma aula em conflito: mover para um horário livre da turma ou trocar com outra aula da turma. */
export function sugerirSolucoes(aulaId: string, aulas: AulaGrade[], ind: Indisponibilidade[], max = 10): Sugestao[] {
  const a = aulas.find((x) => x.id === aulaId);
  if (!a) return [];
  const profsA = professoresDe(a.professor);
  const daTurma = aulas.filter((x) => x.turma_codigo === a.turma_codigo);
  const ocupado = (d: number, n: number) => daTurma.find((x) => x.dia_semana === d && x.aula === n);
  const mover: Sugestao[] = [], trocar: Sugestao[] = [];
  const ordemDia = [...DIAS_UTEIS].sort((x, y) => Math.abs(x - a.dia_semana) - Math.abs(y - a.dia_semana));
  for (const d of ordemDia) for (const n of AULAS_REGULARES) {
    if (d === a.dia_semana && n === a.aula) continue;
    const b = ocupado(d, n);
    const ig = new Set([a.id]);
    if (!b) {
      if (profLivre(aulas, ind, profsA, d, n, ig) && salaLivre(aulas, a.sala, d, n, ig))
        mover.push({ tipo: "mover", dia: d, aula: n, texto: `Mover para ${rotuloSlot(d, n)} (horário livre da turma)` });
    } else if (b.id !== a.id) {
      const par = new Set([a.id, b.id]);
      const profsB = professoresDe(b.professor);
      if (profLivre(aulas, ind, profsA, d, n, par) && profLivre(aulas, ind, profsB, a.dia_semana, a.aula, par)
        && salaLivre(aulas, a.sala, d, n, par) && salaLivre(aulas, b.sala, a.dia_semana, a.aula, par))
        trocar.push({ tipo: "trocar", com: b.id, texto: `Trocar com ${b.disciplina}${b.professor ? ` (${b.professor})` : ""} — ${rotuloSlot(d, n)}` });
    }
  }
  return [...mover.slice(0, Math.ceil(max / 2)), ...trocar.slice(0, max)].slice(0, max);
}
