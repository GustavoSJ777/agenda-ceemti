import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ErroNegocio } from "@/lib/actions/resultado";
import { esquemaNovoUsuario, type NovoUsuario } from "@/lib/validations/usuarios";
import type { Perfil } from "@/types";

/**
 * Cria login (Supabase Auth) + perfil (+ professor ou vínculo com aluno) usando a service role.
 * Substitui a Edge Function "criar-usuario". O CHAMADOR já deve estar autenticado (Perfil do banco).
 * Regras do original: Direção cria qualquer perfil; Secretaria cria somente acesso de ALUNO.
 */
export async function criarUsuario(chamador: Perfil, entrada: unknown): Promise<{ id: string }> {
  if (chamador.papel !== "direcao" && chamador.papel !== "secretaria") {
    throw new ErroNegocio("Você não tem permissão para criar usuários.");
  }
  const r = esquemaNovoUsuario.safeParse(entrada);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  const d: NovoUsuario = r.data;

  if (chamador.papel === "secretaria" && d.papel !== "aluno") {
    throw new ErroNegocio("A Secretaria só pode criar acesso de alunos.");
  }

  const admin = criarClienteAdmin();

  if (d.papel === "aluno") {
    if (!d.aluno_id) throw new ErroNegocio("Selecione o aluno para vincular ao acesso.");
    const { data: al } = await admin.from("alunos").select("id,perfil_id,email").eq("id", d.aluno_id).maybeSingle();
    if (!al) throw new ErroNegocio("Aluno não encontrado.");
    if (al.perfil_id) throw new ErroNegocio("Este aluno já possui acesso.");
    // Melhoria sobre o original: o e-mail do login precisa ser o cadastrado para o aluno.
    if (!al.email) throw new ErroNegocio("Cadastre o e-mail do aluno antes de criar o acesso.");
    if (al.email.toLowerCase() !== d.email) throw new ErroNegocio("O e-mail do acesso deve ser o mesmo cadastrado para o aluno.");
  }

  const { data: novo, error: ec } = await admin.auth.admin.createUser({
    email: d.email, password: d.senha, email_confirm: true, user_metadata: { nome: d.nome },
  });
  if (ec || !novo?.user) {
    const m = (ec?.message ?? "").toLowerCase();
    if (m.includes("already") || m.includes("registered")) throw new ErroNegocio("Já existe um usuário com este e-mail.");
    if (m.includes("password")) throw new ErroNegocio("Senha fraca. Use ao menos 8 caracteres, com letras e números.");
    console.error("createUser falhou:", ec?.message);
    throw new ErroNegocio("Não foi possível criar o login.");
  }
  const id = novo.user.id;

  const desfazer = async (motivo: string, detalhe?: string) => {
    console.error(motivo, detalhe);
    await admin.auth.admin.deleteUser(id); // perfis/professores são removidos em cascata
    throw new ErroNegocio(motivo);
  };

  const p = await admin.from("perfis").insert({ id, nome: d.nome, email: d.email, papel: d.papel, ativo: true });
  if (p.error) return desfazer("Não foi possível criar o perfil.", p.error.message);

  if (d.papel === "professor") {
    const pr = await admin.from("professores").insert({ perfil_id: id });
    if (pr.error) return desfazer("Não foi possível registrar o professor.", pr.error.message);
  }
  if (d.papel === "aluno") {
    // Só vincula se o aluno ainda estiver sem acesso (evita corrida entre duas requisições).
    const v = await admin.from("alunos").update({ perfil_id: id }).eq("id", d.aluno_id!).is("perfil_id", null).select("id");
    if (v.error || !v.data?.length) return desfazer("Não foi possível vincular o aluno.", v.error?.message);
  }
  return { id };
}
