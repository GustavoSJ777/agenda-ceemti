import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { obterPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { limparCacheCurto } from "@/lib/cache-curto";
import { ErroNegocio } from "@/lib/actions/resultado";
import { interpretarLinhas } from "@/lib/horario/planilha";
import { BUCKET_HORARIOS, LIMITE_PDF, LIMITE_PLANILHA, lerPlanilhaHorario } from "@/services/horario-arquivos";
import { mensagemErroDb } from "@/lib/utils/erros-db";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Anexa o novo horário. Planilha (.xlsx) é importada para a grade; PDF é guardado para download na página pública.
 * Somente Direção e Coordenação (o RLS do banco confirma cada gravação).
 */
export async function POST(request: NextRequest) {
  const perfil = await obterPerfil();
  if (!perfil) return NextResponse.json({ erro: "Sessão inválida. Entre novamente." }, { status: 401 });
  if (perfil.papel !== "direcao" && perfil.papel !== "coordenador") return NextResponse.json({ erro: "Você não tem permissão para alterar o horário." }, { status: 403 });
  try {
    const f = await request.formData();
    const arquivo = f.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroNegocio("Selecione um arquivo PDF ou planilha .xlsx.");
    const vigencia = String(f.get("vigencia") ?? "");
    if (!DATA.test(vigencia)) throw new ErroNegocio("Informe a data de início da vigência.");
    const nome = arquivo.name.toLowerCase();
    const buf = Buffer.from(await arquivo.arrayBuffer());
    const sb = await criarClienteServidor();

    if (nome.endsWith(".pdf")) {
      if (buf.length > LIMITE_PDF) throw new ErroNegocio("PDF muito grande (máximo 5 MB).");
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new ErroNegocio("O arquivo não é um PDF válido.");
      const caminho = `${randomUUID()}.pdf`;
      const up = await criarClienteAdmin().storage.from(BUCKET_HORARIOS).upload(caminho, buf, { contentType: "application/pdf", upsert: false });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      const ins = await sb.from("horario_arquivos").insert({ nome: arquivo.name.slice(0, 150), caminho, tamanho: buf.length, vigente_desde: vigencia }).select("id");
      if (ins.error || !ins.data?.length) {
        await criarClienteAdmin().storage.from(BUCKET_HORARIOS).remove([caminho]);
        throw ins.error ?? new ErroNegocio("Você não tem permissão para alterar o horário.");
      }
      limparCacheCurto(); revalidatePath("/horario"); revalidatePath("/");
      return NextResponse.json({ ok: true, mensagem: "PDF anexado. Ele já está disponível para download na página pública do horário." });
    }

    if (nome.endsWith(".xlsx")) {
      if (buf.length > LIMITE_PLANILHA) throw new ErroNegocio("Planilha muito grande (máximo 2 MB).");
      const { validas, ignoradas } = interpretarLinhas(await lerPlanilhaHorario(buf));
      if (!validas.length) return NextResponse.json({ erro: "Nenhuma aula válida na planilha.", ignoradas }, { status: 422 });

      const existe = await sb.from("horarios").select("id", { count: "exact", head: true }).eq("vigente_desde", vigencia);
      if (existe.error) throw existe.error;
      if ((existe.count ?? 0) > 0 && f.get("substituir") !== "on")
        throw new ErroNegocio("Já existe horário nesta data de vigência. Marque “Substituir o horário existente” para continuar.");

      const codigos = [...new Set(validas.map((a) => a.turma_codigo))];
      const turmas = await sb.from("horario_turmas").upsert(codigos.map((codigo) => ({ codigo })), { onConflict: "codigo", ignoreDuplicates: true });
      if (turmas.error) throw turmas.error;
      const { error } = await sb.rpc("substituir_horario", { p_vigencia: vigencia, p_linhas: validas });
      if (error) throw error;
      limparCacheCurto(); revalidatePath("/horario"); revalidatePath("/calendario"); revalidatePath("/");
      return NextResponse.json({ ok: true, mensagem: `Horário importado: ${validas.length} aulas em ${codigos.length} turma(s).`, ignoradas });
    }
    throw new ErroNegocio("Formato não aceito. Envie um PDF ou uma planilha .xlsx.");
  } catch (e) {
    if (e instanceof ErroNegocio) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error("anexar horário falhou", e);
    return NextResponse.json({ erro: mensagemErroDb(e) }, { status: 500 });
  }
}
