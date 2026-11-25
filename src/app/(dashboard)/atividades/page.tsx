import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { BotaoDetalhe } from "@/components/ui/BotaoDetalhe";
import { Detalhes } from "@/components/ui/Detalhes";
import { CampoAreaTexto, CampoSelecao, CampoTexto } from "@/components/ui/Campos";
import { Selo } from "@/components/ui/Selo";
import { Tabela } from "@/components/tables/Tabela";
import { Paginacao } from "@/components/tables/Paginacao";
import { Filtros } from "@/components/tables/Filtros";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { intervalo, lerPagina, termoSeguro } from "@/lib/utils/paginacao";
import { fmtData, hojeISO } from "@/lib/utils/datas";
import { POR_PAGINA } from "@/constants";
import { excluirAtividade, salvarAtividade } from "./actions";

export const metadata = { title: "Provas e Trabalhos — Agenda Escolar CEEMTI Baixo Guandu" };

interface Atividade {
  id: string; tipo: "prova" | "trabalho"; titulo: string; disciplina_id: string; turma_id: string; professor_id: string | null;
  data_realizacao: string | null; prazo_entrega: string | null; orientacoes: string | null;
}

/** Une grupos de condições (cada grupo é uma lista "a,b" de um OR) em um único filtro .or() do PostgREST. */
function combinar(grupos: string[]): string | null {
  if (!grupos.length) return null;
  if (grupos.length === 1) return grupos[0];
  return `and(${grupos.map((g) => `or(${g})`).join(",")})`;
}

export default async function PaginaAtividades({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perfil = await exigirPerfil();
  const sp = await searchParams;
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);
  const gestao = perfil.papel === "direcao" || perfil.papel === "secretaria";
  const aluno = perfil.papel === "aluno";
  const meusVinculos = perfil.papel === "professor" ? ref.vinculos.filter((v) => v.professor_id === perfil.id) : [];
  const podeCriar = gestao || meusVinculos.length > 0;

  const pagina = lerPagina(sp.pagina);
  const hoje = hojeISO();
  const q = termoSeguro(sp.q);
  const tipo = sp.tipo === "prova" || sp.tipo === "trabalho" ? sp.tipo : undefined;
  const turma = ref.turmas.some((t) => t.id === sp.turma) ? sp.turma : undefined;
  const disc = ref.disciplinas.some((d) => d.id === sp.disc) ? sp.disc : undefined;
  const quando = sp.quando === "futuras" || sp.quando === "passadas" ? sp.quando : undefined;
  const idUnico = sp.id && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : undefined;

  const sb = await criarClienteServidor();
  let c = sb.from("atividades").select("*", { count: "exact" });
  if (idUnico) c = c.eq("id", idUnico);
  if (tipo) c = c.eq("tipo", tipo);
  if (turma) c = c.eq("turma_id", turma);
  if (disc) c = c.eq("disciplina_id", disc);
  const grupos: string[] = [];
  if (q) grupos.push(`titulo.ilike.%${q}%,orientacoes.ilike.%${q}%`);
  // "Data principal": prova usa a data de realização; trabalho, o prazo de entrega.
  if (quando === "futuras") grupos.push(`and(tipo.eq.prova,data_realizacao.gte.${hoje}),and(tipo.eq.trabalho,prazo_entrega.gte.${hoje})`);
  if (quando === "passadas") grupos.push(`and(tipo.eq.prova,data_realizacao.lt.${hoje}),and(tipo.eq.trabalho,prazo_entrega.lt.${hoje})`);
  const filtro = combinar(grupos);
  if (filtro) c = c.or(filtro);
  const [de, ate] = intervalo(pagina, POR_PAGINA);
  const resp = await c.order("data_realizacao", { ascending: false, nullsFirst: false })
    .order("prazo_entrega", { ascending: false, nullsFirst: false }).range(de, ate);
  if (resp.error) throw resp.error;
  const linhas = (resp.data ?? []) as Atividade[];
  const total = resp.count ?? 0;

  const podeEditar = (a: Atividade) => gestao || (perfil.papel === "professor" && a.professor_id === perfil.id);
  const params = { q: sp.q, tipo, turma, disc, quando };

  const pares = meusVinculos.map((v) => ({ v: `${v.turma_id}|${v.disciplina_id}`, l: `${n.nomeTurma(v.turma_id)} — ${n.nomeDisciplina(v.disciplina_id)}` }));

  return (
    <>
      <CabecalhoPagina titulo="Provas e Trabalhos" descricao={aluno ? "Atividades da sua turma." : "Cadastre e acompanhe provas e trabalhos."}>
        {podeCriar && (
          <BotaoModal titulo="Nova atividade" rotulo="Nova atividade" textoSalvar="Cadastrar" largo action={salvarAtividade.bind(null, "")}>
            <Campos gestao={gestao} n={n} pares={pares} />
          </BotaoModal>
        )}
      </CabecalhoPagina>
      {perfil.papel === "professor" && !meusVinculos.length && (
        <div className="alerta alerta-aviso mb-4">Você ainda não está vinculado a nenhuma turma/disciplina. Peça à Direção ou à Secretaria para configurar seus vínculos.</div>
      )}

      <Filtros caminho="/atividades" valores={params} campos={[
        { name: "q", label: "Buscar", tipo: "busca" },
        { name: "tipo", label: "Tipo", tipo: "select", opcoes: [{ v: "prova", l: "Provas" }, { v: "trabalho", l: "Trabalhos" }] },
        ...(aluno ? [] : [{ name: "turma", label: "Turma", tipo: "select" as const, opcoes: n.opcoesTurmas(), vazio: "Todas" }]),
        { name: "disc", label: "Disciplina", tipo: "select", opcoes: n.opcoesDisciplinas(), vazio: "Todas" },
        { name: "quando", label: "Período", tipo: "select", opcoes: [{ v: "futuras", l: "Próximas" }, { v: "passadas", l: "Já realizadas" }], vazio: "Todas" },
      ]} />

      <Tabela chave={(a) => a.id} linhas={linhas} vazio="Nenhuma atividade encontrada."
        colunas={[
          { titulo: "Tipo", render: (a) => <Selo cor={a.tipo === "prova" ? "vermelho" : "azul"}>{a.tipo === "prova" ? "Prova" : "Trabalho"}</Selo> },
          { titulo: "Título", render: (a) => <strong>{a.titulo}</strong> },
          { titulo: "Disciplina", render: (a) => n.nomeDisciplina(a.disciplina_id) },
          { titulo: "Turma", render: (a) => n.nomeTurma(a.turma_id) },
          { titulo: "Professor", render: (a) => n.nomeProfessor(a.professor_id) },
          { titulo: "Realização", render: (a) => fmtData(a.data_realizacao) },
          { titulo: "Prazo de entrega", render: (a) => fmtData(a.prazo_entrega) },
          { titulo: "Ações", acoes: true, render: (a) => (
            <>
              <BotaoDetalhe titulo={`${a.tipo === "prova" ? "Prova" : "Trabalho"}: ${a.titulo}`}>
                <Detalhes linhas={[
                  ["Disciplina", n.nomeDisciplina(a.disciplina_id)], ["Turma", n.nomeTurma(a.turma_id)], ["Professor", n.nomeProfessor(a.professor_id)],
                  ["Data de realização", fmtData(a.data_realizacao)], ["Prazo de entrega", fmtData(a.prazo_entrega)], ["Orientações", a.orientacoes ?? "Sem orientações."],
                ]} />
              </BotaoDetalhe>
              {podeEditar(a) && (
                <>
                  <BotaoModal titulo="Editar atividade" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" largo action={salvarAtividade.bind(null, a.id)}>
                    <Campos gestao={gestao} n={n} pares={pares} a={a} />
                  </BotaoModal>
                  <BotaoExcluir titulo="Excluir atividade" ariaLabel="Excluir" action={excluirAtividade.bind(null, a.id)}
                    mensagem={`Excluir "${a.titulo}"? Os alunos deixarão de vê-la.`} />
                </>
              )}
            </>
          ) },
        ]} />
      <Paginacao total={total} pagina={pagina} porPagina={POR_PAGINA} caminho="/atividades" params={params} />
    </>
  );
}

