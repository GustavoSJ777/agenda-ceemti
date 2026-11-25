"use client";
import Link from "next/link";
import { useActionState } from "react";
import { recuperarSenha } from "@/app/actions-auth";
import type { EstadoForm } from "@/lib/actions/resultado";
import { BotaoEnviar } from "./BotaoEnviar";
import { Mensagem } from "./Mensagem";

export function FormRecuperar() {
  const [estado, acao] = useActionState<EstadoForm, FormData>(recuperarSenha, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Mensagem estado={estado} />
      <div className="campo">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" placeholder="nome@exemplo.com" />
      </div>
      <BotaoEnviar ocupado="Enviando...">Enviar link</BotaoEnviar>
      <Link href="/login" className="text-center text-sm text-azul-600 underline">Voltar ao login</Link>
    </form>
  );
}
