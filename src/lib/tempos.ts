/** Mede e registra a duração de um trecho (só quando DEBUG_TEMPOS=1). Sem custo quando desligado. */
export async function medir<T>(rotulo: string, fn: () => PromiseLike<T> | T): Promise<T> {
  if (process.env.DEBUG_TEMPOS !== "1") return fn();
  const t = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[tempo] ${rotulo}: ${Math.round(performance.now() - t)} ms`);
  }
}
