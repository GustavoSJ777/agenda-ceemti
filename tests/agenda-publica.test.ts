import { describe, expect, it } from "vitest";
import { avisosAbertos, daTurma, montarItens } from "@/lib/utils/agenda-publica";

const ev = (o: Partial<Parameters<typeof montarItens>[0][number]>) => ({ id: "1", titulo: "Feira", descricao: null, categoria: "evento_escolar", data: "2026-11-10", data_fim: null, hora: null, turma_id: null, disciplina_id: null, ...o });

describe("agenda pública", () => {
  it("esconde reuniões pedagógicas e conselhos de classe", () => {
    const itens = montarItens([ev({ id: "a" }), ev({ id: "b", categoria: "reuniao_pedagogica" }), ev({ id: "c", categoria: "conselho_classe" })], [], "2026-11-01", "2026-11-30");
    expect(itens.map((i) => i.chave)).toEqual(["ea"]);
  });

  it("transforma prova e trabalho em itens nas datas certas", () => {
    const itens = montarItens([], [
      { id: "p", tipo: "prova", titulo: "Bimestral", disciplina_id: "d", turma_id: "t", data_realizacao: "2026-11-12", prazo_entrega: null, orientacoes: null },
      { id: "t", tipo: "trabalho", titulo: "Maquete", disciplina_id: "d", turma_id: "t", data_realizacao: "2026-11-20", prazo_entrega: "2026-11-18", orientacoes: "Em grupo" },
    ], "2026-11-01", "2026-11-30");
    expect(itens.map((i) => [i.data, i.titulo])).toEqual([
      ["2026-11-12", "Prova: Bimestral"], ["2026-11-18", "Trabalho: Maquete"], ["2026-11-20", "Apresentação: Maquete"],
    ]);
  });

  it("mostra só avisos abertos, publicados e válidos", () => {
    const base = { conteudo: "x", turma_id: null, data_publicacao: "2026-11-01", validade: null };
    const r = avisosAbertos([
      { ...base, id: "1", titulo: "Todos", publico: "todos" },
      { ...base, id: "2", titulo: "Prof", publico: "professores" },
      { ...base, id: "3", titulo: "Vencido", publico: "alunos", validade: "2026-11-05" },
      { ...base, id: "4", titulo: "Futuro", publico: "todos", data_publicacao: "2026-12-01" },
    ], "2026-11-25");
    expect(r.map((a) => a.id)).toEqual(["1"]);
  });

  it("filtro por turma mantém o que é da escola toda", () => {
    const l = [{ turma_id: null }, { turma_id: "A" }, { turma_id: "B" }];
    expect(daTurma(l, "A")).toEqual([{ turma_id: null }, { turma_id: "A" }]);
  });
});
