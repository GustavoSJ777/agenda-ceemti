import type { Referencias } from "@/services/referencias";
import type { Opcao } from "@/components/ui/Campos";

/** Funções de nome/opções baseadas nas tabelas de apoio. */
export function criarNomeadores(ref: Referencias) {
  const mapa = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
  const series = mapa(ref.series), disc = mapa(ref.disciplinas), turmas = mapa(ref.turmas), profs = mapa(ref.professores);
  const variosAnos = new Set(ref.turmas.map((t) => t.ano_letivo)).size > 1;

  const nomeTurma = (id?: string | null) => {
    if (!id) return "Toda a escola";
    const t = turmas.get(id);
    if (!t) return "—";
    return variosAnos ? `${t.nome} (${t.ano_letivo})` : t.nome;
  };
  return {
    nomeTurma,
    nomeSerie: (id?: string | null) => (id ? series.get(id)?.nome ?? "—" : "—"),
    nomeDisciplina: (id?: string | null) => (id ? disc.get(id)?.nome ?? "—" : "—"),
    nomeProfessor: (id?: string | null) => (id ? profs.get(id)?.nome ?? "—" : "—"),
    turma: (id: string) => turmas.get(id),
    opcoesTurmas: (filtro?: (t: Referencias["turmas"][number]) => boolean): Opcao[] =>
      ref.turmas.filter(filtro ?? (() => true)).map((t) => ({ v: t.id, l: nomeTurma(t.id) })),
    opcoesDisciplinas: (ids?: string[]): Opcao[] =>
      ref.disciplinas.filter((d) => !ids || ids.includes(d.id)).map((d) => ({ v: d.id, l: d.nome })),
    opcoesProfessores: (): Opcao[] => ref.professores.map((p) => ({ v: p.id, l: p.nome })),
    opcoesSeries: (): Opcao[] => ref.series.map((s) => ({ v: s.id, l: s.nome })),
  };
}
export type Nomeadores = ReturnType<typeof criarNomeadores>;
