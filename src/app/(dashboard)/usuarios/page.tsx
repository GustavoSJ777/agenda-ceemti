import Link from "next/link";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { Selo, type CorSelo } from "@/components/ui/Selo";
import { CampoMarcar, CampoSelecao, CampoTexto } from "@/components/ui/Campos";
import { Tabela } from "@/components/tables/Tabela";
import { Paginacao } from "@/components/tables/Paginacao";
import { Filtros } from "@/components/tables/Filtros";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { intervalo, lerPagina, termoSeguro } from "@/lib/utils/paginacao";
import { fmtDataHora } from "@/lib/utils/datas";
import { POR_PAGINA } from "@/constants";
import { editarUsuario, enviarLinkSenha, novoUsuario } from "./actions";

export const metadata = { title: "Usuários — Agenda Escolar CEEMTI Baixo Guandu" };

const PAPEIS: Record<string, string> = { direcao: "Direção", secretaria: "Secretaria", professor: "Professor(a)", aluno: "Aluno(a)", coordenador: "Coordenação" };
const COR: Record<string, CorSelo> = { direcao: "roxo", secretaria: "azul", professor: "verde", aluno: "cinza", coordenador: "amarelo" };
const TABELAS: Record<string, string> = { perfis: "Usuários", alunos: "Alunos", matriculas: "Matrículas", recuperacoes: "Recuperações", professor_turmas: "Vínculos de professores" };
const ACOES: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Excluiu" };

interface P { id: string; nome: string; email: string; papel: string; ativo: boolean }
interface Aud { id: number; tabela: string; registro_id: string | null; acao: string; usuario_id: string | null; em: string }

