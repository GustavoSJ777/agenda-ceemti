import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_HORARIOS } from "@/services/horario-arquivos";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Download PÚBLICO do PDF do horário (o bucket é privado; só este endpoint o entrega). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const sb = criarClienteAdmin();
  const { data } = await sb.from("horario_arquivos").select("caminho").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const dl = await sb.storage.from(BUCKET_HORARIOS).download(data.caminho);
  if (dl.error || !dl.data) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  return new NextResponse(await dl.data.arrayBuffer(), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="horario-de-aulas.pdf"', "Cache-Control": "public, max-age=300" },
  });
}
