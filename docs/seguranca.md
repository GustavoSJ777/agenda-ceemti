# Revisão de segurança (Fase 6)

Verificado no código:
- **Service role** só em `src/lib/supabase/admin.ts` (`server-only`) e `src/services/criar-usuario.ts`; nenhum componente cliente importa esses arquivos e a chave não aparece em `.next/static`.
- **Toda Server Action** de módulo chama `exigirPapel`/`exigirPerfil` antes de gravar e valida a entrada com Zod; o RLS segue como autoridade final (`.select("id")` após update/delete detecta filtragem silenciosa).
- **Rotas de API** (`/api/usuarios`, `/api/relatorios`) verificam sessão e papel e retornam 401/403.
- **Sessão** em cookies via `@supabase/ssr`; middleware usa `getUser()`; logout por inatividade (30 min).
- **Cabeçalhos**: HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy e CSP (frame-ancestors none, connect-src limitado ao Supabase). `script-src` mantém `'unsafe-inline'` porque o Next 15 injeta scripts inline; endurecer com nonce é melhoria futura.
- **Redirecionamento aberto** bloqueado em `/auth/callback` (recusa `//`, `/\`, esquemas e quebras de linha).
- **Link de redefinição de senha** usa `NEXT_PUBLIC_SITE_URL` quando definida (evita confiar no cabeçalho Host).
- **Exportação Excel** neutraliza fórmulas (`= + - @`).
- **LGPD**: auditoria por gatilho no banco guarda só tabela, ação e identificador.

Pendente / depende de você:
- Rodar `database/testes_permissoes.sql` no Supabase (61 testes).
- Ativar proteção contra senhas vazadas e confirmar limites de taxa de e-mail em Authentication → Settings.
- PostCSS embutido no Next 15 (`npm audit`): só build; resolver ao migrar para Next 16.
- Migrations opcionais 002 (auditoria) e 003 (proteção de turma) só com sua autorização.

## Desempenho x segurança (ajustes de velocidade)
- O middleware e `obterPerfil()` usam `getClaims()` (verificação local da assinatura do JWT, sem ida ao Supabase). Uma sessão encerrada em outro dispositivo só deixa de valer quando o token (1 h) expira; o RLS continua barrando dados de usuários desativados.
- Perfil e tabelas de apoio ficam 30 s em memória, por usuário, e são limpos a cada gravação por Server Action.
