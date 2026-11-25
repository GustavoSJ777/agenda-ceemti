import { z } from "zod";
import { dataISO, dataOpc, uuidOpc } from "./comuns";

export const esquemaAviso = z.object({
  titulo: z.string().min(3, "O título deve ter ao menos 3 caracteres.").max(120),
  conteudo: z.string().min(1, "Informe o conteúdo do aviso.").max(3000),
  publico: z.enum(["todos", "professores", "alunos", "turma"], { message: "Escolha os destinatários." }),
  turma_id: uuidOpc,
  data_publicacao: dataISO("Informe a data de publicação."),
  validade: dataOpc,
}).superRefine((v, ctx) => {
  if (v.publico === "turma" && !v.turma_id) ctx.addIssue({ code: "custom", message: "Escolha a turma de destino.", path: ["turma_id"] });
  if (v.validade && v.validade < v.data_publicacao) ctx.addIssue({ code: "custom", message: "A validade não pode ser anterior à data de publicação.", path: ["validade"] });
}).transform((v) => ({ ...v, turma_id: v.publico === "turma" ? v.turma_id : undefined }));

export const esquemaAnotacao = z.object({
  tipo: z.enum(["administrativa", "pedagogica", "lembrete"], { message: "Escolha o tipo." }),
  titulo: z.string().min(3, "O título deve ter ao menos 3 caracteres.").max(120),
  conteudo: z.string().min(1, "Informe o conteúdo.").max(5000),
  turma_id: uuidOpc,
  disciplina_id: uuidOpc,
  compartilhada: z.string().optional().transform((v) => v === "on"),
});
