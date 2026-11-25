/** Converte FormData em objeto: texto aparado; vazio vira undefined; checkbox marcado vira "on". */
export function lerForm(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    const t = v.trim();
    out[k] = t === "" ? undefined : t;
  }
  return out;
}

/** undefined -> null (para gravar colunas opcionais). */
export function paraBanco<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v]));
}
