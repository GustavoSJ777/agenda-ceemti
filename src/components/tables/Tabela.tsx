import type { ReactNode } from "react";

export interface Coluna<T> { titulo: string; render: (linha: T) => ReactNode; acoes?: boolean }

/** Tabela responsiva: no celular cada linha vira um cartão (rótulo vem de data-label). */
export function Tabela<T>({ colunas, linhas, vazio = "Nenhum registro encontrado.", chave }: {
  colunas: Coluna<T>[]; linhas: T[]; vazio?: string; chave: (linha: T) => string;
}) {
  if (!linhas.length) return <div className="card text-center text-texto-suave">{vazio}</div>;
  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead>
          <tr>{colunas.map((c) => <th key={c.titulo} scope="col">{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={chave(l)}>
              {colunas.map((c) => (
                <td key={c.titulo} data-label={c.titulo} className={c.acoes ? "col-acoes" : undefined}>{c.render(l)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