export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const eu = await exigirPapel(["direcao"]);
  const sp = await searchParams;
  const aba = sp.aba === "auditoria" ? "auditoria" : "usuarios";
  const pagina = lerPagina(sp.pagina);
  const [de, ate] = intervalo(pagina, POR_PAGINA);
  const sb = await criarClienteServidor();

  return (
    <>
      <CabecalhoPagina titulo="Usuários e segurança" descricao="Gerencie quem acessa o sistema e consulte o registro de alterações." />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-borda">
        {[["usuarios", "Usuários"], ["auditoria", "Registro de alterações (LGPD)"]].map(([id, rot]) => (
          <Link key={id} href={`/usuarios?aba=${id}`} role="tab" aria-selected={id === aba}
            className={`-mb-px rounded-t-campo border border-b-0 px-4 py-2 font-bold ${id === aba ? "border-borda bg-white text-azul-700" : "border-transparent text-texto-suave hover:text-azul-700"}`}>
            {rot}
          </Link>
        ))}
      </div>

      {aba === "usuarios" ? await AbaUsuarios() : await AbaAuditoria()}
    </>
  );

  async function AbaUsuarios() {
    const q = termoSeguro(sp.q);
    const papel = sp.papel && sp.papel in PAPEIS ? sp.papel : undefined;
    let c = sb.from("perfis").select("id,nome,email,papel,ativo", { count: "exact" });
    if (papel) c = c.eq("papel", papel);
    if (q) c = c.or(`nome.ilike.%${q}%,email.ilike.%${q}%`);
    const r = await c.order("nome").range(de, ate);
    if (r.error) throw r.error;
    const linhas = (r.data ?? []) as P[];
    const params = { aba, q: sp.q, papel };
    return (
      <>
        <div className="mb-3 flex justify-end">
          <BotaoModal titulo="Novo usuário" rotulo="Novo usuário" textoSalvar="Criar usuário" largo action={novoUsuario.bind(null, null)}>
            <CampoTexto name="nome" label="Nome completo" obrigatorio cheio maxLength={150} />
            <CampoTexto name="email" label="E-mail (login)" tipo="email" obrigatorio maxLength={150} />
            <CampoSelecao name="papel" label="Perfil" obrigatorio vazio={null} valor="professor"
              opcoes={[{ v: "direcao", l: "Direção" }, { v: "secretaria", l: "Secretaria" }, { v: "coordenador", l: "Coordenação (horário)" }, { v: "professor", l: "Professor(a)" }]} />
            <CampoTexto name="senha" label="Senha provisória" obrigatorio cheio maxLength={72} dica="Mínimo de 8 caracteres. A pessoa pode trocá-la depois em “Esqueci minha senha”." />
          </BotaoModal>
        </div>
        <div className="alerta alerta-info mb-4">Logins de <strong>alunos</strong> são criados na área Alunos, vinculados à matrícula. Para excluir definitivamente um login, use o painel do Supabase (Authentication &gt; Users).</div>
        <Filtros caminho="/usuarios" valores={params} extras={{ aba }} campos={[
          { name: "q", label: "Buscar", tipo: "busca" },
          { name: "papel", label: "Perfil", tipo: "select", opcoes: Object.entries(PAPEIS).map(([v, l]) => ({ v, l })), vazio: "Todos" },
        ]} />
        <Tabela chave={(p) => p.id} linhas={linhas} vazio="Nenhum usuário encontrado." colunas={[
          { titulo: "Nome", render: (p) => <><strong>{p.nome}</strong>{p.id === eu.id && <span className="text-xs text-texto-suave"> (você)</span>}</> },
          { titulo: "E-mail", render: (p) => p.email },
          { titulo: "Perfil", render: (p) => <Selo cor={COR[p.papel]}>{PAPEIS[p.papel]}</Selo> },
          { titulo: "Situação", render: (p) => <Selo cor={p.ativo ? "verde" : "vermelho"}>{p.ativo ? "Ativo" : "Desativado"}</Selo> },
          { titulo: "Ações", acoes: true, render: (p) => {
            const proprio = p.id === eu.id;
            const cambiavel = p.papel === "direcao" || p.papel === "secretaria";
            return (
              <>
                <BotaoModal titulo="Editar usuário" icone="editar" variante="icone" ariaLabel="Editar usuário" textoSalvar="Salvar alterações" action={editarUsuario.bind(null, p.id)}>
                  <CampoTexto name="nome" label="Nome completo" obrigatorio cheio maxLength={150} valor={p.nome} />
                  <CampoTexto name="email" label="E-mail (não editável aqui)" cheio readOnly valor={p.email} />
                  {cambiavel && !proprio
                    ? <CampoSelecao name="papel" label="Perfil" cheio vazio={null} valor={p.papel} opcoes={[{ v: "direcao", l: "Direção" }, { v: "secretaria", l: "Secretaria" }]} />
                    : <CampoTexto name="papel_info" label="Perfil" cheio readOnly valor={PAPEIS[p.papel]} dica={proprio ? "Você não pode alterar o próprio perfil." : "Professores e alunos têm dados próprios; para mudar o perfil, crie um novo usuário."} />}
                  {proprio
                    ? <p className="sm:col-span-2 text-sm text-texto-suave">Você não pode desativar a própria conta.</p>
                    : <CampoMarcar name="ativo" label="Acesso ativo" cheio marcado={p.ativo} />}
                </BotaoModal>
                <BotaoModal titulo="Redefinir senha" icone="chave" variante="icone" ariaLabel="Enviar link para redefinir senha" textoSalvar="Enviar link" action={enviarLinkSenha.bind(null, p.id)}>
                  <p className="sm:col-span-2">Enviar para <strong>{p.email}</strong> um link para criar uma nova senha?</p>
                </BotaoModal>
              </>
            );
          } },
        ]} />
        <Paginacao total={r.count ?? 0} pagina={pagina} porPagina={POR_PAGINA} caminho="/usuarios" params={params} />
      </>
    );
  }

  async function AbaAuditoria() {
    const r = await sb.from("auditoria").select("*", { count: "exact" }).order("em", { ascending: false }).range(de, ate);
    if (r.error) throw r.error;
    const linhas = (r.data ?? []) as Aud[];
    const idsUsuarios = [...new Set(linhas.map((a) => a.usuario_id).filter((x): x is string => Boolean(x)))];
    const { data: autores } = idsUsuarios.length ? await sb.from("perfis").select("id,nome").in("id", idsUsuarios) : { data: [] as { id: string; nome: string }[] };
    const nomes = new Map((autores ?? []).map((p) => [p.id, p.nome]));
    return (
      <>
        <div className="alerta alerta-info mb-4">Registro de quem criou, alterou ou excluiu dados sensíveis (usuários, alunos, matrículas, recuperações e vínculos). Guarda apenas o tipo da operação e o identificador — nunca o conteúdo dos dados pessoais.</div>
        <Tabela chave={(a) => String(a.id)} linhas={linhas} vazio="Nenhuma operação registrada ainda." colunas={[
          { titulo: "Data e hora", render: (a) => fmtDataHora(a.em) },
          { titulo: "Usuário", render: (a) => (a.usuario_id ? nomes.get(a.usuario_id) ?? "Usuário removido" : "Sistema") },
          { titulo: "Operação", render: (a) => ACOES[a.acao] ?? a.acao },
          { titulo: "Área", render: (a) => TABELAS[a.tabela] ?? a.tabela },
          { titulo: "Registro", render: (a) => <code>{(a.registro_id ?? "").slice(0, 8)}</code> },
        ]} />
        <Paginacao total={r.count ?? 0} pagina={pagina} porPagina={POR_PAGINA} caminho="/usuarios" params={{ aba }} />
      </>
    );
  }
}
