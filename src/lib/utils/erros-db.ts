/** Traduz erros do Supabase/Postgres em mensagens claras (equivalente ao msgErro do sistema original). */
export function mensagemErroDb(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  const c = err.code;
  const msg = String(err.message ?? e ?? "");
  const m = msg.toLowerCase();

  if (c === "42501" || m.includes("row-level security") || m.includes("permission denied")) {
    // 42501 lançado por nossas funções/triggers traz texto próprio em português.
    return c === "42501" && !m.includes("row-level") && !m.includes("permission denied")
      ? msg
      : "Você não tem permissão para realizar esta ação.";
  }
  if (c === "23505") {
    if (m.includes("matricula")) return "Já existe um aluno com esta matrícula.";
    if (m.includes("email")) return "Já existe um cadastro com este e-mail.";
    if (m.includes("turmas_nome")) return "Já existe uma turma com este nome neste ano letivo.";
    if (m.includes("series_nome")) return "Já existe uma série com este nome.";
    if (m.includes("disciplinas_nome")) return "Já existe uma disciplina com este nome.";
    if (m.includes("professor_id") || m.includes("professor_turmas")) return "Este vínculo já existe.";
    return "Já existe um registro com estes dados.";
  }
  if (c === "23503") return "Operação bloqueada: este item está vinculado a outros registros (ou o item relacionado não existe mais).";
  if (c === "23514") {
    if (m.includes("rec_concluida")) return "Para concluir a recuperação, informe a nota da recuperação.";
    if (m.includes("atividades_datas")) return "Prova exige data de realização; trabalho exige prazo de entrega.";
    if (m.includes("avisos_validade")) return "A validade não pode ser anterior à data de publicação.";
    if (m.includes("avisos_turma")) return 'Escolha a turma quando o público for "Turma específica".';
    return msg && !m.includes("violates check") ? msg : "Algum dado informado não é válido. Revise os campos.";
  }
  if (c === "23502") return "Preencha todos os campos obrigatórios.";
  if (c === "P0002") return msg || "Registro não encontrado.";
  if (m.includes("fetch failed") || m.includes("failed to fetch") || m.includes("network")) {
    return "Falha de conexão com o servidor. Tente novamente.";
  }
  if (m.includes("jwt")) return "Sua sessão expirou. Entre novamente.";
  return "Não foi possível concluir a operação.";
}
