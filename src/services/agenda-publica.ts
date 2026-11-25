import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cacheCurto } from "@/lib/cache-curto";
import { avisosAbertos, montarItens, type AtividadeBruta, type AvisoBruto, type EventoBruto, type ItemAgenda } from "@/lib/utils/agenda-publica";

export interface AgendaPublica {
  itens: ItemAgenda[];
  avisos: AvisoBruto[];
  turmas: { id: string; nome: string }[];
  disciplinas: Record<string, string>;
}

/**
 * Agenda para a página PÚBLICA (sem login, só leitura). Lê com a service role, só no servidor, e devolve apenas
 * campos de calendário: título, descrição, data, categoria, turma e matéria. Nunca alunos, notas, recuperações,
 * anotações, e-mails ou nomes de quem cadastrou. Reuniões pedagógicas, conselhos de classe e avisos só para
 * professores ficam de fora.
 */
export function carregarAgendaPublica(inicio: string, fim: string, hoje: string): Promise<AgendaPublica> {
  return cacheCurto(`agenda-publica:${inicio}:${fim}:${hoje}`, 120, async () => {
    const sb = criarClienteAdmin();
    const [ev, at, av, tu, di] = await Promise.all([
      sb.from("eventos").select("id,titulo,descricao,categoria,data,data_fim,hora,turma_id,disciplina_id").lte("data", fim).gte("data_fim", inicio).order("data").limit(2000),
      sb.from("atividades").select("id,tipo,titulo,disciplina_id,turma_id,data_realizacao,prazo_entrega,orientacoes")
        .or(`and(data_realizacao.gte.${inicio},data_realizacao.lte.${fim}),and(prazo_entrega.gte.${inicio},prazo_entrega.lte.${fim})`).limit(2000),
      sb.from("avisos").select("id,titulo,conteudo,publico,turma_id,data_publicacao,validade").in("publico", ["todos", "alunos", "turma"])
        .lte("data_publicacao", hoje).order("data_publicacao", { ascending: false }).limit(200),
      sb.from("turmas").select("id,nome,ano_letivo").order("nome"),
      sb.from("disciplinas").select("id,nome"),
    ]);
    if (ev.error || at.error || av.error || tu.error || di.error) throw new Error("Falha ao carregar a agenda pública.");
    const anoAtual = Number(hoje.slice(0, 4));
    const turmas = (tu.data as { id: string; nome: string; ano_letivo: number }[]);
    const doAno = turmas.filter((t) => t.ano_letivo === anoAtual);
    return {
      itens: montarItens(ev.data as EventoBruto[], at.data as AtividadeBruta[], inicio, fim),
      avisos: avisosAbertos(av.data as AvisoBruto[], hoje),
      turmas: (doAno.length ? doAno : turmas).map(({ id, nome }) => ({ id, nome })),
      disciplinas: Object.fromEntries((di.data as { id: string; nome: string }[]).map((d) => [d.id, d.nome])),
    };
  });
}
