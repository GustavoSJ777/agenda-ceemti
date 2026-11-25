import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { BotaoModal } from "@/components/ui/BotaoModal";
import { BotaoExcluir } from "@/components/ui/BotaoExcluir";
import { CamposAviso } from "@/components/forms/CamposAviso";
import { Selo } from "@/components/ui/Selo";
import { Paginacao } from "@/components/tables/Paginacao";
import { Filtros } from "@/components/tables/Filtros";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { carregarReferencias } from "@/services/referencias";
import { criarNomeadores } from "@/lib/utils/nomes";
import { intervalo, lerPagina } from "@/lib/utils/paginacao";
import { fmtData, hojeISO } from "@/lib/utils/datas";
import { opcoesDe, POR_PAGINA, PUBLICOS_AVISO } from "@/constants";
import type { PublicoAviso } from "@/types/db";
import { excluirAviso, salvarAviso } from "./actions";

export const metadata = { title: "Avisos — Agenda Escolar CEEMTI Baixo Guandu" };

interface Aviso {
  id: string; titulo: string; conteudo: string; publico: PublicoAviso; turma_id: string | null;
  data_publicacao: string; validade: string | null;
}

function estado(a: Aviso, hoje: string): { rotulo: string; cor: "amarelo" | "cinza" | "verde" } {
  if (a.data_publicacao > hoje) return { rotulo: "Agendado", cor: "amarelo" };
  if (a.validade && a.validade < hoje) return { rotulo: "Expirado", cor: "cinza" };
  return { rotulo: "Vigente", cor: "verde" };
}

export default async function PaginaAvisos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perfil = await exigirPerfil();
  const gestao = perfil.papel === "direcao" || perfil.papel === "secretaria";
  const sp = await searchParams;
  const ref = await carregarReferencias();
  const n = criarNomeadores(ref);
  const hoje = hojeISO();
  const pagina = lerPagina(sp.pagina);
  const publico = sp.publico && sp.publico in PUBLICOS_AVISO ? sp.publico : undefined;
  const sit = ["Vigente", "Agendado", "Expirado"].includes(sp.sit ?? "") ? sp.sit : undefined;

  const sb = await criarClienteServidor();
  let c = sb.from("avisos").select("*", { count: "exact" });
  if (gestao) {
    if (publico) c = c.eq("publico", publico);
    if (sit === "Agendado") c = c.gt("data_publicacao", hoje);
    if (sit === "Expirado") c = c.lte("data_publicacao", hoje).lt("validade", hoje);
    if (sit === "Vigente") c = c.lte("data_publicacao", hoje).or(`validade.is.null,validade.gte.${hoje}`);
  }
  const [de, ate] = intervalo(pagina, POR_PAGINA);
  const resp = await c.order("data_publicacao", { ascending: false }).order("criado_em", { ascending: false }).range(de, ate);
  if (resp.error) throw resp.error;
  const avisos = (resp.data ?? []) as Aviso[];
  const params = { publico, sit };
  const publicos = opcoesDe(PUBLICOS_AVISO);

  return (
    <>
      <CabecalhoPagina titulo="Avisos" descricao="Mural de comunicação da escola.">
        {gestao && (
          <BotaoModal titulo="Novo aviso" rotulo="Novo aviso" textoSalvar="Publicar aviso" largo action={salvarAviso.bind(null, "")}>
            <CamposAviso publicos={publicos} turmas={n.opcoesTurmas()} hoje={hoje} />
          </BotaoModal>
        )}
      </CabecalhoPagina>

      {gestao && (
        <Filtros caminho="/avisos" valores={params} campos={[
          { name: "publico", label: "Público", tipo: "select", opcoes: publicos },
          { name: "sit", label: "Situação", tipo: "select", opcoes: [{ v: "Vigente", l: "Vigentes" }, { v: "Agendado", l: "Agendados" }, { v: "Expirado", l: "Expirados" }], vazio: "Todas" },
        ]} />
      )}

      {avisos.length === 0 ? (
        <div className="card text-center text-texto-suave">Nenhum aviso no momento.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {avisos.map((a) => {
            const st = estado(a, hoje);
            const destino = a.publico === "turma" ? `Turma ${n.nomeTurma(a.turma_id)}` : PUBLICOS_AVISO[a.publico];
            return (
              <article key={a.id} className="card flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">{gestao && <Selo cor={st.cor}>{st.rotulo}</Selo>}<Selo>{destino}</Selo></div>
                <h2 className="text-lg font-extrabold">{a.titulo}</h2>
                <span className="text-xs text-texto-suave">Publicado em {fmtData(a.data_publicacao)}{a.validade ? ` · válido até ${fmtData(a.validade)}` : ""}</span>
                <p className="whitespace-pre-wrap break-words">{a.conteudo}</p>
                {gestao && (
                  <div className="mt-auto flex justify-end">
                    <BotaoModal titulo="Editar aviso" icone="editar" variante="icone" ariaLabel="Editar" textoSalvar="Salvar alterações" largo action={salvarAviso.bind(null, a.id)}>
                      <CamposAviso publicos={publicos} turmas={n.opcoesTurmas()} hoje={hoje} valores={a} />
                    </BotaoModal>
                    <BotaoExcluir titulo="Excluir aviso" ariaLabel="Excluir" action={excluirAviso.bind(null, a.id)} mensagem={`Excluir o aviso "${a.titulo}"?`} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <Paginacao total={resp.count ?? 0} pagina={pagina} porPagina={POR_PAGINA} caminho="/avisos" params={params} />
    </>
  );
}
