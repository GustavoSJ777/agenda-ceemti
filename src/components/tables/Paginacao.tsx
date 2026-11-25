import Link from "next/link";

/** Paginação por links (estado na URL). Mantém os filtros atuais. */
export function Paginacao({ total, pagina, porPagina, caminho, params }: {
  total: number; pagina: number; porPagina: number; caminho: string; params: Record<string, string | undefined>;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const ir = (n: number) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v && k !== "pagina") q.set(k, v); });
    if (n > 1) q.set("pagina", String(n));
    const s = q.toString();
    return s ? `${caminho}?${s}` : caminho;
  };
  const ini = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(total, pagina * porPagina);
  const ativo = "btn btn-secundario !py-1";
  const inativo = "btn btn-secundario !py-1 pointer-events-none opacity-50";
  return (
    <nav aria-label="Paginação" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-texto-suave">{total === 0 ? "Nenhum registro" : `Mostrando ${ini}–${fim} de ${total}`}</span>
      {paginas > 1 && (
        <span className="flex items-center gap-2">
          <Link href={ir(pagina - 1)} className={pagina > 1 ? ativo : inativo} aria-disabled={pagina <= 1}>Anterior</Link>
          <span>Página {pagina} de {paginas}</span>
          <Link href={ir(pagina + 1)} className={pagina < paginas ? ativo : inativo} aria-disabled={pagina >= paginas}>Próxima</Link>
        </span>
      )}
    </nav>
  );
}
