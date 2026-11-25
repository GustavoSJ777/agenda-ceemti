import { z } from "zod";
import { emailDeLogin } from "@/lib/utils/login-aluno";

export const esquemaLogin = z.object({
  // Aceita e-mail ou matrícula (aluno); o resultado é sempre o e-mail usado no Supabase Auth.
  email: z.string().trim().max(150).transform((v, ctx) => {
    const e = emailDeLogin(v);
    if (!e) ctx.addIssue({ code: "custom", message: "Informe seu e-mail ou matrícula." });
    return e ?? "";
  }),
  senha: z.string().min(1, "Informe a senha.").max(200),
});

export const esquemaRecuperar = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
});

export const esquemaNovaSenha = z
  .object({
    senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres.").max(72),
    senha2: z.string(),
  })
  .refine((v) => v.senha === v.senha2, { message: "As senhas não coincidem.", path: ["senha2"] });
