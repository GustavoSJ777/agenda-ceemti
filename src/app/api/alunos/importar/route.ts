import { NextResponse, type NextRequest } from "next/server";
import { obterPerfil } from "@/lib/auth";
import { carregarReferencias } from "@/services/referencias";
import { gerarPdfCredenciais, importarAlunos, lerPlanilha, validarTamanho } from "@/services/importar-alunos";
import { esquemaImportacao } from "@/lib/validations/importar-alunos";
import { ErroNegocio } from "@/lib/actions/resultado";
import { limparCacheCurto } from "@/lib/cache-curto";
import { hojeISO } from "@/lib/utils/datas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Importa alunos de uma planilha .xlsx e devolve o PDF com login (matrícula) e senha provisória.
 * Resumo no cabeçalho "X-Resumo" (JSON em base64); sem credenciais novas não há PDF (JSON com os motivos).
 */
export async function POST(request: NextRequest) {
  const perfil = await obterPerfil();
  if (!perfil) return NextResponse.json({ erro: "Sessão inválida. Entre novamente." }, { status: 401 });
  if (perfil.papel !== "direcao" && perfil.papel !== "secretaria") return NextResponse.json({ erro: "Você não tem permissão para importar alunos." }, { status: 403 });
  try {
    const f = await request.formData();
    const arquivo = f.get("arquivo");
    if (!(arquivo instanceof File)) throw new ErroNegocio("Selecione a planilha .xlsx.");
    validarTamanho(arquivo);
    const v = esquemaImportacao.safeParse({ turma_id: f.get("turma_id") || undefined, ano_letivo: f.get("ano_letivo") });
    if (!v.success) throw new ErroNegocio(v.error.issues[0].message);
    const ref = await carregarReferencias();
    const turmas = ref.turmas.filter((t) => t.ano_letivo === v.data.ano_letivo);
    if (v.data.turma_id && !turmas.some((t) => t.id === v.data.turma_id)) throw new ErroNegocio("A turma escolhida não pertence ao ano letivo.");

    const linhas = await lerPlanilha(Buffer.from(await arquivo.arrayBuffer()));
    const r = await importarAlunos(perfil, linhas, turmas, v.data.turma_id, v.data.ano_letivo);
    limparCacheCurto();
    const resumo = { total: r.total, criados: r.credenciais.length, ignorados: r.ignorados };
    if (!r.credenciais.length) return NextResponse.json({ erro: "Nenhum acesso novo foi criado.", resumo }, { status: 422 });
    const pdf = gerarPdfCredenciais(r.credenciais, perfil.nome, hojeISO());
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="acessos-alunos-${hojeISO()}.pdf"`,
        "Cache-Control": "no-store",
        "X-Resumo": Buffer.from(JSON.stringify(resumo)).toString("base64"),
      },
    });
  } catch (e) {
    if (e instanceof ErroNegocio) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ erro: "Erro interno ao importar." }, { status: 500 });
  }
}