function Campos({ gestao, n, pares, a }: { gestao: boolean; n: ReturnType<typeof criarNomeadores>; pares: Array<{ v: string; l: string }>; a?: Atividade }) {
  // Professor editando: garante que o par atual apareça mesmo que o vínculo tenha sido removido.
  const atual = a ? `${a.turma_id}|${a.disciplina_id}` : undefined;
  const opcoesPar = atual && !pares.some((p) => p.v === atual) ? [...pares, { v: atual, l: `${n.nomeTurma(a!.turma_id)} — ${n.nomeDisciplina(a!.disciplina_id)}` }] : pares;
  return (
    <>
      <CampoSelecao name="tipo" label="Tipo" obrigatorio vazio={null} opcoes={[{ v: "prova", l: "Prova" }, { v: "trabalho", l: "Trabalho" }]} valor={a?.tipo ?? "prova"} />
      <CampoTexto name="titulo" label="Título" obrigatorio maxLength={120} valor={a?.titulo} />
      {gestao ? (
        <>
          <CampoSelecao name="turma_id" label="Turma" obrigatorio opcoes={n.opcoesTurmas()} valor={a?.turma_id} />
          <CampoSelecao name="disciplina_id" label="Disciplina" obrigatorio opcoes={n.opcoesDisciplinas()} valor={a?.disciplina_id} />
          <CampoSelecao name="professor_id" label="Professor responsável" opcoes={n.opcoesProfessores()} vazio="Nenhum" valor={a?.professor_id} cheio />
        </>
      ) : (
        <CampoSelecao name="par" label="Turma e disciplina" obrigatorio opcoes={opcoesPar} valor={atual} cheio />
      )}
      <CampoTexto name="data_realizacao" label="Data de realização" tipo="date" valor={a?.data_realizacao} dica="Obrigatória para provas." />
      <CampoTexto name="prazo_entrega" label="Prazo de entrega" tipo="date" valor={a?.prazo_entrega} dica="Obrigatório para trabalhos." />
      <CampoAreaTexto name="orientacoes" label="Orientações para os alunos" cheio linhas={5} maxLength={2000} valor={a?.orientacoes} />
    </>
  );
}
