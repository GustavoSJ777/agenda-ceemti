import { z } from "zod";
import { uuid } from "./comuns";

export const esquemaAluno = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(150).refine((v) => v.split(/\s+/).length >= 2, "Informe o nome completo (nome e sobrenome)."),
  matricula: z.string().trim().min(1, "Informe a matrícula.").max(30),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(150).optional(),
  turma_id: uuid("Escolha a turma."),
  ano_letivo: z.coerce.number().int().min(2000, "Ano letivo inválido.").max(2100, "Ano letivo inválido."),
  situacao: z.enum(["ativa", "transferida", "trancada", "concluida", "cancelada"], { message: "Situação inválida." }),
});

export const esquemaAcessoAluno = z.object({
  senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(72),
});
