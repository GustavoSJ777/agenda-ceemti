"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import { esquemaRecuperacao } from "@/lib/validations/recuperacoes";

/** Direção e professores escrevem (Secretaria só consulta). O RLS confere turma+disciplina do professor. */
export async function salvarRecuperacao(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const perfil = await exigirPapel(["direcao", "professor"]);
    const v = validar(esquemaRecuperacao, lerForm(fd));
    const payload = paraBanco({ ...v, professor_id: perfil.papel === "professor" ? perfil.id : v.professor_id });
    const sb = await criarClienteServidor();
    if (id) {
      const r = checar(await sb.from("recuperacoes").update(payload).eq("id", id).select("id"));
      if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para alterar este registro.");
    } else {
      checar(await sb.from("recuperacoes").insert(payload));
    }
    revalidatePath("/recuperacoes");
    revalidatePath("/dashboard");
    return id ? "Recuperação atualizada." : "Recuperação cadastrada.";
  });
}

export async function excluirRecuperacao(id: string) {
  return executar(async () => {
    await exigirPapel(["direcao", "professor"]);
    const sb = await criarClienteServidor();
    const r = checar(await sb.from("recuperacoes").delete().eq("id", id).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para excluir este registro.");
    revalidatePath("/recuperacoes");
    revalidatePath("/dashboard");
    return "Registro excluído.";
  });
}
