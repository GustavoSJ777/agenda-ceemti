import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { Detalhes } from "@/components/ui/Detalhes";
import { CampoAreaTexto, CampoSelecao, CampoTexto } from "@/components/ui/Campos";
import { ItemCalendario as ItemUI } from "@/components/calendar/ItemCalendario";
import { exigirPerfil, obterIdUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarReferencias } from "@/services/referencias";
import { carregarItens } from "@/services/calendario";
import { carregarHorarios } from "@/services/horarios";
import { aulasDoDia, horaCurta, materiasDoDia, type AulaHorario } from "@/lib/utils/horario";
import { criarNomeadores } from "@/lib/utils/nomes";
import { intervaloDoModo, itensDoDia, mover, type ItemCalendario, type ModoCalendario } from "@/lib/utils/calendario";
import { addDias, DIAS_SEMANA, diaDaSemana, fmtData, fmtHora, hojeISO, MESES } from "@/lib/utils/datas";
import { CATEGORIAS_EVENTO, COR_CATEGORIA, opcoesDe } from "@/constants";
import { excluirEvento, salvarEvento, vincularHorarioTurmas } from "./actions";

export const metadata = { title: "Calendário — Agenda Escolar CEEMTI Baixo Guandu" };

type SP = Record<string, string | undefined>;
const rotulo = (c: string) => (CATEGORIAS_EVENTO as Record<string, string>)[c] ?? c;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaCalendario({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const modo: ModoCalendario = sp.modo === "semana" || sp.modo === "dia" ? sp.modo : "mes";
  const dataRef = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? (sp.data as string) : hoje;
  const [ini, fim] = intervaloDoModo(modo, dataRef);

  // Perfil, tabelas de apoio e itens do período em paralelo (1 ida ao banco). O RLS filtra por perfil.
  const sb = await criarClienteServidor();
  const uid = (await obterIdUsuario()) ?? "";
  const [perfil, ref, todos, horario] = await Promise.all([exigirPerfil(), carregarReferencias(), carregarItens(sb, ini, fim), carregarHorarios(sb, uid, UUID.test(sp.turma ?? "") ? sp.turma : undefined)]);
  const gestao = perfil.papel === "direcao" || perfil.papel === "secretaria";
  const n = criarNomeadores(ref);
  const turma = ref.turmas.some((t) => t.id === sp.turma) ? sp.turma : undefined;
  const categoria = sp.categoria && sp.categoria in CATEGORIAS_EVENTO ? sp.categoria : undefined;

  const itens = todos.filter((i) => {
    if (turma && i.turma_id && i.turma_id !== turma) return false;
    if (categoria && i.categoria !== categoria) return false;
    return true;
  });

  // Horário de aulas: o aluno vê a própria turma; os demais escolhem uma turma no filtro.
  const codigosHorario = turma
    ? new Set(horario.turmas.filter((t) => t.turma_id === turma).map((t) => t.codigo))
    : perfil.papel === "aluno" ? new Set(horario.turmas.map((t) => t.codigo)) : undefined;
  const semAula = (dia: string) => todos.some((i) => i.origem === "evento" && (i.categoria === "feriado" || i.categoria === "recesso") && i.data <= dia && dia <= i.data_fim
    && (!i.turma_id || !turma || i.turma_id === turma));
  const aulasDe = (dia: string): AulaHorario[] => (!codigosHorario || semAula(dia) ? [] : aulasDoDia(horario.aulas, dia, diaDaSemana(dia), codigosHorario));
  const naoVinculados = horario.turmas.filter((t) => !t.turma_id);
  const mostrarAvisoTurma = perfil.papel !== "aluno" && !turma && horario.aulas.length > 0;

  const href = (o: { modo?: string; data?: string }) => {
    const q = new URLSearchParams({ modo: o.modo ?? modo, data: o.data ?? dataRef });
    if (turma) q.set("turma", turma);
    if (categoria) q.set("categoria", categoria);
    return `/calendario?${q.toString()}`;
  };

  const d = new Date(`${dataRef}T12:00:00Z`);
  let titulo = `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  if (modo === "semana") {
    const a = new Date(`${ini}T12:00:00Z`), b = new Date(`${fim}T12:00:00Z`);
    titulo = `${a.getUTCDate()}/${a.getUTCMonth() + 1} – ${b.getUTCDate()}/${b.getUTCMonth() + 1}/${b.getUTCFullYear()}`;
  }
  if (modo === "dia") titulo = `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;

  const detalhe = (i: ItemCalendario) => {
    const periodo = i.data_fim !== i.data ? `${fmtData(i.data)} a ${fmtData(i.data_fim)}` : fmtData(i.data);
    return (
      <>
        <Detalhes linhas={[
          ["Categoria", rotulo(i.categoria)], ["Data", periodo], ["Horário", i.hora ? fmtHora(i.hora) : "Dia todo"],
          ["Turma", n.nomeTurma(i.turma_id)], i.disciplina_id ? ["Disciplina", n.nomeDisciplina(i.disciplina_id)] : null,
          i.professor_id ? ["Professor", n.nomeProfessor(i.professor_id)] : null, ["Descrição", i.descricao],
        ]} />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {i.origem === "atividade" && <Link href={`/atividades?id=${i.id}`} className="btn btn-primario">Abrir em Provas e Trabalhos</Link>}
          {i.origem === "evento" && gestao && (
            <>
              <BotaoModal titulo="Editar evento" rotulo="Editar" icone="editar" variante="secundario" textoSalvar="Salvar alterações" largo action={salvarEvento.bind(null, i.id)}>
                <CamposEvento n={n} ev={i.bruto} dataInicial={dataRef} />
              </BotaoModal>
              <span className="inline-flex items-center rounded-campo border border-perigo/30">
                <BotaoExcluir titulo="Excluir evento" ariaLabel="Excluir evento" action={excluirEvento.bind(null, i.id)} mensagem={`Excluir "${i.titulo}"? Esta ação não pode ser desfeita.`} />
              </span>
            </>
          )}
        </div>
      </>
    );
  };

  const chip = (i: ItemCalendario) => (
    <ItemUI key={`${i.origem}:${i.id}:${i.data}`} variante="chip" titulo={i.titulo} rotulo={`${i.hora ? fmtHora(i.hora) + " " : ""}${i.titulo}`} classe={COR_CATEGORIA[i.categoria] ?? ""}>
      {detalhe(i)}
    </ItemUI>
  );
  const bloco = (i: ItemCalendario) => {
    const meta = [i.hora ? fmtHora(i.hora) : null, i.turma_id ? n.nomeTurma(i.turma_id) : null, i.disciplina_id ? n.nomeDisciplina(i.disciplina_id) : null].filter(Boolean).join(" · ");
    return (
      <ItemUI key={`${i.origem}:${i.id}:${i.data}`} variante="bloco" titulo={i.titulo} rotulo={i.titulo} meta={`${meta}${meta ? " · " : ""}${rotulo(i.categoria)}`} classe={COR_CATEGORIA[i.categoria] ?? ""}>
        {detalhe(i)}
      </ItemUI>
    );
  };

  return (
    <>
      <CabecalhoPagina titulo="Calendário escolar" descricao="Provas, trabalhos, reuniões, feriados, eventos e horário de aulas.">
        {(perfil.papel === "direcao" || perfil.papel === "coordenador") && naoVinculados.length > 0 && (
          <BotaoModal titulo="Vincular turmas ao horário" rotulo="Vincular turmas do horário" variante="secundario" textoSalvar="Vincular" largo action={vincularHorarioTurmas}>
            <p className="sm:col-span-2 text-sm text-texto-suave">Associe cada turma do horário oficial à turma cadastrada no sistema. Só aparecem as ainda não vinculadas.</p>
            {naoVinculados.map((t, i) => (
              <div key={t.codigo} className="campo sm:col-span-2">
                <input type="hidden" name={`codigo_${i}`} value={t.codigo} />
                <label htmlFor={`vinc_${i}`}>{t.codigo}</label>
                <select id={`vinc_${i}`} name={`turma_${i}`} defaultValue="">
                  <option value="">Não vincular agora</option>
                  {n.opcoesTurmas().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
          </BotaoModal>
        )}
        {gestao && (
          <BotaoModal titulo="Novo evento" rotulo="Novo evento" textoSalvar="Cadastrar evento" largo action={salvarEvento.bind(null, "")}>
            <CamposEvento n={n} dataInicial={dataRef} />
          </BotaoModal>
        )}
      </CabecalhoPagina>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href({ data: mover(modo, dataRef, -1) })} aria-label="Anterior" className="grid h-9 w-9 place-items-center rounded-campo border border-borda bg-white"><ChevronLeft size={18} /></Link>
        <Link href={href({ data: mover(modo, dataRef, 1) })} aria-label="Próximo" className="grid h-9 w-9 place-items-center rounded-campo border border-borda bg-white"><ChevronRight size={18} /></Link>
        <Link href={href({ data: hoje })} className="btn btn-secundario !py-1.5">Hoje</Link>
        <h2 className="mx-2 flex-1 text-lg font-extrabold capitalize">{titulo}</h2>
        <div role="group" aria-label="Modo de exibição" className="flex overflow-hidden rounded-campo border border-borda bg-white">
          {(["mes", "semana", "dia"] as const).map((m) => (
            <Link key={m} href={href({ modo: m })} aria-current={m === modo ? "true" : undefined}
              className={`px-3 py-1.5 font-bold ${m === modo ? "bg-azul-600 text-white" : "text-azul-700 hover:bg-azul-50"}`}>
              {m === "mes" ? "Mês" : m === "semana" ? "Semana" : "Dia"}
            </Link>
          ))}
        </div>
      </div>

      <form method="get" action="/calendario" className="card mb-4 flex flex-wrap items-end gap-3 !p-4">
        <input type="hidden" name="modo" value={modo} />
        <input type="hidden" name="data" value={dataRef} />
        <div className="campo min-w-[160px] flex-1">
          <label htmlFor="c_turma">Turma</label>
          <select id="c_turma" name="turma" defaultValue={turma ?? ""}>
            <option value="">Todas as turmas</option>
            {n.opcoesTurmas().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div className="campo min-w-[160px] flex-1">
          <label htmlFor="c_cat">Categoria</label>
          <select id="c_cat" name="categoria" defaultValue={categoria ?? ""}>
            <option value="">Todas as categorias</option>
            {opcoesDe(CATEGORIAS_EVENTO).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primario">Filtrar</button>
        <Link href={`/calendario?modo=${modo}&data=${dataRef}`} className="btn btn-secundario">Limpar</Link>
      </form>

      {modo === "mes" && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-card border border-borda bg-white shadow-card">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((x) => <div key={x} className="bg-azul-50 px-2 py-2 text-center text-xs font-extrabold text-texto-suave">{x}</div>)}
            {Array.from({ length: 42 }, (_, k) => {
              const dia = addDias(ini, k);
              const lista = itensDoDia(itens, dia);
              const doMes = dia.slice(0, 7) === dataRef.slice(0, 7);
              return (
                <div key={dia} className={`min-h-[96px] space-y-1 border-t border-l border-borda p-1.5 ${doMes ? "" : "bg-slate-50 text-texto-suave"} ${dia === hoje ? "bg-azul-50" : ""}`}>
                  <Link href={href({ modo: "dia", data: dia })} aria-label={`Abrir ${fmtData(dia)}`}
                    className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-bold ${dia === hoje ? "bg-azul-600 text-white" : "hover:bg-azul-100"}`}>
                    {Number(dia.slice(8))}
                  </Link>
                  {(() => { const m = materiasDoDia(aulasDe(dia)); return m.length ? <p className="line-clamp-2 text-[11px] leading-tight text-texto-suave" title={`Aulas: ${m.join(", ")}`}>Aulas: {m.join(", ")}</p> : null; })()}
                  {lista.slice(0, 3).map(chip)}
                  {lista.length > 3 && <Link href={href({ modo: "dia", data: dia })} className="block text-xs font-bold text-azul-600">+{lista.length - 3} mais</Link>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modo === "semana" && (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, k) => {
            const dia = addDias(ini, k);
            const lista = itensDoDia(itens, dia);
            return (
              <section key={dia} className={`card space-y-2 !p-3 ${dia === hoje ? "border-azul-400" : ""}`}>
                <h3 className="text-sm font-extrabold"><Link href={href({ modo: "dia", data: dia })} className="hover:underline">{DIAS_SEMANA[diaDaSemana(dia)].split("-")[0]}, {Number(dia.slice(8))}</Link></h3>
                <ListaAulas aulas={aulasDe(dia)} compacta />
                {lista.length ? lista.map(bloco) : <span className="text-xs text-texto-suave">Sem compromissos</span>}
              </section>
            );
          })}
        </div>
      )}

      {modo === "dia" && (
        <div className="max-w-2xl space-y-2">
          <HorarioDoDia aulas={aulasDe(dataRef)} dia={dataRef} feriado={codigosHorario ? semAula(dataRef) : false} />
          {itensDoDia(itens, dataRef).length ? itensDoDia(itens, dataRef).map(bloco) : <div className="card text-center text-texto-suave">Nenhum compromisso neste dia.</div>}
        </div>
      )}

      {mostrarAvisoTurma && <p className="mt-3 text-sm text-texto-suave">Para ver o horário de aulas, escolha uma turma no filtro acima.</p>}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(CATEGORIAS_EVENTO).map(([k, v]) => <span key={k} className={`rounded px-2 py-0.5 font-bold ${COR_CATEGORIA[k]}`}>{v}</span>)}
      </div>
    </>
  );
}

function CamposEvento({ n, ev, dataInicial }: { n: ReturnType<typeof criarNomeadores>; ev?: Record<string, string | null>; dataInicial: string }) {
  return (
    <>
      <CampoTexto name="titulo" label="Título" obrigatorio cheio maxLength={120} valor={ev?.titulo} />
      <CampoSelecao name="categoria" label="Categoria" obrigatorio vazio={null} opcoes={opcoesDe(CATEGORIAS_EVENTO)} valor={ev?.categoria ?? "evento_escolar"} />
      <CampoTexto name="hora" label="Horário" tipo="time" valor={ev?.hora ? fmtHora(ev.hora) : ""} dica="Deixe em branco para o dia todo." />
      <CampoTexto name="data" label="Data" tipo="date" obrigatorio valor={ev?.data ?? dataInicial} />
      <CampoTexto name="data_fim" label="Data final (opcional)" tipo="date" valor={ev?.data_fim && ev.data_fim !== ev.data ? ev.data_fim : ""} dica="Para recessos e eventos de vários dias." />
      <CampoSelecao name="turma_id" label="Turma" opcoes={n.opcoesTurmas()} vazio="Toda a escola" valor={ev?.turma_id} />
      <CampoSelecao name="disciplina_id" label="Disciplina" opcoes={n.opcoesDisciplinas()} vazio="Nenhuma" valor={ev?.disciplina_id} />
      <CampoSelecao name="professor_id" label="Professor responsável" opcoes={n.opcoesProfessores()} vazio="Nenhum" valor={ev?.professor_id} cheio />
      <CampoAreaTexto name="descricao" label="Descrição" cheio maxLength={1000} valor={ev?.descricao} />
    </>
  );
}

function ListaAulas({ aulas, compacta }: { aulas: AulaHorario[]; compacta?: boolean }) {
  if (!aulas.length) return null;
  return (
    <ul className={`space-y-0.5 border-b border-borda pb-2 ${compacta ? "text-xs" : "text-sm"}`} aria-label="Aulas do dia">
      {aulas.map((a) => (
        <li key={a.id} title={[a.professor, a.sala].filter(Boolean).join(" · ")}>
          <span className="font-bold text-azul-700">{horaCurta(a.inicio)}</span> {a.disciplina}
        </li>
      ))}
    </ul>
  );
}

function HorarioDoDia({ aulas, dia, feriado }: { aulas: AulaHorario[]; dia: string; feriado: boolean }) {
  const wd = diaDaSemana(dia);
  const nome = DIAS_SEMANA[wd];
  if (feriado) return <div className="card text-sm text-texto-suave">Sem aulas em {nome} ({fmtData(dia)}): feriado ou recesso no calendário.</div>;
  if (!aulas.length) return null;
  const materias = materiasDoDia(aulas);
  return (
    <section className="card !p-4" aria-label="Horário de aulas">
      <h3 className="text-base font-extrabold">Horário de aulas</h3>
      {materias.length > 0 && <p className="mt-1 text-sm">Em {nome}, dia {Number(dia.slice(8))}, temos as matérias: <strong>{materias.join(", ")}</strong>.</p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-xs text-texto-suave"><th className="py-1 pr-3">Aula</th><th className="pr-3">Horário</th><th className="pr-3">Matéria</th><th className="pr-3">Professor</th><th>Sala</th></tr></thead>
          <tbody>
            {aulas.map((a) => (
              <tr key={a.id} className="border-t border-borda">
                <td className="py-1 pr-3 font-bold">{a.aula}ª</td>
                <td className="pr-3 whitespace-nowrap">{horaCurta(a.inicio)} – {horaCurta(a.fim)}</td>
                <td className="pr-3">{a.disciplina}</td>
                <td className="pr-3">{a.professor ?? "—"}</td>
                <td>{a.sala ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
