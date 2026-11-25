# Agenda Escolar CEEMTI Baixo Guandu — Fase 1: Auditoria

Base analisada: `agenda-ceemti.zip` (23 arquivos, ~4.300 linhas). Nada foi alterado. Todo o conteúdo foi lido: 3 HTML, 2 CSS, 13 JS, 3 SQL, 1 Edge Function, README.

## 1. Resumo

- O sistema atual é um **SPA estático** (HTML + JavaScript puro) que fala **direto com o Supabase** pelo navegador (`supabase-js` 2.45.4 via CDN). Não há servidor próprio.
- **Toda a autorização está no banco (RLS)**, e é bem feita: 14 tabelas com RLS, funções `SECURITY DEFINER` para evitar recursão, 61 testes automáticos de permissão (conferi: 61 chamadas `ok()`).
- O único código de servidor é a **Edge Function `criar-usuario`**, que usa a service role para criar logins.
- **4 perfis reais**: `direcao`, `secretaria`, `professor`, `aluno`. O roteiro fala só em Administrador e Professor; "Administrador" corresponde a `direcao`.
- Migrar para Next.js é viável sem mexer no banco. As lacunas em relação ao roteiro estão na seção 8.

## 2. Inventário de arquivos

| Arquivo | Linhas | Função |
|---|---|---|
| `index.html` | 40 | Entrada; redireciona se já houver sessão |
| `login.html` | 100 | Login, "esqueci a senha", nova senha |
| `dashboard.html` | 75 | Casca do sistema (menu lateral + área de conteúdo) |
| `css/style.css`, `responsivo.css` | 339 / 72 | Identidade visual (azul), responsividade |
| `js/supabase.js` | 50 | Config + cliente Supabase |
| `js/auth.js` | 185 | Login, sessão, recuperação de senha |
| `js/app.js` | 563 | Núcleo: menu por perfil, rotas por hash, modal, formulários, tabelas, toast, inatividade |
| `js/dashboard.js` | 124 | Painel inicial |
| `js/calendario.js` | 252 | Calendário mês/semana/dia (eventos + atividades) |
| `js/atividades.js` | 165 | Provas e trabalhos |
| `js/recuperacoes.js` | 185 | Recuperação escolar |
| `js/avisos.js` | 101 | Mural de avisos |
| `js/anotacoes.js` | 107 | Anotações privadas/compartilhadas |
| `js/alunos.js` | 170 | Alunos, matrículas, criação de acesso |
| `js/turmas.js` | 202 | Turmas, séries, disciplinas, vínculos professor×turma×disciplina |
| `js/relatorios.js` | 213 | 6 relatórios, PDF e Excel |
| `js/usuarios.js` | 157 | Usuários e registro de alterações (Direção) |
| `database/schema.sql` | 279 | Tabelas, checks, índices, triggers |
| `database/policies.sql` | 381 | Funções auxiliares, RLS, grants, views, RPC |
| `database/testes_permissoes.sql` | 214 | 61 testes (transação com ROLLBACK) |
| `supabase/functions/criar-usuario/index.ts` | 100 | Edge Function (Deno) |

## 3. Banco de dados

### 3.1 Tabelas (14) e relacionamentos

| Tabela | PK | Chaves estrangeiras (ação ao excluir) | Regras notáveis |
|---|---|---|---|
| `perfis` | `id` | `auth.users(id)` (cascade) | `papel` ∈ direcao/secretaria/professor/aluno; `nome` ≥ 3 caracteres; e-mail único (case-insensitive) |
| `professores` | `perfil_id` | `perfis` (cascade) | registro funcional, área |
| `series` | `id` | — | `nome` único |
| `disciplinas` | `id` | — | `nome` único |
| `turmas` | `id` | `series` (restrict) | turno ∈ integral/matutino/vespertino/noturno; único (nome, ano_letivo) |
| `professor_turmas` | `id` | `professores` (cascade), `turmas` (cascade), `disciplinas` (restrict) | único (professor, turma, disciplina) |
| `alunos` | `id` | `perfis` (set null), `perfil_id` único | `matricula` única; e-mail validado por regex |
| `matriculas` | `id` | `alunos` (cascade), `turmas` (restrict) | situação ∈ ativa/transferida/trancada/concluida/cancelada; único (aluno, ano) |
| `eventos` | `id` | `turmas` (cascade), `disciplinas` (set null), `professores` (set null), `perfis` (set null) | 11 categorias; `turma_id` nulo = toda a escola |
| `atividades` | `id` | `disciplinas` (restrict), `turmas` (cascade), `professores` (set null), `perfis` (set null) | tipo prova/trabalho; prova exige `data_realizacao`, trabalho exige `prazo_entrega` |
| `recuperacoes` | `id` | `alunos` (cascade), `turmas` (restrict), `disciplinas` (restrict), `professores` (set null) | notas 0–10; **concluída exige nota da recuperação** |
| `anotacoes` | `id` | `perfis` (cascade), `turmas` (set null), `disciplinas` (set null) | tipo administrativa/pedagógica/lembrete; flag `compartilhada` |
| `avisos` | `id` | `turmas` (cascade), `perfis` (set null) | público todos/professores/alunos/turma; público "turma" exige `turma_id`; validade ≥ publicação |
| `auditoria` | `id` identity | — | só gravada por trigger |

