import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { BotaoDetalhe } from "@/components/ui/BotaoDetalhe";
import { Detalhes } from "@/components/ui/Detalhes";
import { Selo, type CorSelo } from "@/components/ui/Selo";
import { CamposRecuperacao, type MatriculaOpc } from "@/components/forms/CamposRecuperacao";
import { Tabela } from "@/components/tables/Tabela";
import { Paginacao } from "@/components/tables/Paginacao";
import { Filtros } from "@/components/tables/Filtros";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTodos } from "@/lib/supabase/todos";
import { cacheCurto } from "@/lib/cache-curto";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { intervalo, lerPagina, termoSeguro } from "@/lib/utils/paginacao";
import { fmtData } from "@/lib/utils/datas";
import { opcoesDe, POR_PAGINA, SITUACOES_RECUPERACAO } from "@/constants";
import type { SituacaoRecuperacao } from "@/types/db";
import { excluirRecuperacao, salvarRecuperacao } from "./actions";

export const metadata = { title: "Recuperação — Agenda Escolar CEEMTI Baixo Guandu" };

interface Rec {
  id: string; aluno_id: string; turma_id: string; disciplina_id: string; professor_id: string | null;
  nota_anterior: number | null; nota_recuperacao: number | null; data_avaliacao: string | null; prazo: string | null;
  situacao: SituacaoRecuperacao; observacoes: string | null; alunos: { nome: string; matricula: string } | null;
}
const COR: Record<SituacaoRecuperacao, CorSelo> = { pendente: "amarelo", em_andamento: "azul", avaliacao_realizada: "roxo", aguardando_resultado: "cinza", concluida: "verde" };
const fmtNota = (n: number | null) => (n === null || n === undefined ? "—" : Number(n).toFixed(1).replace(".", ","));

