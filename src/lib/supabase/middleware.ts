import { createServerClient } from "@supabase/ssr";
import { medir } from "@/lib/tempos";
import { NextResponse, type NextRequest } from "next/server";

const ROTAS_PUBLICAS = ["/agenda", "/login", "/recuperar", "/auth/callback", "/api/horario/arquivo"];

/** Renova a sessão (cookies) e bloqueia rotas privadas para quem não está logado. */
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return resposta; // sistema ainda não configurado

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() confere a assinatura do JWT localmente (sem chamada de rede) e renova a sessão se expirou.
  // A autorização real continua no banco (RLS) e em obterPerfil().
  const { data } = await medir("middleware.getClaims", () => supabase.auth.getClaims());
  const logado = Boolean(data?.claims?.sub);
  const caminho = request.nextUrl.pathname;
  const publica = caminho === "/" || ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(r + "/"));

  if (!logado && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  if (logado && caminho === "/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/dashboard";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  return resposta;
}