### 3.2 Funções, triggers, views, índices

- **Funções SQL (11)**: `papel_atual`, `eh_direcao`, `eh_secretaria`, `eh_gestao`, `eh_professor`, `eh_aluno`, `turmas_do_professor`, `professor_leciona`, `aluno_id_atual`, `turmas_do_aluno`, `aluno_visivel_ao_professor`. Todas `SECURITY DEFINER` com `search_path = public`.
- **RPC**: `salvar_aluno(...)` (SECURITY INVOKER, atômica: aluno + matrícula, só gestão).
- **Triggers**: `atualizado_em` (7 tabelas); `data_fim := data` em eventos; proteção contra a Direção se rebaixar ou desativar; `tg_auditoria` em 5 tabelas (`perfis`, `alunos`, `matriculas`, `recuperacoes`, `professor_turmas`).
- **Views**: `v_professores` (id + nome de professores ativos, visível a qualquer usuário ativo); `provas` e `trabalhos` (`security_invoker`, **não usadas pelo frontend**).
- **Índices**: 14 criados explicitamente (13 secundários + 1 único por e-mail em `perfis`), mais os únicos implícitos das constraints.

### 3.3 Políticas RLS por tabela (resumo)

| Tabela | Direção | Secretaria | Professor | Aluno |
|---|---|---|---|---|
| perfis | lê/edita todos | lê todos | só o próprio | só o próprio |
| professores | tudo | lê | lê o próprio | — |
| series/disciplinas/turmas | tudo | tudo | lê | lê |
| professor_turmas | tudo | tudo | lê os seus | lê os da sua turma |
| alunos | tudo (exclui) | cria/edita (não exclui) | lê alunos das suas turmas | lê o próprio |
| matriculas | tudo (exclui) | cria/edita | lê das suas turmas | lê as próprias |
| eventos | tudo | tudo | lê (escola + suas turmas) | lê (escola + sua turma) |
| atividades | tudo | tudo | cria/edita/exclui as suas, só onde leciona | lê da sua turma |
| recuperacoes | tudo | **só lê** | cria/edita onde leciona; exclui as suas | lê as próprias |
| anotacoes | lê as próprias + as **compartilhadas** | próprias | próprias | sem acesso |
| avisos | tudo | tudo | só vigentes do seu público/turma | só vigentes do seu público/turma |
| auditoria | lê | — | — | — |

Anônimo: `revoke all` em tudo.

### 3.4 Edge Function `criar-usuario`

- Valida o JWT de quem chama, confere perfil ativo (direcao ou secretaria) e valida nome, e-mail, senha ≥ 8 e papel.
- Secretaria só cria `aluno`. Aluno exige `aluno_id` existente e ainda sem login.
- Cria o usuário no Auth (e-mail já confirmado), insere em `perfis`, e em `professores` ou vincula `alunos.perfil_id`. Se algo falha, apaga o usuário do Auth (rollback manual).

## 4. Funcionalidades e regras de negócio por módulo

