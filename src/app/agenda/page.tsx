import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { CabecalhoPublico } from "@/components/layout/CabecalhoPublico";
import { obterIdUsuario } from "@/lib/auth";
import { carregarAgendaPublica } from "@/services/agenda-publica";
import { daTurma, type ItemAgenda } from "@/lib/utils/agenda-publica";
import { primeiroDoMes, mover } from "@/lib/utils/calendario";
import { addDias, DIAS_SEMANA, fmtData, fmtHora, hojeISO, MESES } from "@/lib/utils/datas";
import { CATEGORIAS_EVENTO, COR_CATEGORIA, NOME_ESCOLA } from "@/constants";

export const metadata: Metadata = {
  title: `Agenda Escolar — ${NOME_ESCOLA}`,
  description: `Provas, trabalhos, eventos, feriados e avisos do ${NOME_ESCOLA}.`,
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

const rotulo = (c: string) => (CATEGORIAS_EVENTO as Record<string, string>)[c] ?? c;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agenda aberta (sem login, só leitura): avisos e, mês a mês, provas, trabalhos, eventos e feriados. */
export default async function AgendaPublica({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const logado = Boolean(await obterIdUsuario());
  const hoje = hojeISO();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : primeiroDoMes(hoje);
  const proximo = mover("mes", mes, 1);
  const fim = addDias(proximo, -1);

  const dados = await carregarAgendaPublica(mes, fim, hoje).catch(() => null);
  const turma = dados && UUID.test(sp.turma ?? "") && dados.turmas.some((t) => t.id === sp.turma) ? sp.turma : undefined;
  const nomeTurma = (id: string | null) => (id ? dados?.turmas.find((t) => t.id === id)?.nome ?? "Turma" : "Toda a escola");
  const itens = dados ? daTurma(dados.itens, turma) : [];
  const avisos = dados ? daTurma(dados.avisos, turma) : [];

  // Agrupa por dia; eventos de vários dias aparecem no primeiro dia do mês em que caem.
  const porDia = new Map<string, ItemAgenda[]>();
  for (const i of itens) {
    const dia = i.data < mes ? mes : i.data;
    porDia.set(dia, [...(porDia.get(dia) ?? []), i]);
  }
  const dias = [...porDia.keys()].sort();

  const d = new Date(`${mes}T12:00:00Z`);
  const nomeMes = MESES[d.getUTCMonth()];
  const tituloMes = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${d.getUTCFullYear()}`;
  const link = (m: string) => `/agenda?${new URLSearchParams({ mes: m.slice(0, 7), ...(turma ? { turma } : {}) }).toString()}`;
  const nomeDia = (iso: string) => {
    const x = new Date(`${iso}T12:00:00Z`);
    return `${DIAS_SEMANA[x.getUTCDay()]}, ${x.getUTCDate()} de ${MESES[x.getUTCMonth()]}`;
  };

  return (
    <div className="min-h-screen bg-azul-50">
      <CabecalhoPublico ativo="agenda" logado={logado} />
      <main className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
        <div>
          <h1 className="text-xl font-extrabold">Agenda Escolar</h1>
          <p className="text-sm text-texto-suave">Provas, trabalhos, eventos, feriados e avisos. Aberta para consulta, sem login.</p>
        </div>

        {!dados ? (
          <div className="card text-center text-texto-suave">Não foi possível carregar a agenda agora. Tente de novo em instantes.</div>
        ) : (
          <>
            <div className="card flex flex-wrap items-end gap-3 !p-3">
              <form method="get" action="/agenda" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="mes" value={mes.slice(0, 7)} />
                <div className="campo min-w-[200px]">
                  <label htmlFor="a_turma">Minha turma</label>
                  <select id="a_turma" name="turma" defaultValue={turma ?? ""}>
                    <option value="">Todas as turmas</option>
                    {dados.turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn btn-primario">Ver</button>
              </form>
              <nav aria-label="Mês" className="ml-auto flex items-center gap-1">
                <Link href={link(mover("mes", mes, -1))} className="btn btn-secundario !px-2.5" aria-label="Mês anterior"><ChevronLeft size={18} aria-hidden="true" /></Link>
                <span className="min-w-[150px] text-center font-extrabold">{tituloMes}</span>
                <Link href={link(proximo)} className="btn btn-secundario !px-2.5" aria-label="Próximo mês"><ChevronRight size={18} aria-hidden="true" /></Link>
                {mes !== primeiroDoMes(hoje) && <Link href={link(hoje)} className="btn btn-secundario !py-1.5">Hoje</Link>}
              </nav>
            </div>

            {avisos.length > 0 && (
              <section aria-labelledby="h-avisos" className="space-y-2">
                <h2 id="h-avisos" className="flex items-center gap-2 text-lg font-extrabold"><Megaphone size={20} aria-hidden="true" /> Avisos</h2>
                {avisos.map((a) => (
                  <article key={a.id} className="card !p-4">
                    <h3 className="font-extrabold">{a.titulo}</h3>
                    <p className="text-xs text-texto-suave">{fmtData(a.data_publicacao)} · {a.turma_id ? nomeTurma(a.turma_id) : "Toda a escola"}{a.validade ? ` · até ${fmtData(a.validade)}` : ""}</p>
                    <p className="mt-1 whitespace-pre-line text-sm">{a.conteudo}</p>
                  </article>
                ))}
              </section>
            )}

            <section aria-labelledby="h-mes" className="space-y-3">
              <h2 id="h-mes" className="text-lg font-extrabold">{tituloMes}</h2>
              {dias.length === 0 ? (
                <div className="card text-center text-texto-suave">Nada marcado neste mês{turma ? " para esta turma" : ""}.</div>
              ) : dias.map((dia) => (
                <div key={dia} className={`card !p-0 overflow-hidden ${dia < hoje ? "opacity-60" : ""}`}>
                  <h3 className={`px-4 py-2 font-extrabold first-letter:uppercase ${dia === hoje ? "bg-azul-600 text-white" : "bg-azul-100 text-azul-700"}`}>
                    {nomeDia(dia)}{dia === hoje ? " — hoje" : ""}
                  </h3>
                  <ul className="divide-y divide-borda">
                    {porDia.get(dia)!.map((i) => (
                      <li key={i.chave} className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COR_CATEGORIA[i.categoria] ?? "bg-gray-100 text-gray-800"}`}>{rotulo(i.categoria)}</span>
                          <strong>{i.titulo}</strong>
                        </div>
                        <p className="mt-0.5 text-sm text-texto-suave">
                          {nomeTurma(i.turma_id)}
                          {i.disciplina_id && dados.disciplinas[i.disciplina_id] ? ` · ${dados.disciplinas[i.disciplina_id]}` : ""}
                          {i.hora ? ` · ${fmtHora(i.hora)}` : ""}
                          {i.data_fim !== i.data ? ` · de ${fmtData(i.data)} a ${fmtData(i.data_fim)}` : ""}
                        </p>
                        {i.descricao && <p className="mt-1 whitespace-pre-line text-sm">{i.descricao}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <p className="text-xs text-texto-suave">Só consulta. Para alterar algo, a equipe da escola entra pelo botão Entrar.</p>
          </>
        )}
      </main>
    </div>
  );
}
