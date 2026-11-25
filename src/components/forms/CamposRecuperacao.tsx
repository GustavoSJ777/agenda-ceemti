"use client";
import { useMemo, useState } from "react";
import { CampoAreaTexto, CampoSelecao, CampoTexto, type Opcao } from "@/components/ui/Campos";

export interface MatriculaOpc { turma_id: string; aluno_id: string; rotulo: string }
export interface ParTurmaDisc { turma_id: string; disciplina_id: string }

interface Props {
  turmas: Opcao[];
  matriculas: MatriculaOpc[];
  disciplinas: Opcao[];
  /** Professor: só as disciplinas de cada turma em que leciona. Direção: null (todas). */
  limitarPor: ParTurmaDisc[] | null;
  professores: Opcao[] | null;
  situacoes: Opcao[];
  valores?: {
    turma_id?: string; aluno_id?: string; disciplina_id?: string; professor_id?: string | null;
    nota_anterior?: number | null; nota_recuperacao?: number | null; data_avaliacao?: string | null; prazo?: string | null;
    situacao?: string; observacoes?: string | null;
  };
}

/** Turma → alunos matriculados e disciplinas (dependentes). Os dados chegam prontos do servidor. */
export function CamposRecuperacao({ turmas, matriculas, disciplinas, limitarPor, professores, situacoes, valores = {} }: Props) {
  const [turma, setTurma] = useState(valores.turma_id ?? "");
  const alunos = useMemo<Opcao[]>(
    () => matriculas.filter((m) => m.turma_id === turma).map((m) => ({ v: m.aluno_id, l: m.rotulo })).sort((a, b) => a.l.localeCompare(b.l, "pt-BR")),
    [matriculas, turma],
  );
  const discs = useMemo<Opcao[]>(() => {
    if (!limitarPor) return disciplinas;
    const ids = new Set(limitarPor.filter((p) => p.turma_id === turma).map((p) => p.disciplina_id));
    return disciplinas.filter((d) => ids.has(d.v));
  }, [disciplinas, limitarPor, turma]);

  return (
    <>
      <div className="campo">
        <label htmlFor="f_turma_id">Turma <span className="text-perigo" aria-hidden="true">*</span></label>
        <select id="f_turma_id" name="turma_id" required value={turma} onChange={(e) => setTurma(e.target.value)}>
          <option value="">Selecione...</option>
          {turmas.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>
      <CampoSelecao key={`al-${turma}`} name="aluno_id" label="Aluno" obrigatorio opcoes={alunos} valor={valores.aluno_id} vazio={turma ? "Selecione..." : "Escolha a turma primeiro"} />
      <CampoSelecao key={`di-${turma}`} name="disciplina_id" label="Disciplina" obrigatorio opcoes={discs} valor={valores.disciplina_id} vazio={turma ? "Selecione..." : "Escolha a turma primeiro"} />
      {professores && <CampoSelecao name="professor_id" label="Professor responsável" opcoes={professores} vazio="Nenhum" valor={valores.professor_id} />}
      <CampoTexto name="nota_anterior" label="Nota anterior (0 a 10)" tipo="number" min={0} max={10} step="0.1" valor={valores.nota_anterior} />
      <CampoTexto name="nota_recuperacao" label="Nota da recuperação (0 a 10)" tipo="number" min={0} max={10} step="0.1" valor={valores.nota_recuperacao} />
      <CampoTexto name="data_avaliacao" label="Data da avaliação" tipo="date" valor={valores.data_avaliacao} />
      <CampoTexto name="prazo" label="Prazo" tipo="date" valor={valores.prazo} />
      <CampoSelecao name="situacao" label="Situação" obrigatorio vazio={null} opcoes={situacoes} valor={valores.situacao ?? "pendente"} />
      <CampoAreaTexto name="observacoes" label="Observações (visíveis ao aluno)" cheio maxLength={1000} valor={valores.observacoes} />
    </>
  );
}
