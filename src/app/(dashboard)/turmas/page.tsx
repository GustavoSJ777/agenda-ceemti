import Link from "next/link";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { CampoSelecao, CampoTexto } from "@/components/ui/Campos";
import { Selo } from "@/components/ui/Selo";
import { Tabela } from "@/components/tables/Tabela";
import { Paginacao } from "@/components/tables/Paginacao";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { checar } from "@/lib/actions/resultado";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { lerPagina } from "@/lib/utils/paginacao";
import { anoAtual } from "@/lib/utils/datas";
import { opcoesDe, POR_PAGINA, TURNOS } from "@/constants";
import type { Disciplina, Serie, Turma } from "@/types/db";
import {
  criarVinculo, excluirDisciplina, excluirSerie, excluirTurma, removerVinculo,
  salvarDadosProfessor, salvarDisciplina, salvarSerie, salvarTurma,
} from "./actions";

export const metadata = { title: "Turmas e Disciplinas — Agenda Escolar CEEMTI Baixo Guandu" };

const ABAS = [
  { id: "turmas", rotulo: "Turmas" }, { id: "series", rotulo: "Séries" },
  { id: "disciplinas", rotulo: "Disciplinas" }, { id: "professores", rotulo: "Professores e vínculos" },
] as const;

type SP = Record<string, string | undefined>;

