-- =====================================================================
-- AGENDA ESCOLAR CEEMTI BAIXO GUANDU — ESTRUTURA DO BANCO (schema.sql)
-- Execute PRIMEIRO este arquivo e, depois, o policies.sql.
-- Supabase > SQL Editor > New query > cole o conteúdo > Run.
-- O script pode ser executado novamente com segurança (idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Funções de gatilho (triggers)
-- ---------------------------------------------------------------------

-- Atualiza automaticamente a coluna atualizado_em.
create or replace function public.tg_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. PERFIS (um registro por usuário do Supabase Auth)
--    O papel define o que a pessoa pode fazer. Só a Direção altera.
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null check (char_length(btrim(nome)) >= 3),
  email          text not null,
  papel          text not null check (papel in ('direcao','secretaria','professor','aluno')),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create unique index if not exists perfis_email_uk on public.perfis (lower(email));

-- ---------------------------------------------------------------------
-- 2. PROFESSORES (dados complementares dos perfis com papel 'professor')
-- ---------------------------------------------------------------------
create table if not exists public.professores (
  perfil_id          uuid primary key references public.perfis(id) on delete cascade,
  registro_funcional text,
  area               text,
  criado_em          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. SÉRIES, DISCIPLINAS E TURMAS
-- ---------------------------------------------------------------------
create table if not exists public.series (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null check (char_length(btrim(nome)) >= 1) unique,
  ordem int  not null default 0
);

create table if not exists public.disciplinas (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null check (char_length(btrim(nome)) >= 2) unique,
  codigo text
);

create table if not exists public.turmas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(btrim(nome)) >= 1),
  serie_id    uuid not null references public.series(id) on delete restrict,
  turno       text not null default 'integral'
              check (turno in ('integral','matutino','vespertino','noturno')),
  ano_letivo  int  not null check (ano_letivo between 2000 and 2100),
  criado_em   timestamptz not null default now(),
  unique (nome, ano_letivo)
);
create index if not exists turmas_serie_idx on public.turmas(serie_id);

-- Vínculo: qual professor leciona qual disciplina em qual turma.
create table if not exists public.professor_turmas (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.professores(perfil_id) on delete cascade,
  turma_id      uuid not null references public.turmas(id) on delete cascade,
  disciplina_id uuid not null references public.disciplinas(id) on delete restrict,
  unique (professor_id, turma_id, disciplina_id)
);
create index if not exists pt_turma_idx on public.professor_turmas(turma_id);
create index if not exists pt_disc_idx  on public.professor_turmas(disciplina_id);

-- ---------------------------------------------------------------------
-- 4. ALUNOS E MATRÍCULAS
--    alunos.perfil_id liga o aluno ao seu login (criado depois, se houver).
-- ---------------------------------------------------------------------
create table if not exists public.alunos (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid unique references public.perfis(id) on delete set null,
  nome           text not null check (char_length(btrim(nome)) >= 3),
  matricula      text not null check (char_length(btrim(matricula)) >= 1) unique,
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists alunos_nome_idx on public.alunos (lower(nome));

create table if not exists public.matriculas (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.alunos(id) on delete cascade,
  turma_id    uuid not null references public.turmas(id) on delete restrict,
  ano_letivo  int  not null check (ano_letivo between 2000 and 2100),
  situacao    text not null default 'ativa'
              check (situacao in ('ativa','transferida','trancada','concluida','cancelada')),
  criado_em   timestamptz not null default now(),
  unique (aluno_id, ano_letivo)
);
create index if not exists matriculas_turma_idx on public.matriculas(turma_id);

-- ---------------------------------------------------------------------
-- 5. EVENTOS DO CALENDÁRIO ESCOLAR
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(btrim(titulo)) >= 3),
  descricao     text,
  categoria     text not null check (categoria in (
                  'prova','trabalho','seminario','apresentacao','reuniao_pedagogica',
                  'conselho_classe','evento_escolar','feriado','recesso',
                  'data_comemorativa','prazo_entrega')),
  data          date not null,
  data_fim      date,                          -- preenchida automaticamente (= data)
  hora          time,
  turma_id      uuid references public.turmas(id) on delete cascade,        -- nulo = toda a escola
  disciplina_id uuid references public.disciplinas(id) on delete set null,
  professor_id  uuid references public.professores(perfil_id) on delete set null,
  criado_por    uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists eventos_data_idx  on public.eventos(data, data_fim);
create index if not exists eventos_turma_idx on public.eventos(turma_id);

create or replace function public.tg_eventos_data_fim()
returns trigger language plpgsql as $$
begin
  new.data_fim := coalesce(new.data_fim, new.data);
  if new.data_fim < new.data then
    raise exception 'A data final não pode ser anterior à data inicial.' using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. PROVAS E TRABALHOS (tabela única "atividades"; veja as views provas/trabalhos)