export default async function PaginaRecuperacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perfil = await exigirPerfil();
  const sp = await searchParams;
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);
  const aluno = perfil.papel === "aluno";
  const professor = perfil.papel === "professor";
  const meus = professor ? ref.vinculos.filter((v) => v.professor_id === perfil.id) : [];
  const podeEscrever = perfil.papel === "direcao" || (professor && meus.length > 0);

  const pagina = lerPagina(sp.pagina);
  const q = termoSeguro(sp.q);
  const turma = ref.turmas.some((t) => t.id === sp.turma) ? sp.turma : undefined;
  const disc = ref.disciplinas.some((d) => d.id === sp.disc) ? sp.disc : undefined;
  const sit = sp.sit && sp.sit in SITUACOES_RECUPERACAO ? sp.sit : undefined;

  const sb = await criarClienteServidor();
  let c = sb.from("recuperacoes").select(`*, alunos${q ? "!inner" : ""}(nome,matricula)`, { count: "exact" });
  if (turma) c = c.eq("turma_id", turma);
  if (disc) c = c.eq("disciplina_id", disc);
  if (sit) c = c.eq("situacao", sit);
  if (q) c = c.or(`nome.ilike.%${q}%,matricula.ilike.%${q}%`, { referencedTable: "alunos" });
  const [de, ate] = intervalo(pagina, POR_PAGINA);
  const resp = await c.order("criado_em", { ascending: false }).range(de, ate);
  if (resp.error) throw resp.error;
  const linhas = (resp.data ?? []) as unknown as Rec[];

  // Dados dos formulários (somente quem escreve): matrículas ativas das turmas permitidas.
  let matriculas: MatriculaOpc[] = [];
  if (podeEscrever) {
    type M = { turma_id: string; aluno_id: string; alunos: { nome: string; matricula: string } | null };
    const lista = await cacheCurto(`matr:${perfil.id}`, 30, () => lerTodos<M>(() => sb.from("matriculas").select("turma_id,aluno_id,alunos(nome,matricula)").eq("situacao", "ativa").order("id") as never));
    matriculas = lista.filter((m) => m.alunos).map((m) => ({ turma_id: m.turma_id, aluno_id: m.aluno_id, rotulo: `${m.alunos!.nome} (${m.alunos!.matricula})` }));
  }
  const turmasForm = professor ? n.opcoesTurmas((t) => meus.some((v) => v.turma_id === t.id)) : n.opcoesTurmas();
  const podeEditar = (r: Rec) => perfil.papel === "direcao" || (professor && meus.some((v) => v.turma_id === r.turma_id && v.disciplina_id === r.disciplina_id));
  const params = { q: sp.q, turma, disc, sit };
  const situacoes = opcoesDe(SITUACOES_RECUPERACAO);

  const formulario = (r?: Rec) => (
    <CamposRecuperacao turmas={turmasForm} matriculas={matriculas} disciplinas={n.opcoesDisciplinas()}
      limitarPor={professor ? meus : null} professores={perfil.papel === "direcao" ? n.opcoesProfessores() : null} situacoes={situacoes} valores={r} />
  );

  return (
    <>
      <CabecalhoPagina titulo={aluno ? "Minha recuperação" : "Recuperação escolar"}
        descricao={aluno ? "Acompanhe suas avaliações de recuperação." : "Acompanhe os alunos que precisam realizar recuperação."}>
        {podeEscrever && (
          <BotaoModal titulo="Nova recuperação" rotulo="Nova recuperação" textoSalvar="Cadastrar" largo action={salvarRecuperacao.bind(null, "")}>
            {formulario()}
          </BotaoModal>
        )}
      </CabecalhoPagina>
      {perfil.papel === "secretaria" && <div className="alerta alerta-info mb-4">A Secretaria tem acesso somente para consulta nesta área.</div>}
      {professor && !meus.length && <div className="alerta alerta-aviso mb-4">Você ainda não está vinculado a nenhuma turma/disciplina.</div>}

      <Filtros caminho="/recuperacoes" valores={params} campos={[
        ...(aluno ? [] : [
          { name: "q", label: "Buscar aluno", tipo: "busca" as const },
          { name: "turma", label: "Turma", tipo: "select" as const, opcoes: n.opcoesTurmas(), vazio: "Todas" },
        ]),
        { name: "disc", label: "Disciplina", tipo: "select", opcoes: n.opcoesDisciplinas(), vazio: "Todas" },
        { name: "sit", label: "Situação", tipo: "select", opcoes: situacoes, vazio: "Todas" },
      ]} />

      <Tabela chave={(r) => r.id} linhas={linhas} vazio={aluno ? "Você não possui recuperações registradas." : "Nenhuma recuperação encontrada."}
        colunas={[
          ...(aluno ? [] : [
            { titulo: "Aluno", render: (r: Rec) => <strong>{r.alunos?.nome ?? "—"}</strong> },
            { titulo: "Matrícula", render: (r: Rec) => r.alunos?.matricula ?? "—" },
            { titulo: "Turma", render: (r: Rec) => n.nomeTurma(r.turma_id) },
          ]),
          { titulo: "Disciplina", render: (r) => n.nomeDisciplina(r.disciplina_id) },
          { titulo: "Professor", render: (r) => n.nomeProfessor(r.professor_id) },
          { titulo: "Nota anterior", render: (r) => fmtNota(r.nota_anterior) },
          { titulo: "Nota recuperação", render: (r) => fmtNota(r.nota_recuperacao) },
          { titulo: "Avaliação", render: (r) => fmtData(r.data_avaliacao) },
          { titulo: "Prazo", render: (r) => fmtData(r.prazo) },
          { titulo: "Situação", render: (r) => <Selo cor={COR[r.situacao]}>{SITUACOES_RECUPERACAO[r.situacao]}</Selo> },
          { titulo: "Ações", acoes: true, render: (r) => (
            <>
              <BotaoDetalhe titulo={`Recuperação — ${n.nomeDisciplina(r.disciplina_id)}`}>
                <Detalhes linhas={[
                  !aluno && ["Aluno", r.alunos?.nome], !aluno && ["Matrícula", r.alunos?.matricula], ["Turma", n.nomeTurma(r.turma_id)],
                  ["Disciplina", n.nomeDisciplina(r.disciplina_id)], ["Professor", n.nomeProfessor(r.professor_id)],
                  ["Nota anterior", fmtNota(r.nota_anterior)], ["Nota da recuperação", fmtNota(r.nota_recuperacao)],
                  ["Data da avaliação", fmtData(r.data_avaliacao)], ["Prazo", fmtData(r.prazo)], ["Situação", SITUACOES_RECUPERACAO[r.situacao]], ["Observações", r.observacoes],
                ]} />
              </BotaoDetalhe>
              {podeEditar(r) && (
                <>
                  <BotaoModal titulo="Editar recuperação" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" largo action={salvarRecuperacao.bind(null, r.id)}>
                    {formulario(r)}
                  </BotaoModal>
                  <BotaoExcluir titulo="Excluir recuperação" ariaLabel="Excluir" action={excluirRecuperacao.bind(null, r.id)}
                    mensagem={`Excluir o registro de recuperação de ${r.alunos?.nome ?? "aluno"}?`} />
                </>
              )}
            </>
          ) },
        ]} />
      <Paginacao total={resp.count ?? 0} pagina={pagina} porPagina={POR_PAGINA} caminho="/recuperacoes" params={params} />
    </>
  );
}