export default async function PaginaTurmas({ searchParams }: { searchParams: Promise<SP> }) {
  const perfil = await exigirPapel(["direcao", "secretaria", "professor"]);
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);

  // Professor: somente consulta dos próprios vínculos.
  if (perfil.papel === "professor") {
    const meus = ref.vinculos.filter((v) => v.professor_id === perfil.id);
    return (
      <>
        <CabecalhoPagina titulo="Minhas turmas" descricao="Turmas e disciplinas em que você leciona." />
        <Tabela chave={(v) => v.id} linhas={meus} vazio="Você ainda não está vinculado a nenhuma turma. Procure a Direção ou a Secretaria."
          colunas={[
            { titulo: "Turma", render: (v) => <strong>{n.nomeTurma(v.turma_id)}</strong> },
            { titulo: "Disciplina", render: (v) => n.nomeDisciplina(v.disciplina_id) },
            { titulo: "Série", render: (v) => n.nomeSerie(n.turma(v.turma_id)?.serie_id) },
            { titulo: "Turno", render: (v) => { const t = n.turma(v.turma_id); return t ? TURNOS[t.turno] : "—"; } },
            { titulo: "Ano letivo", render: (v) => n.turma(v.turma_id)?.ano_letivo ?? "—" },
          ]} />
      </>
    );
  }

  const sp = await searchParams;
  const aba = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as (typeof ABAS)[number]["id"]) : "turmas";
  const pagina = lerPagina(sp.pagina);
  const fatia = <T,>(l: T[]) => l.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <CabecalhoPagina titulo="Turmas e Disciplinas" descricao="Organize turmas, séries, disciplinas e os professores de cada turma." />
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-borda">
        {ABAS.map((a) => (
          <Link key={a.id} href={`/turmas?aba=${a.id}`} role="tab" aria-selected={a.id === aba}
            className={`-mb-px rounded-t-campo border border-b-0 px-4 py-2 font-bold ${a.id === aba ? "border-borda bg-white text-azul-700" : "border-transparent text-texto-suave hover:text-azul-700"}`}>
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === "turmas" && (
        <>
          <div className="mb-3 flex justify-end">
            <BotaoModal titulo="Nova turma" rotulo="Nova turma" textoSalvar="Cadastrar" action={salvarTurma.bind(null, "")}>
              <CampoTurma n={n} />
            </BotaoModal>
          </div>
          <Tabela chave={(t) => t.id} linhas={fatia(ref.turmas)} vazio="Nenhum registro cadastrado ainda."
            colunas={[
              { titulo: "Turma", render: (t) => <strong>{t.nome}</strong> },
              { titulo: "Série", render: (t) => n.nomeSerie(t.serie_id) },
              { titulo: "Turno", render: (t) => TURNOS[t.turno] },
              { titulo: "Ano letivo", render: (t) => t.ano_letivo },
              { titulo: "Ações", acoes: true, render: (t) => (
                <>
                  <BotaoModal titulo="Editar turma" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" action={salvarTurma.bind(null, t.id)}>
                    <CampoTurma n={n} t={t} />
                  </BotaoModal>
                  <BotaoExcluir titulo="Excluir turma" ariaLabel="Excluir" action={excluirTurma.bind(null, t.id)}
                    mensagem={`Excluir "${t.nome}"? Atenção: eventos, atividades, avisos e vínculos desta turma também serão apagados. Se houver matrículas ou recuperações, o sistema não permitirá a exclusão.`} />
                </>
              ) },
            ]} />
          <Paginacao total={ref.turmas.length} pagina={pagina} porPagina={POR_PAGINA} caminho="/turmas" params={{ aba }} />
        </>
      )}

      {aba === "series" && (
        <>
          <div className="mb-3 flex justify-end">
            <BotaoModal titulo="Nova série" rotulo="Nova série" textoSalvar="Cadastrar" action={salvarSerie.bind(null, "")}>
              <CampoSerie ordem={ref.series.length + 1} />
            </BotaoModal>
          </div>
          <Tabela chave={(s) => s.id} linhas={fatia(ref.series)} vazio="Nenhum registro cadastrado ainda."
            colunas={[
              { titulo: "Série", render: (s) => <strong>{s.nome}</strong> },
              { titulo: "Ordem", render: (s) => s.ordem },
              { titulo: "Ações", acoes: true, render: (s) => (
                <>
                  <BotaoModal titulo="Editar série" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" action={salvarSerie.bind(null, s.id)}>
                    <CampoSerie s={s} ordem={s.ordem} />
                  </BotaoModal>
                  <BotaoExcluir titulo="Excluir série" ariaLabel="Excluir" action={excluirSerie.bind(null, s.id)}
                    mensagem={`Excluir "${s.nome}"? Se houver turmas vinculadas, o sistema não permitirá a exclusão.`} />
                </>
              ) },
            ]} />
          <Paginacao total={ref.series.length} pagina={pagina} porPagina={POR_PAGINA} caminho="/turmas" params={{ aba }} />
        </>
      )}

      {aba === "disciplinas" && (
        <>
          <div className="mb-3 flex justify-end">
            <BotaoModal titulo="Nova disciplina" rotulo="Nova disciplina" textoSalvar="Cadastrar" action={salvarDisciplina.bind(null, "")}>
              <CampoDisciplina />
            </BotaoModal>
          </div>
          <Tabela chave={(d) => d.id} linhas={fatia(ref.disciplinas)} vazio="Nenhum registro cadastrado ainda."
            colunas={[
              { titulo: "Disciplina", render: (d) => <strong>{d.nome}</strong> },
              { titulo: "Código", render: (d) => d.codigo ?? "—" },
              { titulo: "Ações", acoes: true, render: (d) => (
                <>
                  <BotaoModal titulo="Editar disciplina" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" action={salvarDisciplina.bind(null, d.id)}>
                    <CampoDisciplina d={d} />
                  </BotaoModal>
                  <BotaoExcluir titulo="Excluir disciplina" ariaLabel="Excluir" action={excluirDisciplina.bind(null, d.id)}
                    mensagem={`Excluir "${d.nome}"? Se houver registros vinculados, o sistema não permitirá a exclusão.`} />
                </>
              ) },
            ]} />
          <Paginacao total={ref.disciplinas.length} pagina={pagina} porPagina={POR_PAGINA} caminho="/turmas" params={{ aba }} />
        </>
      )}

      {aba === "professores" && <AbaProfessores perfilPapel={perfil.papel} n={n} vinculos={ref.vinculos} pagina={pagina} />}
    </>
  );
}

function CampoTurma({ n, t }: { n: ReturnType<typeof criarNomeadores>; t?: Turma }) {
  return (
    <>
      <CampoTexto name="nome" label="Nome da turma" obrigatorio maxLength={40} valor={t?.nome} dica="Ex.: 1ª Série A" />
      <CampoSelecao name="serie_id" label="Série" obrigatorio opcoes={n.opcoesSeries()} valor={t?.serie_id} />
      <CampoSelecao name="turno" label="Turno" obrigatorio vazio={null} opcoes={opcoesDe(TURNOS)} valor={t?.turno ?? "integral"} />
      <CampoTexto name="ano_letivo" label="Ano letivo" tipo="number" obrigatorio min={2000} max={2100} step="1" valor={t?.ano_letivo ?? anoAtual()} />
    </>
  );
}
function CampoSerie({ s, ordem }: { s?: Serie; ordem: number }) {
  return (
    <>
      <CampoTexto name="nome" label="Nome da série" obrigatorio maxLength={40} valor={s?.nome} dica="Ex.: 1ª Série" />
      <CampoTexto name="ordem" label="Ordem de exibição" tipo="number" min={0} max={99} step="1" valor={ordem} />
    </>
  );
}
function CampoDisciplina({ d }: { d?: Disciplina }) {
  return (
    <>
      <CampoTexto name="nome" label="Nome da disciplina" obrigatorio maxLength={80} valor={d?.nome} />
      <CampoTexto name="codigo" label="Código (opcional)" maxLength={20} valor={d?.codigo} />
    </>
  );
}

