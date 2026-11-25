"use client";
import { useRef } from "react";
import { X } from "lucide-react";

interface Props {
  rotulo: string;
  titulo: string;
  classe: string;
  variante: "chip" | "bloco";
  meta?: string;
  children: React.ReactNode;
}

/** Item do calendário: botão colorido que abre os detalhes (conteúdo vem renderizado do servidor). */
export function ItemCalendario({ rotulo, titulo, classe, variante, meta, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} title={titulo}
        className={variante === "chip"
          ? `block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-bold ${classe}`
          : `block w-full rounded-campo px-3 py-2 text-left ${classe}`}>
        {variante === "chip" ? rotulo : (
          <>
            <strong className="block">{rotulo}</strong>
            {meta && <small className="block opacity-80">{meta}</small>}
          </>
        )}
      </button>
      <dialog ref={ref} aria-label={titulo} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card p-0 shadow-modal backdrop:bg-texto/40"
        onMouseDown={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="text-lg font-extrabold">{titulo}</h2>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-campo hover:bg-azul-100" aria-label="Fechar" onClick={() => ref.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end border-t border-borda px-5 py-3">
          <button type="button" className="btn btn-secundario" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
      </dialog>
    </>
  );
}
