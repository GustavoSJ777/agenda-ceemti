import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { CampoAreaTexto, CampoMarcar, CampoSelecao, CampoTexto, type Opcao } from "@/components/ui/Campos";
import { Selo, type CorSelo } from "@/components/ui/Selo";
import { Paginacao } from "@/components/tables/Paginacao";
import { Filtros } from "@/components/tables/Filtros";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { intervalo, lerPagina, termoSeguro } from "@/lib/utils/paginacao";
import { fmtDataHora } from "@/lib/utils/datas";
import { opcoesDe, POR_PAGINA, TIPOS_ANOTACAO } from "@/constants";
import type { TipoAnotacao } from "@/types/db";
import { excluirAnotacao, salvarAnotacao } from "./actions";

export const metadata = { title: "Anotações — Agenda Escolar CEEMTI Baixo Guandu" };

interface Anotacao {
  id: string; autor_id: string; tipo: TipoAnotacao; titulo: string; conteudo: string;
  turma_id: string | null; disciplina_id: string | null; compartilhada: boolean; criado_em: string;
}
const COR: Record<TipoAnotacao, CorSelo> = { administrativa: "cinza", pedagogica: "roxo", lembrete: "amarelo" };

export default async function PaginaAnotacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perfil = await exigirPapel(["direcao", "secretaria", "professor"]);
  const sp = await searchParams;
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);
  const professor = perfil.papel === "professor";
  const meus = ref.vinculos.filter((v) => v.professor_id === perfil.id);
  const turmasOps: Opcao[] = professor ? n.opcoesTurmas((t) => meus.some((v) => v.turma_id === t.id)) : n.opcoesTurmas();
  const discOps: Opcao[] = professor ? n.opcoesDisciplinas(meus.map((v) => v.disciplina_id)) : n.opcoesDisciplinas();

  const pagina = lerPagina(sp.pagina);
  const q = termoSeguro(sp.q);
  const tipo = sp.tipo && sp.tipo in TIPOS_ANOTACAO ? sp.tipo : undefined;
  const turma = ref.turmas.some((t) => t.id === sp.turma) ? sp.turma : undefined;
  const disc = ref.disciplinas.some((d) => d.id === sp.disc) ? sp.disc : undefined;

  const sb = await criarClienteServidor();
  let c = sb.from("anotacoes").select("*", { count: "exact" });
  if (tipo) c = c.eq("tipo", tipo);
  if (turma) c = c.eq("turma_id", turma);
  if (disc) c = c.eq("disciplina_id", disc);
  if (q) c = c.or(`titulo.ilike.%${q}%,conteudo.ilike.%${q}%`);
  const [de, ate] = intervalo(pagina, POR_PAGINA);
  const resp = await c.order("criado_em", { ascending: false }).range(de, ate);
  if (resp.error) throw resp.error;
  const lista = (resp.data ?? []) as Anotacao[];

  // A Direção também recebe anotações compartilhadas por outros: mostra o nome do autor.
  const autores = new Map<string, string>();
  if (perfil.papel === "direcao" && lista.some((a) => a.autor_id !== perfil.id)) {
    const ids = [...new Set(lista.map((a) => a.autor_id))];
    const { data } = await sb.from("perfis").select("id,nome").in("id", ids);
    (data ?? []).forEach((p: { id: string; nome: string }) => autores.set(p.id, p.nome));
  }
  const params = { q: sp.q, tipo, turma, disc };

  return (
    <>
      <CabecalhoPagina titulo="Anotações" descricao="Registros escolares. Suas anotações são privadas; você escolhe o que compartilhar com a Direção.">
        <BotaoModal titulo="Nova anotação" rotulo="Nova anotação" textoSalvar="Salvar anotação" largo action={salvarAnotacao.bind(null, "")}>
          <Campos professor={professor} turmas={turmasOps} disciplinas={discOps} />
        </BotaoModal>
      </CabecalhoPagina>

      <Filtros caminho="/anotacoes" valores={params} campos={[
        { name: "q", label: "Buscar", tipo: "busca" },
        { name: "tipo", label: "Tipo", tipo: "select", opcoes: opcoesDe(TIPOS_ANOTACAO) },
        { name: "turma", label: "Turma", tipo: "select", opcoes: turmasOps, vazio: "Todas" },
        { name: "disc", label: "Disciplina", tipo: "select", opcoes: discOps, vazio: "Todas" },
      ]} />

      {lista.length === 0 ? (
        <div className="card text-center text-texto-suave">Nenhuma anotação encontrada.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((a) => {
            const minha = a.autor_id === perfil.id;
            const meta = [a.turma_id ? `Turma ${n.nomeTurma(a.turma_id)}` : null, a.disciplina_id ? n.nomeDisciplina(a.disciplina_id) : null, fmtDataHora(a.criado_em)].filter(Boolean).join(" · ");
            return (
              <article key={a.id} className="card flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Selo cor={COR[a.tipo]}>{TIPOS_ANOTACAO[a.tipo]}</Selo>
                  {a.compartilhada ? <Selo cor="verde">Compartilhada com a Direção</Selo> : minha ? <Selo cor="cinza">Privada</Selo> : null}
                </div>
                <h2 className="text-lg font-extrabold">{a.titulo}</h2>
                <span className="text-xs text-texto-suave">{meta}{minha ? "" : ` · por ${autores.get(a.autor_id) ?? "outro usuário"}`}</span>
                <p className="whitespace-pre-wrap break-words">{a.conteudo}</p>
                {minha && (
                  <div className="mt-auto flex justify-end">
                    <BotaoModal titulo="Editar anotação" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" largo action={salvarAnotacao.bind(null, a.id)}>
                      <Campos professor={professor} turmas={turmasOps} disciplinas={discOps} a={a} />
                    </BotaoModal>
                    <BotaoExcluir titulo="Excluir anotação" ariaLabel="Excluir" action={excluirAnotacao.bind(null, a.id)} mensagem={`Excluir a anotação "${a.titulo}"?`} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <Paginacao total={resp.count ?? 0} pagina={pagina} porPagina={POR_PAGINA} caminho="/anotacoes" params={params} />
    </>
  );
}

function Campos({ professor, turmas, disciplinas, a }: { professor: boolean; turmas: Opcao[]; disciplinas: Opcao[]; a?: Anotacao }) {
  return (
    <>
      <CampoSelecao name="tipo" label="Tipo" obrigatorio vazio={null} opcoes={opcoesDe(TIPOS_ANOTACAO)} valor={a?.tipo ?? (professor ? "pedagogica" : "administrativa")} />
      <CampoTexto name="titulo" label="Título" obrigatorio maxLength={120} valor={a?.titulo} />
      <CampoSelecao name="turma_id" label="Turma (opcional)" opcoes={turmas} vazio="Nenhuma" valor={a?.turma_id} />
      <CampoSelecao name="disciplina_id" label="Disciplina (opcional)" opcoes={disciplinas} vazio="Nenhuma" valor={a?.disciplina_id} />
      <CampoAreaTexto name="conteudo" label="Conteúdo" obrigatorio cheio linhas={7} maxLength={5000} valor={a?.conteudo} />
      <CampoMarcar name="compartilhada" label="Compartilhar com a Direção" cheio marcado={a?.compartilhada} />
    </>
  );
}
