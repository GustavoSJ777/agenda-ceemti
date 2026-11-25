import { CartaoAuth } from "@/components/layout/CartaoAuth";
import { FormRecuperar } from "@/components/forms/FormRecuperar";

export const metadata = { title: "Recuperar senha — Agenda Escolar CEEMTI Baixo Guandu" };

export default function PaginaRecuperar() {
  return (
    <CartaoAuth titulo="Recuperar senha" descricao="Informe seu e-mail. Enviaremos um link para criar uma nova senha.">
      <FormRecuperar />
    </CartaoAuth>
  );
}
