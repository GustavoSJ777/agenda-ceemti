"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, X } from "lucide-react";
import type { EstadoForm } from "@/lib/actions/resultado";
import { mostrarToast } from "./Toasts";

interface Props {
  /** Server Action já "amarrada" ao id (action.bind(null, id)). */
  action: (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>;
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  ariaLabel?: string;
  /** Mostra um botão de texto em vez de ícone (ex.: remover vínculo). */
  compacto?: boolean;
}

function Confirmar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn bg-perigo text-white hover:opacity-90" disabled={pending}>{pending ? "Excluindo..." : texto}</button>;
}

/** Botão de exclusão com confirmação obrigatória em janela modal. */
export function BotaoExcluir({ action, titulo, mensagem, textoConfirmar = "Excluir", ariaLabel, compacto }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const comAviso = async (anterior: EstadoForm, dados: FormData) => {
    const r = await action(anterior, dados);
    if (r.sucesso) mostrarToast(r.sucesso); // não depende de este componente continuar na tela
    return r;
  };
  const [estado, acaoForm] = useActionState<EstadoForm, FormData>(comAviso, {});
  const ultimo = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!estado.n || estado.n === ultimo.current) return;
    ultimo.current = estado.n;
    if (estado.sucesso) ref.current?.close();
  }, [estado]);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-label={ariaLabel ?? titulo} title={ariaLabel ?? titulo}
        className={compacto ? "ml-1 grid h-5 w-5 place-items-center rounded-full text-texto-suave hover:bg-perigo-bg hover:text-perigo"
          : "grid h-8 w-8 place-items-center rounded-campo text-perigo hover:bg-perigo-bg"}>
        {compacto ? <X size={12} aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}
      </button>
      <dialog ref={ref} aria-label={titulo} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card p-0 shadow-modal backdrop:bg-texto/40"
        onMouseDown={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <form action={acaoForm} className="space-y-4 p-5">
          <h2 className="text-lg font-extrabold">{titulo}</h2>
          {estado.erro && <div role="alert" className="alerta alerta-erro">{estado.erro}</div>}
          <p>{mensagem}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secundario" onClick={() => ref.current?.close()}>Cancelar</button>
            <Confirmar texto={textoConfirmar} />
          </div>
        </form>
      </dialog>
    </>
  );
}
