"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import {
  esquemaDadosProfessor, esquemaDisciplina, esquemaSerie, esquemaTurma, esquemaVinculo,
} from "@/lib/validations/turmas";

const GESTAO = ["direcao", "secretaria"] as const;
type Tabela = "turmas" | "series" | "disciplinas";

async function gravar(tabela: Tabela, id: string, payload: Record<string, unknown>) {
  const sb = await criarClienteServidor();
  if (id) checar(await sb.from(tabela).update(payload).eq("id", id));
  else checar(await sb.from(tabela).insert(payload));
  revalidatePath("/turmas");
}
async function remover(tabela: Tabela | "professor_turmas", id: string) {
  const sb = await criarClienteServidor();
  const r = await sb.from(tabela).delete().eq("id", id).select("id");
  // RLS que filtra o registro devolve 0 linhas sem erro: tratamos como falta de permissão.
  if ((checar(r) ?? []).length === 0) throw { code: "42501", message: "row-level security" };
  revalidatePath("/turmas");
}

export async function salvarTurma(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel([...GESTAO]);
    const v = validar(esquemaTurma, lerForm(fd));
    await gravar("turmas", id, v);
    return id ? "Turma atualizada." : "Turma cadastrada.";
  });
}
export async function excluirTurma(id: string) {
  return executar(async () => { await exigirPapel([...GESTAO]); await remover("turmas", id); return "Registro excluído."; });
}

export async function salvarSerie(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel([...GESTAO]);
    const v = validar(esquemaSerie, lerForm(fd));
    await gravar("series", id, v);
    return id ? "Série atualizada." : "Série cadastrada.";
  });
}
export async function excluirSerie(id: string) {
  return executar(async () => { await exigirPapel([...GESTAO]); await remover("series", id); return "Registro excluído."; });
}

export async function salvarDisciplina(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel([...GESTAO]);
    const v = validar(esquemaDisciplina, lerForm(fd));
    await gravar("disciplinas", id, paraBanco(v));
    return id ? "Disciplina atualizada." : "Disciplina cadastrada.";
  });
}
export async function excluirDisciplina(id: string) {
  return executar(async () => { await exigirPapel([...GESTAO]); await remover("disciplinas", id); return "Registro excluído."; });
}

export async function criarVinculo(professorId: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel([...GESTAO]);
    const v = validar(esquemaVinculo, lerForm(fd));
    const sb = await criarClienteServidor();
    checar(await sb.from("professor_turmas").insert({ professor_id: professorId, ...v }));
    revalidatePath("/turmas");
    return "Vínculo criado.";
  });
}
export async function removerVinculo(id: string) {
  return executar(async () => { await exigirPapel([...GESTAO]); await remover("professor_turmas", id); return "Vínculo removido."; });
}

export async function salvarDadosProfessor(perfilId: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel(["direcao"]);
    const v = validar(esquemaDadosProfessor, lerForm(fd));
    const sb = await criarClienteServidor();
    checar(await sb.from("professores").update(paraBanco(v)).eq("perfil_id", perfilId));
    revalidatePath("/turmas");
    return "Dados atualizados.";
  });
}
