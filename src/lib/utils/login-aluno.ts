/**
 * Login de aluno = matrícula. O Supabase Auth exige um e-mail, então a matrícula vira um e-mail interno
 * (domínio reservado "example.com": nunca recebe mensagens). O aluno digita só a matrícula.
 */
export const DOMINIO_LOGIN_ALUNO = "aluno.ceemti.example.com";

const MATRICULA_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/;

export const matriculaValidaParaLogin = (m: string) => MATRICULA_OK.test(m);

export const emailDaMatricula = (matricula: string) => `${matricula.trim().toLowerCase()}@${DOMINIO_LOGIN_ALUNO}`;

/** Aceita e-mail completo ou matrícula; devolve o e-mail usado no Supabase Auth (ou null se for inválido). */
export function emailDeLogin(valor: string): string | null {
  const v = valor.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
  return MATRICULA_OK.test(v) ? emailDaMatricula(v) : null;
}
