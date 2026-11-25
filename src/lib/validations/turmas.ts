import { z } from "zod";
import { textoOpc, uuid } from "./comuns";

export const esquemaSerie = z.object({
  nome: z.string().min(1, "Informe o nome da série.").max(40, "Use no máximo 40 caracteres."),
  ordem: z.coerce.number().int("A ordem deve ser um número inteiro.").min(0).max(99).default(0),
});

export const esquemaDisciplina = z.object({
  nome: z.string().min(2, "O nome deve ter ao menos 2 caracteres.").max(80),
  codigo: textoOpc(20),
});

export const esquemaTurma = z.object({
  nome: z.string().min(1, "Informe o nome da turma.").max(40),
  serie_id: uuid("Escolha a série."),
  turno: z.enum(["integral", "matutino", "vespertino", "noturno"], { message: "Escolha o turno." }),
  ano_letivo: z.coerce.number().int().min(2000, "Ano letivo inválido.").max(2100, "Ano letivo inválido."),
});

export const esquemaVinculo = z.object({
  turma_id: uuid("Escolha a turma."),
  disciplina_id: uuid("Escolha a disciplina."),
});

export const esquemaDadosProfessor = z.object({
  registro_funcional: textoOpc(40),
  area: textoOpc(80),
});
