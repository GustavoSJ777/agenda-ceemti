import { AlertTriangle } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { AnexarHorario } from "@/components/forms/AnexarHorario";
import { CampoMarcar, CampoSelecao, CampoTexto } from "@/components/ui/Campos";
import { Tabela } from "@/components/tables/Tabela";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { checar } from "@/lib/actions/resultado";
import { carregarReferencias } from "@/services/referencias";
import { hojeISO, fmtData } from "@/lib/utils/datas";
import { AULAS_REGULARES, DIAS_UTEIS, HORARIO_AULA, NOME_DIA, chaveProf, type Demanda, type Indisponibilidade } from "@/lib/horario/tipos";
import { detectarConflitos, sugerirSolucoes, type AulaGrade, type Conflito } from "@/lib/horario/conflitos";
import { listarProfessores, type ProfessorListado } from "@/lib/horario/professores";
import { restricoesParaDisponibilidade } from "@/lib/horario/disponibilidade";
import {
  adicionarMateria, adicionarProfessor, excluirProfessor, aplicarSugestao, importarDaGrade, excluirAulaGrade, excluirDemanda, excluirIndisponibilidade, excluirSala, gerarGrade,
  salvarAulaGrade, definirDisponibilidade, excluirArquivoHorario, salvarDemanda, salvarIndisponibilidade, salvarSala, salvarTurmaHorario,
} from "./actions";

export const metadata = { title: "Horário de aulas — Agenda Escolar CEEMTI Baixo Guandu" };

type SP = Record<string, string | undefined>;
interface TurmaH { codigo: string; turma_id: string | null; sala_base: string | null }
interface DemandaH extends Demanda { id: string }
interface IndispH extends Indisponibilidade { id: string }
interface AulaH extends AulaGrade { vigente_desde: string }

interface Arquivo { id: string; nome: string; vigente_desde: string | null; criado_em: string }
const horaCurta = (t: string) => t.replace(":", "h").replace(/h00$/, "h");