| Módulo (rota) | Perfis | O que faz | Regras principais |
|---|---|---|---|
| Painel | todos | 3 indicadores (provas, trabalhos, alunos em recuperação), próximos compromissos (45 dias), avisos, mini-calendário, atalhos, atividades recentes | Tudo filtrado por RLS: aluno conta só a própria turma |
| Calendário | todos | Mês/semana/dia, filtros por turma e categoria; une `eventos` + `atividades` | Só a gestão cria/edita/exclui eventos. Prova gera item "Prova" e, se houver, "Prazo"; trabalho gera "Trabalho" e, se houver data distinta, "Apresentação" |
| Provas e Trabalhos | todos | CRUD, busca, filtros (tipo, turma, disciplina, período) | Professor só escolhe pares turma+disciplina dos seus vínculos e só edita os seus |
| Recuperação | todos | CRUD, filtros, notas, situação (5 estados) | Direção cadastra; Secretaria só consulta; professor onde leciona; aluno só as suas ("Minha recuperação"). Concluída exige nota |
| Avisos | todos | Mural; gestão publica/edita/exclui | Público: todos, professores, alunos ou turma específica. Agendado e expirado só a gestão vê |
| Anotações | direção, secretaria, professor | CRUD privado, 3 tipos, vínculo opcional a turma/disciplina | Privada do autor; "Compartilhar com a Direção" libera a leitura |
| Alunos | direção, secretaria, professor | CRUD de aluno+matrícula (RPC), filtros por ano/turma/situação, criação do login | Só a Direção exclui (eliminação LGPD, em cascata). Professor só consulta |
| Turmas e Disciplinas | direção, secretaria (professor vê "Minhas turmas") | Abas: turmas, séries, disciplinas, professores e vínculos | Vínculo libera o professor a cadastrar atividades e recuperações |
| Relatórios | direção, secretaria | 6 relatórios (alunos por turma, provas, trabalhos, recuperações, atividades, eventos), exportação PDF e Excel | PDF com aviso de uso restrito (LGPD) |
| Usuários | direção | Criar usuário, ativar/desativar, enviar link de senha, aba de auditoria (300 últimas) | Direção não se rebaixa nem se desativa |

**Autenticação**: login e senha, recuperação por e-mail, tela de nova senha, sessão em `localStorage` (padrão do supabase-js), logout automático após 30 min de inatividade (controlado no navegador), cadastro livre desligado no painel Supabase.

**Identidade visual a preservar**: paleta azul (`#6fb7ea` principal, `#2878bd` botões, `#1d5d93` escuro, fundo `#f3f8fd`), fonte Nunito, cantos arredondados (14 px), logo SVG de calendário, menu lateral que vira gaveta no celular, tabelas que viram cartões no celular.

## 5. Dependências externas

- `@supabase/supabase-js` 2.45.4, `jsPDF` 2.5.1, `jspdf-autotable` 3.8.2, `SheetJS` 0.18.5, tudo via CDN.
- Fonte Nunito referenciada no CSS (sem `@font-face`; cai em Segoe UI/system-ui se não estiver instalada).
- Sem nenhuma dependência de build.

## 6. Pontos fortes que devem ser preservados

1. Autorização no banco, com testes. É a melhor parte do projeto e **não deve ser reescrita**.
2. Escape de HTML (`esc()`) usado de forma consistente em dados vindos do banco.
3. Mensagens de erro do Postgres traduzidas para o usuário.
4. Auditoria sem copiar dados pessoais.
5. Segredo da service role fora do navegador.

## 7. Inconsistências e riscos encontrados (a documentar antes de qualquer correção)

| # | Achado | Gravidade | Observação |
|---|---|---|---|
| 1 | **Chave anon ainda é placeholder** (`COLE_AQUI_A_CHAVE_ANON`); só a URL do projeto está preenchida | Bloqueio | Preciso da chave anon/publishable e do acesso ao projeto para testar contra o banco real (ver seção 9) |
| 2 | Sessão guardada em `localStorage`, não em cookies | Média | O roteiro exige cookies seguros; implica adotar `@supabase/ssr` |
| 3 | Inatividade só no navegador | Baixa | Ao migrar, validar a sessão também no servidor (middleware) |
| 4 | Auditoria cobre só 5 tabelas. Eventos, atividades, avisos, turmas, séries, disciplinas e anotações **não são auditados** | Média | O roteiro pede "registrar operações administrativas". Exige migração nova |
| 5 | Ações feitas pela Edge Function (service role) aparecem na auditoria como "Sistema" (`auth.uid()` nulo) | Média | Não dá para saber quem criou o login. Corrigir na migração registrando o chamador |
| 6 | Excluir turma apaga em cascata eventos, atividades, vínculos e avisos dela (só é barrado se houver matrículas ou recuperações) | Média | Risco de perda de dados por engano. Sugiro confirmação reforçada ou bloqueio |
| 7 | `v_professores` é uma view sem `security_invoker`, então roda como dono e expõe nome e id de todos os professores ativos a qualquer usuário, inclusive alunos | Baixa | Intencional (mostrar "professor responsável"), mas é um alerta clássico do linter do Supabase. Documentar |
| 8 | `salvar_aluno` não confere se o ano da matrícula bate com o ano letivo da turma | Baixa | Regra de negócio possivelmente faltante; **não vou inventar**, vou perguntar |
| 9 | Edge Function: CORS `*`, sem limite de taxa, e a Secretaria pode informar qualquer e-mail/nome ao criar o login de um aluno (o servidor só valida o `aluno_id`) | Baixa/Média | Ao migrar para Route Handler, validar e-mail contra `alunos.email` e restringir origem |
| 10 | Tela de login usa `minlength=6` na senha; o resto do sistema usa 8 | Baixa | Inconsistência de validação |
| 11 | Todas as listas carregam tudo e filtram no navegador; **sem paginação** | Média | O roteiro exige paginação. Para escola de porte médio funciona, mas precisa de paginação no servidor |
| 12 | `SheetJS` 0.18.5 do npm/CDN tem vulnerabilidades conhecidas (prototype pollution e ReDoS) corrigidas só em versões posteriores, que não saem mais no npm | Média | Trocar por `exceljs` ou instalar a versão atual pelo tarball oficial |
| 13 | Os 61 testes SQL inserem direto em `auth.users (id, email)`. Pode falhar se o projeto exigir colunas obrigatórias adicionais do Auth | Baixa | **Não executei os testes** (não tenho acesso ao banco). Verificar na execução |
| 14 | Views `provas` e `trabalhos` existem mas o frontend não as usa | Info | Manter, sem impacto |

