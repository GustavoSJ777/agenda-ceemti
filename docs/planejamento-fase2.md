# Agenda Escolar CEEMTI Baixo Guandu — Fase 2: Planejamento

Base: `AUDITORIA_FASE1.md`. Nenhum código foi escrito nesta fase.

## 0. Premissas adotadas (você não respondeu às 6 decisões; ajuste se discordar)

| # | Decisão | Premissa adotada |
|---|---|---|
| 1 | Acesso ao banco | Desenvolvo e testo build/tipos/lint/unitários aqui. Testes contra o Supabase real são rodados por você com os scripts que eu entregar |
| 2 | Professor cria eventos? | **Não.** Mantém o original: professor cria provas/trabalhos (que aparecem no calendário). Eventos: Direção e Secretaria |
| 3 | Auditoria | Migração **opcional** `002` amplia a auditoria e registra quem cria logins. Só aplicada com sua autorização |
| 4 | Excluir turma | Migração **opcional** `003` bloqueia exclusão se houver atividades/eventos/avisos. Hoje: cascata |
| 5 | Edge Function | Substituída por Route Handler; a função antiga permanece publicada até você validar o novo fluxo |
| 6 | Ano da matrícula × turma | **Sem alteração de regra.** Só será exibido aviso na tela se divergir |

## 1. Arquitetura final

- **Next.js (App Router) + React + TypeScript + Tailwind CSS**, implantado só na Vercel (sem Express).
- **Supabase** (Postgres, Auth, RLS). O RLS continua sendo a autoridade de autorização.
- **Camadas**:
  1. `middleware.ts` renova a sessão (cookies via `@supabase/ssr`) e redireciona quem não está logado.
  2. **Server Components** leem dados com o cliente de servidor **na sessão do usuário** (RLS aplicado).
  3. **Server Actions / Route Handlers** gravam: validam com **Zod**, confirmam o papel do usuário e só então chamam o banco. O banco recusa o que o perfil não pode.
  4. **Service role** usada só em 2 pontos: criar usuário (`POST /api/usuarios`) e, se necessário, exportações. Nunca importada em código cliente (módulo marcado `server-only`).
- **Sessão**: cookies HttpOnly/Secure/SameSite via `@supabase/ssr`. Inatividade de 30 min mantida por controle no cliente + validação no servidor (`getUser()`, não `getSession()`).
- **Segurança de cabeçalhos**: CSP, `X-Frame-Options`, `Referrer-Policy` em `next.config.ts`.
- **Tipos do banco**: gerados do schema (`database.types.ts`), usados em todo acesso.

## 2. Stack e bibliotecas

| Uso | Biblioteca |
|---|---|
| Supabase | `@supabase/supabase-js`, `@supabase/ssr` |
| Validação | `zod` |
| Formulários | `react-hook-form` + `@hookform/resolvers` |
| Tabelas/estado de URL | filtros, ordenação e página em **query string** (paginação no servidor com `.range()`) |
| Datas | `date-fns` (fuso `America/Sao_Paulo`, evitando o erro de um dia) |
| PDF | `jspdf` + `jspdf-autotable` (gerado no navegador, sem custo de função serverless) |
| Excel | `exceljs` (substitui SheetJS 0.18.5, vulnerável) |
| Ícones | `lucide-react` (equivalentes aos SVGs atuais) |
| Testes | `vitest` + Testing Library (unitários), `playwright` (e2e, contra Supabase de teste) |
| Qualidade | `eslint`, `prettier`, `tsc --noEmit` |

## 3. Estrutura de pastas (ajustada às funcionalidades reais)

