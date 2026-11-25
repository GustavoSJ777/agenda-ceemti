import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente para Server Components, Server Actions e Route Handlers.
 * Atua COM a sessão do usuário, então o RLS do banco continua valendo.
 */
export async function criarClienteServidor() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(lista) {
          try {
            lista.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            // Chamado de um Server Component: o middleware já renova a sessão.
          }
        },
      },
    },
  );
}