## 8. Lacunas entre o sistema atual e o roteiro (itens novos, não "migração")

| Pedido do roteiro | Situação no original |
|---|---|
| Relatórios com **filtro por professor** | Não existe (há ano, turma, período, situação) |
| Dashboard com **total de alunos, professores e turmas** | Não existe (hoje: provas, trabalhos, recuperações) |
| **Paginação** nas tabelas | Não existe |
| **Cookies seguros** de sessão e proteção de rotas no servidor | Não existe (SPA com `localStorage`) |
| Perfil Professor "**cria eventos**" | **Conflito:** no original, professor **não** cria eventos (só Direção e Secretaria); ele cria provas e trabalhos, que aparecem no calendário |
| `database/seeds.sql`, `database/migrations/` | Não existem. O README manda rodar `schema.sql` e `policies.sql` e criar a primeira Direção por SQL manual |
| Tela separada de "Eventos" e "Professores" | Hoje eventos ficam dentro do **Calendário** e professores dentro de **Turmas e Disciplinas**; o roteiro diz para ajustar conforme as funcionalidades reais |
| "Cadastro de alunos" pelo Administrador | Original: Direção **e** Secretaria cadastram; Secretaria cria só login de aluno |

## 9. O que eu **não** consigo fazer deste ambiente

- **Não tenho acesso ao seu projeto Supabase**, então não consigo rodar os testes SQL, validar RLS ao vivo nem testar login real. Isso depende da chave anon e de você (ou de um conector) executar os scripts.
- **Não tenho credenciais do GitHub nem da Vercel**; consigo preparar o repositório e a configuração, mas o push e o deploy exigem que você conecte as contas.
- Posso construir, tipar, lintar e gerar o build de produção aqui, e escrever testes automatizados. Testes ponta a ponta contra o Supabase real ficam com você ou após receber acesso.

## 10. Proposta de arquitetura (insumo para a Fase 2)

- **Next.js 15 (App Router) + TypeScript + Tailwind**, com as cores e tokens do `style.css` portados para o tema do Tailwind.
- **`@supabase/ssr`**: cliente de navegador, cliente de servidor e `middleware.ts` renovando a sessão por cookie. Rotas privadas protegidas no servidor.
- **Leitura e gravação comuns**: continuam via Supabase com a sessão do usuário, **mantendo o RLS como autoridade**. O servidor valida (Zod) e o banco autoriza.
- **Route Handlers com service role só onde for indispensável**: criação de usuário (substitui a Edge Function) e relatórios/exportações pesadas. Antes de usar a service role, o handler confere perfil e papel de quem chama.
- **Rotas**: seguem as 10 áreas do original; `eventos` e `professores` entram como subseções de Calendário e Turmas, salvo decisão contrária.
- **Banco**: nenhuma alteração obrigatória para funcionar. Alterações opcionais viram migrações versionadas em `database/migrations/` (ex.: ampliar auditoria, corrigir "Sistema" na auditoria).

## 11. Decisões que preciso de você antes da Fase 2

1. **Chave anon/publishable** do projeto e se posso contar com você para rodar os SQLs e os testes no Supabase.
2. **Professor cria eventos?** O roteiro diz que sim; o original, não. Manter o original (recomendo) ou ampliar a permissão (exige mudar RLS)?
3. **Auditoria**: posso criar migração para auditar também eventos, atividades, avisos, turmas e disciplinas, e registrar quem criou os logins?
4. **Excluir turma**: bloquear quando houver atividades/eventos vinculados, ou manter o comportamento atual com confirmação reforçada?
5. **Edge Function**: substituir por Route Handler do Next.js (como o roteiro pede) e, depois da validação, desativar a função antiga?
6. **Regra do ano da matrícula** (achado 8): o ano da matrícula deve ser obrigatoriamente igual ao ano da turma?
