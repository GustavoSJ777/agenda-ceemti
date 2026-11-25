"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Pencil, Plus, X } from "lucide-react";
import type { EstadoForm } from "@/lib/actions/resultado";
import { mostrarToast } from "./Toasts";

type Acao = (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>;

interface Props {
  titulo: string;
  /** Texto do botão que abre o modal. Se omitido, mostra só o ícone. */
  rotulo?: string;
  icone?: "plus" | "editar" | "chave";
  variante?: "primario" | "secundario" | "icone";
  textoSalvar?: string;
  largo?: boolean;
  action: Acao;
  children: React.ReactNode;
  /** Texto de acessibilidade do botão (quando só há ícone). */
  ariaLabel?: string;
}

function Salvar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primario" disabled={pending}>{pending ? "Salvando..." : texto}</button>;
}

/** Botão que abre um modal com formulário ligado a uma Server Action. Os campos vêm do servidor (children). */
export function BotaoModal({ titulo, rotulo, icone = "plus", variante = "primario", textoSalvar = "Salvar", largo, action, children, ariaLabel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // O aviso sai aqui, logo que a resposta chega: se a ação remover este próprio modal da tela
  // (ex.: o conflito resolvido some da lista), um efeito de montagem nunca chegaria a mostrá-lo.
  const comAviso: Acao = async (anterior, dados) => {
    const r = await action(anterior, dados);
    if (r.sucesso) mostrarToast(r.sucesso);
    return r;
  };
  const [estado, acaoForm] = useActionState<EstadoForm, FormData>(comAviso, {});
  const [chave, setChave] = useState(0);
  const ultimo = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!estado.n || estado.n === ultimo.current) return;
    ultimo.current = estado.n;
    if (estado.sucesso) ref.current?.close();
  }, [estado]);

  const abrir = () => { setChave((c) => c + 1); ref.current?.showModal(); };
  const Ico = icone === "editar" ? Pencil : icone === "chave" ? KeyRound : Plus;
  const classe = variante === "icone"
    ? "grid h-8 w-8 place-items-center rounded-campo text-azul-700 hover:bg-azul-100"
    : variante === "secundario" ? "btn btn-secundario" : "btn btn-primario";

  return (
    <>
      <button type="button" className={classe} onClick={abrir} aria-label={ariaLabel ?? rotulo ?? titulo} title={ariaLabel ?? rotulo ?? titulo}>
        <Ico size={variante === "icone" ? 17 : 18} aria-hidden="true" /> {rotulo}
      </button>
      <dialog ref={ref} aria-label={titulo}
        className={`m-auto w-[calc(100%-2rem)] rounded-card p-0 shadow-modal backdrop:bg-texto/40 ${largo ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <form key={chave} action={acaoForm} className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3">
            <h2 className="text-lg font-extrabold">{titulo}</h2>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-campo hover:bg-azul-100" aria-label="Fechar" onClick={() => ref.current?.close()}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {estado.erro && <div role="alert" className="alerta alerta-erro">{estado.erro}</div>}
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
          </div>
          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3">
            <button type="button" className="btn btn-secundario" onClick={() => ref.current?.close()}>Cancelar</button>
            <Salvar texto={textoSalvar} />
          </div>
        </form>
      </dialog>
    </>
  );
}
