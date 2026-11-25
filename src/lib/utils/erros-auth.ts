/** Traduz erros de autenticação do Supabase em mensagens claras (mesmas do sistema original). */
export function mensagemErroAuth(mensagem: string | undefined | null): string {
  const m = (mensagem ?? "").toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado. Procure a secretaria da escola.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("fetch") || m.includes("network")) return "Sem conexão com o servidor. Verifique sua internet.";
  if (m.includes("same password")) return "A nova senha deve ser diferente da anterior.";
  if (m.includes("password should be") || m.includes("weak")) return "A senha é fraca. Use ao menos 8 caracteres.";
  return "Não foi possível concluir a operação.";
}
