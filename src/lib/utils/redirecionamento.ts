/** Aceita apenas caminhos internos; recusa //host, /\host e esquemas (evita redirecionamento aberto). */
export function caminhoInterno(valor: string | null | undefined, padrao = "/dashboard"): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\") || /[\r\n]/.test(valor)) return padrao;
  return valor;
}

/** URL base do site: variável de ambiente (preferida) ou cabeçalhos da requisição. */
export function urlBase(host: string | null, proto: string | null): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env) return env;
  return `${proto ?? "https"}://${host ?? ""}`;
}
