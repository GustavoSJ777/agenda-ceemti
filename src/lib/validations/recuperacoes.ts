import { z } from "zod";
import { dataOpc, nota, textoOpc, uuid, uuidOpc } from "./comuns";

export const esquemaRecuperacao = z.object({
  turma_id: uuid("Escolha a turma."),
  aluno_id: uuid("Escolha o aluno."),
  disciplina_id: uuid("Escolha a disciplina."),
  professor_id: uuidOpc,
  nota_anterior: nota,
  nota_recuperacao: nota,
  data_avaliacao: dataOpc,
  prazo: dataOpc,
  situacao: z.enum(["pendente", "em_andamento", "avaliacao_realizada", "aguardando_resultado", "concluida"], { message: "Situação inválida." }),
  observacoes: textoOpc(1000),
}).superRefine((v, ctx) => {
  if (v.situacao === "concluida" && v.nota_recuperacao === undefined) {
    ctx.addIssue({ code: "custom", message: "Para marcar como concluída, informe a nota da recuperação.", path: ["nota_recuperacao"] });
  }
});
