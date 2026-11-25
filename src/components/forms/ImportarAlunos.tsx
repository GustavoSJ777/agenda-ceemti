"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, X } from "lucide-react";
import { mostrarToast } from "@/components/ui/Toasts";

interface Resumo { total: number; criados: number; ignorados: { linha: number; matricula: string; motivo: string }[] }
interface Props { turmas: { id: string; nome: string; ano_letivo: number }[]; ano: number; anos: number[] }

export function ImportarAlunos({ turmas, ano, anos }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [anoSel, setAnoSel] = useState(ano);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);

  const abrir = () => { setErro(""); setResumo(null); ref.current?.showModal(); };

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(""); setResumo(null); setOcupado(true);
    try {
      const r = await fetch("/api/alunos/importar", { method: "POST", body: new FormData(e.currentTarget) });
      if (r.ok && r.headers.get("content-type")?.includes("application/pdf")) {
        const resumoBruto = r.headers.get("X-Resumo");
        if (resumoBruto) setResumo(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(resumoBruto), (c) => c.charCodeAt(0)))));
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement("a");
        a.href = url; a.download = `acessos-alunos-${new Date().toISOString().slice(0, 10)}.pdf`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        mostrarToast("Alunos importados. O PDF com os acessos foi baixado.");
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        setErro(j.erro ?? "Não foi possível importar.");
        if (j.resumo) setResumo(j.resumo);
      }
    } catch { setErro("Falha de conexão. Tente novamente."); }
    finally { setOcupado(false); }
  }

  const turmasDoAno = turmas.filter((t) => t.ano_letivo === anoSel);
  return (
    <>
      <button type="button" className="btn btn-secundario" onClick={abrir}><FileSpreadsheet size={16} aria-hidden /> Importar planilha</button>
      <dialog ref={ref} aria-labelledby="titulo-imp" className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-card p-0 shadow-modal backdrop:bg-texto/40"
        onMouseDown={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="p-4">
        <div className="flex items-center justify-between">
          <h2 id="titulo-imp" className="text-lg font-semibold">Importar alunos por planilha</h2>
          <button type="button" aria-label="Fechar" onClick={() => ref.current?.close()}><X size={18} /></button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          A planilha (.xlsx) precisa das colunas <strong>Matrícula</strong> e <strong>Nome</strong>; <strong>Turma</strong> é opcional.
          O login do aluno será a matrícula e será gerada uma senha provisória, que ele troca no primeiro acesso.{" "}
          <a className="underline text-azul-600" href="/api/alunos/modelo">Baixar modelo</a>
        </p>
        <form onSubmit={enviar} className="mt-3 flex flex-col gap-3">
          {erro && <p role="alert" className="rounded-campo bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
          <div className="campo">
            <label htmlFor="imp-arq">Planilha</label>
            <input id="imp-arq" name="arquivo" type="file" required accept=".xlsx" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="campo">
              <label htmlFor="imp-ano">Ano letivo</label>
              <select id="imp-ano" name="ano_letivo" value={anoSel} onChange={(e) => setAnoSel(Number(e.target.value))}>
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="imp-turma">Turma padrão (se a planilha não tiver coluna Turma)</label>
              <select id="imp-turma" name="turma_id" defaultValue="">
                <option value="">Usar a coluna Turma</option>
                {turmasDoAno.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          </div>
          {resumo && (
            <div className="rounded-campo bg-azul-50 p-2 text-sm">
              <p><strong>{resumo.criados}</strong> de {resumo.total} acessos criados.</p>
              {resumo.ignorados.length > 0 && (
                <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                  {resumo.ignorados.map((i) => <li key={`${i.linha}-${i.matricula}`}>Linha {i.linha}{i.matricula ? ` (${i.matricula})` : ""}: {i.motivo}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">O PDF contém senhas: entregue cada acesso só ao próprio aluno. As senhas não ficam salvas no sistema.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secundario" onClick={() => ref.current?.close()}>Fechar</button>
            <button type="submit" className="btn btn-primario" disabled={ocupado}>{ocupado ? "Importando..." : "Importar e gerar PDF"}</button>
          </div>
        </form>
        </div>
      </dialog>
    </>
  );
}