export default async function PaginaHorario({ searchParams }: { searchParams: Promise<SP> }) {
  await exigirPapel(["direcao", "coordenador"]);
  const sp = await searchParams;
  const aba = sp.aba === "configurar" ? "configurar" : "grade";
  const sb = await criarClienteServidor();

  const [rv, rt, rd, ri, rs, ref, rar, rp] = await Promise.all([
    sb.from("horarios").select("vigente_desde").limit(5000),
    sb.from("horario_turmas").select("codigo,turma_id,sala_base").order("codigo"),
    sb.from("horario_demandas").select("*").order("disciplina"),
    sb.from("horario_indisponibilidades").select("*").order("professor").order("dia_semana"),
    sb.from("horario_salas").select("id,nome").order("nome"),
    carregarReferencias(),
    sb.from("horario_arquivos").select("id,nome,vigente_desde,criado_em").order("criado_em", { ascending: false }).limit(20),
    sb.from("horario_professores").select("id,nome").order("nome"),
  ]);
  const vigencias = [...new Set((checar(rv) as { vigente_desde: string }[]).map((x) => x.vigente_desde))].sort().reverse();
  const turmas = checar(rt) as TurmaH[];
  const demandas = checar(rd) as DemandaH[];
  const indisp = checar(ri) as IndispH[];
  const salas = checar(rs) as { id: string; nome: string }[];
  const arquivos = (rar.error ? [] : rar.data) as Arquivo[];

  const vig = vigencias.includes(sp.vig ?? "") ? (sp.vig as string) : vigencias.find((v) => v <= hojeISO()) ?? vigencias[0];
  const aulasR = vig ? await sb.from("horarios").select("id,turma_codigo,dia_semana,aula,disciplina,professor,sala,vigente_desde").eq("vigente_desde", vig).limit(5000) : { data: [], error: null };
  const aulas = checar(aulasR) as AulaH[];
  const turmaSel = turmas.some((t) => t.codigo === sp.turma) ? (sp.turma as string) : turmas[0]?.codigo;

  const semCadastroProf = Boolean(rp.error);
  const professores = listarProfessores({ cadastrados: rp.error ? [] : (rp.data as { id: string; nome: string }[]), demandas, aulas, indisp });
  const nomesProf = professores.map((p) => p.nome);
  const lista = <datalist id="lista-prof">{nomesProf.map((n) => <option key={n} value={n} />)}</datalist>;
  const nomeTurmaSistema = (id: string | null) => ref.turmas.find((t) => t.id === id)?.nome ?? "—";

  const q = (o: SP) => `/horario?${new URLSearchParams(Object.entries({ aba, vig, turma: turmaSel, ...o }).filter(([, v]) => v) as [string, string][]).toString()}`;

  const botaoGerar = (
    <BotaoModal titulo="Gerar horário" rotulo="Gerar horário" textoSalvar="Gerar" action={gerarGrade}>
      <CampoTexto name="vigencia" label="Vale a partir de" tipo="date" obrigatorio valor={hojeISO()} dica="Cada data de início forma uma versão do horário." cheio />
      <CampoMarcar name="substituir" label="Substituir o horário existente nesta data" cheio />
      <p className="sm:col-span-2 text-sm text-texto-suave">Gera segunda a sexta, 1ª a 7ª aula (8ª e 9ª, eletivas e clube, não são geradas), respeitando as restrições dos professores. Você poderá alterar qualquer aula depois.</p>
    </BotaoModal>
  );

  return (
    <>
      <CabecalhoPagina titulo="Horário de aulas" descricao="Informe as aulas de cada turma, gere o horário e ajuste. O sistema avisa conflitos e sugere soluções.">
        <AnexarHorario hoje={hojeISO()} />
      </CabecalhoPagina>

      <div role="tablist" className="mb-4 flex gap-2">
        {([["grade", "Grade e conflitos"], ["configurar", "Criar horário"]] as const).map(([k, r]) => (
          // Link comum (recarrega a página): a troca de aba não depende do roteador do cliente.
           
          <a key={k} href={q({ aba: k })} aria-current={aba === k ? "page" : undefined}
            className={`btn ${aba === k ? "btn-primario" : "btn-secundario"}`}>{r}</a>
        ))}
      </div>
      {lista}

      {aba === "grade" ? (
        <Grade vigencias={vigencias} vig={vig} turmas={turmas} turmaSel={turmaSel} aulas={aulas} indisp={indisp} demandas={demandas} arquivos={arquivos} />
      ) : (
        <Configurar turmas={turmas} turmaSel={turmaSel} demandas={demandas} indisp={indisp} salas={salas} professores={professores} semCadastroProf={semCadastroProf} ref_={ref} nomeTurmaSistema={nomeTurmaSistema} vigencias={vigencias} vig={vig} totalAulas={aulas.length} botaoGerar={botaoGerar} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
function Grade({ vigencias, vig, turmas, turmaSel, aulas, indisp, demandas, arquivos }: {
  vigencias: string[]; vig?: string; turmas: TurmaH[]; turmaSel?: string; aulas: AulaH[]; indisp: IndispH[]; demandas: DemandaH[]; arquivos: Arquivo[];
}) {
  const painelArquivos = arquivos.length > 0 && (
    <section aria-label="PDFs anexados" className="card !p-4">
      <h2 className="font-extrabold">PDFs do horário anexados</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {arquivos.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <a className="text-azul-600 underline" href={`/api/horario/arquivo/${a.id}`} target="_blank" rel="noopener noreferrer">{a.nome}</a>
            <span className="flex items-center gap-2 text-xs text-texto-suave">{a.vigente_desde ? `desde ${fmtData(a.vigente_desde)}` : ""}
              <BotaoExcluir titulo="Remover PDF" ariaLabel={`Remover ${a.nome}`} action={excluirArquivoHorario.bind(null, a.id)} mensagem={`Remover o PDF ${a.nome}? Ele deixa de aparecer na página pública.`} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
  if (!vig || !turmaSel) {
    return <div className="space-y-4">{painelArquivos}<div className="card text-center text-texto-suave">Ainda não há horário. Use <strong>Anexar PDF ou planilha</strong> ou vá em “Criar horário”, cadastre as aulas de cada turma e clique em <strong>Gerar horário</strong>.</div></div>;
  }
  const conflitos = detectarConflitos(aulas, indisp);
  const doConflito = new Map<string, Conflito[]>();
  for (const c of conflitos) doConflito.set(c.aulaId, [...(doConflito.get(c.aulaId) ?? []), c]);
  const porId = new Map(aulas.map((a) => [a.id, a]));

  // Aulas que as disciplinas pedem e ainda não estão na grade.
  const faltando = demandas.map((d) => {
    const tem = aulas.filter((a) => a.turma_codigo === d.turma_codigo && a.disciplina === d.disciplina).length;
    return { d, falta: d.aulas_semana - tem };
  }).filter((x) => x.falta > 0);

  const daTurma = aulas.filter((a) => a.turma_codigo === turmaSel);
  const mostra89 = daTurma.some((a) => a.aula >= 8);
  const linhasAula = mostra89 ? [...AULAS_REGULARES, 8, 9] : [...AULAS_REGULARES];

  return (
    <div className="space-y-4">
      <form method="get" action="/horario" className="card flex flex-wrap items-end gap-3 !p-4">
        <input type="hidden" name="aba" value="grade" />
        <div className="campo min-w-[200px] flex-1">
          <label htmlFor="g_turma">Turma</label>
          <select id="g_turma" name="turma" defaultValue={turmaSel}>{turmas.map((t) => <option key={t.codigo} value={t.codigo}>{t.codigo}</option>)}</select>
        </div>
        <div className="campo min-w-[200px]">
          <label htmlFor="g_vig">Horário vigente desde</label>
          <select id="g_vig" name="vig" defaultValue={vig}>{vigencias.map((v) => <option key={v} value={v}>{fmtData(v)}</option>)}</select>
        </div>
        <button type="submit" className="btn btn-primario">Ver</button>
      </form>

      {painelArquivos}

      <section aria-label="Conflitos" className={`card !p-4 ${conflitos.length ? "border-amber-400" : ""}`}>
        {conflitos.length === 0 ? (
          <p className="text-sm">Nenhum conflito neste horário: professores disponíveis, sem duplicidade de professor ou sala.</p>
        ) : (
          <>
            <h2 className="flex items-center gap-2 font-extrabold text-amber-800"><AlertTriangle size={18} aria-hidden /> {conflitos.length} conflito(s) a resolver</h2>
            <ul className="mt-2 space-y-2">
              {conflitos.slice(0, 40).map((c, i) => {
                const a = porId.get(c.aulaId)!;
                const sug = i < 40 ? sugerirSolucoes(c.aulaId, aulas, indisp) : [];
                return (
                  <li key={`${c.aulaId}-${c.tipo}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-campo bg-amber-50 p-2 text-sm">
                    <span>{c.mensagem}</span>
                    <BotaoModal titulo="Resolver conflito" rotulo="Resolver" variante="secundario" textoSalvar="Aplicar solução selecionada" largo action={aplicarSugestao.bind(null, c.aulaId)}>
                      <input type="hidden" name="vigencia" value={vig} />
                      <p className="sm:col-span-2 text-sm">{c.mensagem}</p>
                      {sug.length === 0 ? (
                        <p className="sm:col-span-2 text-sm text-perigo">Nenhuma troca automática resolve este caso. Edite a aula manualmente na grade ou ajuste a restrição do professor.</p>
                      ) : (
                        <fieldset className="sm:col-span-2 space-y-1">
                          <legend className="mb-1 text-sm font-bold">Soluções possíveis ({a.turma_codigo}, {a.disciplina})</legend>
                          {sug.map((s, k) => (
                            <label key={k} className="flex items-start gap-2 !font-normal">
                              <input type="radio" name="escolha" required value={s.tipo === "mover" ? `mover:${s.dia}:${s.aula}` : `trocar:${s.com}`} className="mt-1" />
                              <span>{s.texto}</span>
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </BotaoModal>
                  </li>
                );
              })}
            </ul>
            {conflitos.length > 40 && <p className="mt-2 text-xs text-texto-suave">Mostrando os 40 primeiros. Resolva-os para ver os demais.</p>}
          </>
        )}
      </section>

      {faltando.length > 0 && (
        <section aria-label="Aulas sem horário" className="card !p-4">
          <h2 className="font-extrabold">Aulas sem horário</h2>
          <p className="text-sm text-texto-suave">Previstas em “Aulas por turma”, mas não encontradas na grade desta vigência.</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {faltando.slice(0, 30).map(({ d, falta }) => <li key={d.id}>{d.turma_codigo}: {d.disciplina} ({d.professor}) — faltam {falta} de {d.aulas_semana}</li>)}
          </ul>
        </section>
      )}

      <div className="tabela-wrap">
        <table className="tabela" aria-label={`Horário da turma ${turmaSel}`}>
          <thead><tr><th scope="col">Aula</th>{DIAS_UTEIS.map((d) => <th key={d} scope="col">{NOME_DIA[d]}</th>)}</tr></thead>
          <tbody>
            {linhasAula.map((n) => (
              <tr key={n}>
                <th scope="row" className="whitespace-nowrap">{n}ª<br /><span className="text-xs font-normal text-texto-suave">{horaCurta(HORARIO_AULA[n][0])}–{horaCurta(HORARIO_AULA[n][1])}</span></th>
                {DIAS_UTEIS.map((d) => {
                  const a = daTurma.find((x) => x.dia_semana === d && x.aula === n);
                  const cs = a ? doConflito.get(a.id) : undefined;
                  const campos = (
                    <>
                      <input type="hidden" name="turma_codigo" value={turmaSel} /><input type="hidden" name="vigencia" value={vig} />
                      <input type="hidden" name="dia_semana" value={d} /><input type="hidden" name="aula" value={n} />
                      <CampoTexto name="disciplina" label="Disciplina" obrigatorio cheio valor={a?.disciplina} maxLength={60} />
                      <div className="campo"><label htmlFor="f_professor">Professor</label>
                        <input id="f_professor" name="professor" list="lista-prof" defaultValue={a?.professor ?? ""} maxLength={80} autoComplete="off" /></div>
                      <CampoTexto name="sala" label="Sala" valor={a?.sala} maxLength={60} />
                    </>
                  );
                  return (
                    <td key={d} data-label={NOME_DIA[d]} className={cs ? "bg-amber-50" : undefined}>
                      <div className="flex items-start justify-between gap-1">
                        <div className="text-sm">
                          {a ? <><strong>{a.disciplina}</strong><br /><span className="text-xs text-texto-suave">{[a.professor, a.sala].filter(Boolean).join(" · ")}</span></> : <span className="text-xs text-texto-suave">livre</span>}
                          {cs && <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-amber-800"><AlertTriangle size={12} aria-hidden /> conflito</span>}
                        </div>
                        <span className="flex shrink-0">
                          <BotaoModal titulo={a ? `Editar aula — ${NOME_DIA[d]}, ${n}ª` : `Nova aula — ${NOME_DIA[d]}, ${n}ª`} icone={a ? "editar" : "plus"} variante="icone"
                            ariaLabel={a ? `Editar ${a.disciplina}` : `Adicionar aula ${NOME_DIA[d]} ${n}ª`} textoSalvar="Salvar" action={salvarAulaGrade.bind(null, a?.id ?? "")}>{campos}</BotaoModal>
                          {a && <BotaoExcluir titulo="Remover aula" ariaLabel={`Remover ${a.disciplina}`} action={excluirAulaGrade.bind(null, a.id)} mensagem={`Remover ${a.disciplina} de ${NOME_DIA[d]}, ${n}ª aula?`} />}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-texto-suave">Para mudar o dia ou a aula, use “Resolver” (com validação) ou edite/remova e adicione na nova célula. Alunos e professores veem a grade publicada em Calendário.</p>
      <p className="text-xs text-texto-suave">Ligue cada turma do horário à turma do sistema (para os alunos a verem) em Calendário → Vincular turmas.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
const AULAS_NA_SEMANA = DIAS_UTEIS.length * AULAS_REGULARES.length;

function Configurar({ turmas, turmaSel, demandas, indisp, salas, professores, semCadastroProf, ref_, nomeTurmaSistema, vigencias, vig, totalAulas, botaoGerar }: {
  vigencias: string[]; vig?: string; totalAulas: number; turmaSel?: string; professores: ProfessorListado[]; semCadastroProf: boolean; botaoGerar: React.ReactNode;
  turmas: TurmaH[]; demandas: DemandaH[]; indisp: IndispH[]; salas: { id: string; nome: string }[];
  ref_: Awaited<ReturnType<typeof carregarReferencias>>; nomeTurmaSistema: (id: string | null) => string;
}) {
  const optTurmas = turmas.map((t) => ({ v: t.codigo, l: t.codigo }));
  const optSistema = ref_.turmas.map((t) => ({ v: t.id, l: `${t.nome} (${t.ano_letivo})` }));
  const optDias = DIAS_UTEIS.map((d) => ({ v: String(d), l: NOME_DIA[d] }));
  const optAulas = AULAS_REGULARES.map((n) => ({ v: String(n), l: `${n}ª aula (${horaCurta(HORARIO_AULA[n][0])})` }));
  const optVig = vigencias.map((v) => ({ v, l: fmtData(v) }));
  const daTurma = demandas.filter((d) => d.turma_codigo === turmaSel).sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR"));
  const totalTurma = daTurma.reduce((n, d) => n + d.aulas_semana, 0);

  const campoProfessor = (id: string, valor?: string) => (
    <div className="campo"><label htmlFor={id}>Professor <span className="text-perigo" aria-hidden>*</span></label>
      <input id={id} name="professor" list="lista-prof" required defaultValue={valor ?? ""} maxLength={80} autoComplete="off" /></div>
  );
  const camposDemanda = (d: DemandaH) => (
    <>
      <CampoSelecao name="turma_codigo" label="Turma" obrigatorio vazio={null} opcoes={optTurmas} valor={d.turma_codigo} />
      <CampoTexto name="disciplina" label="Matéria" obrigatorio valor={d.disciplina} maxLength={60} />
      {campoProfessor("e_professor", d.professor)}
      <CampoTexto name="aulas_semana" label="Aulas por semana" tipo="number" min={1} max={20} obrigatorio valor={d.aulas_semana} />
      <CampoTexto name="sala" label="Sala específica (opcional)" valor={d.sala} maxLength={60} dica="Ex.: laboratório. Em branco = sala da turma." cheio />
    </>
  );
  const camposDisp = (dias: number[], de: number, ate: number, prefixo: string) => (
    <>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-bold">Dias em que pode dar aula</legend>
        <div className="flex flex-wrap gap-3">
          {DIAS_UTEIS.map((d) => <label key={d} className="flex items-center gap-1 !font-normal"><input type="checkbox" name="dia" value={d} defaultChecked={dias.includes(d)} className="h-4 w-4" /> {NOME_DIA[d]}</label>)}
        </div>
      </fieldset>
      <CampoSelecao id={`${prefixo}-de`} name="de" label="A partir da" obrigatorio vazio={null} opcoes={optAulas} valor={String(de)} dica="Ex.: só depois das 13h → 6ª aula (13h20)." />
      <CampoSelecao id={`${prefixo}-ate`} name="ate" label="Até a" obrigatorio vazio={null} opcoes={optAulas} valor={String(ate)} />
      <p className="sm:col-span-2 text-sm text-texto-suave" id={`${prefixo}-dica`}>Ex.: Charles só após as 13h e de segunda a quinta → marque Seg–Qui e “A partir da 6ª aula”. O gerador e a grade respeitam isso.</p>
    </>
  );

  const resumoDisp = (nome: string) => {
    const k = chaveProf(nome);
    const dele = indisp.filter((i) => chaveProf(i.professor) === k);
    const disp = dele.filter((i) => (i.motivo ?? "").startsWith("Disponibilidade:"));
    const avulsas = dele.length - disp.length;
    const txt = disp[0]?.motivo?.replace("Disponibilidade: ", "") ?? "Qualquer dia e horário";
    return { txt: avulsas ? `${txt} · ${avulsas} restrição(ões) avulsa(s)` : txt, faixas: disp };
  };

  return (
    <div className="space-y-6">
      {totalAulas > 0 && (
        <section aria-label="Importar da grade" className={`card !p-4 ${demandas.length === 0 ? "border-azul-600" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[240px] flex-1">
              <h2 className="font-extrabold">Já existe um horário no sistema</h2>
              <p className="text-sm text-texto-suave">
                {demandas.length === 0 ? "As matérias ainda não foram cadastradas. " : ""}
                Importe a grade pronta para preencher sozinho os professores, as matérias de cada turma, as aulas por semana e as salas.
              </p>
            </div>
            <BotaoModal titulo="Importar matérias da grade" rotulo="Importar da grade atual" textoSalvar="Importar" action={importarDaGrade}>
              <CampoSelecao name="vigencia" label="Versão do horário" obrigatorio vazio={null} opcoes={optVig} valor={vig} cheio />
              <CampoMarcar name="substituir" label="Remover as matérias cadastradas que não estão nessa grade" cheio />
              <p className="sm:col-span-2 text-sm text-texto-suave">A grade e as restrições dos professores não são alteradas. Matérias que já existem na mesma turma são atualizadas; a sala da turma só é preenchida quando estiver em branco. Eletivas e clube (8ª e 9ª aulas) não são importadas.</p>
            </BotaoModal>
          </div>
        </section>
      )}

      <section aria-labelledby="h-prof" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-prof" className="text-lg font-extrabold">1. Professores e quando podem dar aula</h2>
          <BotaoModal titulo="Adicionar professor" rotulo="Adicionar professor" textoSalvar="Adicionar" largo action={adicionarProfessor}>
            <CampoTexto name="nome" label="Nome do professor" obrigatorio maxLength={80} cheio dica="Use o mesmo nome que aparece no horário (ex.: CHARLES)." />
            {camposDisp([1, 2, 3, 4, 5], 1, 7, "np")}
          </BotaoModal>
        </div>
        {semCadastroProf && <p className="card !p-3 text-sm text-amber-800">Para cadastrar professores novos, rode a migração <code>006_horario_professores.sql</code> no Supabase. A lista abaixo já mostra os professores que aparecem nas matérias e no horário.</p>}
        <Tabela chave={(p) => p.chave} linhas={professores} vazio="Nenhum professor ainda. Use Adicionar professor ou Importar da grade atual." colunas={[
          { titulo: "Professor", render: (p) => p.nome },
          { titulo: "Pode dar aula", render: (p) => resumoDisp(p.nome).txt },
          { titulo: "Matérias", render: (p) => p.materias },
          { titulo: "Ações", acoes: true, render: (p) => {
            const r = resumoDisp(p.nome);
            const d = restricoesParaDisponibilidade(r.faixas);
            return (
              <span className="flex">
                <BotaoModal titulo={`Disponibilidade — ${p.nome}`} icone="editar" variante="icone" ariaLabel={`Disponibilidade de ${p.nome}`} textoSalvar="Salvar disponibilidade" largo action={definirDisponibilidade}>
                  <input type="hidden" name="professor" value={p.nome} />
                  {camposDisp(d.dias, d.de, d.ate, `p-${p.chave}`)}
                </BotaoModal>
                {p.cadastroId && p.materias === 0 && p.aulasNaGrade === 0 && (
                  <BotaoExcluir titulo="Remover professor" ariaLabel={`Remover ${p.nome}`} action={excluirProfessor.bind(null, p.nome)} mensagem={`Remover o professor ${p.nome}?`} />
                )}
              </span>
            );
          } },
        ]} />
        <details className="card !p-3">
          <summary className="cursor-pointer text-sm font-bold">Restrições avulsas ({indisp.filter((i) => !(i.motivo ?? "").startsWith("Disponibilidade:")).length})</summary>
          <div className="mt-2 space-y-2">
            <BotaoModal titulo="Nova restrição de professor" rotulo="Nova restrição avulsa" variante="secundario" textoSalvar="Registrar" largo action={salvarIndisponibilidade}>
              {campoProfessor("r_professor")}
              <CampoSelecao name="dia_semana" label="Dia" obrigatorio vazio={null} opcoes={optDias} />
              <span />
              <CampoSelecao name="aula_de" label="Da aula" obrigatorio vazio={null} opcoes={optAulas} valor="1" />
              <CampoSelecao name="aula_ate" label="Até a aula" obrigatorio vazio={null} opcoes={optAulas} valor="5" dica="Ex.: só trabalha à tarde na segunda → 1ª até 5ª." />
              <CampoTexto name="motivo" label="Motivo (opcional)" maxLength={120} cheio />
            </BotaoModal>
            <Tabela chave={(i) => i.id} linhas={indisp.filter((i) => !(i.motivo ?? "").startsWith("Disponibilidade:"))} vazio="Nenhuma restrição avulsa." colunas={[
              { titulo: "Professor", render: (i) => i.professor },
              { titulo: "Dia", render: (i) => NOME_DIA[i.dia_semana] },
              { titulo: "Aulas", render: (i) => (i.aula_de === i.aula_ate ? `${i.aula_de}ª` : `${i.aula_de}ª a ${i.aula_ate}ª`) },
              { titulo: "Motivo", render: (i) => i.motivo ?? "—" },
              { titulo: "Ações", acoes: true, render: (i) => <BotaoExcluir titulo="Remover restrição" ariaLabel="Remover restrição" action={excluirIndisponibilidade.bind(null, i.id)} mensagem={`Remover a restrição de ${i.professor}?`} /> },
            ]} />
          </div>
        </details>
      </section>

      <section aria-labelledby="h-turmas" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-turmas" className="text-lg font-extrabold">2. Turmas e salas</h2>
          <div className="flex flex-wrap gap-2">
            <BotaoModal titulo="Nova turma no horário" rotulo="Nova turma" variante="secundario" textoSalvar="Adicionar" action={salvarTurmaHorario.bind(null, "")}>
              <CampoTexto name="codigo" label="Código/nome no horário" obrigatorio maxLength={60} cheio />
              <CampoSelecao name="turma_id" label="Turma do sistema" opcoes={optSistema} vazio="Vincular depois" cheio />
              <CampoTexto name="sala_base" label="Sala da turma" maxLength={60} cheio />
            </BotaoModal>
            <BotaoModal titulo="Nova sala" rotulo="Nova sala" variante="secundario" textoSalvar="Adicionar" action={salvarSala}>
              <CampoTexto name="nome" label="Nome da sala" obrigatorio maxLength={60} cheio />
            </BotaoModal>
          </div>
        </div>
        <Tabela chave={(t) => t.codigo} linhas={turmas} vazio="Nenhuma turma no horário. Rode a migração 003 ou adicione uma." colunas={[
          { titulo: "Turma (horário)", render: (t) => t.codigo },
          { titulo: "Turma do sistema", render: (t) => nomeTurmaSistema(t.turma_id) },
          { titulo: "Sala da turma", render: (t) => t.sala_base ?? "—" },
          { titulo: "Ações", acoes: true, render: (t) => (
            <BotaoModal titulo={`Editar ${t.codigo}`} icone="editar" variante="icone" ariaLabel={`Editar ${t.codigo}`} textoSalvar="Salvar" action={salvarTurmaHorario.bind(null, t.codigo)}>
              <CampoSelecao name="turma_id" label="Turma do sistema" opcoes={optSistema} vazio="Sem vínculo" valor={t.turma_id} cheio />
              <CampoTexto name="sala_base" label="Sala da turma" valor={t.sala_base} maxLength={60} cheio />
              <input type="hidden" name="codigo" value={t.codigo} />
            </BotaoModal>) },
        ]} />
        <details className="card !p-3">
          <summary className="cursor-pointer text-sm font-bold">Salas extras para o gerador ({salas.length})</summary>
          <p className="my-2 text-sm text-texto-suave">Usadas para turmas sem sala própria. Salas compartilhadas (quadra, biblioteca, salão) não geram conflito.</p>
          <Tabela chave={(s) => s.id} linhas={salas} vazio="Nenhuma sala cadastrada." colunas={[
            { titulo: "Sala", render: (s) => s.nome },
            { titulo: "Ações", acoes: true, render: (s) => <BotaoExcluir titulo="Remover sala" ariaLabel={`Remover ${s.nome}`} action={excluirSala.bind(null, s.id)} mensagem={`Remover a sala ${s.nome}?`} /> },
          ]} />
        </details>
      </section>

      <section aria-labelledby="h-dem" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-dem" className="text-lg font-extrabold">3. Matérias de cada turma</h2>
          <BotaoModal titulo="Adicionar matéria" rotulo="Adicionar matéria" textoSalvar="Adicionar" largo action={adicionarMateria}>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-bold">Turmas que têm esta matéria <span className="text-perigo" aria-hidden>*</span></legend>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                {turmas.map((t) => <label key={t.codigo} className="flex items-center gap-1 !font-normal"><input type="checkbox" name="turma_codigo" value={t.codigo} defaultChecked={t.codigo === turmaSel} className="h-4 w-4" /> {t.codigo}</label>)}
              </div>
            </fieldset>
            <CampoTexto name="disciplina" label="Matéria" obrigatorio maxLength={60} />
            {campoProfessor("m_professor")}
            <CampoTexto name="aulas_semana" label="Aulas por semana" tipo="number" min={1} max={20} obrigatorio valor={2} />
            <CampoTexto name="sala" label="Sala específica (opcional)" maxLength={60} dica="Ex.: laboratório. Em branco = sala da turma." />
          </BotaoModal>
        </div>
        {turmas.length > 0 && (
          <form method="get" action="/horario" className="card flex flex-wrap items-end gap-3 !p-3">
            <input type="hidden" name="aba" value="configurar" />
            {vig && <input type="hidden" name="vig" value={vig} />}
            <div className="campo min-w-[220px] flex-1">
              <label htmlFor="c_turma">Turma</label>
              <select id="c_turma" name="turma" defaultValue={turmaSel}>{turmas.map((t) => <option key={t.codigo} value={t.codigo}>{t.codigo}</option>)}</select>
            </div>
            <button type="submit" className="btn btn-secundario">Ver matérias</button>
          </form>
        )}
        {turmaSel && <p className="text-sm text-texto-suave">{daTurma.length} matéria(s), {totalTurma} aula(s) por semana (a grade comporta {AULAS_NA_SEMANA}).</p>}
        <Tabela chave={(d) => d.id} linhas={daTurma} vazio="Esta turma ainda não tem matérias. Use Adicionar matéria ou Importar da grade atual." colunas={[
          { titulo: "Matéria", render: (d) => d.disciplina },
          { titulo: "Professor", render: (d) => d.professor },
          { titulo: "Aulas/semana", render: (d) => d.aulas_semana },
          { titulo: "Sala", render: (d) => d.sala ?? "—" },
          { titulo: "Ações", acoes: true, render: (d) => (
            <span className="flex">
              <BotaoModal titulo="Editar matéria da turma" icone="editar" variante="icone" ariaLabel={`Editar ${d.disciplina}`} textoSalvar="Salvar" largo action={salvarDemanda.bind(null, d.id)}>{camposDemanda(d)}</BotaoModal>
              <BotaoExcluir titulo="Remover matéria" ariaLabel={`Remover ${d.disciplina}`} action={excluirDemanda.bind(null, d.id)} mensagem={`Remover ${d.disciplina} de ${d.turma_codigo}?`} />
            </span>) },
        ]} />
      </section>

      <section aria-labelledby="h-ger" className="card !p-4">
        <h2 id="h-ger" className="text-lg font-extrabold">4. Gerar o horário</h2>
        <p className="my-1 text-sm text-texto-suave">Com professores, turmas e matérias prontos, o sistema monta a semana respeitando a disponibilidade de cada professor. Depois você ajusta na aba “Grade e conflitos”.</p>
        {botaoGerar}
      </section>
    </div>
  );
}
