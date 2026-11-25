import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente ADMINISTRATIVO (service role). Ignora o RLS.
 * Use SOMENTE em Route Handlers/Server Actions, depois de confirmar o papel de quem chama.
 * O import de "server-only" faz o build falhar se este arquivo for usado no navegador.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
