import { CartaoAuth } from "@/components/layout/CartaoAuth";
import { FormLogin } from "@/components/forms/FormLogin";

export const metadata = { title: "Entrar — Agenda Escolar CEEMTI Baixo Guandu" };

const AVISOS: Record<string, [string, string]> = {
  acesso: ["alerta-erro", "Seu acesso não está ativo. Procure a Direção ou a Secretaria."],
  saiu: ["alerta-info", "Você saiu da conta."],
  inativo: ["alerta-info", "Sessão encerrada por inatividade. Entre novamente."],
  link: ["alerta-erro", "O link é inválido ou expirou. Peça um novo em “Esqueci minha senha”."],
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const chave = p.erro ?? (p.saiu ? "saiu" : p.inativo ? "inativo" : undefined);
  const aviso = chave ? AVISOS[chave] : undefined;
  const configurado = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <CartaoAuth titulo="Entrar na sua conta" descricao="Use o e-mail e a senha fornecidos pela escola.">
      {!configurado && (
        <div className="alerta alerta-aviso mb-4">O sistema ainda não foi conectado ao Supabase. Configure o arquivo .env.local (veja o README).</div>
      )}
      {aviso && <div role="status" className={`alerta mb-4 ${aviso[0]}`}>{aviso[1]}</div>}
      <FormLogin />
      <p className="mt-4 text-sm text-texto-suave">
        O cadastro é feito pela escola. Se você ainda não tem acesso, procure a Secretaria ou a Direção.
      </p>
    </CartaoAuth>
  );
}
