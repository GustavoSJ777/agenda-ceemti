import type { Papel } from "@/types";

export const NOME_SISTEMA = "Agenda Escolar CEEMTI Baixo Guandu";
export const NOME_ESCOLA = "CEEMTI Baixo Guandu";
export const MINUTOS_INATIVIDADE = 30;

export const ROTULO_PAPEL: Record<Papel, string> = {
  direcao: "Direção",
  secretaria: "Secretaria",
  professor: "Professor(a)",
  aluno: "Aluno(a)",
  coordenador: "Coordenação",
};

export const TURNOS = { integral: "Integral", matutino: "Matutino", vespertino: "Vespertino", noturno: "Noturno" } as const;
export const SITUACOES_MATRICULA = { ativa: "Ativa", transferida: "Transferida", trancada: "Trancada", concluida: "Concluída", cancelada: "Cancelada" } as const;
export const SITUACOES_RECUPERACAO = {
  pendente: "Pendente", em_andamento: "Em andamento", avaliacao_realizada: "Avaliação realizada",
  aguardando_resultado: "Aguardando resultado", concluida: "Concluída",
} as const;
export const PUBLICOS_AVISO = { todos: "Toda a escola", professores: "Professores", alunos: "Alunos", turma: "Turma específica" } as const;
export const TIPOS_ANOTACAO = { administrativa: "Administrativa", pedagogica: "Pedagógica", lembrete: "Lembrete" } as const;
export const CATEGORIAS_EVENTO = {
  prova: "Prova", trabalho: "Trabalho", seminario: "Seminário", apresentacao: "Apresentação",
  reuniao_pedagogica: "Reunião pedagógica", conselho_classe: "Conselho de classe", evento_escolar: "Evento escolar",
  feriado: "Feriado", recesso: "Recesso", data_comemorativa: "Data comemorativa", prazo_entrega: "Prazo de entrega",
} as const;
export const POR_PAGINA = 20;

export function opcoesDe(obj: Record<string, string>) {
  return Object.entries(obj).map(([v, l]) => ({ v, l }));
}

/** Cores por categoria do calendário (classes completas para o Tailwind enxergar). */
export const COR_CATEGORIA: Record<string, string> = {
  prova: "bg-red-100 text-red-800", trabalho: "bg-blue-100 text-blue-800", seminario: "bg-purple-100 text-purple-800",
  apresentacao: "bg-indigo-100 text-indigo-800", reuniao_pedagogica: "bg-teal-100 text-teal-800", conselho_classe: "bg-amber-100 text-amber-800",
  evento_escolar: "bg-sky-100 text-sky-800", feriado: "bg-rose-100 text-rose-800", recesso: "bg-orange-100 text-orange-800",
  data_comemorativa: "bg-pink-100 text-pink-800", prazo_entrega: "bg-yellow-100 text-yellow-800",
};
