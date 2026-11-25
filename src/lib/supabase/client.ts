import { createBrowserClient } from "@supabase/ssr";

/** Cliente para componentes do navegador. Usa apenas a chave pública (anon). */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
