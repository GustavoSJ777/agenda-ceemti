import Link from "next/link";
import { obterIdUsuario } from "@/lib/auth";
import { CabecalhoPublico } from "@/components/layout/CabecalhoPublico";
import { BotaoImprimir } from "@/components/ui/BotaoImprimir";
import { CSS_IMPRESSAO, NOME_DIA_LONGO as NOME, QuadroDia, QuadroTurma } from "@/components/horario/QuadroDia";
import { carregarHorarioPublico } from "@/services/horario-publico";
import { aulasDoDia, type AulaHorario } from "@/lib/utils/horario";
import { diaDaSemana, fmtData, hojeISO } from "@/lib/utils/datas";

const DIAS = [1, 2, 3, 4, 5];

/** Página inicial do sistema: horário de aulas público + menu para entrar. */
export async function PaginaPublica({ sp }: { sp: Record<string, string | undefined> }) {
  const logado = Boolean(await obterIdUsuario());
  const hoje = hojeISO();
  const { aulas, turmas, arquivos } = await carregarHorarioPublico().catch(() => ({
    aulas: [] as AulaHorario[], turmas: [] as string[], arquivos: [] as { id: string; nome: string; vigente_desde: string | null }[],
  }));
  const comAulas = turmas.filter((t) => aulas.some((a) => a.turma_codigo === t));
  const turma = comAulas.includes(sp.turma ?? "") ? (sp.turma as string) : undefined;

  // Dia mostrado: o pedido; senão hoje (segunda a sexta); no fim de semana, segunda-feira.
  const wd = diaDaSemana(hoje);
  const todos = sp.dia === "todos";
  const pedido = Number(sp.dia);
  const dia = DIAS.includes(pedido) ? pedido : DIAS.includes(wd) ? wd : 1;

  // Se nenhum horário já começou, mostra o mais antigo para a página não ficar vazia.
  const dataRef = aulas.some((a) => a.vigente_desde <= hoje) ? hoje : [...aulas.map((a) => a.vigente_desde)].sort()[0] ?? hoje;
  const doDia = (d: number, codigos?: string[]) => aulasDoDia(aulas, dataRef, d, codigos ? new Set(codigos) : undefined);
  const vigencia = aulas.filter((a) => a.vigente_desde <= dataRef).map((a) => a.vigente_desde).sort().pop();
  const link = (o: Record<string, string>) => `/?${new URLSearchParams(o).toString()}`;

  return (
    <div className="min-h-screen bg-azul-50 print:min-h-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESSAO }} />
      <CabecalhoPublico ativo="horario" logado={logado} />

      <main className="mx-auto max-w-[1800px] space-y-3 p-3 sm:p-4 print:max-w-none print:p-0">
        <h1 className="text-xl font-extrabold print:hidden">Horário de aulas</h1>

        {comAulas.length === 0 ? (
          <div className="card text-center text-texto-suave">O horário ainda não foi divulgado. Volte em breve.</div>
        ) : (
          <>
            <div className="card flex flex-wrap items-end gap-3 !p-3 print:hidden">
              <form method="get" action="/" className="flex flex-wrap items-end gap-2">
                <div className="campo min-w-[200px]">
                  <label htmlFor="p_turma">Minha turma</label>
                  <select id="p_turma" name="turma" defaultValue={turma ?? ""}>
                    <option value="">Todas as turmas (por dia)</option>
                    {comAulas.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn btn-primario">Ver</button>
              </form>
              {!turma && (
                <nav aria-label="Dia da semana" className="flex flex-wrap gap-1.5">
                  {DIAS.map((d) => (
                    <Link key={d} href={link({ dia: String(d) })} aria-current={!todos && d === dia ? "page" : undefined}
                      className={`btn !px-3 !py-1.5 ${!todos && d === dia ? "btn-primario" : "btn-secundario"}`}>
                      {NOME[d].replace("-feira", "")}{d === wd ? " (hoje)" : ""}
                    </Link>
                  ))}
                  <Link href={link({ dia: "todos" })} aria-current={todos ? "page" : undefined} className={`btn !px-3 !py-1.5 ${todos ? "btn-primario" : "btn-secundario"}`}>Semana toda</Link>
                </nav>
              )}
              {turma && <Link href="/" className="btn btn-secundario">Ver todas as turmas</Link>}
              <div className="ml-auto"><BotaoImprimir rotulo="Imprimir" /></div>
            </div>

            {turma ? (
              <QuadroTurma turma={turma} aulas={DIAS.flatMap((d) => doDia(d, [turma]))} vigencia={vigencia} />
            ) : (
              (todos ? DIAS : [dia]).map((d) => <QuadroDia key={d} dia={d} aulas={doDia(d, comAulas)} turmas={comAulas} vigencia={vigencia} />)
            )}

            <p className="text-xs text-texto-suave print:text-black">
              Horário sujeito a alterações. Feriados e recessos não estão marcados aqui; consulte o calendário escolar.
              <span className="print:hidden"> Para colar na escola: escolha o dia (ou “Semana toda”, uma folha por dia), clique em Imprimir e use A4 na horizontal.</span>
            </p>
          </>
        )}

        {arquivos.length > 0 && (
          <section className="card !p-4 print:hidden" aria-label="Horário em PDF">
            <h2 className="font-extrabold">Horário em arquivo</h2>
            <ul className="mt-1 space-y-1 text-sm">
              {arquivos.map((a) => (
                <li key={a.id}><a className="text-azul-600 underline" href={`/api/horario/arquivo/${a.id}`} target="_blank" rel="noopener noreferrer">{a.nome}</a>{a.vigente_desde ? <span className="text-texto-suave"> — vale desde {fmtData(a.vigente_desde)}</span> : null}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
