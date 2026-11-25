import { CartaoAuth } from "@/components/layout/CartaoAuth";
import { FormNovaSenha } from "@/components/forms/FormNovaSenha";

export const metadata = { title: "Nova senha — Agenda Escolar CEEMTI Baixo Guandu" };

// Rota privada: só chega aqui quem abriu o link do e-mail (sessão criada em /auth/callback).
export default function PaginaNovaSenha() {
  return (
    <CartaoAuth titulo="Criar nova senha" descricao="Escolha uma senha com pelo menos 8 caracteres.">
      <FormNovaSenha />
    </CartaoAuth>
  );
}
