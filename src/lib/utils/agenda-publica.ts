/** Regras da Agenda PÚBLICA (sem login, só leitura). Funções puras, testadas em tests/agenda-publica.test.ts. */

/** Categorias internas da equipe que não aparecem para o público. */
export const CATEGORIAS_INTERNAS = new Set(["reuniao_pedagogica", "conselho_classe"]);
/** Públicos de aviso que podem ser vistos sem login (avisos só para professores ficam de fora). */
export const PUBLICOS_ABERTOS = new Set(["todos", "alunos", "turma"]);

export interface EventoBruto { id: string; titulo: string; descricao: string | null; categoria: string; data: string; data_fim: string | null; hora: string | null; turma_id: string | null; disciplina_id: string | null }
export interface AtividadeBruta { id: string; tipo: "prova" | "trabalho"; titulo: string; disciplina_id: string; turma_id: string; data_realizacao: string | null; prazo_entrega: string | null; orientacoes: string | null }
export interface AvisoBruto { id: string; titulo: string; conteudo: string; publico: string; turma_id: string | null; data_publicacao: string; validade: string | null }

export interface ItemAgenda { chave: string; titulo: string; descricao: string | null; categoria: string; data: string; data_fim: string; hora: string | null; turma_id: string | null; disciplina_id: string | null }

/** Junta eventos e provas/trabalhos do intervalo [inicio, fim] num formato único, já sem o que é interno. */
export function montarItens(eventos: EventoBruto[], atividades: AtividadeBruta[], inicio: string, fim: string): ItemAgenda[] {
  const itens: ItemAgenda[] = [];
  for (const e of eventos) {
    if (CATEGORIAS_INTERNAS.has(e.categoria)) continue;
    const df = e.data_fim ?? e.data;
    if (e.data > fim || df < inicio) continue;
    itens.push({ chave: `e${e.id}`, titulo: e.titulo, descricao: e.descricao, categoria: e.categoria, data: e.data, data_fim: df, hora: e.hora, turma_id: e.turma_id, disciplina_id: e.disciplina_id });
  }
  for (const a of atividades) {
    const add = (data: string | null, categoria: string, prefixo: string, sufixo: string) => {
      if (!data || data < inicio || data > fim) return;
      itens.push({ chave: `a${a.id}${sufixo}`, titulo: prefixo + a.titulo, descricao: a.orientacoes, categoria, data, data_fim: data, hora: null, turma_id: a.turma_id, disciplina_id: a.disciplina_id });
    };
    if (a.tipo === "prova") {
      add(a.data_realizacao, "prova", "Prova: ", "r");
      if (a.prazo_entrega) add(a.prazo_entrega, "prazo_entrega", "Prazo (prova): ", "p");
    } else {
      add(a.prazo_entrega, "trabalho", "Trabalho: ", "p");
      if (a.data_realizacao && a.data_realizacao !== a.prazo_entrega) add(a.data_realizacao, "apresentacao", "Apresentação: ", "r");
    }
  }
  return itens.sort((x, y) => x.data.localeCompare(y.data) || (x.hora ?? "").localeCompare(y.hora ?? "") || x.titulo.localeCompare(y.titulo));
}

/** Avisos que o público pode ver hoje: já publicados, ainda válidos e não restritos a professores. */
export function avisosAbertos(avisos: AvisoBruto[], hoje: string): AvisoBruto[] {
  return avisos
    .filter((a) => PUBLICOS_ABERTOS.has(a.publico) && a.data_publicacao <= hoje && (!a.validade || a.validade >= hoje))
    .sort((x, y) => y.data_publicacao.localeCompare(x.data_publicacao));
}

/** Filtra por turma: itens da escola toda (sem turma) aparecem sempre. */
export function daTurma<T extends { turma_id: string | null }>(lista: T[], turma?: string): T[] {
  return turma ? lista.filter((i) => !i.turma_id || i.turma_id === turma) : lista;
}
