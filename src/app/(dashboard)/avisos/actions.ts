"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import { esquemaAviso } from "@/lib/validations/avisos";

export async function salvarAviso(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    await exigirPapel(["direcao", "secretaria"]);
    const v = validar(esquemaAviso, lerForm(fd));
    const sb = await criarClienteServidor();
    if (id) {
      const r = checar(await sb.from("avisos").update(paraBanco(v)).eq("id", id).select("id"));
      if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    } else {
      checar(await sb.from("avisos").insert(paraBanco(v)));
    }
    revalidatePath("/avisos");
    revalidatePath("/dashboard");
    return id ? "Aviso atualizado." : "Aviso publicado.";
  });
}

export async function excluirAviso(id: string) {
  return executar(async () => {
    await exigirPapel(["direcao", "secretaria"]);
    const sb = await criarClienteServidor();
    const r = checar(await sb.from("avisos").delete().eq("id", id).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você não tem permissão para realizar esta ação.");
    revalidatePath("/avisos");
    revalidatePath("/dashboard");
    return "Aviso excluído.";
  });
}
