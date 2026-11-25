import { ZodType } from "zod";
import { mensagemErroDb } from "@/lib/utils/erros-db";
import { limparCacheCurto } from "@/lib/cache-curto";

export interface EstadoForm {
  erro?: string;
  sucesso?: string;
  /** Muda a cada resposta para o cliente reagir mesmo se a mensagem se repetir. */
  n?: number;
}

export class ErroNegocio extends Error {}

/** Valida dados com Zod; lança ErroNegocio com a primeira mensagem de erro. */
export function validar<T>(esquema: ZodType<T>, dados: unknown): T {
  const r = esquema.safeParse(dados);
  if (!r.success) throw new ErroNegocio(r.error.issues[0]?.message ?? "Dados inválidos.");
  return r.data;
}

/** Executa uma gravação e converte exceções em mensagens para a tela. */
export async function executar(fn: () => Promise<string | void>): Promise<EstadoForm> {
  try {
    const msg = await fn();
    limparCacheCurto();
    return { sucesso: msg ?? "Operação concluída.", n: Date.now() };
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message, n: Date.now() };
    // Redirecionamentos do Next.js precisam seguir adiante.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { erro: mensagemErroDb(e), n: Date.now() };
  }
}

/** Lança se a resposta do Supabase trouxer erro. */
export function checar<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
