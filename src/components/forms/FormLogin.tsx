"use client";
import Link from "next/link";
import { useActionState } from "react";
import { entrar } from "@/app/actions-auth";
import type { EstadoForm } from "@/lib/actions/resultado";
import { BotaoEnviar } from "./BotaoEnviar";
import { Mensagem } from "./Mensagem";

export function FormLogin({ semLinkHorario }: { semLinkHorario?: boolean } = {}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(entrar, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      <Mensagem estado={estado} />
      <div className="campo">
        <label htmlFor="escola">Escola</label>
        <input id="escola" value="CEEMTI Baixo Guandu" readOnly aria-readonly="true" />
      </div>
      <div className="campo">
        <label htmlFor="email">E-mail ou matrícula</label>
        <input id="email" name="email" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="E-mail (equipe) ou matrícula (aluno)" />
      </div>
      <div className="campo">
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" placeholder="Sua senha" />
      </div>
      <BotaoEnviar ocupado="Entrando...">Entrar</BotaoEnviar>
      <Link href="/recuperar" className="text-center text-sm text-azul-600 underline">Esqueci minha senha</Link>
      {!semLinkHorario && <Link href="/" className="text-center text-sm text-azul-600 underline">Ver horário de aulas (sem login)</Link>}
    </form>
  );
}
