"use server";

import { headers } from "next/headers";
import { urlBase } from "@/lib/utils/redirecionamento";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { esquemaLogin, esquemaNovaSenha, esquemaRecuperar } from "@/lib/validations/auth";
import { mensagemErroAuth } from "@/lib/utils/erros-auth";
import type { EstadoForm } from "@/lib/actions/resultado";

export async function entrar(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const v = esquemaLogin.safeParse({ email: dados.get("email"), senha: dados.get("senha") });
  if (!v.success) return { erro: v.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({ email: v.data.email, password: v.data.senha });
  if (error || !data.user) return { erro: mensagemErroAuth(error?.message) };

  const { data: perfil } = await supabase.from("perfis").select("ativo").eq("id", data.user.id).maybeSingle();
  if (!perfil || !perfil.ativo) {
    await supabase.auth.signOut();
    return { erro: "Seu acesso não está ativo ou ainda não foi liberado. Procure a Direção ou a Secretaria." };
  }
  redirect("/dashboard");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login?saiu=1");
}

export async function sairPorInatividade() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login?inativo=1");
}

export async function recuperarSenha(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const v = esquemaRecuperar.safeParse({ email: dados.get("email") });
  if (!v.success) return { erro: v.error.issues[0].message };

  const h = await headers();
  
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(v.data.email, {
    redirectTo: `${urlBase(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"))}/auth/callback?next=/nova-senha`,
  });
  if (error && /rate limit|too many/i.test(error.message)) return { erro: mensagemErroAuth(error.message) };
  // Mensagem neutra: não revela se o e-mail existe.
  return { sucesso: "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." };
}

export async function definirNovaSenha(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const v = esquemaNovaSenha.safeParse({ senha: dados.get("senha"), senha2: dados.get("senha2") });
  if (!v.success) return { erro: v.error.issues[0].message };

  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { erro: "O link expirou. Peça um novo em “Esqueci minha senha”." };
  const { error } = await supabase.auth.updateUser({ password: v.data.senha, data: { trocar_senha: false } });
  if (error) return { erro: mensagemErroAuth(error.message) };
  // Renova o token para que o marcador "trocar_senha" saia dos dados da sessão (evita voltar a esta tela).
  await supabase.auth.refreshSession();
  redirect("/dashboard");
}
