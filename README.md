# Agenda Escolar CEEMTI Baixo Guandu

Migração do sistema original (HTML + JavaScript puro + Supabase) para **Next.js + React + TypeScript**, hospedagem na **Vercel**, banco e autenticação no **Supabase**.

> **Estado atual: Fases 1 a 5 concluídas** (auditoria, planejamento, preparação, autenticação e migração de todos os módulos: painel, calendário, provas e trabalhos, recuperação, avisos, anotações, alunos, turmas, relatórios PDF/Excel e usuários). Pendentes: validação contra o seu Supabase real (suíte de testes SQL), revisão de segurança final, testes E2E e deploy (Fases 6 a 9).

## O que já funciona
- Login, logout, recuperação e redefinição de senha (Supabase Auth, sessão em cookies seguros).
- Proteção de rotas privadas no servidor (middleware + layout) e bloqueio de perfis inativos.
- Encerramento da sessão por inatividade (30 min).
- Menu lateral responsivo por perfil, identidade visual azul do sistema original.
- Cabeçalhos de segurança (X-Frame-Options, HSTS, etc.).

## Instalação local
```bash
npm install
cp .env.example .env.local   # preencha os 3 valores
npm run dev                  # http://localhost:3000
```

| Variável | Onde usar | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador e servidor | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador e servidor | chave anon/publishable (pública; o RLS protege os dados) |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** | nunca com prefixo `NEXT_PUBLIC_`; usada só na criação de usuários (`/api/usuarios` e acesso de aluno) |

## Supabase (projeto existente)
1. O banco **já existe**; não execute `schema.sql` em produção. Os arquivos em `database/` são a referência original (`schema.sql`, `policies.sql`, `testes_permissoes.sql`).
2. **Authentication → URL Configuration**: *Site URL* = endereço do site; *Redirect URLs* = `https://SEU-ENDERECO/auth/callback` e `http://localhost:3000/auth/callback`.
3. Cadastro livre desligado; senha mínima 8 caracteres; SMTP configurado para e-mails de recuperação.
4. Rode `database/testes_permissoes.sql` no SQL Editor para conferir as 61 regras de permissão (termina em ROLLBACK).

