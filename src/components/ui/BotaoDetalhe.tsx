"use client";
import { useRef } from "react";
import { Eye, X } from "lucide-react";

/** Abre uma janela somente leitura com os detalhes (children vêm renderizados do servidor). */
export function BotaoDetalhe({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-label="Ver detalhes" title="Ver detalhes"
        className="grid h-8 w-8 place-items-center rounded-campo text-azul-700 hover:bg-azul-100">
        <Eye size={17} aria-hidden="true" />
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
