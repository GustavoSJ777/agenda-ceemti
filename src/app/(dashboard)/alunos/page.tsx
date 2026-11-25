import { ImportarAlunos } from "@/components/forms/ImportarAlunos";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { BotaoDetalhe } from "@/components/ui/BotaoDetalhe";
import { Detalhes } from "@/components/ui/Detalhes";
import { CampoSelecao, CampoTexto } from "@/components/ui/Campos";
import { Selo, type CorSelo } from "@/components/ui/Selo";
import { Tabela } from "@/components/tables/Tabela";
import { Paginacao } from "@/components/tables/Paginacao";
import { Filtros } from "@/components/tables/Filtros";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { checar } from "@/lib/actions/resultado";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { intervalo, lerPagina, termoSeguro } from "@/lib/utils/paginacao";
import { anoAtual } from "@/lib/utils/datas";
import { opcoesDe, POR_PAGINA, SITUACOES_MATRICULA, TURNOS } from "@/constants";
import type { SituacaoMatricula } from "@/types/db";
import { criarAcessoAluno, excluirAluno, salvarAluno } from "./actions";

export const metadata = { title: "Alunos — Agenda Escolar CEEMTI Baixo Guandu" };

interface Linha {
  id: string; aluno_id: string; turma_id: string; ano_letivo: number; situacao: SituacaoMatricula;
  alunos: { id: string; nome: string; matricula: string; email: string | null; perfil_id: string | null };
}
const COR: Record<SituacaoMatricula, CorSelo> = { ativa: "verde", transferida: "cinza", trancada: "amarelo", concluida: "azul", cancelada: "vermelho" };
const ORDENS = { nome: "Nome", matricula: "Matrícula", turma: "Turma e nome" };

