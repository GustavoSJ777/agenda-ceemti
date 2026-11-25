import "server-only";

/**
 * Cache em memória de curta duração (por processo). Reduz idas ao Supabase em dados que mudam pouco.
 * - Chaves devem incluir o id do usuário quando o resultado depende do RLS.
 * - Qualquer gravação feita por Server Action limpa tudo (ver `executar`), então o próprio usuário
 *   enxerga o que acabou de salvar. Em hospedagem com várias instâncias, o atraso máximo é o TTL.
 */
const memoria = new Map<string, { ate: number; valor: Promise<unknown> }>();
const LIMITE = 500;

export function cacheCurto<T>(chave: string, segundos: number, buscar: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const item = memoria.get(chave);
  if (item && item.ate > agora) return item.valor as Promise<T>;

  if (memoria.size >= LIMITE) {
    for (const [k, v] of memoria) if (v.ate <= agora) memoria.delete(k);
    if (memoria.size >= LIMITE) memoria.clear();
  }
  const valor = buscar().catch((e) => {
    memoria.delete(chave); // não guarda falhas
    throw e;
  });
  memoria.set(chave, { ate: agora + segundos * 1000, valor });
  return valor;
}

export function limparCacheCurto(): void {
  memoria.clear();
}
