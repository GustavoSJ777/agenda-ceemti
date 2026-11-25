"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import { esquemaEvento, esquemaVinculoHorario } from "@/lib/validations/eventos";

/** Eventos do calendário: somente Direção e Secretaria (regra do sistema original). */
export async function salvarEvento(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel(["direcao", "secretaria"]);
    const v = validar(esquemaEvento, lerForm(fd));
    const sb = await criarClienteServidor();
    if (id) {
      const r = checar(await sb.from("eventos").update(paraBanco(v)).eq("id", id).select("id"));
      if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    } else {
      checar(await sb.from("eventos").insert(paraBanco(v)));
    }
    revalidatePath("/calendario");
    revalidatePath("/dashboard");
    return id ? "Evento atualizado." : "Evento cadastrado.";
  });
}

export async function excluirEvento(id: string) {
  return executar(async () => {
    await exigirPapel(["direcao", "secretaria"]);
    const sb = await criarClienteServidor();
    const r = checar(await sb.from("eventos").delete().eq("id", id).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    revalidatePath("/calendario");
    revalidatePath("/dashboard");
    return "Evento excluído.";
  });
}

/** Vincula cada código do horário oficial a uma turma do sistema. Somente Direção (o RLS também exige). */
export async function vincularHorarioTurmas(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel(["direcao", "coordenador"]);
    const sb = await criarClienteServidor();
    let n = 0;
    for (let i = 0; fd.has(`codigo_${i}`); i++) {
      const codigo = String(fd.get(`codigo_${i}`) ?? "");
      const turma = String(fd.get(`turma_${i}`) ?? "");
      if (!turma) continue;
      const v = validar(esquemaVinculoHorario, { codigo, turma_id: turma });
      const r = checar(await sb.from("horario_turmas").update({ turma_id: v.turma_id }).eq("codigo", v.codigo).select("codigo"));
      if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
      n++;
    }
    if (!n) throw new ErroNegocio("Escolha ao menos uma turma para vincular.");
    revalidatePath("/calendario");
    return `${n} turma(s) vinculada(s) ao horário.`;
  });
}
