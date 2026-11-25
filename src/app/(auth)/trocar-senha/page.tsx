import { CartaoAuth } from "@/components/layout/CartaoAuth";
import { FormNovaSenha } from "@/components/forms/FormNovaSenha";

export const metadata = { title: "Troque sua senha — Agenda Escolar CEEMTI Baixo Guandu" };

// Primeiro acesso com senha provisória: o painel só abre depois de escolher uma senha própria.
export default function PaginaTrocarSenha() {
  return (
    <CartaoAuth titulo="Escolha sua senha" descricao="Você entrou com uma senha provisória. Crie uma senha só sua, com pelo menos 8 caracteres.">
      <FormNovaSenha />
    </CartaoAuth>
  );
}
