import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Verificação de saúde do contêiner (não toca no banco nem expõe configuração). */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
