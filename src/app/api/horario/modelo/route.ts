import { NextResponse } from "next/server";
import { obterPerfil } from "@/lib/auth";
import { gerarModeloHorario } from "@/services/horario-arquivos";

export const dynamic = "force-dynamic";

export async function GET() {
  const perfil = await obterPerfil();
  if (!perfil || (perfil.papel !== "direcao" && perfil.papel !== "coordenador")) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  return new NextResponse(new Uint8Array(await gerarModeloHorario()), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="modelo-horario.xlsx"' },
  });
}
