"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm } from "@/lib/forms";
import { esquemaAcessoAluno, esquemaAluno } from "@/lib/validations/alunos";
import { criarUsuario } from "@/services/criar-usuario";

/** Cadastra/edita aluno + matrícula pela função atômica do banco (que também confere o perfil). */
export async function salvarAluno(alunoId: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel(["direcao", "secretaria"]);
    const v = validar(esquemaAluno, lerForm(fd));
    const sb = await criarClienteServidor();
    checar(await sb.rpc("salvar_aluno", {
      p_aluno_id: alunoId || null, p_nome: v.nome, p_matricula: v.matricula, p_email: v.email ?? "",
      p_turma_id: v.turma_id, p_ano: v.ano_letivo, p_situacao: v.situacao,
    }));
    const { data: turma } = await sb.from("turmas").select("ano_letivo").eq("id", v.turma_id).maybeSingle();
    revalidatePath("/alunos");
    const base = alunoId ? "Aluno atualizado." : "Aluno cadastrado.";
    return turma && turma.ano_letivo !== v.ano_letivo
      ? `${base} Atenção: o ano da matrícula (${v.ano_letivo}) é diferente do ano letivo da turma (${turma.ano_letivo}).`
      : base;
  });
}

/** Exclusão definitiva (direito de eliminação da LGPD). Somente Direção; o RLS também confere. */
export async function excluirAluno(alunoId: string) {
  return executar(async () => {
    await exigirPapel(["direcao"]);
    const sb = await criarClienteServidor();
    const r = checar(await sb.from("alunos").delete().eq("id", alunoId).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    revalidatePath("/alunos");
    return "Aluno excluído.";
  });
}

export async function criarAcessoAluno(alunoId: string, nome: string, email: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const perfil = await exigirPapel(["direcao", "secretaria"]);
    const { senha } = validar(esquemaAcessoAluno, lerForm(fd));
    await criarUsuario(perfil, { nome, email, senha, papel: "aluno", aluno_id: alunoId });
    revalidatePath("/alunos");
    return "Acesso criado. O aluno já pode entrar.";
  });
}
