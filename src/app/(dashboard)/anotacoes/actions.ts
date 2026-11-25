"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import { esquemaAnotacao } from "@/lib/validations/avisos";

const PAPEIS = ["direcao", "secretaria", "professor"] as const;

export async function salvarAnotacao(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const perfil = await exigirPapel([...PAPEIS]);
    const v = validar(esquemaAnotacao, lerForm(fd));
    const sb = await criarClienteServidor();
    if (id) {
      // O RLS só deixa o autor alterar; conferimos também para dar uma mensagem clara.
      const r = checar(await sb.from("anotacoes").update(paraBanco(v)).eq("id", id).eq("autor_id", perfil.id).select("id"));
      if (!r || r.length === 0) throw new ErroNegocio("Você só pode alterar as suas próprias anotações.");
    } else {
      checar(await sb.from("anotacoes").insert({ ...paraBanco(v), autor_id: perfil.id }));
    }
    revalidatePath("/anotacoes");
    return id ? "Anotação atualizada." : "Anotação salva.";
  });
}

export async function excluirAnotacao(id: string) {
  return executar(async () => {
    const perfil = await exigirPapel([...PAPEIS]);
    const sb = await criarClienteServidor();
    const r = checar(await sb.from("anotacoes").delete().eq("id", id).eq("autor_id", perfil.id).select("id"));
    if (!r || r.length === 0) throw new ErroNegocio("Você só pode excluir as suas próprias anotações.");
    revalidatePath("/anotacoes");
    return "Anotação excluída.";
  });
}
