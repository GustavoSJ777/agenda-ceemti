export interface Serie { id: string; nome: string; ordem: number }
export interface Disciplina { id: string; nome: string; codigo: string | null }
export interface Turma { id: string; nome: string; serie_id: string; turno: Turno; ano_letivo: number }
export interface Vinculo { id: string; professor_id: string; turma_id: string; disciplina_id: string }
export interface ProfessorNome { id: string; nome: string }

export type Turno = "integral" | "matutino" | "vespertino" | "noturno";
export type SituacaoMatricula = "ativa" | "transferida" | "trancada" | "concluida" | "cancelada";
export type SituacaoRecuperacao = "pendente" | "em_andamento" | "avaliacao_realizada" | "aguardando_resultado" | "concluida";
export type PublicoAviso = "todos" | "professores" | "alunos" | "turma";
export type TipoAnotacao = "administrativa" | "pedagogica" | "lembrete";
export type CategoriaEvento =
  | "prova" | "trabalho" | "seminario" | "apresentacao" | "reuniao_pedagogica" | "conselho_classe"
  | "evento_escolar" | "feriado" | "recesso" | "data_comemorativa" | "prazo_entrega";
