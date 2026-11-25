import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { medir } from "@/lib/tempos";
import { checar } from "@/lib/actions/resultado";
import type { ItemCalendario } from "@/lib/utils/calendario";

/** Carrega eventos e atividades que tocam o intervalo [inicio, fim] (datas ISO). O RLS filtra por perfil. */
export async function carregarItens(sb: SupabaseClient, inicio: string, fim: string): Promise<ItemCalendario[]> {
  const [ev, at] = await medir("calendario.consultas", () => Promise.all([
    sb.from("eventos").select("*").lte("data", fim).gte("data_fim", inicio).order("data").order("hora"),
    sb.from("atividades").select("*")
      .or(`and(data_realizacao.gte.${inicio},data_realizacao.lte.${fim}),and(prazo_entrega.gte.${inicio},prazo_entrega.lte.${fim})`),
  ]));
  const itens: ItemCalendario[] = [];
  for (const e of checar(ev) ?? []) {
    itens.push({
      origem: "evento", id: e.id, titulo: e.titulo, descricao: e.descricao, categoria: e.categoria, data: e.data,
      data_fim: e.data_fim ?? e.data, hora: e.hora, turma_id: e.turma_id, disciplina_id: e.disciplina_id, professor_id: e.professor_id, bruto: e,
    });
  }
  for (const a of checar(at) ?? []) {
    const push = (data: string | null, categoria: string, prefixo: string) => {
      if (!data || data < inicio || data > fim) return;
      itens.push({
        origem: "atividade", id: a.id, titulo: prefixo + a.titulo, descricao: a.orientacoes, categoria, data, data_fim: data, hora: null,
        turma_id: a.turma_id, disciplina_id: a.disciplina_id, professor_id: a.professor_id, bruto: a,
      });
    };
    if (a.tipo === "prova") {
      push(a.data_realizacao, "prova", "Prova: ");
      if (a.prazo_entrega) push(a.prazo_entrega, "prazo_entrega", "Prazo (prova): ");
    } else {
      push(a.prazo_entrega, "trabalho", "Trabalho: ");
      if (a.data_realizacao && a.data_realizacao !== a.prazo_entrega) push(a.data_realizacao, "apresentacao", "Apresentação: ");
    }
  }
  return itens;
}
