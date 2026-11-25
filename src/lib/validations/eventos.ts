import { z } from "zod";
import { dataISO, dataOpc, horaOpc, textoOpc, uuidOpc } from "./comuns";

export const esquemaEvento = z.object({
  titulo: z.string().min(3, "O título deve ter ao menos 3 caracteres.").max(120),
  categoria: z.enum(["prova", "trabalho", "seminario", "apresentacao", "reuniao_pedagogica", "conselho_classe", "evento_escolar", "feriado", "recesso", "data_comemorativa", "prazo_entrega"], { message: "Escolha a categoria." }),
  data: dataISO("Informe a data."),
  data_fim: dataOpc,
  hora: horaOpc,
  turma_id: uuidOpc,
  disciplina_id: uuidOpc,
  professor_id: uuidOpc,
  descricao: textoOpc(1000),
}).superRefine((v, ctx) => {
  if (v.data_fim && v.data_fim < v.data) ctx.addIssue({ code: "custom", message: "A data final não pode ser anterior à data inicial.", path: ["data_fim"] });
});

export const esquemaVinculoHorario = z.object({
  codigo: z.string().trim().min(1).max(60),
  turma_id: z.string().uuid("Turma inválida."),
});
