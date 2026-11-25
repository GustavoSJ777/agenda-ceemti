"use server";

import { headers } from "next/headers";
import { urlBase } from "@/lib/utils/redirecionamento";
import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarUsuario } from "@/services/criar-usuario";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { esquemaEditarUsuario } from "@/lib/validations/usuarios";

/** Cria login de Direção, Secretaria ou Professor (acesso de aluno nasce na área Alunos). */
export async function novoUsuario(_: unknown, __: EstadoForm, fd: FormData) {
  return executar(async () => {
    const perfil = await exigirPapel(["direcao"]);
    const papel = String(fd.get("papel") ?? "");
    if (papel === "aluno") throw new ErroNegocio("Crie o acesso de aluno na área Alunos.");
    await criarUsuario(perfil, {
      nome: fd.get("nome"), email: fd.get("email"), senha: fd.get("senha"), papel,
    });
    revalidatePath("/usuarios");
    return "Usuário criado.";
  });
}

export async function editarUsuario(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const eu = await exigirPapel(["direcao"]);
    const proprio = eu.id === id;
    const v = validar(esquemaEditarUsuario, {
      nome: fd.get("nome"),
      papel: fd.get("papel") || undefined,
      ativo: proprio ? true : fd.get("ativo") === "on",
    });
    const sb = await criarClienteServidor();
    const { data: atual } = await sb.from("perfis").select("papel").eq("id", id).maybeSingle();
    if (!atual) throw new ErroNegocio("Usuário não encontrado.");
    const cambiavel = atual.papel === "direcao" || atual.papel === "secretaria";
    const alteracao: Record<string, unknown> = { nome: v.nome };
    if (!proprio) {
      alteracao.ativo = v.ativo;
      if (cambiavel && v.papel) alteracao.papel = v.papel;
    }
    const r = checar(await sb.from("perfis").update(alteracao).eq("id", id).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    revalidatePath("/usuarios");
    return "Usuário atualizado.";
  });
}

export async function enviarLinkSenha(id: string) {
  return executar(async () => {
    await exigirPapel(["direcao"]);
    const sb = await criarClienteServidor();
    const { data } = await sb.from("perfis").select("email").eq("id", id).maybeSingle();
    if (!data) throw new ErroNegocio("Usuário não encontrado.");
    const h = await headers();
      
    const { error } = await sb.auth.resetPasswordForEmail(data.email, { redirectTo: `${urlBase(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"))}/auth/callback?next=/nova-senha` });
    if (error) throw new ErroNegocio("Não foi possível enviar o link agora. Tente novamente em instantes.");
    return `Link enviado para ${data.email}.`;
  });
}
