import { NextResponse, type NextRequest } from "next/server";
import { obterPerfil } from "@/lib/auth";
import { criarUsuario } from "@/services/criar-usuario";
import { ErroNegocio } from "@/lib/actions/resultado";

export const dynamic = "force-dynamic";

/** Cria um usuário (login + perfil). A autorização vem do perfil no banco, nunca do corpo da requisição. */
export async function POST(request: NextRequest) {
  const perfil = await obterPerfil();
  if (!perfil) return NextResponse.json({ erro: "Sessão inválida. Entre novamente." }, { status: 401 });
  if (perfil.papel !== "direcao" && perfil.papel !== "secretaria") {
    return NextResponse.json({ erro: "Você não tem permissão para criar usuários." }, { status: 403 });
  }
  let corpo: unknown;
  try { corpo = await request.json(); } catch { return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 }); }
  try {
    const r = await criarUsuario(perfil, corpo);
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    if (e instanceof ErroNegocio) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ erro: "Erro interno ao criar o usuário." }, { status: 500 });
  }
}