-- ---------------------------------------------------------------------
create table if not exists public.atividades (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('prova','trabalho')),
  titulo          text not null check (char_length(btrim(titulo)) >= 3),
  disciplina_id   uuid not null references public.disciplinas(id) on delete restrict,
  turma_id        uuid not null references public.turmas(id) on delete cascade,
  professor_id    uuid references public.professores(perfil_id) on delete set null,
  data_realizacao date,
  prazo_entrega   date,
  orientacoes     text,
  criado_por      uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- Prova precisa de data de realização; trabalho precisa de prazo de entrega.
  constraint atividades_datas_ck check (
    (tipo = 'prova'    and data_realizacao is not null) or
    (tipo = 'trabalho' and prazo_entrega   is not null)
  )
);
create index if not exists atividades_turma_idx on public.atividades(turma_id);
create index if not exists atividades_datas_idx on public.atividades(data_realizacao, prazo_entrega);

-- ---------------------------------------------------------------------
-- 7. RECUPERAÇÕES (dados individuais e privados do aluno)
-- ---------------------------------------------------------------------
create table if not exists public.recuperacoes (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references public.alunos(id) on delete cascade,
  turma_id         uuid not null references public.turmas(id) on delete restrict,
  disciplina_id    uuid not null references public.disciplinas(id) on delete restrict,
  professor_id     uuid references public.professores(perfil_id) on delete set null,
  nota_anterior    numeric(4,1) check (nota_anterior is null or nota_anterior between 0 and 10),
  nota_recuperacao numeric(4,1) check (nota_recuperacao is null or nota_recuperacao between 0 and 10),
  data_avaliacao   date,
  prazo            date,
  situacao         text not null default 'pendente'
                   check (situacao in ('pendente','em_andamento','avaliacao_realizada',
                                       'aguardando_resultado','concluida')),
  observacoes      text,
  criado_por       uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint rec_concluida_nota_ck check (situacao <> 'concluida' or nota_recuperacao is not null)
);
create index if not exists rec_aluno_idx on public.recuperacoes(aluno_id);
create index if not exists rec_turma_idx on public.recuperacoes(turma_id, disciplina_id);

-- ---------------------------------------------------------------------
-- 8. ANOTAÇÕES (privadas do autor; só vão à Direção se o autor compartilhar)
-- ---------------------------------------------------------------------
create table if not exists public.anotacoes (
  id             uuid primary key default gen_random_uuid(),
  autor_id       uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  tipo           text not null check (tipo in ('administrativa','pedagogica','lembrete')),
  titulo         text not null check (char_length(btrim(titulo)) >= 3),
  conteudo       text not null check (char_length(btrim(conteudo)) >= 1),
  turma_id       uuid references public.turmas(id) on delete set null,
  disciplina_id  uuid references public.disciplinas(id) on delete set null,
  compartilhada  boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists anotacoes_autor_idx on public.anotacoes(autor_id);

-- ---------------------------------------------------------------------
-- 9. AVISOS
-- ---------------------------------------------------------------------
create table if not exists public.avisos (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (char_length(btrim(titulo)) >= 3),
  conteudo         text not null check (char_length(btrim(conteudo)) >= 1),
  publico          text not null default 'todos'
                   check (publico in ('todos','professores','alunos','turma')),
  turma_id         uuid references public.turmas(id) on delete cascade,
  data_publicacao  date not null default current_date,
  validade         date,
  autor_id         uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint avisos_turma_ck check ((publico = 'turma') = (turma_id is not null)),
  constraint avisos_validade_ck check (validade is null or validade >= data_publicacao)
);

-- ---------------------------------------------------------------------
-- 10. AUDITORIA (LGPD: quem alterou o quê e quando — sem copiar dados pessoais)
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registro_id text,
  acao        text not null,
  usuario_id  uuid,
  em          timestamptz not null default now()
);
create index if not exists auditoria_em_idx on public.auditoria(em desc);

create or replace function public.tg_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg jsonb;
begin
  v_reg := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into public.auditoria(tabela, registro_id, acao, usuario_id)
  values (tg_table_name, v_reg->>'id', tg_op, auth.uid());
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Triggers (recriados para o script ser repetível)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- atualizado_em
  foreach t in array array['perfis','alunos','eventos','atividades','recuperacoes','anotacoes','avisos'] loop
    execute format('drop trigger if exists tg_%1$s_atualizado on public.%1$s', t);
    execute format('create trigger tg_%1$s_atualizado before update on public.%1$s
                    for each row execute function public.tg_atualizado_em()', t);
  end loop;

  -- auditoria
  foreach t in array array['perfis','alunos','matriculas','recuperacoes','professor_turmas'] loop
    execute format('drop trigger if exists tg_%1$s_auditoria on public.%1$s', t);
    execute format('create trigger tg_%1$s_auditoria after insert or update or delete on public.%1$s
                    for each row execute function public.tg_auditoria()', t);
  end loop;
end $$;

drop trigger if exists tg_eventos_data_fim on public.eventos;
create trigger tg_eventos_data_fim before insert or update on public.eventos
  for each row execute function public.tg_eventos_data_fim();
