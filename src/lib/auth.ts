import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { medir } from "@/lib/tempos";
import { cacheCurto } from "@/lib/cache-curto";
import type { Papel, Perfil } from "@/types";

/**
 * Perfil do usuário logado, lido do banco (nunca do navegador).
 * Retorna null se não houver sessão, perfil ou se o acesso estiver desativado.
 */
/** Id do usuário logado, lido do JWT (verificação local, sem ida ao banco). */
const obterClaims = cache(async () => {
  const supabase = await criarClienteServidor();
  const { data } = await medir("auth.getClaims", () => supabase.auth.getClaims());
  return data?.claims ?? null;
});

export const obterIdUsuario = cache(async (): Promise<string | null> => (await obterClaims())?.sub ?? null);

/** Verdadeiro quando o acesso ainda usa a senha provisória (definida no cadastro). */
export const precisaTrocarSenha = cache(async (): Promise<boolean> => {
  const c = await obterClaims();
  return Boolean((c?.user_metadata as { trocar_senha?: boolean } | undefined)?.trocar_senha);
});

export const obterPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await criarClienteServidor();
  // Verificação local do JWT (sem ida ao Supabase). O RLS no banco segue valendo para toda leitura/escrita.
  const id = await obterIdUsuario();
  if (!id) return null;
  // Perfil em cache de 30 s por usuário (limpo a cada gravação). Desativar alguém bloqueia o acesso aos dados
  // imediatamente via RLS; a tela só muda ao expirar o cache.
  return cacheCurto(`perfil:${id}`, 30, async () => {
    const { data } = await medir("auth.perfil", async () => supabase.from("perfis").select("id,nome,email,papel,ativo").eq("id", id).maybeSingle());
    if (!data || !data.ativo) throw new SemPerfil();
    return data as Perfil;
  }).catch((e) => {
    if (e instanceof SemPerfil) return null;
    throw e;
  });
});

class SemPerfil extends Error {}

/** Exige sessão válida e perfil ativo; senão, volta ao login. */
export async function exigirPerfil(): Promise<Perfil> {
  const perfil = await obterPerfil();
  if (!perfil) {
    const supabase = await criarClienteServidor();
    await supabase.auth.signOut();
    redirect("/login?erro=acesso");
  }
  return perfil;
}

/** Exige que o usuário tenha um dos papéis; senão, volta ao painel. */
export async function exigirPapel(papeis: Papel[]): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (!papeis.includes(perfil.papel)) redirect("/dashboard?aviso=sem-acesso");
  return perfil;
}
