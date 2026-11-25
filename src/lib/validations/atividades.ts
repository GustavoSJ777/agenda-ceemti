import { z } from "zod";
import { dataOpc, textoOpc, uuid, uuidOpc } from "./comuns";

export const esquemaAtividade = z.object({
  tipo: z.enum(["prova", "trabalho"], { message: "Escolha o tipo." }),
  titulo: z.string().min(3, "O título deve ter ao menos 3 caracteres.").max(120),
  turma_id: uuidOpc,
  disciplina_id: uuidOpc,
  professor_id: uuidOpc,
  par: z.string().regex(/^[0-9a-f-]{36}\|[0-9a-f-]{36}$/i, "Escolha a turma e a disciplina.").optional(),
  data_realizacao: dataOpc,
  prazo_entrega: dataOpc,
  orientacoes: textoOpc(2000),
}).superRefine((v, ctx) => {
  if (v.tipo === "prova" && !v.data_realizacao) ctx.addIssue({ code: "custom", message: "Informe a data de realização da prova.", path: ["data_realizacao"] });
  if (v.tipo === "trabalho" && !v.prazo_entrega) ctx.addIssue({ code: "custom", message: "Informe o prazo de entrega do trabalho.", path: ["prazo_entrega"] });
});
export { uuid };
