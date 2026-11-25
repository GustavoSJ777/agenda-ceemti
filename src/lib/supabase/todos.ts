/** Lê todas as linhas de uma consulta, paginando de 1000 em 1000 (limite padrão da API). Máximo de 10 páginas. */
export async function lerTodos<T>(montar: () => { range: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const passo = 1000;
  const saida: T[] = [];
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await montar().range(pagina * passo, pagina * passo + passo - 1);
    if (r.error) throw r.error;
    const lote = r.data ?? [];
    saida.push(...lote);
    if (lote.length < passo) break;
  }
  return saida;
}
