import Link from "next/link";
import { FileText, Table2 } from "lucide-react";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { Tabela } from "@/components/tables/Tabela";
import { Paginacao } from "@/components/tables/Paginacao";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarReferencias } from "@/services/referencias";
import { gerarRelatorio } from "@/services/relatorios";
import { criarNomeadores } from "@/lib/utils/nomes";
import { anoAtual } from "@/lib/utils/datas";
import { lerPagina } from "@/lib/utils/paginacao";
import { opcoesDe, POR_PAGINA, SITUACOES_MATRICULA, SITUACOES_RECUPERACAO } from "@/constants";
import { esquemaRelatorio, TIPOS_RELATORIO, type TipoRelatorio } from "@/lib/validations/relatorios";

export const metadata = { title: "Relatórios — Agenda Escolar CEEMTI Baixo Guandu" };

export default async function PaginaRelatorios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirPapel(["direcao", "secretaria"]);
  const sp = await searchParams;
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);
  const tipo: TipoRelatorio = sp.tipo && sp.tipo in TIPOS_RELATORIO ? (sp.tipo as TipoRelatorio) : "alunos";
  const usa = TIPOS_RELATORIO[tipo].filtros as readonly string[];
  const ano = anoAtual();
  const anos = [...new Set([...ref.turmas.map((t) => t.ano_letivo), ano])].sort((a, b) => b - a);
  const gerar = sp.gerar === "1";

  const bruto = { ...sp, tipo, ano: sp.ano ?? String(ano), inicio: sp.inicio ?? `${ano}-01-01`, fim: sp.fim ?? `${ano}-12-31` };
  const v = gerar ? esquemaRelatorio.safeParse(bruto) : null;
  let rel = null;
  let erro: string | null = null;
  if (v?.success) {
    try { rel = await gerarRelatorio(await criarClienteServidor(), v.data); } catch (e) { console.error(e); erro = "Não foi possível gerar o relatório. Tente novamente."; }
  } else if (v) erro = v.error.issues[0]?.message ?? "Filtros inválidos.";

  const pagina = lerPagina(sp.pagina);
  const exportar = (formato: "pdf" | "xlsx") => {
    const q = new URLSearchParams({ formato, tipo });
    for (const k of ["ano", "turma", "professor", "sit", "recsit", "inicio", "fim"]) {
      const val = k === "ano" ? bruto.ano : k === "inicio" ? bruto.inicio : k === "fim" ? bruto.fim : sp[k];
      if (val && usa.includes(k === "inicio" || k === "fim" ? "periodo" : k)) q.set(k, val);
    }
    return `/api/relatorios?${q.toString()}`;
  };
  const paramsPag: Record<string, string | undefined> = { ...bruto, gerar: "1" };

  return (
    <>
      <CabecalhoPagina titulo="Relatórios" descricao="Gere listas e exporte para PDF ou Excel." />
      <nav aria-label="Tipo de relatório" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.entries(TIPOS_RELATORIO) as [TipoRelatorio, (typeof TIPOS_RELATORIO)[TipoRelatorio]][]).map(([id, t]) => (
          <Link key={id} href={`/relatorios?tipo=${id}`} aria-current={id === tipo ? "true" : undefined}
            className={`card block !p-3 ${id === tipo ? "border-azul-500 bg-azul-50" : "hover:border-azul-300"}`}>
            <strong className="block">{t.nome}</strong>
            <span className="text-sm text-texto-suave">{t.desc}</span>
          </Link>
        ))}
      </nav>

      <form method="get" action="/relatorios" className="card mb-4 flex flex-wrap items-end gap-3 !p-4">
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="gerar" value="1" />
        {usa.includes("ano") && (
          <div className="campo min-w-[110px]"><label htmlFor="r_ano">Ano letivo</label>
            <select id="r_ano" name="ano" defaultValue={bruto.ano}>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        )}
        {usa.includes("turma") && (
          <div className="campo min-w-[150px] flex-1"><label htmlFor="r_turma">Turma</label>
            <select id="r_turma" name="turma" defaultValue={sp.turma ?? ""}><option value="">Todas</option>{n.opcoesTurmas().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
        )}
        {usa.includes("professor") && (
          <div className="campo min-w-[150px] flex-1"><label htmlFor="r_prof">Professor</label>
            <select id="r_prof" name="professor" defaultValue={sp.professor ?? ""}><option value="">Todos</option>{n.opcoesProfessores().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
        )}
        {usa.includes("sit") && (
          <div className="campo min-w-[150px] flex-1"><label htmlFor="r_sit">Situação da matrícula</label>
            <select id="r_sit" name="sit" defaultValue={sp.sit ?? ""}><option value="">Todas</option>{opcoesDe(SITUACOES_MATRICULA).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
        )}
        {usa.includes("recsit") && (
          <div className="campo min-w-[150px] flex-1"><label htmlFor="r_rs">Situação da recuperação</label>
            <select id="r_rs" name="recsit" defaultValue={sp.recsit ?? ""}><option value="">Todas</option>{opcoesDe(SITUACOES_RECUPERACAO).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
        )}
        {usa.includes("periodo") && (
          <>
            <div className="campo"><label htmlFor="r_ini">De</label><input id="r_ini" type="date" name="inicio" defaultValue={bruto.inicio} required /></div>
            <div className="campo"><label htmlFor="r_fim">Até</label><input id="r_fim" type="date" name="fim" defaultValue={bruto.fim} required /></div>
          </>
        )}
        <button type="submit" className="btn btn-primario">Gerar relatório</button>
      </form>

      {erro && <div className="alerta alerta-erro mb-4" role="alert">{erro}</div>}
      {rel && (
        <section aria-live="polite">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold">{rel.titulo}</h2>
              <p className="text-sm text-texto-suave">{rel.linhas.length} registro(s){rel.filtros ? ` · ${rel.filtros}` : ""}</p>
            </div>
            {rel.linhas.length > 0 && (
              <div className="flex gap-2">
                <a className="btn btn-secundario" href={exportar("pdf")}><FileText size={16} aria-hidden="true" /> Exportar PDF</a>
                <a className="btn btn-secundario" href={exportar("xlsx")}><Table2 size={16} aria-hidden="true" /> Exportar Excel</a>
              </div>
            )}
          </div>
          <Tabela chave={(x) => String(x.i)} linhas={rel.linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((l, k) => ({ i: (pagina - 1) * POR_PAGINA + k, l }))} vazio="Nenhum registro para os filtros escolhidos."
            colunas={rel.colunas.map((c, i) => ({ titulo: c, render: (x: { i: number; l: string[] }) => x.l[i] }))} />
          <Paginacao total={rel.linhas.length} pagina={pagina} porPagina={POR_PAGINA} caminho="/relatorios" params={paramsPag} />
        </section>
      )}
    </>
  );
}
