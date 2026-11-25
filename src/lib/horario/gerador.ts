import { AULAS_REGULARES, DIAS_UTEIS, chaveProf, chaveSala, indisponivel, salaCompartilhada,
  type AulaGerada, type Demanda, type Indisponibilidade, type NaoAlocada, type TurmaGrade } from "./tipos";

export interface EntradaGerador { turmas: TurmaGrade[]; demandas: Demanda[]; indisp: Indisponibilidade[]; salas: string[]; semente?: number; tentativas?: number }
export interface SaidaGerador { aulas: AulaGerada[]; naoAlocadas: NaoAlocada[]; avisos: string[] }

function rng(semente: number) {
  let s = semente >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const k3 = (a: string, d: number, n: number) => `${a}|${d}|${n}`;

function tentar(e: EntradaGerador, rand: () => number): SaidaGerador {
  const base = new Map(e.turmas.map((t) => [t.codigo, t.sala_base]));
  const ocupTurma = new Set<string>(), ocupProf = new Set<string>(), ocupSala = new Set<string>();
  const aulas: AulaGerada[] = [];
  const porDemandaDia = new Map<string, number>();
  const slots = DIAS_UTEIS.flatMap((d) => AULAS_REGULARES.map((a) => [d, a] as const));

  // Mais restritas primeiro: menos horários livres para o professor, depois mais aulas por semana.
  const livres = (prof: string) => slots.filter(([d, a]) => !indisponivel(e.indisp, prof, d, a)).length;
  const ordem = [...e.demandas].sort((x, y) => livres(x.professor) - livres(y.professor) || y.aulas_semana - x.aulas_semana || rand() - 0.5);
  const restante = new Map(ordem.map((d) => [d.id, d.aulas_semana]));

  const salaPara = (dm: Demanda, dia: number, aula: number): string | null | undefined => {
    const livre = (s: string) => salaCompartilhada(s) || !ocupSala.has(k3(chaveSala(s), dia, aula));
    if (dm.sala) return livre(dm.sala) ? dm.sala : undefined;
    const b = base.get(dm.turma_codigo);
    if (b) return livre(b) ? b : undefined;
    if (!e.salas.length) return null;
    return e.salas.find(livre);
  };

  // Rodada a rodada: uma aula de cada disciplina por vez, para espalhar ao longo da semana.
  let progresso = true;
  while (progresso) {
    progresso = false;
    for (const dm of ordem) {
      if ((restante.get(dm.id) ?? 0) <= 0) continue;
      const prof = chaveProf(dm.professor);
      let melhor: { d: number; a: number; sala: string | null; custo: number } | null = null;
      for (const [d, a] of slots) {
        if (ocupTurma.has(k3(dm.turma_codigo, d, a)) || ocupProf.has(k3(prof, d, a)) || indisponivel(e.indisp, dm.professor, d, a)) continue;
        const sala = salaPara(dm, d, a);
        if (sala === undefined) continue;
        const no_dia = porDemandaDia.get(`${dm.id}|${d}`) ?? 0;
        const vizinha = aulas.some((x) => x.turma_codigo === dm.turma_codigo && x.disciplina === dm.disciplina && x.dia_semana === d && Math.abs(x.aula - a) === 1);
        const custo = no_dia * 20 + (no_dia > 0 && !vizinha ? 8 : 0) + (a > 5 ? 1 : 0) + rand() * 3;
        if (!melhor || custo < melhor.custo) melhor = { d, a, sala, custo };
      }
      if (!melhor) continue;
      const { d, a, sala } = melhor;
      ocupTurma.add(k3(dm.turma_codigo, d, a)); ocupProf.add(k3(prof, d, a));
      if (sala && !salaCompartilhada(sala)) ocupSala.add(k3(chaveSala(sala), d, a));
      porDemandaDia.set(`${dm.id}|${d}`, (porDemandaDia.get(`${dm.id}|${d}`) ?? 0) + 1);
      aulas.push({ turma_codigo: dm.turma_codigo, dia_semana: d, aula: a, disciplina: dm.disciplina, professor: dm.professor, sala });
      restante.set(dm.id, (restante.get(dm.id) ?? 0) - 1);
      progresso = true;
    }
  }
  const naoAlocadas: NaoAlocada[] = [];
  for (const dm of e.demandas) {
    const f = restante.get(dm.id) ?? 0;
    if (f > 0) naoAlocadas.push({ demanda: dm, faltam: f, motivo: "Sem horário em comum livre entre a turma, o professor (e a sala)." });
  }
  return { aulas, naoAlocadas, avisos: [] };
}

/** Gera a grade semanal (seg–sex, aulas 1–7). Roda várias tentativas e fica com a que alocou mais aulas. */
export function gerarHorario(e: EntradaGerador): SaidaGerador {
  const avisos: string[] = [];
  const cap = DIAS_UTEIS.length * AULAS_REGULARES.length;
  const total = new Map<string, number>();
  for (const d of e.demandas) total.set(d.turma_codigo, (total.get(d.turma_codigo) ?? 0) + d.aulas_semana);
  for (const [t, n] of total) if (n > cap) avisos.push(`A turma ${t} tem ${n} aulas por semana, mas a grade comporta ${cap}.`);
  const codigos = new Set(e.turmas.map((t) => t.codigo));
  const sem = e.demandas.filter((d) => !codigos.has(d.turma_codigo));
  if (sem.length) avisos.push(`${sem.length} demanda(s) de turmas que não estão no horário foram ignoradas.`);
  const demandas = e.demandas.filter((d) => codigos.has(d.turma_codigo));

  const rand = rng(e.semente ?? 20260302);
  let melhor: SaidaGerador | null = null;
  for (let i = 0; i < (e.tentativas ?? 40); i++) {
    const r = tentar({ ...e, demandas }, rand);
    const faltam = r.naoAlocadas.reduce((s, n) => s + n.faltam, 0);
    if (!melhor || faltam < melhor.naoAlocadas.reduce((s, n) => s + n.faltam, 0)) melhor = r;
    if (faltam === 0) break;
  }
  return { ...melhor!, avisos };
}
