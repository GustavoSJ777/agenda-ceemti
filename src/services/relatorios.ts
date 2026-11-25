import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { fmtData, fmtHora } from "@/lib/utils/datas";
import { lerTodos } from "@/lib/supabase/todos";
import { CATEGORIAS_EVENTO, SITUACOES_MATRICULA, SITUACOES_RECUPERACAO } from "@/constants";
import { TIPOS_RELATORIO, type FiltrosRelatorio } from "@/lib/validations/relatorios";

export interface Relatorio { titulo: string; filtros: string; colunas: string[]; linhas: string[][] }

const nota = (n: number | null) => (n === null || n === undefined ? "" : Number(n).toFixed(1).replace(".", ","));
const d = (s: string | null) => (s ? fmtData(s) : "");

/** Gera o relatório com a sessão do usuário (o RLS continua valendo). Linhas já em texto puro. */
export async function gerarRelatorio(sb: SupabaseClient, f: FiltrosRelatorio): Promise<Relatorio> {
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);
  const usa = (TIPOS_RELATORIO[f.tipo].filtros as readonly string[]);
  const partes: string[] = [];
  if (usa.includes("ano")) partes.push(`Ano letivo: ${f.ano ?? new Date().getFullYear()}`);
  if (usa.includes("turma")) partes.push(`Turma: ${f.turma ? n.nomeTurma(f.turma) : "todas"}`);
  if (usa.includes("professor")) partes.push(`Professor: ${f.professor ? n.nomeProfessor(f.professor) : "todos"}`);
  if (usa.includes("periodo") && f.inicio && f.fim) partes.push(`Período: ${fmtData(f.inicio)} a ${fmtData(f.fim)}`);
  const filtros = partes.join("  |  ");
  const pt = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

  if (f.tipo === "alunos") {
    const ano = f.ano ?? new Date().getFullYear();
    type M = { turma_id: string; situacao: keyof typeof SITUACOES_MATRICULA; alunos: { nome: string; matricula: string; email: string | null } | null };
    const m = await lerTodos<M>(() => {
      let q = sb.from("matriculas").select("turma_id,situacao,alunos(nome,matricula,email)").eq("ano_letivo", ano);
      if (f.turma) q = q.eq("turma_id", f.turma);
      if (f.sit) q = q.eq("situacao", f.sit);
      return q.order("id") as never;
    });
    const ord = m.filter((x) => x.alunos).sort((a, b) => pt(n.nomeTurma(a.turma_id), n.nomeTurma(b.turma_id)) || pt(a.alunos!.nome, b.alunos!.nome));
    return { titulo: `Relação de alunos por turma — ${ano}`, filtros, colunas: ["Turma", "Nome", "Matrícula", "E-mail", "Situação"],
      linhas: ord.map((x) => [n.nomeTurma(x.turma_id), x.alunos!.nome, x.alunos!.matricula, x.alunos!.email ?? "", SITUACOES_MATRICULA[x.situacao]]) };
  }

  if (f.tipo === "recuperacoes") {
    type R = { turma_id: string; disciplina_id: string; professor_id: string | null; nota_anterior: number | null; nota_recuperacao: number | null;
      data_avaliacao: string | null; prazo: string | null; situacao: keyof typeof SITUACOES_RECUPERACAO; alunos: { nome: string; matricula: string } | null; criado_em: string };
    const r = await lerTodos<R>(() => {
      let q = sb.from("recuperacoes").select("*, alunos(nome,matricula)");
      if (f.turma) q = q.eq("turma_id", f.turma);
      if (f.professor) q = q.eq("professor_id", f.professor);
      if (f.recsit) q = q.eq("situacao", f.recsit);
      if (f.inicio && f.fim) q = q.gte("criado_em", `${f.inicio}T00:00:00-03:00`).lte("criado_em", `${f.fim}T23:59:59-03:00`);
      return q.order("criado_em", { ascending: false }) as never;
    });
    r.sort((a, b) => pt(a.alunos?.nome ?? "", b.alunos?.nome ?? ""));
    return { titulo: "Relatório de recuperações", filtros: filtros + (f.recsit ? `  |  Situação: ${SITUACOES_RECUPERACAO[f.recsit]}` : ""),
      colunas: ["Aluno", "Matrícula", "Turma", "Disciplina", "Professor", "Nota anterior", "Nota recuperação", "Avaliação", "Prazo", "Situação"],
      linhas: r.map((x) => [x.alunos?.nome ?? "", x.alunos?.matricula ?? "", n.nomeTurma(x.turma_id), n.nomeDisciplina(x.disciplina_id),
        x.professor_id ? n.nomeProfessor(x.professor_id) : "", nota(x.nota_anterior), nota(x.nota_recuperacao), d(x.data_avaliacao), d(x.prazo), SITUACOES_RECUPERACAO[x.situacao]]) };
  }

  if (f.tipo === "eventos") {
    type E = { data: string; data_fim: string | null; hora: string | null; titulo: string; categoria: keyof typeof CATEGORIAS_EVENTO; turma_id: string | null; disciplina_id: string | null; professor_id: string | null };
    const e = await lerTodos<E>(() => {
      let q = sb.from("eventos").select("*").lte("data", f.fim!).gte("data_fim", f.inicio!);
      if (f.turma) q = q.or(`turma_id.eq.${f.turma},turma_id.is.null`);
      if (f.professor) q = q.eq("professor_id", f.professor);
      return q.order("data").order("hora") as never;
    });
    return { titulo: "Relatório de eventos", filtros, colunas: ["Data", "Horário", "Título", "Categoria", "Turma", "Disciplina", "Professor"],
      linhas: e.map((x) => [fmtData(x.data) + (x.data_fim && x.data_fim !== x.data ? ` a ${fmtData(x.data_fim)}` : ""), fmtHora(x.hora), x.titulo,
        CATEGORIAS_EVENTO[x.categoria] ?? x.categoria, x.turma_id ? n.nomeTurma(x.turma_id) : "Toda a escola",
        x.disciplina_id ? n.nomeDisciplina(x.disciplina_id) : "", x.professor_id ? n.nomeProfessor(x.professor_id) : ""]) };
  }

  // provas / trabalhos / atividades
  const tipo = f.tipo === "provas" ? "prova" : f.tipo === "trabalhos" ? "trabalho" : null;
  type A = { tipo: "prova" | "trabalho"; titulo: string; turma_id: string; disciplina_id: string; professor_id: string | null; data_realizacao: string | null; prazo_entrega: string | null };
  const a = await lerTodos<A>(() => {
    let q = sb.from("atividades").select("*")
      .or(`and(data_realizacao.gte.${f.inicio},data_realizacao.lte.${f.fim}),and(prazo_entrega.gte.${f.inicio},prazo_entrega.lte.${f.fim})`);
    if (tipo) q = q.eq("tipo", tipo);
    if (f.turma) q = q.eq("turma_id", f.turma);
    if (f.professor) q = q.eq("professor_id", f.professor);
    return q.order("id") as never;
  });
  a.sort((x, y) => (x.data_realizacao ?? x.prazo_entrega ?? "").localeCompare(y.data_realizacao ?? y.prazo_entrega ?? ""));
  const titulo = f.tipo === "provas" ? "Relação de provas" : f.tipo === "trabalhos" ? "Relação de trabalhos" : "Relatório de atividades escolares";
  return { titulo, filtros, colunas: ["Tipo", "Título", "Turma", "Disciplina", "Professor", "Realização", "Prazo de entrega"],
    linhas: a.map((x) => [x.tipo === "prova" ? "Prova" : "Trabalho", x.titulo, n.nomeTurma(x.turma_id), n.nomeDisciplina(x.disciplina_id),
      x.professor_id ? n.nomeProfessor(x.professor_id) : "", d(x.data_realizacao), d(x.prazo_entrega)]) };
}