export default async function PaginaAlunos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perfil = await exigirPapel(["direcao", "secretaria", "professor"]);
  const gestao = perfil.papel !== "professor";
  const sp = await searchParams;
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);

  const anos = [...new Set([...ref.turmas.map((t) => t.ano_letivo), anoAtual()])].sort().reverse();
  const ano = anos.includes(Number(sp.ano)) ? Number(sp.ano) : anoAtual();
  const pagina = lerPagina(sp.pagina);
  const ord = sp.ord === "matricula" || sp.ord === "turma" ? sp.ord : "nome";
  const q = termoSeguro(sp.q);
  const turmaFiltro = ref.turmas.some((t) => t.id === sp.turma) ? sp.turma : undefined;
  const sitFiltro = sp.sit && sp.sit in SITUACOES_MATRICULA ? sp.sit : undefined;

  const sb = await criarClienteServidor();
  let consulta = sb.from("matriculas")
    .select("id,aluno_id,turma_id,ano_letivo,situacao,alunos!inner(id,nome,matricula,email,perfil_id),turmas(nome)", { count: "exact" })
    .eq("ano_letivo", ano);
  if (turmaFiltro) consulta = consulta.eq("turma_id", turmaFiltro);
  if (sitFiltro) consulta = consulta.eq("situacao", sitFiltro);
  if (q) consulta = consulta.or(`nome.ilike.%${q}%,matricula.ilike.%${q}%`, { referencedTable: "alunos" });
  if (ord === "turma") consulta = consulta.order("turmas(nome)").order("alunos(nome)");
  else consulta = consulta.order(ord === "matricula" ? "alunos(matricula)" : "alunos(nome)");
  const [de, ate] = intervalo(pagina, POR_PAGINA);
  const resp = await consulta.range(de, ate);
  if (resp.error) throw resp.error;
  const linhas = checar(resp) as unknown as Linha[];
  const total = resp.count ?? 0;

  const params = { q: sp.q, ano: String(ano), turma: turmaFiltro, sit: sitFiltro, ord };
  const opAno = anos.map((a) => ({ v: String(a), l: String(a) }));

  return (
    <>
      <CabecalhoPagina titulo="Alunos" descricao={gestao ? "Cadastro e consulta de alunos e matrículas." : "Alunos das turmas em que você leciona."}>
        {gestao && <ImportarAlunos turmas={ref.turmas.map((t) => ({ id: t.id, nome: t.nome, ano_letivo: t.ano_letivo }))} ano={ano} anos={anos} />}
        {gestao && (
          <BotaoModal titulo="Novo aluno" rotulo="Novo aluno" textoSalvar="Cadastrar aluno" largo action={salvarAluno.bind(null, "")}>
            <CamposAluno n={n} anoPadrao={ano} />
          </BotaoModal>
        )}
      </CabecalhoPagina>

      <Filtros caminho="/alunos" valores={params} campos={[
        { name: "q", label: "Buscar por nome ou matrícula", tipo: "busca" },
        { name: "ano", label: "Ano letivo", tipo: "select", opcoes: opAno, vazio: String(anoAtual()) },
        { name: "turma", label: "Turma", tipo: "select", opcoes: n.opcoesTurmas(), vazio: "Todas" },
        { name: "sit", label: "Situação da matrícula", tipo: "select", opcoes: opcoesDe(SITUACOES_MATRICULA), vazio: "Todas" },
        { name: "ord", label: "Ordenar por", tipo: "select", opcoes: opcoesDe(ORDENS), vazio: "Nome" },
      ]} />

      <Tabela chave={(m) => m.id} linhas={linhas} vazio="Nenhum aluno encontrado com estes filtros."
        colunas={[
          { titulo: "Nome", render: (m) => <strong>{m.alunos.nome}</strong> },
          { titulo: "Matrícula", render: (m) => m.alunos.matricula },
          ...(gestao ? [{ titulo: "E-mail", render: (m: Linha) => m.alunos.email ?? "—" }] : []),
          { titulo: "Turma", render: (m) => n.nomeTurma(m.turma_id) },
          { titulo: "Série", render: (m) => n.nomeSerie(n.turma(m.turma_id)?.serie_id) },
          { titulo: "Turno", render: (m) => { const t = n.turma(m.turma_id); return t ? TURNOS[t.turno] : "—"; } },
          { titulo: "Situação", render: (m) => <Selo cor={COR[m.situacao]}>{SITUACOES_MATRICULA[m.situacao]}</Selo> },
          ...(gestao ? [{ titulo: "Acesso", render: (m: Linha) => (m.alunos.perfil_id ? <Selo cor="verde">Com acesso</Selo> : <Selo cor="cinza">Sem acesso</Selo>) }] : []),
          { titulo: "Ações", acoes: true, render: (m) => (
            <>
              <BotaoDetalhe titulo={m.alunos.nome}>
                <Detalhes linhas={[
                  ["Matrícula", m.alunos.matricula], gestao && ["E-mail", m.alunos.email], ["Turma", n.nomeTurma(m.turma_id)],
                  ["Série", n.nomeSerie(n.turma(m.turma_id)?.serie_id)], ["Ano letivo", m.ano_letivo],
                  ["Situação da matrícula", SITUACOES_MATRICULA[m.situacao]], gestao && ["Acesso ao sistema", m.alunos.perfil_id ? "Com acesso" : "Sem acesso"],
                ]} />
              </BotaoDetalhe>
              {gestao && (
                <BotaoModal titulo="Editar aluno" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" largo action={salvarAluno.bind(null, m.alunos.id)}>
                  <CamposAluno n={n} anoPadrao={m.ano_letivo} m={m} />
                </BotaoModal>
              )}
              {gestao && !m.alunos.perfil_id && m.alunos.email && (
                <BotaoModal titulo={`Criar acesso para ${m.alunos.nome}`} icone="chave" variante="icone" ariaLabel="Criar acesso (login)" textoSalvar="Criar acesso"
                  action={criarAcessoAluno.bind(null, m.alunos.id, m.alunos.nome, m.alunos.email)}>
                  <CampoTexto name="email_login" label="E-mail de login" tipo="email" valor={m.alunos.email} readOnly cheio />
                  <CampoTexto name="senha" label="Senha provisória" obrigatorio cheio maxLength={72} autoComplete="new-password"
                    dica='Mínimo de 8 caracteres. Entregue ao aluno e peça para trocá-la em "Esqueci minha senha".' />
                </BotaoModal>
              )}
              {perfil.papel === "direcao" && (
                <BotaoExcluir titulo="Excluir aluno" ariaLabel="Excluir aluno" textoConfirmar="Excluir definitivamente" action={excluirAluno.bind(null, m.alunos.id)}
                  mensagem={`Excluir "${m.alunos.nome}" removerá definitivamente matrículas e registros de recuperação deste aluno (direito de eliminação — LGPD). O login, se existir, deve ser removido em Authentication > Users do Supabase. Continuar?`} />
              )}
            </>
          ) },
        ]} />
      <Paginacao total={total} pagina={pagina} porPagina={POR_PAGINA} caminho="/alunos" params={params} />
    </>
  );
}

function CamposAluno({ n, anoPadrao, m }: { n: ReturnType<typeof criarNomeadores>; anoPadrao: number; m?: Linha }) {
  return (
    <>
      <CampoTexto name="nome" label="Nome completo" obrigatorio cheio maxLength={150} valor={m?.alunos.nome} />
      <CampoTexto name="matricula" label="Matrícula" obrigatorio maxLength={30} valor={m?.alunos.matricula} />
      <CampoTexto name="email" label="E-mail" tipo="email" maxLength={150} valor={m?.alunos.email} />
      <CampoSelecao name="turma_id" label="Turma" obrigatorio opcoes={n.opcoesTurmas()} valor={m?.turma_id} />
      <CampoTexto name="ano_letivo" label="Ano letivo" tipo="number" obrigatorio min={2000} max={2100} step="1" valor={m?.ano_letivo ?? anoPadrao}
        dica="Deve coincidir com o ano letivo da turma." />
      <CampoSelecao name="situacao" label="Situação da matrícula" obrigatorio vazio={null} opcoes={opcoesDe(SITUACOES_MATRICULA)} valor={m?.situacao ?? "ativa"} />
    </>
  );
}