```
agenda-ceemti/
├── public/ (logo/, icons/, images/)
├── src/
│   ├── app/
│   │   ├── (auth)/login/            login, esqueci senha, nova senha
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx           menu lateral + cabeçalho (exige sessão)
│   │   │   ├── dashboard/           painel
│   │   │   ├── calendario/          mês/semana/dia + eventos (gestão)
│   │   │   ├── atividades/          provas e trabalhos
│   │   │   ├── recuperacoes/
│   │   │   ├── avisos/
│   │   │   ├── anotacoes/
│   │   │   ├── alunos/
│   │   │   ├── turmas/              abas: turmas, séries, disciplinas, professores e vínculos
│   │   │   ├── relatorios/
│   │   │   └── usuarios/            usuários + auditoria (Direção)
│   │   ├── api/
│   │   │   ├── usuarios/route.ts    cria login (service role)
│   │   │   └── auth/callback/route.ts  troca de código (recuperação de senha)
│   │   ├── error.tsx, not-found.tsx, loading.tsx
│   ├── components/ layout/ dashboard/ forms/ tables/ calendar/ ui/
│   ├── lib/
│   │   ├── supabase/ client.ts server.ts middleware.ts admin.ts(server-only)
│   │   ├── permissions/             matriz papel × rota × ação (espelha RLS; só para UX)
│   │   ├── validations/             schemas Zod por módulo
│   │   └── utils/                   datas, formatação, mensagens de erro Postgres
│   ├── services/                    uma função por consulta/gravação, por módulo
│   ├── hooks/ types/ constants/
├── database/
│   ├── schema.sql  policies.sql  testes_permissoes.sql   (originais, intactos)
│   ├── migrations/  (001_baseline_doc, 002_auditoria_ampliada*, 003_turma_protecao*)  *opcionais
│   └── seeds.sql    (somente dados de exemplo para ambiente de teste, nunca produção)
├── docs/ modelo-relacional.md, supabase.md, auditoria-fase1.md
├── tests/ unit/ e2e/
├── .env.example  .gitignore  next.config.ts  package.json  tsconfig.json  README.md
```

## 4. Mapa de migração módulo a módulo

| Original | Rota Next.js | Tipo | Observações |
|---|---|---|---|
| `login.html` + `auth.js` | `/login` | Server Actions | Login, recuperação por e-mail, nova senha; perfil inativo é deslogado |
| `dashboard.js` | `/dashboard` | Server Component | Mantém os 3 indicadores; **acrescenta** total de alunos, professores e turmas (contagens sob RLS) |
| `calendario.js` | `/calendario` | Server + Client | Une `eventos` e `atividades`; mesmos modos e categorias; filtros na URL |
| `atividades.js` | `/atividades` | Server + Actions | Regras de vínculo do professor mantidas (e conferidas pelo RLS) |
| `recuperacoes.js` | `/recuperacoes` | Server + Actions | Concluída exige nota (Zod + CHECK do banco) |
| `avisos.js` | `/avisos` | Server + Actions | Público/turma/validade |
| `anotacoes.js` | `/anotacoes` | Server + Actions | Privada + compartilhar com a Direção |
| `alunos.js` | `/alunos` | Server + Actions | Usa a RPC `salvar_aluno`; "criar acesso" chama `/api/usuarios` |
| `turmas.js` | `/turmas` | Server + Actions | 4 abas; professor vê "Minhas turmas" |
| `relatorios.js` | `/relatorios` | Server + Client (export) | Mantém 6 relatórios; **acrescenta filtro por professor**; PDF e Excel |
| `usuarios.js` | `/usuarios` | Server + Actions | Direção; auditoria paginada |
| Edge Function | `POST /api/usuarios` | Route Handler | Mesmas regras (Direção cria todos; Secretaria só aluno); valida e-mail do aluno contra `alunos.email`; rollback se falhar |

## 5. Permissões em três camadas

1. **Banco (RLS)**: autoridade final, inalterada.
2. **Servidor**: cada Action/Handler chama `exigirPapel([...])` antes de gravar, e valida entrada com Zod. Nunca confia em papel enviado pelo navegador; o papel vem de `perfis` pela sessão.
3. **Interface**: `lib/permissions` esconde menus e botões (só conforto).

