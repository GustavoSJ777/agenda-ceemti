"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { mostrarToast } from "@/components/ui/Toasts";

interface Resp { ok?: boolean; mensagem?: string; erro?: string; ignoradas?: { linha: number; motivo: string }[] }

export function AnexarHorario({ hoje }: { hoje: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [ignoradas, setIgnoradas] = useState<{ linha: number; motivo: string }[]>([]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setErro(""); setIgnoradas([]); setOcupado(true);
    try {
      const r = await fetch("/api/horario/anexar", { method: "POST", body: new FormData(form) });
      const j: Resp = await r.json().catch(() => ({}));
      setIgnoradas(j.ignoradas ?? []);
      if (r.ok && j.ok) {
        mostrarToast(j.mensagem ?? "Horário anexado.");
        router.refresh();
        if (!j.ignoradas?.length) { form.reset(); ref.current?.close(); }
      } else setErro(j.erro ?? "Não foi possível anexar o arquivo.");
    } catch { setErro("Falha de conexão. Tente novamente."); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <button type="button" className="btn btn-secundario" onClick={() => { setErro(""); setIgnoradas([]); ref.current?.showModal(); }}>
        <Paperclip size={16} aria-hidden /> Anexar PDF ou planilha
      </button>
      <dialog ref={ref} aria-labelledby="t-anexar" className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-card p-0 shadow-modal backdrop:bg-texto/40"
        onMouseDown={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <form onSubmit={enviar} className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 id="t-anexar" className="text-lg font-extrabold">Anexar novo horário</h2>
            <button type="button" aria-label="Fechar" onClick={() => ref.current?.close()}><X size={18} /></button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-texto-suave">
            <li><strong>Planilha (.xlsx)</strong>: vira o horário do sistema. Colunas: Turma, Dia, Aula, Matéria, Professor, Sala. <a className="text-azul-600 underline" href="/api/horario/modelo">Baixar modelo</a>.</li>
            <li><strong>PDF</strong>: fica disponível para download na página pública. O PDF não é lido para montar a grade.</li>
          </ul>
          {erro && <p role="alert" className="alerta alerta-erro">{erro}</p>}
          <div className="campo"><label htmlFor="an-arq">Arquivo</label><input id="an-arq" name="arquivo" type="file" required accept=".pdf,.xlsx" /></div>
          <div className="campo"><label htmlFor="an-vig">Vale a partir de</label><input id="an-vig" name="vigencia" type="date" required defaultValue={hoje} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="substituir" className="h-4 w-4" /> Substituir o horário existente nesta data (planilha)</label>
          {ignoradas.length > 0 && (
            <div className="rounded-campo bg-amber-50 p-2 text-sm">
              <p className="font-bold">{ignoradas.length} linha(s) ignorada(s):</p>
              <ul className="max-h-36 list-disc overflow-auto pl-5">{ignoradas.slice(0, 50).map((i) => <li key={i.linha}>Linha {i.linha}: {i.motivo}</li>)}</ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secundario" onClick={() => ref.current?.close()}>Fechar</button>
            <button type="submit" className="btn btn-primario" disabled={ocupado}>{ocupado ? "Enviando..." : "Anexar"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
