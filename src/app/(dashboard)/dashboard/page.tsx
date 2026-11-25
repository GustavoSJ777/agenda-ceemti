import Link from "next/link";
import { Icone } from "@/components/layout/Icone";
import { Selo } from "@/components/ui/Selo";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTodos } from "@/lib/supabase/todos";
import { carregarReferencias } from "@/services/referencias";
import { carregarItens } from "@/services/calendario";
import { criarNomeadores } from "@/lib/utils/nomes";
import { itensDoDia, primeiroDoMes } from "@/lib/utils/calendario";
import { addDias, diaDaSemana, DIAS_SEMANA, fmtData, fmtDataHora, fmtHora, hojeISO, MESES } from "@/lib/utils/datas";
import { CATEGORIAS_EVENTO, ROTULO_PAPEL } from "@/constants";
import { menuDoPapel, rotuloDoMenu } from "@/lib/permissions";
import { medir } from "@/lib/tempos";
import { checar } from "@/lib/actions/resultado";

export const metadata = { title: "Painel — Agenda Escolar CEEMTI Baixo Guandu" };

const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function PaginaPainel({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const hoje = hojeISO();
  const primeiro = primeiroDoMes(hoje);
  const miniIni = addDias(primeiro, -diaDaSemana(primeiro));
  const miniFim = addDias(miniIni, 41);
  const ate45 = addDias(hoje, 45);

  // Tudo é disparado ao mesmo tempo: perfil, tabelas de apoio e dados da tela (1 ida ao banco em vez de 3 em sequência).
  // O RLS filtra os dados por perfil, então as consultas não dependem de saber o papel antes.
  const sb = await criarClienteServidor();
  const [perfil, sp, ref, [provas, trabalhos, recs, itens, avisosR, ativR, eventosR, totalAlunos]] = await Promise.all([
    exigirPerfil(),
    searchParams,
    carregarReferencias(),
    medir("painel.consultas", () => Promise.all([
      medir("q.provas", async () => sb.from("atividades").select("id", { count: "exact", head: true }).eq("tipo", "prova")),
      medir("q.trabalhos", async () => sb.from("atividades").select("id", { count: "exact", head: true }).eq("tipo", "trabalho")),
      medir("q.recuperacoes", () => lerTodos<{ aluno_id: string }>(() => sb.from("recuperacoes").select("aluno_id").neq("situacao", "concluida").order("id") as never)),
      medir("q.calendario", () => carregarItens(sb, miniIni < hoje ? miniIni : hoje, miniFim > ate45 ? miniFim : ate45)),
      medir("q.avisos", async () => sb.from("avisos").select("id,titulo,conteudo,data_publicacao,validade,criado_em").lte("data_publicacao", hoje).order("data_publicacao", { ascending: false }).limit(15)),
      medir("q.atividades-recentes", async () => sb.from("atividades").select("id,tipo,titulo,criado_em").order("criado_em", { ascending: false }).limit(5)),
      medir("q.eventos-recentes", async () => sb.from("eventos").select("id,titulo,criado_em").order("criado_em", { ascending: false }).limit(5)),
      medir("q.total-alunos", async () => sb.from("alunos").select("id", { count: "exact", head: true })),
    ])),
  ]);
  const aluno = perfil.papel === "aluno";
  const gestao = perfil.papel === "direcao" || perfil.papel === "secretaria";
  const n = criarNomeadores(ref);
  for (const r of [provas, trabalhos]) if (r.error) throw r.error;

  const emRec = aluno ? recs.length : new Set(recs.map((r) => r.aluno_id)).size;
  const proximos = itens.filter((i) => i.data >= hoje && i.data <= ate45).sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? "")).slice(0, 6);
  type Av = { id: string; titulo: string; conteudo: string; data_publicacao: string; validade: string | null; criado_em: string };
  const todosAvisos = (checar(avisosR) ?? []) as Av[];
  const avisos = todosAvisos.filter((a) => !a.validade || a.validade >= hoje).slice(0, 4);
  const recentes = [
    ...((checar(ativR) ?? []) as { tipo: string; titulo: string; criado_em: string }[]).map((a) => ({ em: a.criado_em, txt: `${a.tipo === "prova" ? "Prova cadastrada" : "Trabalho cadastrado"}: ${a.titulo}` })),
    ...((checar(eventosR) ?? []) as { titulo: string; criado_em: string }[]).map((e) => ({ em: e.criado_em, txt: `Evento no calendário: ${e.titulo}` })),
    ...todosAvisos.map((a) => ({ em: a.criado_em, txt: `Aviso publicado: ${a.titulo}` })),
  ].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 6);

  const nome = perfil.nome.trim().split(/\s+/)[0];
  const d = new Date(`${hoje}T12:00:00Z`);
  const stats: { icone: string; valor: number; rotulo: string }[] = [
    { icone: "clipboard", valor: provas.count ?? 0, rotulo: aluno ? "Provas da minha turma" : "Provas cadastradas" },
    { icone: "note", valor: trabalhos.count ?? 0, rotulo: aluno ? "Trabalhos da minha turma" : "Trabalhos cadastrados" },
    { icone: "refresh", valor: emRec, rotulo: aluno ? "Recuperações em aberto" : "Alunos em recuperação" },
  ];
  if (gestao) {
    stats.push({ icone: "users", valor: totalAlunos?.count ?? 0, rotulo: "Alunos cadastrados" });
    stats.push({ icone: "users", valor: ref.professores.length, rotulo: "Professores" });
    stats.push({ icone: "layers", valor: ref.turmas.length, rotulo: "Turmas" });
  }
  const atalhos = menuDoPapel(perfil.papel).filter((m) => m.id !== "dashboard");

  return (
    <div className="space-y-4">
      {sp.aviso === "sem-acesso" && <div role="alert" className="alerta alerta-erro">Você não tem acesso a esta área.</div>}
      <section className="card">
        <h1 className="text-xl font-extrabold">Olá, {nome}!</h1>
        <p className="text-texto-suave">Bem-vindo(a) à Agenda Escolar do CEEMTI Baixo Guandu — {ROTULO_PAPEL[perfil.papel]}. Hoje é {DIAS_SEMANA[d.getUTCDay()]}, {fmtData(hoje)}.</p>
      </section>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.rotulo} className="card flex items-center gap-3 !p-4">
            <span className="grid h-11 w-11 place-items-center rounded-campo bg-azul-100 text-azul-700"><Icone nome={s.icone} /></span>
            <div><strong className="block text-2xl font-extrabold leading-none">{s.valor}</strong><span className="text-sm text-texto-suave">{s.rotulo}</span></div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-3 text-lg font-extrabold">Próximos compromissos</h2>
            {proximos.length ? (
              <ul className="divide-y divide-borda">
                {proximos.map((i) => {
                  const dt = new Date(`${i.data}T12:00:00Z`);
                  const meta = [i.hora ? fmtHora(i.hora) : null, i.turma_id ? n.nomeTurma(i.turma_id) : null, i.disciplina_id ? n.nomeDisciplina(i.disciplina_id) : null].filter(Boolean).join(" · ");
                  return (
                    <li key={`${i.origem}:${i.id}:${i.data}`}>
                      <Link href={`/calendario?modo=dia&data=${i.data}`} className="flex items-center gap-3 py-2 hover:bg-azul-50">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-campo bg-azul-100 text-azul-800 leading-tight">
                          <strong className="text-lg">{dt.getUTCDate()}</strong><span className="-mt-1 text-xs uppercase">{ABREV[dt.getUTCMonth()]}</span>
                        </span>
                        <span className="min-w-0"><strong className="block truncate">{i.titulo}</strong>
                          <span className="text-sm text-texto-suave"><Selo>{(CATEGORIAS_EVENTO as Record<string, string>)[i.categoria] ?? i.categoria}</Selo> {meta}</span></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-texto-suave">Nenhum compromisso nos próximos dias.</p>}
          </section>

          <section className="card">
            <h2 className="mb-3 text-lg font-extrabold">Avisos da escola</h2>
            {avisos.length ? (
              <>
                <ul className="divide-y divide-borda">
                  {avisos.map((a) => (
                    <li key={a.id} className="py-2"><strong>{a.titulo}</strong> <span className="text-xs text-texto-suave">{fmtData(a.data_publicacao)}</span>
                      <p className="text-sm">{a.conteudo.length > 180 ? `${a.conteudo.slice(0, 180)}…` : a.conteudo}</p></li>
                  ))}
                </ul>
                <p className="mt-2"><Link href="/avisos" className="font-bold text-azul-600">Ver todos os avisos</Link></p>
              </>
            ) : <p className="text-texto-suave">Nenhum aviso vigente.</p>}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-extrabold capitalize">{MESES[d.getUTCMonth()]} de {d.getUTCFullYear()}</h2>
              <Link href="/calendario" className="text-sm font-bold text-azul-600">Abrir calendário</Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((x, k) => <span key={k} className="text-xs font-bold text-texto-suave">{x}</span>)}
              {Array.from({ length: 42 }, (_, k) => {
                const dia = addDias(miniIni, k);
                const tem = itensDoDia(itens, dia).length > 0;
                const doMes = dia.slice(0, 7) === hoje.slice(0, 7);
                return (
                  <Link key={dia} href={`/calendario?modo=dia&data=${dia}`} aria-label={`${fmtData(dia)}${tem ? " (há compromissos)" : ""}`}
                    className={`rounded-campo py-1 ${dia === hoje ? "bg-azul-600 font-bold text-white" : doMes ? "hover:bg-azul-100" : "text-texto-suave/60 hover:bg-azul-50"} ${tem && dia !== hoje ? "font-extrabold text-azul-700 underline decoration-2" : ""}`}>
                    {Number(dia.slice(8))}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-lg font-extrabold">Atalhos</h2>
            <div className="grid grid-cols-2 gap-2">
              {atalhos.map((m) => (
                <Link key={m.id} href={`/${m.id}`} className="flex items-center gap-2 rounded-campo border border-borda px-3 py-2 font-bold text-azul-800 hover:bg-azul-50">
                  <Icone nome={m.icone} tamanho={18} /> {rotuloDoMenu(m, perfil.papel)}
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-lg font-extrabold">Atividades recentes</h2>
            {recentes.length ? (
              <ul className="divide-y divide-borda">
                {recentes.map((x, k) => <li key={k} className="py-2"><strong className="block">{x.txt}</strong><span className="text-xs text-texto-suave">{fmtDataHora(x.em)}</span></li>)}
              </ul>
            ) : <p className="text-texto-suave">Sem atividades recentes.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
