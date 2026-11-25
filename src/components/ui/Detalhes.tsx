/** Lista "rótulo: valor" usada nos modais de detalhe. */
export function Detalhes({ linhas }: { linhas: Array<[string, React.ReactNode] | null | false> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      {linhas.filter((l): l is [string, React.ReactNode] => !!l).map(([r, v]) => (
        <div key={r} className="contents">
          <dt className="text-sm font-bold text-texto-suave">{r}</dt>
          <dd className="whitespace-pre-wrap break-words">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}
