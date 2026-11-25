import Link from "next/link";
import { Search } from "lucide-react";

export interface CampoFiltro {
  name: string;
  label: string;
  tipo: "busca" | "select" | "data";
  opcoes?: Array<{ v: string; l: string }>;
  vazio?: string;
}

/** Filtros por formulário GET: o estado fica na URL (compartilhável e sem JavaScript). */
export function Filtros({ campos, valores, caminho, extras }: {
  campos: CampoFiltro[]; valores: Record<string, string | undefined>; caminho: string; extras?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" action={caminho} className="card mb-4 flex flex-wrap items-end gap-3 !p-4">
      {Object.entries(extras ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {campos.map((c) => (
        <div key={c.name} className={`campo ${c.tipo === "busca" ? "min-w-[200px] flex-[2]" : "min-w-[150px] flex-1"}`}>
          <label htmlFor={`flt_${c.name}`}>{c.label}</label>
          {c.tipo === "select" ? (
            <select id={`flt_${c.name}`} name={c.name} defaultValue={valores[c.name] ?? ""}>
              <option value="">{c.vazio ?? "Todos"}</option>
              {c.opcoes?.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          ) : (
            <input id={`flt_${c.name}`} name={c.name} type={c.tipo === "data" ? "date" : "search"} defaultValue={valores[c.name] ?? ""} />
          )}
        </div>
      ))}
      <button type="submit" className="btn btn-primario"><Search size={16} aria-hidden="true" /> Filtrar</button>
      <Link href={caminho} className="btn btn-secundario">Limpar</Link>
    </form>
  );
}