## Verificações
```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Estrutura
Veja `docs/planejamento-fase2.md` (arquitetura) e `docs/modelo-relacional.md` (banco).

## Implantação na Vercel
Importe o repositório do GitHub, cadastre as 3 variáveis em *Settings → Environment Variables* e faça o deploy. Sem build customizado. (Detalhes completos na Fase 8.)

## Limitações conhecidas
- `npm audit` aponta o `postcss` embutido no Next 15 (usado só em tempo de build, sobre o CSS do próprio projeto). A correção exige Next 16; atualização planejada antes da entrega.
- Não foi testado contra o Supabase real (sem chaves no ambiente de desenvolvimento).

## Relatórios
`/relatorios` (Direção e Secretaria) gera 6 relatórios com filtros por ano, turma, professor, período e situação. A exportação roda no servidor em `GET /api/relatorios?formato=pdf|xlsx` (jsPDF + AutoTable e ExcelJS, sem bibliotecas por CDN). Células do Excel que começam com `=`, `+`, `-` ou `@` são neutralizadas contra injeção de fórmula.

## Observações de segurança de dependências
- `npm audit` aponta o PostCSS embutido no Next 15 (usado apenas em tempo de build, não recebe entrada de usuários). A correção exige Next 16; avaliar na Fase 6.
- O `uuid` do ExcelJS é forçado para ^11 via `overrides` em `package.json`.

## Diferenças conhecidas em relação ao sistema original
- Provas e trabalhos são listados do mais recente para o mais antigo (o original mostrava os próximos primeiro).
- A matrícula é ordenada como texto.
- O e-mail do login de aluno precisa ser igual ao e-mail cadastrado no aluno.

## Docker
Arquivos: `Dockerfile` (3 estágios, saída `standalone`, usuário sem privilégios, healthcheck em `/api/saude`), `docker-compose.yml` (produção/homologação), `docker-compose.dev.yml` (desenvolvimento com recarga), `.dockerignore`.

```bash
cp .env.example .env          # preencha URL, chave publishable e service role
docker compose up -d --build  # app em http://localhost:3000 (porta configurável por PORTA)
docker compose logs -f app
docker compose down
```
- As variáveis `NEXT_PUBLIC_*` são embutidas no build (por isso são *build args*); troque-as refazendo o build.
- `SUPABASE_SERVICE_ROLE_KEY` só existe em tempo de execução e nunca entra na imagem.
- O banco continua sendo o Supabase (nuvem), preservando os dados e as políticas RLS existentes. Para um Supabase 100% local, use a Supabase CLI (`supabase start`) e aponte as 3 variáveis para ele.
- Em produção, coloque um proxy HTTPS (Caddy, Nginx ou Traefik) na frente e defina `NEXT_PUBLIC_SITE_URL` com a URL pública.

## Alunos por planilha e horário de aulas

**Importar alunos (Alunos → Importar planilha; Direção e Secretaria).** Planilha `.xlsx` com colunas *Matrícula* e *Nome* (e, opcionalmente, *Turma*; modelo em `/api/alunos/modelo`). Para cada aluno o sistema cadastra o aluno + matrícula, cria o login (**login = matrícula**, internamente `matrícula@aluno.ceemti.example.com`) com **senha provisória aleatória** e baixa um PDF com os acessos. As senhas não ficam gravadas: só existem nesse PDF. No primeiro acesso o aluno é obrigado a criar uma senha própria (`/trocar-senha`). Linhas inválidas, matrículas repetidas ou alunos que já têm acesso são ignorados e listados no resumo. O PDF contém credenciais: entregue cada linha somente ao próprio aluno.

**Horário de aulas no Calendário.** Migrações (rodar no SQL Editor, nesta ordem; nada existente é alterado):
1. `database/migrations/002_horarios.sql` — tabelas `horario_turmas` e `horarios` + RLS (aluno só vê a própria turma; só Direção grava). Para desfazer: `002_horarios_reverter.sql`.
2. `database/migrations/003_horarios_dados.sql` — dados do horário oficial de 02/03/2026, gerados de `scripts/horario-oficial-2026-03-02.docx` por `python3 -I scripts/gerar_horarios.py <docx> <AAAA-MM-DD>` (cada célula guarda o texto original).

Depois, a Direção usa **Calendário → Vincular turmas do horário** para ligar cada código do horário (ex.: `1ªI01-EMI ANC`) à turma cadastrada (vínculos automáticos quando os nomes são iguais). Aluno vê o horário da própria turma; Direção/Secretaria/Professor escolhem a turma no filtro. Dias com feriado/recesso cadastrado aparecem sem aulas. Premissas: as 5 tabelas do documento = segunda a sexta; término da 9ª aula (17h00) estimado pela duração de 50 min.

## Coordenação: gerador de horário

Perfil novo **Coordenação** (criado pela Direção em Usuários): gerencia o horário e vê só Painel, Calendário e **Horário de aulas** (a Direção também acessa).
Migração (depois de 002): `database/migrations/004_coordenador_gerador.sql` (reverter: `004_coordenador_gerador_reverter.sql`). Ela altera a regra de papéis em `perfis`, cria o papel `coordenador`, tabelas de salas/aulas por turma/restrições e as funções atômicas `substituir_horario` e `trocar_aulas`.

Fluxo em **Horário de aulas → Aulas, salas e restrições**: (1) turmas do horário e a sala de cada uma; (2) salas livres; (3) disciplinas, professor e aulas por semana de cada turma; (4) quando o professor **não** pode (ex.: só trabalha à tarde na segunda = 1ª a 5ª aula); (5) **Gerar horário** (segunda a sexta, 1ª–7ª; 8ª/9ª eletivas e clube não são geradas; 40 tentativas, fica com a que encaixa mais aulas).
Em **Grade e conflitos**, qualquer aula pode ser editada. O sistema detecta professor fora da disponibilidade, professor em duas turmas ao mesmo tempo e sala dupla (quadra/biblioteca/salão não contam) e, em **Resolver**, oferece mover a aula para um horário livre da turma ou trocar com outra aula, sempre validando restrições; o servidor revalida a solução antes de aplicar. Aulas que não couberam aparecem em “Aulas sem horário”.

## Página pública do horário

**Agenda aberta** (`/agenda`, sem login, só leitura): avisos válidos para todos/alunos/turma e, mês a mês, provas, trabalhos, eventos, feriados e recessos, com filtro “Minha turma”. Ficam de fora reuniões pedagógicas, conselhos de classe, avisos só para professores, recuperações, anotações e qualquer dado de aluno. Lê no servidor com a service role e só os campos de calendário (`src/services/agenda-publica.ts`; regras em `src/lib/utils/agenda-publica.ts`, testadas). Para fechar a página, remova `"/agenda"` de `ROTAS_PUBLICAS` em `src/lib/supabase/middleware.ts`.

A página inicial (`/`) é o horário público, sem login, com o botão **Entrar** no menu (logado, vira **Painel**). Mostra um dia com todas as turmas nas colunas e as aulas nas linhas, cabendo numa tela de notebook; ao escolher “Minha turma”, mostra a semana da turma (dias nas colunas). “Semana toda” + Imprimir gera uma folha A4 horizontal por dia. O endereço antigo `/horario-publico` redireciona para `/`. Os dados vêm do servidor com a service role, cache de 5 min, e só saem turma, dia, aula, horário, matéria, professor e sala — nunca alunos, e-mails ou ids. Requer as migrações 002/003. Código: `src/components/horario/PaginaPublica.tsx` e `QuadroDia.tsx`.

## Diagnóstico de lentidão

1. `powershell -ExecutionPolicy Bypass -File .\scripts\medir-latencia.ps1` — tempo até o Supabase (da 2ª medida em diante, o normal para São Paulo é < 60 ms).
2. Ligue os tempos por consulta: no `.env` ponha `DEBUG_TEMPOS=1`, rode `docker compose up -d` e `docker compose logs -f`; cada página imprime `[tempo] ...`. Desligue depois (`DEBUG_TEMPOS=0`).
3. Já aplicado: tela de carregamento imediata nas abas, consultas em paralelo, verificação local do login, horário só baixado quando usado, IPv4 primeiro no contêiner.

## Anexar horário e disponibilidade do professor

Migração: `database/migrations/005_horario_arquivos_disponibilidade.sql` (rode depois da 004; reverter: `..._reverter.sql`). Cria o bucket privado `horarios`, a tabela `horario_arquivos` e a função `definir_disponibilidade`. `database/setup_completo.sql` já inclui tudo, na ordem.

- **Horário de aulas → Anexar PDF ou planilha** (Direção e Coordenação). *Planilha .xlsx* (modelo em `/api/horario/modelo`; colunas Turma, Dia, Aula, Matéria, Professor, Sala) é importada para a grade da data de vigência escolhida; turmas novas são criadas; linhas inválidas são listadas. *PDF* é guardado e aparece para download na página pública. O PDF não é lido para montar a grade: não há como extrair um quadro de horários de PDF com segurança.
- **Criar horário** (aba): 1 turmas e salas, 2 salas livres, 3 matérias/professor/aulas por semana, 4 disponibilidade dos professores, depois **Gerar horário**. Em *Definir disponibilidade* marque os dias e a faixa de aulas. Exemplo: Charles só após as 13h e de segunda a quinta → marque Seg–Qui, “a partir da 6ª aula (13h20)”. O sistema transforma isso em restrições e o gerador e o detector de conflitos as respeitam.

### Importar a grade atual para o "Criar horário"

Na aba **Criar horário**, o botão **Importar da grade atual** preenche os passos 2 e 3 a partir de uma versão do horário já gravada
(por exemplo, o horário oficial): matérias de cada turma, professor mais frequente, aulas por semana (1ª a 7ª), sala da turma
(só quando estiver em branco) e a lista de salas. A grade e as restrições dos professores não mudam. Eletivas e clube (8ª/9ª) não entram.
A disponibilidade dos professores (passo 4) continua sendo informada à mão, pois não dá para deduzi-la da grade.

### Criar horário: professores e matérias

Migração **006** (`database/migrations/006_horario_professores.sql`) cria o cadastro de professores do horário. Em **Horário de aulas → Criar horário**:
1. **Professores:** *Adicionar professor* (nome, dias e aulas em que pode dar aula); o lápis edita a disponibilidade.
2. **Turmas e salas.**
3. **Matérias de cada turma:** *Adicionar matéria* (uma ou várias turmas de uma vez, professor, aulas por semana). A lista mostra uma turma por vez.
4. **Gerar o horário.** *Importar da grade atual* preenche os passos 1 a 3 a partir de um horário já gravado.

### Página pública: horário por dia

`/horario-publico` mostra **um dia por vez, com todas as turmas** (linhas) e as aulas (colunas), com abas de segunda a sexta, “Semana toda” e filtro de turma.
**Imprimir** gera A4 na horizontal, uma página por dia (a “Semana toda” sai em 5 páginas) para afixar na escola.
