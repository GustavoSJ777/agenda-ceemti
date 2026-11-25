import { z } from "zod";
import { uuid } from "./comuns";
import { matriculaValidaParaLogin } from "@/lib/utils/login-aluno";

export const LIMITE_LINHAS = 500;
export const LIMITE_BYTES = 2 * 1024 * 1024;

export const esquemaImportacao = z.object({
  turma_id: uuid("Escolha a turma padrão.").optional(),
  ano_letivo: z.coerce.number().int().min(2000, "Ano letivo inválido.").max(2100, "Ano letivo inválido."),
});

export const esquemaLinhaAluno = z.object({
  matricula: z.string().trim().min(1, "Matrícula vazia.").max(30, "Matrícula muito longa.")
    .refine(matriculaValidaParaLogin, "Matrícula só pode ter letras, números, ponto, hífen e sublinhado."),
  nome: z.string().trim().min(3, "Nome muito curto.").max(150).refine((v) => v.split(/\s+/).length >= 2, "Informe nome e sobrenome."),
});

/** Normaliza cabeçalho: sem acento, minúsculo, só letras/números. */
export const normalizarCabecalho = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const COLUNAS = {
  matricula: ["matricula", "matric", "mat", "codigo"],
  nome: ["nome", "aluno", "nomedoaluno", "nomecompleto", "estudante"],
  turma: ["turma", "classe"],
} as const;
