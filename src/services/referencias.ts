import "server-only";
import { cache } from "react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { checar } from "@/lib/actions/resultado";
import { medir } from "@/lib/tempos";
import { obterIdUsuario } from "@/lib/auth";
import { cacheCurto } from "@/lib/cache-curto";
import type { Disciplina, ProfessorNome, Serie, Turma, Vinculo } from "@/types/db";

export interface Referencias {
  series: Serie[];
  disciplinas: Disciplina[];
  turmas: Turma[];
  professores: ProfessorNome[];
  vinculos: Vinculo[];
}

/** Tabelas de apoio (pequenas), lidas com a sessão do usuário: o RLS decide o que cada perfil enxerga. */
export const carregarReferencias = cache(async (): Promise<Referencias> => {
  const id = await obterIdUsuario(); // local, sem rede: permite buscar em paralelo com o perfil
  if (!id) return buscarReferencias();
  return cacheCurto(`ref:${id}`, 30, buscarReferencias);
});

function buscarReferencias(): Promise<Referencias> {
  return medir("referencias", buscarReferenciasSemMedida);
}

async function buscarReferenciasSemMedida(): Promise<Referencias> {
  const sb = await criarClienteServidor();
  const [series, disciplinas, turmas, professores, vinculos] = await Promise.all([
    sb.from("series").select("id,nome,ordem").order("ordem").order("nome"),
    sb.from("disciplinas").select("id,nome,codigo").order("nome"),
    sb.from("turmas").select("id,nome,serie_id,turno,ano_letivo").order("ano_letivo", { ascending: false }).order("nome"),
    sb.from("v_professores").select("id,nome").order("nome"),
    sb.from("professor_turmas").select("id,professor_id,turma_id,disciplina_id"),
  ]);
  return {
    series: checar(series) as Serie[],
    disciplinas: checar(disciplinas) as Disciplina[],
    turmas: checar(turmas) as Turma[],
    professores: checar(professores) as ProfessorNome[],
    vinculos: checar(vinculos) as Vinculo[],
  };
}
