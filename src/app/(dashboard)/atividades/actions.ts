"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import { esquemaAtividade } from "@/lib/validations/atividades";

/**
 * Gestão informa turma, disciplina e professor. Professor escolhe um par turma|disciplina
 * dos seus vínculos e fica como responsável. O RLS do banco confere de novo (professor_leciona).
 */
export async function salvarAtividade(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const perfil = await exigirPerfil();
    if (perfil.papel !== "direcao" && perfil.papel !== "secretaria" && perfil.papel !== "professor") {
      throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    }
    const v = validar(esquemaAtividade, lerForm(fd));
    let turma_id = v.turma_id, disciplina_id = v.disciplina_id, professor_id = v.professor_id;
    if (perfil.papel === "professor") {
      if (!v.par) throw new ErroNegocio("Escolha a turma e a disciplina.");
      [turma_id, disciplina_id] = v.par.split("|");
      professor_id = perfil.id; // nunca confia no que veio do navegador
    } else if (!turma_id || !disciplina_id) {
      throw new ErroNegocio("Escolha a turma e a disciplina.");
    }
    const payload = paraBanco({
      tipo: v.tipo, titulo: v.titulo, turma_id, disciplina_id, professor_id,
      data_realizacao: v.data_realizacao, prazo_entrega: v.prazo_entrega, orientacoes: v.orientacoes,
    });
    const sb = await criarClienteServidor();
    if (id) {
      const r = checar(await sb.from("atividades").update(payload).eq("id", id).select("id"));
      if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para alterar esta atividade.");
    } else {
      checar(await sb.from("atividades").insert(payload));
    }
    revalidatePath("/atividades");
    revalidatePath("/calendario");
    return id ? "Atividade atualizada." : "Atividade cadastrada.";
  });
}

export async function excluirAtividade(id: string) {
  return executar(async () => {
    await exigirPerfil();
    const sb = await criarClienteServidor();
    const r = checar(await sb.from("atividades").delete().eq("id", id).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para excluir esta atividade.");
    revalidatePath("/atividades");
    revalidatePath("/calendario");
    return "Atividade excluída.";
  });
}