async function AbaProfessores({ perfilPapel, n, vinculos, pagina }: {
  perfilPapel: string; n: ReturnType<typeof criarNomeadores>; vinculos: Array<{ id: string; professor_id: string; turma_id: string; disciplina_id: string }>; pagina: number;
}) {
  const sb = await criarClienteServidor();
  type Linha = { perfil_id: string; registro_funcional: string | null; area: string | null; perfis: { nome: string; email: string; ativo: boolean } | null };
  const todos = checar(await sb.from("professores").select("perfil_id,registro_funcional,area,perfis(nome,email,ativo)")) as unknown as Linha[];
  todos.sort((a, b) => (a.perfis?.nome ?? "").localeCompare(b.perfis?.nome ?? "", "pt-BR"));
  const linhas = todos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <>
      <div className="alerta alerta-info mb-3">
        Para criar o acesso (login) de um professor, use a área <strong>Usuários</strong> (Direção). Aqui você define em quais turmas e disciplinas cada professor leciona — isso libera o cadastro de provas, trabalhos e recuperações.
      </div>
      <Tabela chave={(p) => p.perfil_id} linhas={linhas} vazio="Nenhum professor cadastrado. A Direção cria professores na área Usuários."
        colunas={[
          { titulo: "Professor", render: (p) => (<><strong>{p.perfis?.nome ?? "—"}</strong><br /><span className="text-xs text-texto-suave">{p.perfis?.email}</span></>) },
          { titulo: "Registro", render: (p) => p.registro_funcional ?? "—" },
          { titulo: "Situação", render: (p) => (p.perfis?.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="cinza">Inativo</Selo>) },
          { titulo: "Turmas e disciplinas", render: (p) => {
            const vs = vinculos.filter((v) => v.professor_id === p.perfil_id);
            if (!vs.length) return <span className="text-xs text-texto-suave">Nenhum vínculo</span>;
            return (
              <span className="flex flex-wrap justify-end gap-1 sm:justify-start">
                {vs.map((v) => (
                  <span key={v.id} className="inline-flex items-center rounded-full bg-azul-100 py-0.5 pl-2.5 pr-1 text-xs font-bold text-azul-700">
                    {n.nomeTurma(v.turma_id)} — {n.nomeDisciplina(v.disciplina_id)}
                    <BotaoExcluir compacto titulo="Remover vínculo" textoConfirmar="Remover" ariaLabel={`Remover vínculo ${n.nomeTurma(v.turma_id)} ${n.nomeDisciplina(v.disciplina_id)}`}
                      action={removerVinculo.bind(null, v.id)} mensagem="O professor deixará de cadastrar atividades para esta turma/disciplina. Continuar?" />
                  </span>
                ))}
              </span>
            );
          } },
          { titulo: "Ações", acoes: true, render: (p) => (
            <>
              <BotaoModal titulo={`Vincular ${p.perfis?.nome ?? "professor"}`} variante="icone" ariaLabel="Vincular turma/disciplina" textoSalvar="Vincular" action={criarVinculo.bind(null, p.perfil_id)}>
                <CampoSelecao name="turma_id" label="Turma" obrigatorio opcoes={n.opcoesTurmas()} cheio />
                <CampoSelecao name="disciplina_id" label="Disciplina" obrigatorio opcoes={n.opcoesDisciplinas()} cheio />
              </BotaoModal>
              {perfilPapel === "direcao" && (
                <BotaoModal titulo="Dados funcionais" icone="editar" variante="icone" ariaLabel="Editar dados funcionais" action={salvarDadosProfessor.bind(null, p.perfil_id)}>
                  <CampoTexto name="registro_funcional" label="Registro funcional" maxLength={40} valor={p.registro_funcional} cheio />
                  <CampoTexto name="area" label="Área de atuação" maxLength={80} valor={p.area} cheio />
                </BotaoModal>
              )}
            </>
          ) },
        ]} />
      <Paginacao total={todos.length} pagina={pagina} porPagina={POR_PAGINA} caminho="/turmas" params={{ aba: "professores" }} />
    </>
  );
}