Rotas protegidas pelo middleware e pelo `layout` do grupo `(dashboard)`. Acesso a rota sem permissão leva ao `/dashboard` com aviso, como hoje.

## 6. Estratégia de banco

- **Nenhuma tabela é recriada, nenhum dado é apagado.** Os 3 SQL originais seguem como referência.
- `docs/modelo-relacional.md`: diagrama (Mermaid) e dicionário de dados gerados da Fase 1.
- **Migrações versionadas** (`database/migrations/NNN_nome.sql` + `NNN_nome_down.sql`), idempotentes e reversíveis:
  - `002_auditoria_ampliada` (opcional): aplica `tg_auditoria` a eventos, atividades, avisos, turmas, séries, disciplinas; faz a Edge/Route registrar o chamador.
  - `003_turma_protecao` (opcional): troca cascata por `restrict` onde há dados.
- Antes de aplicar qualquer migração: backup (`pg_dump`) e execução primeiro em um projeto Supabase de teste.

## 7. Plano de testes

- **Banco**: `testes_permissoes.sql` (61 testes), executado por você no SQL Editor; novos testes para cada migração.
- **Unitários (vitest)**: schemas Zod, matriz de permissões, utilitários de data, geração das linhas dos relatórios.
- **Integração**: Route Handler `/api/usuarios` (papéis, rollback) com Supabase mockado.
- **E2E (Playwright)**: login válido/inválido, logout, recuperação de senha, sessão expirada, rota privada sem login, um fluxo por perfil, acesso direto às APIs sem permissão. Roda contra um projeto Supabase de teste, nunca produção.
- **Qualidade**: `tsc --noEmit`, ESLint, `next build` sem erros.

## 8. Implantação e configuração

- `.env.example` com as 3 variáveis do roteiro (sem valores). `SUPABASE_SERVICE_ROLE_KEY` só no servidor da Vercel, sem prefixo `NEXT_PUBLIC_`.
- Vercel: build padrão do Next, Route Handlers serverless, `revalidate` apenas em dados de referência (séries, disciplinas); dados protegidos sempre dinâmicos.
- Supabase: documentar Site URL e Redirect URLs (`/auth/callback`), cadastro livre desligado, senha mínima 8, SMTP.
- README completo (instalação, variáveis, build, deploy, domínio, atualização, backup e recuperação).

## 9. Cronograma por fases

| Fase | Entrega | Critério de aceite |
|---|---|---|
| 3 Preparação | Projeto Next + TS + Tailwind + tema azul + clientes Supabase + `.env.example` | `next build` passa; página de login renderiza |
| 4 Autenticação | Login, logout, recuperação, middleware, layout e menu por perfil | Rotas privadas bloqueadas; sessão em cookie |
| 5 Módulos | Ordem: turmas/séries/disciplinas → alunos → atividades → calendário/eventos → recuperações → avisos → anotações → relatórios → usuários → painel | Cada módulo com CRUD real, sem dados fictícios, sem TODO |
| 6 Segurança | Revisão de RLS, handlers, cabeçalhos, segredos | Sem service role no bundle do cliente (verificado no build) |
| 7 Testes | Unit, integração, e2e, build | Tudo verde |
| 8 Implantação | Repositório GitHub + Vercel | Preciso das suas contas conectadas |
| 9 Entrega | Documentação e checklist | Roteiro manual do README original passa |

## 10. Pendências que dependem de você

1. **Chave anon/publishable** (pública) para a Fase 3 poder rodar contra o seu projeto.
2. **Segurança da senha do banco**: não cole a senha do Postgres aqui. O projeto não precisa dela (o app usa a API com chave anon e service role). Se algum dia precisar de conexão direta, use uma senha provisória e troque depois. Observação: se você já colou a senha real em algum lugar, redefina-a em *Project Settings → Database*.
3. Confirmar ou corrigir as 6 premissas da seção 0.
4. Conectar GitHub e Vercel na Fase 8.
