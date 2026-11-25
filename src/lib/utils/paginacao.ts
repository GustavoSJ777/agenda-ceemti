/** Lê o número da página da URL com segurança. */
export function lerPagina(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n < 100000 ? n : 1;
}
/** Intervalo [de, ate] para .range() do Supabase. */
export function intervalo(pagina: number, porPagina: number): [number, number] {
  return [(pagina - 1) * porPagina, pagina * porPagina - 1];
}
/** Remove caracteres que alteram a sintaxe de filtros do PostgREST (vírgula, parênteses, %, \). */
export function termoSeguro(s: string | undefined): string {
  return (s ?? "").replace(/[,()%\\*:"']/g, " ").trim().slice(0, 80);
}
