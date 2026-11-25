import { z } from "zod";

export const esquemaNovoUsuario = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo.").refine((v) => v.split(/\s+/).length >= 2, "Informe o nome completo (nome e sobrenome)."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(72),
  papel: z.enum(["direcao", "secretaria", "professor", "aluno", "coordenador"], { message: "Perfil inválido." }),
  aluno_id: z.string().uuid("Selecione o aluno para vincular ao acesso.").optional(),
});
export type NovoUsuario = z.infer<typeof esquemaNovoUsuario>;

export const esquemaEditarUsuario = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  papel: z.enum(["direcao", "secretaria"]).optional(),
  ativo: z.boolean(),
});
