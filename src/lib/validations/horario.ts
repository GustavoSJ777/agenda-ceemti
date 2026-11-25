import { z } from "zod";
import { dataISO, uuidOpc } from "./comuns";

const texto = (max: number, msg: string) => z.string().trim().min(1, msg).max(max, `Use no máximo ${max} caracteres.`);
const opc = (max: number) => z.string().trim().max(max).optional();
const dia = z.coerce.number().int().min(1, "Dia inválido.").max(5, "Use segunda a sexta.");
const aulaN = z.coerce.number().int().min(1, "Aula inválida.").max(9, "Aula inválida.");

export const esquemaSala = z.object({ nome: texto(60, "Informe o nome da sala.") });

export const esquemaTurmaHorario = z.object({
  codigo: texto(60, "Informe o código da turma."),
  turma_id: uuidOpc,
  sala_base: opc(60),
});

export const esquemaDemanda = z.object({
  turma_codigo: texto(60, "Escolha a turma."),
  disciplina: texto(60, "Informe a disciplina."),
  professor: texto(80, "Informe o professor."),
  aulas_semana: z.coerce.number({ message: "Informe as aulas por semana." }).int().min(1, "Mínimo 1 aula por semana.").max(20, "Máximo 20 aulas por semana."),
  sala: opc(60),
});

export const esquemaIndisp = z.object({
  professor: texto(80, "Informe o professor."),
  dia_semana: dia,
  aula_de: aulaN,
  aula_ate: aulaN,
  motivo: opc(120),
}).refine((v) => v.aula_ate >= v.aula_de, { message: "A aula final não pode vir antes da inicial.", path: ["aula_ate"] });

export const esquemaGerar = z.object({
  vigencia: dataISO("Informe a data de início da vigência."),
  substituir: z.string().optional(),
});

export const esquemaProfessor = z.object({
  nome: texto(80, "Informe o nome do professor."),
});

export const esquemaMateria = z.object({
  turmas: z.array(z.string().trim().min(1)).min(1, "Escolha ao menos uma turma."),
  disciplina: texto(60, "Informe a matéria."),
  professor: texto(80, "Informe o professor."),
  aulas_semana: z.coerce.number({ message: "Informe as aulas por semana." }).int().min(1, "Mínimo 1 aula por semana.").max(20, "Máximo 20 aulas por semana."),
  sala: opc(60),
});

export const esquemaImportarGrade = z.object({
  vigencia: dataISO("Escolha a versão do horário."),
  substituir: z.string().optional(),
});

export const esquemaAulaGrade = z.object({
  turma_codigo: texto(60, "Turma inválida."),
  vigencia: dataISO(),
  dia_semana: dia,
  aula: aulaN,
  disciplina: texto(60, "Informe a disciplina."),
  professor: opc(80),
  sala: opc(60),
});

export const esquemaSugestao = z.object({
  vigencia: dataISO(),
  escolha: z.string().regex(/^(mover:[1-5]:[1-9]|trocar:[0-9a-f-]{36})$/, "Escolha uma das soluções."),
});

export const esquemaDisponibilidade = z.object({
  professor: texto(80, "Informe o professor."),
  dias: z.array(z.coerce.number().int().min(1).max(5)).min(1, "Marque ao menos um dia em que o professor pode dar aula."),
  de: z.coerce.number().int().min(1, "Aula inicial inválida.").max(7, "Aula inicial inválida."),
  ate: z.coerce.number().int().min(1, "Aula final inválida.").max(7, "Aula final inválida."),
}).refine((v) => v.ate >= v.de, { message: "A aula final não pode vir antes da inicial.", path: ["ate"] });
