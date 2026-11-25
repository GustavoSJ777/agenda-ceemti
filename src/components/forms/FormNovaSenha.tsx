"use client";
import { useActionState } from "react";
import { definirNovaSenha } from "@/app/actions-auth";
import type { EstadoForm } from "@/lib/actions/resultado";
import { BotaoEnviar } from "./BotaoEnviar";
import { Mensagem } from "./Mensagem";

export function FormNovaSenha() {
  const [estado, acao] = useActionState<EstadoForm, FormData>(definirNovaSenha, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Mensagem estado={estado} />
      <div className="campo">
        <label htmlFor="senha">Nova senha</label>
        <input id="senha" name="senha" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className="campo">
        <label htmlFor="senha2">Repita a nova senha</label>
        <input id="senha2" name="senha2" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <BotaoEnviar ocupado="Salvando...">Salvar nova senha</BotaoEnviar>
    </form>
  );
}
