import { z } from "zod";

const opc = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const TIPOS_RELATORIO = {
  alunos: { nome: "Alunos por turma", desc: "Relação nominal de alunos matriculados.", filtros: ["ano", "turma", "sit"] },
  provas: { nome: "Provas por período", desc: "Provas com data de realização no período.", filtros: ["turma", "professor", "periodo"] },
  trabalhos: { nome: "Trabalhos", desc: "Trabalhos com prazo de entrega no período.", filtros: ["turma", "professor", "periodo"] },
  recuperacoes: { nome: "Recuperações", desc: "Acompanhamento de recuperações.", filtros: ["turma", "professor", "recsit", "periodo"] },
  atividades: { nome: "Atividades escolares", desc: "Provas e trabalhos juntos.", filtros: ["turma", "professor", "periodo"] },
  eventos: { nome: "Eventos", desc: "Eventos do calendário no período.", filtros: ["turma", "professor", "periodo"] },
} as const;
export type TipoRelatorio = keyof typeof TIPOS_RELATORIO;

export const esquemaRelatorio = z.object({
  tipo: z.enum(["alunos", "provas", "trabalhos", "recuperacoes", "atividades", "eventos"], { message: "Tipo de relatório inválido." }),
  ano: opc(z.coerce.number().int().min(2000).max(2100)),
  turma: opc(z.string().uuid()),
  professor: opc(z.string().uuid()),
  sit: opc(z.enum(["ativa", "transferida", "trancada", "concluida", "cancelada"])),
  recsit: opc(z.enum(["pendente", "em_andamento", "avaliacao_realizada", "aguardando_resultado", "concluida"])),
  inicio: opc(iso),
  fim: opc(iso),
}).superRefine((v, ctx) => {
  const usaPeriodo = (TIPOS_RELATORIO[v.tipo].filtros as readonly string[]).includes("periodo");
  if (usaPeriodo) {
    if (!v.inicio || !v.fim) ctx.addIssue({ code: "custom", message: "Informe o período do relatório.", path: ["inicio"] });
    else if (v.fim < v.inicio) ctx.addIssue({ code: "custom", message: "A data final não pode ser anterior à inicial.", path: ["fim"] });
  }
});
export type FiltrosRelatorio = z.infer<typeof esquemaRelatorio>;
