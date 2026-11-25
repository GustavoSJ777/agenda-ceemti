import { NextResponse, type NextRequest } from "next/server";
import { obterPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { esquemaRelatorio } from "@/lib/validations/relatorios";
import { gerarRelatorio } from "@/services/relatorios";
import { gerarExcel, gerarPDF, nomeArquivo } from "@/lib/relatorios/exportar";
import { hojeISO } from "@/lib/utils/datas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/relatorios?formato=pdf|xlsx&tipo=...&filtros — somente Direção e Secretaria. */
export async function GET(req: NextRequest) {
  const perfil = await obterPerfil();
  if (!perfil) return NextResponse.json({ erro: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (perfil.papel !== "direcao" && perfil.papel !== "secretaria") return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const formato = sp.formato;
  if (formato !== "pdf" && formato !== "xlsx") return NextResponse.json({ erro: "Formato inválido." }, { status: 400 });
  const v = esquemaRelatorio.safeParse(sp);
  if (!v.success) return NextResponse.json({ erro: v.error.issues[0]?.message ?? "Filtros inválidos." }, { status: 400 });

  try {
    const sb = await criarClienteServidor();
    const rel = await gerarRelatorio(sb, v.data);
    const arquivo = nomeArquivo(rel.titulo, hojeISO(), formato);
    const corpo = formato === "pdf" ? gerarPDF(rel, perfil.nome) : await gerarExcel(rel, perfil.nome);
    return new NextResponse(corpo as BodyInit, {
      headers: {
        "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${arquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Falha ao gerar relatório:", e);
    return NextResponse.json({ erro: "Não foi possível gerar o relatório." }, { status: 500 });
  }
}
