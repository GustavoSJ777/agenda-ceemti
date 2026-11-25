-- ===================== schema.sql =====================
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

-- ===================== policies.sql =====================
-- =====================================================================
-- AGENDA ESCOLAR CEEMTI BAIXO GUANDU — SEGURANÇA (policies.sql)
-- Execute DEPOIS do schema.sql.
--
-- Toda a autorização é feita AQUI, no banco (Row Level Security).
-- Esconder botões na interface é só conforto: mesmo que alguém altere o
-- JavaScript do navegador, o banco recusa o que o perfil não permite.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES
--    SECURITY DEFINER evita recursão entre políticas. Elas só devolvem
--    informações sobre o PRÓPRIO usuário autenticado (auth.uid()).
-- ---------------------------------------------------------------------
create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo = true
$$;

create or replace function public.eh_direcao()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() = 'direcao', false)
$$;

create or replace function public.eh_secretaria()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() = 'secretaria', false)
$$;

-- Gestão = Direção ou Secretaria
create or replace function public.eh_gestao()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() in ('direcao','secretaria'), false)
$$;

create or replace function public.eh_professor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() = 'professor', false)
$$;

create or replace function public.eh_aluno()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() = 'aluno', false)
$$;

-- Turmas em que o professor logado leciona.
create or replace function public.turmas_do_professor()
returns setof uuid language sql stable security definer set search_path = public as $$
  select pt.turma_id from public.professor_turmas pt
  where pt.professor_id = auth.uid() and public.eh_professor()
$$;

-- O professor logado leciona esta disciplina nesta turma?
create or replace function public.professor_leciona(p_turma uuid, p_disciplina uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_professor() and exists (
    select 1 from public.professor_turmas pt
    where pt.professor_id = auth.uid()
      and pt.turma_id = p_turma and pt.disciplina_id = p_disciplina)
$$;

-- Registro de aluno ligado ao usuário logado.
create or replace function public.aluno_id_atual()
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from public.alunos a where a.perfil_id = auth.uid() and public.eh_aluno()
$$;

-- Turmas em que o aluno logado está matriculado (matrícula ativa).
create or replace function public.turmas_do_aluno()
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.turma_id
  from public.matriculas m
  join public.alunos a on a.id = m.aluno_id
  where a.perfil_id = auth.uid() and m.situacao = 'ativa' and public.eh_aluno()
$$;

-- O aluno informado está em alguma turma do professor logado?
create or replace function public.aluno_visivel_ao_professor(p_aluno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_professor() and exists (
    select 1 from public.matriculas m
    where m.aluno_id = p_aluno
      and m.turma_id in (select public.turmas_do_professor()))
$$;

-- ---------------------------------------------------------------------
-- 2. PERMISSÕES BÁSICAS DE TABELA
--    Visitantes anônimos não acessam nada. Usuários autenticados passam
--    pelas políticas RLS abaixo.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all functions in schema public from public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- A auditoria é gravada somente por gatilho; ninguém altera pelo navegador.
revoke insert, update, delete on public.auditoria from authenticated;
-- Perfis e professores são criados apenas pela função segura (service role).
revoke insert, delete on public.perfis from authenticated;

grant execute on function
  public.papel_atual(), public.eh_direcao(), public.eh_secretaria(), public.eh_gestao(),
  public.eh_professor(), public.eh_aluno(), public.turmas_do_professor(),
  public.professor_leciona(uuid, uuid), public.aluno_id_atual(),
  public.turmas_do_aluno(), public.aluno_visivel_ao_professor(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. ATIVAR RLS EM TODAS AS TABELAS
-- ---------------------------------------------------------------------
alter table public.perfis           enable row level security;
alter table public.professores      enable row level security;
alter table public.series           enable row level security;
alter table public.disciplinas      enable row level security;
alter table public.turmas           enable row level security;
alter table public.professor_turmas enable row level security;
alter table public.alunos           enable row level security;
alter table public.matriculas       enable row level security;
alter table public.eventos          enable row level security;
alter table public.atividades       enable row level security;
alter table public.recuperacoes     enable row level security;
alter table public.anotacoes        enable row level security;
alter table public.avisos           enable row level security;
alter table public.auditoria        enable row level security;

-- Remove políticas antigas (permite reexecutar o arquivo).
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. POLÍTICAS
-- ---------------------------------------------------------------------

-- PERFIS ---------------------------------------------------------------
-- Cada um vê o próprio perfil; Direção e Secretaria veem todos.
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_gestao());
-- Somente a Direção altera perfis (papel, nome, ativo).
create policy perfis_update on public.perfis for update to authenticated
  using (public.eh_direcao()) with check (public.eh_direcao());

-- Impede que a Direção rebaixe/desative a si mesma por engano (evita ficar sem administrador).
create or replace function public.tg_perfis_protege_si_mesmo()
returns trigger language plpgsql as $$
begin
  if old.id = auth.uid() and (new.papel <> old.papel or new.ativo = false) then
    raise exception 'Você não pode alterar o próprio papel nem desativar a própria conta.'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tg_perfis_protege on public.perfis;
create trigger tg_perfis_protege before update on public.perfis
  for each row execute function public.tg_perfis_protege_si_mesmo();

-- Lista de nomes de professores visível a todos os usuários ativos
-- (necessária para mostrar o "professor responsável"; não expõe e-mail).
create or replace view public.v_professores as
  select p.id, p.nome
  from public.perfis p
  join public.professores pr on pr.perfil_id = p.id
  where p.ativo = true and public.papel_atual() is not null;
revoke all on public.v_professores from anon, public;
grant select on public.v_professores to authenticated;

-- PROFESSORES ----------------------------------------------------------
create policy professores_select on public.professores for select to authenticated
  using (public.eh_gestao() or perfil_id = auth.uid());
create policy professores_write on public.professores for all to authenticated
  using (public.eh_direcao()) with check (public.eh_direcao());

-- SÉRIES, DISCIPLINAS, TURMAS -----------------------------------------
-- Leitura: qualquer usuário ativo. Escrita: Direção e Secretaria.
create policy series_select on public.series for select to authenticated
  using (public.papel_atual() is not null);
create policy series_write on public.series for all to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());

create policy disciplinas_select on public.disciplinas for select to authenticated
  using (public.papel_atual() is not null);
create policy disciplinas_write on public.disciplinas for all to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());

create policy turmas_select on public.turmas for select to authenticated
  using (public.papel_atual() is not null);
create policy turmas_write on public.turmas for all to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());

-- PROFESSOR x TURMA x DISCIPLINA --------------------------------------
create policy pt_select on public.professor_turmas for select to authenticated
  using (public.eh_gestao()
         or professor_id = auth.uid()
         or (public.eh_aluno() and turma_id in (select public.turmas_do_aluno())));
create policy pt_write on public.professor_turmas for all to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());

-- ALUNOS ---------------------------------------------------------------
create policy alunos_select on public.alunos for select to authenticated
  using (public.eh_gestao()
         or perfil_id = auth.uid()
         or public.aluno_visivel_ao_professor(id));
create policy alunos_insert on public.alunos for insert to authenticated
  with check (public.eh_gestao());
create policy alunos_update on public.alunos for update to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());
-- Exclusão (direito de eliminação da LGPD): somente Direção.
create policy alunos_delete on public.alunos for delete to authenticated
  using (public.eh_direcao());

-- MATRÍCULAS -----------------------------------------------------------
create policy matriculas_select on public.matriculas for select to authenticated
  using (public.eh_gestao()
         or (public.eh_professor() and turma_id in (select public.turmas_do_professor()))
         or aluno_id = public.aluno_id_atual());
create policy matriculas_insert on public.matriculas for insert to authenticated
  with check (public.eh_gestao());
create policy matriculas_update on public.matriculas for update to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());
create policy matriculas_delete on public.matriculas for delete to authenticated
  using (public.eh_direcao());

-- EVENTOS --------------------------------------------------------------
-- Evento sem turma = toda a escola. Escrita: Direção e Secretaria.
create policy eventos_select on public.eventos for select to authenticated
  using (public.eh_gestao()
         or (public.eh_professor()
             and (turma_id is null or turma_id in (select public.turmas_do_professor())))
         or (public.eh_aluno()
             and (turma_id is null or turma_id in (select public.turmas_do_aluno()))));
create policy eventos_insert on public.eventos for insert to authenticated
  with check (public.eh_gestao());
create policy eventos_update on public.eventos for update to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());
create policy eventos_delete on public.eventos for delete to authenticated
  using (public.eh_gestao());

-- ATIVIDADES (PROVAS E TRABALHOS) -------------------------------------
-- Aluno: só da própria turma. Professor: só das turmas em que leciona.
create policy atividades_select on public.atividades for select to authenticated
  using (public.eh_gestao()
         or (public.eh_professor()
             and (professor_id = auth.uid() or turma_id in (select public.turmas_do_professor())))
         or (public.eh_aluno() and turma_id in (select public.turmas_do_aluno())));
create policy atividades_insert on public.atividades for insert to authenticated
  with check (public.eh_gestao()
              or (public.eh_professor() and professor_id = auth.uid()
                  and public.professor_leciona(turma_id, disciplina_id)));
create policy atividades_update on public.atividades for update to authenticated
  using (public.eh_gestao() or (public.eh_professor() and professor_id = auth.uid()))
  with check (public.eh_gestao()
              or (public.eh_professor() and professor_id = auth.uid()
                  and public.professor_leciona(turma_id, disciplina_id)));
create policy atividades_delete on public.atividades for delete to authenticated
  using (public.eh_gestao() or (public.eh_professor() and professor_id = auth.uid()));

-- RECUPERAÇÕES ---------------------------------------------------------
-- Privadas: Direção/Secretaria (leitura), professor da disciplina/turma,
-- e o próprio aluno (somente leitura do que é dele).
create policy rec_select on public.recuperacoes for select to authenticated
  using (public.eh_gestao()
         or (public.eh_professor()
             and (professor_id = auth.uid() or public.professor_leciona(turma_id, disciplina_id)))
         or (public.eh_aluno() and aluno_id = public.aluno_id_atual()));
create policy rec_insert on public.recuperacoes for insert to authenticated
  with check (public.eh_direcao()
              or (public.eh_professor() and professor_id = auth.uid()
                  and public.professor_leciona(turma_id, disciplina_id)));
create policy rec_update on public.recuperacoes for update to authenticated
  using (public.eh_direcao()
         or (public.eh_professor()
             and (professor_id = auth.uid() or public.professor_leciona(turma_id, disciplina_id))))
  with check (public.eh_direcao()
              or (public.eh_professor() and professor_id = auth.uid()
                  and public.professor_leciona(turma_id, disciplina_id)));
create policy rec_delete on public.recuperacoes for delete to authenticated
  using (public.eh_direcao()
         or (public.eh_professor() and professor_id = auth.uid()));

-- ANOTAÇÕES ------------------------------------------------------------
-- Privadas do autor. A Direção só lê as que o autor marcou como compartilhadas.
-- Alunos nunca têm acesso.
create policy anotacoes_select on public.anotacoes for select to authenticated
  using (autor_id = auth.uid()
         or (public.eh_direcao() and compartilhada = true));
create policy anotacoes_insert on public.anotacoes for insert to authenticated
  with check (autor_id = auth.uid()
              and public.papel_atual() in ('direcao','secretaria','professor'));
create policy anotacoes_update on public.anotacoes for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
create policy anotacoes_delete on public.anotacoes for delete to authenticated
  using (autor_id = auth.uid());

-- AVISOS ---------------------------------------------------------------
-- Direção/Secretaria: veem e gerenciam todos. Demais: só avisos vigentes
-- destinados ao seu público ou à sua turma.
create policy avisos_select on public.avisos for select to authenticated
  using (public.eh_gestao()
         or (data_publicacao <= current_date
             and (validade is null or validade >= current_date)
             and (
               publico = 'todos'
               or (publico = 'professores' and public.eh_professor())
               or (publico = 'alunos'      and public.eh_aluno())
               or (publico = 'turma' and (
                     (public.eh_professor() and turma_id in (select public.turmas_do_professor()))
                  or (public.eh_aluno()     and turma_id in (select public.turmas_do_aluno()))))
             )));
create policy avisos_insert on public.avisos for insert to authenticated
  with check (public.eh_gestao());
create policy avisos_update on public.avisos for update to authenticated
  using (public.eh_gestao()) with check (public.eh_gestao());
create policy avisos_delete on public.avisos for delete to authenticated
  using (public.eh_gestao());

-- AUDITORIA ------------------------------------------------------------
create policy auditoria_select on public.auditoria for select to authenticated
  using (public.eh_direcao());

-- ---------------------------------------------------------------------
-- 5. VIEWS DE CONVENIÊNCIA (respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------
create or replace view public.provas with (security_invoker = true) as
  select * from public.atividades where tipo = 'prova';
create or replace view public.trabalhos with (security_invoker = true) as
  select * from public.atividades where tipo = 'trabalho';
revoke all on public.provas, public.trabalhos from anon, public;
grant select on public.provas, public.trabalhos to authenticated;

-- ---------------------------------------------------------------------
-- 6. FUNÇÃO ATÔMICA PARA CADASTRAR/EDITAR ALUNO + MATRÍCULA
--    SECURITY INVOKER: roda com as permissões (e o RLS) de quem chama.
-- ---------------------------------------------------------------------
create or replace function public.salvar_aluno(
  p_aluno_id  uuid,
  p_nome      text,
  p_matricula text,
  p_email     text,
  p_turma_id  uuid,
  p_ano       int,
  p_situacao  text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.eh_gestao() then
    raise exception 'Você não tem permissão para cadastrar ou editar alunos.' using errcode = '42501';
  end if;

  if p_aluno_id is null then
    insert into public.alunos (nome, matricula, email)
    values (btrim(p_nome), btrim(p_matricula), nullif(lower(btrim(coalesce(p_email,''))), ''))
    returning id into v_id;
  else
    update public.alunos
       set nome = btrim(p_nome),
           matricula = btrim(p_matricula),
           email = nullif(lower(btrim(coalesce(p_email,''))), '')
     where id = p_aluno_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Aluno não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.matriculas (aluno_id, turma_id, ano_letivo, situacao)
  values (v_id, p_turma_id, p_ano, p_situacao)
  on conflict (aluno_id, ano_letivo)
  do update set turma_id = excluded.turma_id, situacao = excluded.situacao;

  return v_id;
end $$;
revoke all on function public.salvar_aluno(uuid, text, text, text, uuid, int, text) from anon, public;
grant execute on function public.salvar_aluno(uuid, text, text, text, uuid, int, text) to authenticated;

-- ===================== migrations/002_horarios.sql =====================
-- 002 — Horário de aulas (grade semanal por turma). Reversível: ver 002_horarios_reverter.sql.
-- Não altera nenhuma tabela existente. Rode ANTES de 003_horarios_dados.sql.
begin;

-- Turmas como aparecem no horário oficial (ex.: "1ªI01-EMI ANC"), com vínculo opcional à turma do sistema.
create table if not exists public.horario_turmas (
  codigo   text primary key check (char_length(btrim(codigo)) >= 1),
  turma_id uuid references public.turmas(id) on delete set null
);
create index if not exists horario_turmas_turma_idx on public.horario_turmas(turma_id);

create table if not exists public.horarios (
  id             uuid primary key default gen_random_uuid(),
  turma_codigo   text not null references public.horario_turmas(codigo) on delete cascade on update cascade,
  dia_semana     smallint not null check (dia_semana between 1 and 7),   -- 1 = segunda ... 7 = domingo
  aula           smallint not null check (aula between 1 and 12),
  inicio         time not null,
  fim            time not null check (fim > inicio),
  disciplina     text not null check (char_length(btrim(disciplina)) >= 1),
  professor      text,
  sala           text,
  texto_original text,
  vigente_desde  date not null,
  unique (turma_codigo, dia_semana, aula, vigente_desde) deferrable initially immediate
);
create index if not exists horarios_dia_idx on public.horarios (dia_semana, vigente_desde);

alter table public.horario_turmas enable row level security;
alter table public.horarios       enable row level security;

grant select, insert, update, delete on public.horario_turmas, public.horarios to authenticated;

-- Leitura: Direção/Secretaria/Professores veem todas as turmas; aluno vê só a turma em que está matriculado.
drop policy if exists htur_select on public.horario_turmas;
create policy htur_select on public.horario_turmas for select to authenticated
  using (public.eh_gestao() or public.eh_professor()
         or (public.eh_aluno() and turma_id in (select public.turmas_do_aluno())));
-- Vínculo código ↔ turma: somente Direção.
drop policy if exists htur_update on public.horario_turmas;
create policy htur_update on public.horario_turmas for update to authenticated
  using (public.eh_direcao()) with check (public.eh_direcao());
drop policy if exists htur_insert on public.horario_turmas;
create policy htur_insert on public.horario_turmas for insert to authenticated with check (public.eh_direcao());
drop policy if exists htur_delete on public.horario_turmas;
create policy htur_delete on public.horario_turmas for delete to authenticated using (public.eh_direcao());

drop policy if exists hor_select on public.horarios;
create policy hor_select on public.horarios for select to authenticated
  using (exists (select 1 from public.horario_turmas h where h.codigo = turma_codigo));  -- herda o RLS de horario_turmas
drop policy if exists hor_insert on public.horarios;
create policy hor_insert on public.horarios for insert to authenticated with check (public.eh_direcao());
drop policy if exists hor_update on public.horarios;
create policy hor_update on public.horarios for update to authenticated using (public.eh_direcao()) with check (public.eh_direcao());
drop policy if exists hor_delete on public.horarios;
create policy hor_delete on public.horarios for delete to authenticated using (public.eh_direcao());

commit;

-- ===================== migrations/003_horarios_dados.sql =====================
-- Gerado por scripts/gerar_horarios.py a partir do horário oficial. NÃO edite à mão: gere de novo.
-- Vigência: a partir de 2026-03-02. Dias: tabelas 1..5 do documento = segunda a sexta.
begin;
insert into public.horario_turmas (codigo) values
  ('1ªI01 - EM LCH'),
  ('1ªI01-EMI ANC'),
  ('1ªI02-EMI ANC'),
  ('1ªI01-EMI IPI'),
  ('1ªI02-EMI IPI'),
  ('1ªI01-EMI RDC'),
  ('2ªI01-EM MCN'),
  ('2ªI01-EMI ANC'),
  ('2ªI02-EMI ANC'),
  ('2ªI01-EMI IPI'),
  ('2ªI02-EMI IPI'),
  ('2ªI01-EMI MSI'),
  ('3ªI01-EM ESP'),
  ('3ªI01-EMI ANC'),
  ('3ªI01-EMI IPI'),
  ('3ªI02-EMI IPI'),
  ('3ªI01-EMI-MSI')
on conflict (codigo) do nothing;
delete from public.horarios where vigente_desde = '2026-03-02';
insert into public.horarios (turma_codigo, dia_semana, aula, inicio, fim, disciplina, professor, sala, texto_original, vigente_desde) values
  ('1ªI01 - EM LCH', 1, 1, '07:30', '08:20', 'FIL', 'BRUNELLY', 'SALA 04', 'FIL / BRUNELLY / SALA 04', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 1, '07:30', '08:20', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 1, '07:30', '08:20', 'LP', 'NICOLY', 'SALA 03', 'LP / NICOLY / SALA 03', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 1, '07:30', '08:20', 'FUND. DA COMP.', 'MAURÍCIO', 'LIED 01', 'FUND. DA COMP. / MAURÍCIO / LIED 01', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 1, '07:30', '08:20', 'L.P.G.', 'GUILH.', 'LIED 02', 'L.P.G. / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 1, '07:30', '08:20', 'DTEI', 'RONAN', 'SALA 13', 'DTEI / RONAN / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 1, '07:30', '08:20', 'QUI / AP', 'RODOLFO', 'SALA 10', 'QUI/AP / RODOLFO / SALA 10', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 1, '07:30', '08:20', 'LP', 'MARLY', 'SALA 05', 'LP / MARLY / SALA 05', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 1, '07:30', '08:20', 'MAT', 'YASMIN', 'SALA 07', 'MAT / YASMIN / SALA 07', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 1, '07:30', '08:20', 'EO', 'QUÉZIA', 'SALA 11', 'EO / QUÉZIA / SALA 11', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 1, '07:30', '08:20', 'PRÁT.EXP. / MAT', 'EDINALDO', 'LAB. MAT', 'PRÁT.EXP. / MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 1, '07:30', '08:20', 'PV', 'MIRIAN', 'BIBLIOTECA', 'PV / MIRIAN / BIBLIOTECA', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 1, '07:30', '08:20', 'PE-BIO', 'BRUNO', 'LAB. BIOL', 'PE-BIO / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 1, '07:30', '08:20', 'IMUNOL.', 'WILSON', 'SALA 09', 'IMUNOL. / WILSON / SALA 09', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 1, '07:30', '08:20', 'A.P.S.', 'MELISSA', 'SALA 12', 'A.P.S. / MELISSA SALA 12', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 1, '07:30', '08:20', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 1, '07:30', '08:20', 'PV', 'JEFERSON', 'SALÃO ARTE', 'PV / JEFERSON / SALÃO ARTE', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 2, '08:20', '09:10', 'PV', 'MIRIAN', 'BIBLIOTECA', 'PV / MIRIAN / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 2, '08:20', '09:10', 'LP', 'NICOLY', 'SALA 03', 'LP / NICOLY / SALA 03', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 2, '08:20', '09:10', 'BFEH', 'WILSON', 'SALA 09', 'BFEH / WILSON / SALA 09', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 2, '08:20', '09:10', 'L.P.G.', 'GUILH.', 'LIED 02', 'L.P.G. / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 2, '08:20', '09:10', 'FUND. DA COMP.', 'MAURÍCIO', 'LIED 01', 'FUND. DA COMP. / MAURÍCIO / LIED 01', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 2, '08:20', '09:10', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 2, '08:20', '09:10', 'FIL', 'BRUNELLY', 'SALA 04', 'FIL / BRUNELLY / SALA 04', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 2, '08:20', '09:10', 'MAT', 'YASMIN', 'SALA 07', 'MAT / YASMIN / SALA 07', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 2, '08:20', '09:10', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 2, '08:20', '09:10', 'PV', 'RENATA', 'SALA PV', 'PV / RENATA / SALA PV', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 2, '08:20', '09:10', 'EO', 'JORGE', 'SALA 06', 'EO / JORGE / SALA 06', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 2, '08:20', '09:10', 'PRÁT. EXP. / MAT', 'EDINALDO', 'LAB. MAT', 'PRÁT. EXP. / MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 2, '08:20', '09:10', 'ENHANCE MUCH?', 'QUÉZIA', 'SALA 11', 'ENHANCE MUCH? / QUÉZIA / SALA 11', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 2, '08:20', '09:10', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 2, '08:20', '09:10', 'PV', 'JEFERSON', 'SALÃO ARTE', 'PV / JEFERSON / SALÃO ARTE', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 2, '08:20', '09:10', 'A.P.S.', 'MELISSA', 'SALA 12', 'A.P.S. / MELISSA SALA 12', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 2, '08:20', '09:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 3, '09:30', '10:20', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 3, '09:30', '10:20', 'BFEH', 'WILSON', 'SALA 09', 'BFEH / WILSON / SALA 09', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 3, '09:30', '10:20', 'MAT', 'YASMIN', 'SALA 07', 'MAT / YASMIN / SALA 07', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 3, '09:30', '10:20', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 3, '09:30', '10:20', 'MAT', 'ABRAÃO', 'SALA 06', 'MAT / ABRAÃO / SALA 06', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 3, '09:30', '10:20', 'DTEI', 'RONAN', 'SALA 02', 'DTEI / RONAN / SALA 02', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 3, '09:30', '10:20', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 3, '09:30', '10:20', 'PRÁT.EXP. / MAT', 'EDINALDO', 'LAB. MAT', 'PRÁT.EXP. / MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 3, '09:30', '10:20', 'PV', 'RENATA', 'SALA PV', 'PV / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 3, '09:30', '10:20', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 3, '09:30', '10:20', 'LP', 'MARLY', 'SALA 05', 'LP / MARLY / SALA 05', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 3, '09:30', '10:20', 'Arq. M.', 'MAURÍCIO', 'LAB. MAN', 'Arq. M. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 3, '09:30', '10:20', 'FIL', 'BRUNELLY', 'SALA 04', 'FIL / BRUNELLY / SALA 04', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 3, '09:30', '10:20', 'PARASIT.', 'THIAGO', 'SALA 11', 'PARASIT. / THIAGO / SALA 11', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 3, '09:30', '10:20', 'DES.GAM.', 'MARCO', 'LIED 01', 'DES.GAM. / MARCO / LIED 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 3, '09:30', '10:20', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 3, '09:30', '10:20', 'B.D.', 'MELISSA', 'SALA 12', 'B.D. / MELISSA SALA 12', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 4, '10:20', '11:10', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 4, '10:20', '11:10', 'MAT', 'YASMIN', 'SALA 07', 'MAT / YASMIN / SALA 07', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 4, '10:20', '11:10', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 4, '10:20', '11:10', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 4, '10:20', '11:10', 'LP', 'NICOLY', 'SALA 03', 'LP / NICOLY / SALA 03', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 4, '10:20', '11:10', 'MAT', 'ABRAÃO', 'SALA 06', 'MAT / ABRAÃO / SALA 06', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 4, '10:20', '11:10', 'FIL', 'BRUNELLY', 'SALA 04', 'FIL / BRUNELLY / SALA 04', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 4, '10:20', '11:10', ' / BCB', 'THIAGO', 'SALA 11', '/ BCB / THIAGO / SALA 11', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 4, '10:20', '11:10', 'PRÁT.EXP. / MAT', 'EDINALDO', 'LAB. MAT', 'PRÁT.EXP. / MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 4, '10:20', '11:10', 'B.D.', 'MELISSA', 'SALA 12', 'B.D. / MELISSA SALA 12', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 4, '10:20', '11:10', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 4, '10:20', '11:10', 'Arq. M.', 'MAURÍCIO', 'LAB. MAN', 'Arq. M. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 4, '10:20', '11:10', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 4, '10:20', '11:10', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 4, '10:20', '11:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 4, '10:20', '11:10', 'DES.GAM.', 'MARCO', 'LIED 01', 'DES.GAM. / MARCO / LIED 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 4, '10:20', '11:10', 'ALP', 'GUILH.', 'LIED 02', 'ALP / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 5, '11:10', '12:00', 'FÍSICA', 'OTÁVIO', 'SALA 09', 'FÍSICA / OTÁVIO / SALA 09', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 5, '11:10', '12:00', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 5, '11:10', '12:00', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 5, '11:10', '12:00', 'MAT', 'ABRAÃO', 'SALA 06', 'MAT / ABRAÃO / SALA 06', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 5, '11:10', '12:00', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 5, '11:10', '12:00', 'LP', 'NICOLY', 'SALA 03', 'LP / NICOLY / SALA 03', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 5, '11:10', '12:00', 'MAT', 'LEO', 'SALA 07', 'MAT / LEO / SALA 07', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 5, '11:10', '12:00', 'EO', 'FERNANDA', 'SALA 05', 'EO / FERNANDA / SALA 05', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 5, '11:10', '12:00', 'BCB', 'THIAGO', 'SALA 11', 'BCB / THIAGO / SALA 11', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 5, '11:10', '12:00', 'CULTURA DIGITAL', 'MAURÍCIO', 'LIED 01', 'CULTURA DIGITAL / MAURÍCIO / LIED 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 5, '11:10', '12:00', 'B.D.', 'MELISSA', 'SALA 12', 'B.D. / MELISSA SALA 12', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 5, '11:10', '12:00', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 5, '11:10', '12:00', 'MAT', 'EDINALDO', 'SALA 04', 'MAT / EDINALDO / SALA 04', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 5, '11:10', '12:00', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 5, '11:10', '12:00', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 5, '11:10', '12:00', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 5, '11:10', '12:00', 'F.D.W.', 'GUILH', 'LIED 02', 'F.D.W. / GUILH / LIED 02', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 6, '13:20', '14:10', 'SOC', 'NICOLAU', 'SALA 04', 'SOC / NICOLAU / SALA 04', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 6, '13:20', '14:10', 'PRIM SOC', 'THIAGO', 'SALA 11', 'PRIM SOC / THIAGO / SALA 11', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 6, '13:20', '14:10', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 6, '13:20', '14:10', 'IDW', 'MARCO', 'SALA 13', 'IDW / MARCO / SALA 13', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 6, '13:20', '14:10', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 6, '13:20', '14:10', 'FTISO', 'RONAN', 'LAB. MAN', 'FTISO / RONAN / LAB. MAN', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 6, '13:20', '14:10', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 6, '13:20', '14:10', 'BIOQ.', 'WILSON', 'SALA 09', 'BIOQ. / WILSON / SALA 09', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 6, '13:20', '14:10', 'LP', 'MARLY', 'SALA 05', 'LP / MARLY / SALA 05', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 6, '13:20', '14:10', 'PRÁT. EXP. / MAT', 'EDINALDO', 'LAB. MAT', 'PRÁT. EXP. / MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 6, '13:20', '14:10', 'CULTURA DIGITAL', 'MAURÍCIO', 'LIED 01', 'CULTURA DIGITAL / MAURÍCIO / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 6, '13:20', '14:10', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 6, '13:20', '14:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 6, '13:20', '14:10', 'HEMAT.', 'DIOGO', 'LAB ANC', 'HEMAT. / DIOGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 6, '13:20', '14:10', 'DES. SIST', 'CHARLES', 'LIED 02', 'DES. SIST / CHARLES / LIED 02', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 6, '13:20', '14:10', 'C.N.V.', 'GUILH.', 'SALA 12', 'C.N.V. / GUILH. / SALA 12', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 6, '13:20', '14:10', 'PE-BIO', 'BRUNO', 'LAB. BIOL', 'PE-BIO / BRUNO / LAB. BIOL', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 7, '14:10', '15:00', 'MAT', 'ABRAÃO', 'SALA 06', 'MAT / ABRAÃO / SALA 06', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 7, '14:10', '15:00', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 7, '14:10', '15:00', 'PRIM SOC', 'THIAGO', 'SALA 11', 'PRIM SOC / THIAGO / SALA 11', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 7, '14:10', '15:00', 'LP', 'NICOLY', 'SALA 03', 'LP / NICOLY / SALA 03', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 7, '14:10', '15:00', 'IDW', 'MARCO', 'SALA 13', 'IDW / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 7, '14:10', '15:00', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 7, '14:10', '15:00', 'SOC', 'NICOLAU', 'SALA 04', 'SOC / NICOLAU / SALA 04', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 7, '14:10', '15:00', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 7, '14:10', '15:00', 'BIOQ.', 'WILSON', 'SALA 09', 'BIOQ. / WILSON / SALA 09', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 7, '14:10', '15:00', 'LP', 'MARLY', 'SALA 05', 'LP / MARLY / SALA 05', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 7, '14:10', '15:00', 'PV', 'RENATA', 'SALA PV', 'PV / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 7, '14:10', '15:00', 'Serv. W.L', 'RONAN', 'LIED 01', 'Serv. W.L / RONAN / LIED 01', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 7, '14:10', '15:00', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 7, '14:10', '15:00', 'HEMAT.', 'DIOGO', 'LAB ANC', 'HEMAT. / DIOGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 7, '14:10', '15:00', 'C.N.V.', 'GUILH.', 'SALA 12', 'C.N.V. / GUILH. / SALA 12', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 7, '14:10', '15:00', 'DES. SIST', 'CHARLES', 'LIED 02', 'DES. SIST / CHARLES / LIED 02', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 7, '14:10', '15:00', 'FERRAME DE SUPOR.', 'MAURÍCIO', 'LAB. MAN', 'FERRAME DE SUPOR. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 8, '15:20', '16:10', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01 - EM LCH', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01-EMI ANC', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI02-EMI ANC', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01-EMI IPI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI02-EMI IPI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01-EMI RDC', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EM MCN', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EMI ANC', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI02-EMI ANC', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EMI IPI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI02-EMI IPI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('2ªI01-EMI MSI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EM ESP', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EMI ANC', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EMI IPI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI02-EMI IPI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('3ªI01-EMI-MSI', 1, 9, '16:10', '17:00', 'ELETIVA', null, null, 'ELETIVA', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 1, '07:30', '08:20', 'FÍSICA', 'OTÁVIO', 'SALA 07', 'FÍSICA / OTÁVIO / SALA 07', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 1, '07:30', '08:20', 'BCB', 'DIOGO', 'SALA 11', 'BCB / DIOGO / SALA 11', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 1, '07:30', '08:20', 'BFEH', 'WILSON', 'LAB ANC', 'BFEH / WILSON / LAB ANC', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 1, '07:30', '08:20', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 1, '07:30', '08:20', 'LP', 'NICOLY', 'SALA 02', 'LP / NICOLY / SALA 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 1, '07:30', '08:20', 'LDP', 'MARCO', 'SALA 13', 'LDP / MARCO / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 1, '07:30', '08:20', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 1, '07:30', '08:20', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 1, '07:30', '08:20', 'MAT', 'YASMIN', 'SALA 09', 'MAT / YASMIN / SALA 09', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 1, '07:30', '08:20', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 1, '07:30', '08:20', 'BIO', 'RAFAEL', 'SALA 01', 'BIO / RAFAEL / SALA 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 1, '07:30', '08:20', 'RC', 'DANIEL.', 'LAB. MAN', 'RC DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 1, '07:30', '08:20', 'LP', 'RENATA', 'SALA 03', 'LP / RENATA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 1, '07:30', '08:20', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 1, '07:30', '08:20', 'P.W.D.', 'MELISSA', 'LIED 01', 'P.W.D. / MELISSA / LIED 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 1, '07:30', '08:20', 'LPOO', 'GUILH.', 'LIED 02', 'LPOO / GUILH. / LIED 02', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 1, '07:30', '08:20', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 2, '08:20', '09:10', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 2, '08:20', '09:10', 'BFEH', 'WILSON', 'LAB ANC', 'BFEH / WILSON / LAB ANC', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 2, '08:20', '09:10', 'BCB', 'DIOGO', 'SALA 11', 'BCB / DIOGO / SALA 11', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 2, '08:20', '09:10', 'FÍSICA', 'OTÁVIO', 'SALA 07', 'FÍSICA / OTÁVIO / SALA 07', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 2, '08:20', '09:10', 'MAT', 'ABRAÃO', 'SALA 01', 'MAT / ABRAÃO / SALA 01', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 2, '08:20', '09:10', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 2, '08:20', '09:10', 'MAT', 'LEO', 'SALA 02', 'MAT / LEO / SALA 02', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 2, '08:20', '09:10', 'MAT', 'YASMIN', 'SALA 09', 'MAT / YASMIN / SALA 09', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 2, '08:20', '09:10', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 2, '08:20', '09:10', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 2, '08:20', '09:10', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 2, '08:20', '09:10', 'LP', 'RENATA', 'SALA 03', 'LP / RENATA / SALA 03', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 2, '08:20', '09:10', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 2, '08:20', '09:10', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 2, '08:20', '09:10', 'LPOO', 'GUILH.', 'LIED 02', 'LPOO / GUILH. / LIED 02', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 2, '08:20', '09:10', 'P.W.D.', 'MELISSA', 'LIED 01', 'P.W.D. / MELISSA / LIED 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 2, '08:20', '09:10', 'PRM', 'DANIEL.', 'LAB. MAN', 'PRM DANIEL. / LAB. MAN', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 3, '09:30', '10:20', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 3, '09:30', '10:20', 'FÍSICA', 'OTÁVIO', 'SALA 07', 'FÍSICA / OTÁVIO / SALA 07', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 3, '09:30', '10:20', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 3, '09:30', '10:20', 'LP', 'NICOLY', 'SALA 02', 'LP / NICOLY / SALA 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 3, '09:30', '10:20', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 3, '09:30', '10:20', 'S. S. R.', 'DANIEL', 'LIED 01', 'S. S. R. / DANIEL / LIED 01', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 3, '09:30', '10:20', 'EO', 'JORGE', 'SALA 03', 'EO / JORGE / SALA 03', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 3, '09:30', '10:20', 'EO', 'BRUNELLY', 'SALA 04', 'EO / BRUNELLY / SALA 04', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 3, '09:30', '10:20', 'EO', 'FERNANDA', 'SALA 08', 'EO / FERNANDA / SALA 08', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 3, '09:30', '10:20', 'EO', 'NICOLAU', 'SALA 09', 'EO / NICOLAU / SALA 09', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 3, '09:30', '10:20', 'EO', 'RODOLFO', 'SALA 10', 'EO / RODOLFO / SALA 10', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 3, '09:30', '10:20', 'EO', 'CLEIDE / ABRAÃO', 'SALA 11', 'EO / CLEIDE / ABRAÃO / SALA 11', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 3, '09:30', '10:20', 'RLE', 'JEFERSON', 'QUADRA', 'RLE / JEFERSON / QUADRA', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 3, '09:30', '10:20', 'IMUNO', 'WILSON', 'SALA 11', 'IMUNO / WILSON / SALA 11', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 3, '09:30', '10:20', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 3, '09:30', '10:20', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 3, '09:30', '10:20', 'ALP', 'GUILH.', 'LIED 02', 'ALP / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 4, '10:20', '11:10', 'GEOG', 'FERNANDA', 'SALA 05', 'GEOG / FERNANDA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 4, '10:20', '11:10', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 4, '10:20', '11:10', 'LP', 'NICOLY', 'SALA 02', 'LP / NICOLY / SALA 02', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 4, '10:20', '11:10', 'L P G', 'GUILH.', 'LIED 02', 'L P G / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 4, '10:20', '11:10', 'FÍSICA', 'OTÁVIO', 'SALA 07', 'FÍSICA / OTÁVIO / SALA 07', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 4, '10:20', '11:10', 'MAT', 'ABRAÃO', 'SALA 01', 'MAT / ABRAÃO / SALA 01', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 4, '10:20', '11:10', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 4, '10:20', '11:10', 'BCB', 'THIAGO', 'LAB ANC', 'BCB / THIAGO / LAB ANC', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 4, '10:20', '11:10', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 4, '10:20', '11:10', 'L.P.W.', 'MELISSA', 'LIED 01', 'L.P.W. / MELISSA / LIED 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 4, '10:20', '11:10', 'IRCP', 'DANIEL.', 'LAB. MAN', 'IRCP DANIEL. / LAB. MAN', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 4, '10:20', '11:10', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 4, '10:20', '11:10', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 4, '10:20', '11:10', 'HEMAT.', 'DIOGO', 'SALA 11', 'HEMAT. / DIOGO SALA 11', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 4, '10:20', '11:10', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 4, '10:20', '11:10', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 4, '10:20', '11:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 5, '11:10', '12:00', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 5, '11:10', '12:00', 'LP', 'NICOLY', 'SALA 02', 'LP / NICOLY / SALA 02', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 5, '11:10', '12:00', 'FÍSICA', 'OTÁVIO', 'SALA 07', 'FÍSICA / OTÁVIO / SALA 07', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 5, '11:10', '12:00', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 5, '11:10', '12:00', 'L P G', 'GUILH.', 'LIED 02', 'L P G / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 5, '11:10', '12:00', 'LDP', 'MARCO', 'SALA 13', 'LDP / MARCO / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 5, '11:10', '12:00', 'FIS / AP', 'JORGE', 'LAB. MAT', 'FIS/AP / JORGE / LAB. MAT', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 5, '11:10', '12:00', 'QUI / SALA 10 / ', 'CLEIDE', null, 'QUI / CLEIDE / SALA 10 /', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 5, '11:10', '12:00', 'BCB', 'THIAGO', 'LAB ANC', 'BCB / THIAGO / LAB ANC', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 5, '11:10', '12:00', 'IRCP', 'DANIEL.', 'LAB. MAN', 'IRCP DANIEL. / LAB. MAN', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 5, '11:10', '12:00', 'L.P.W.', 'MELISSA', 'LIED 01', 'L.P.W. / MELISSA / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 5, '11:10', '12:00', 'MAT', 'LEO', 'SALA 09', 'MAT / LEO / SALA 09', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 5, '11:10', '12:00', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 5, '11:10', '12:00', 'MICRO', 'AZEMAR', 'SALA 11', 'MICRO / AZEMAR / SALA 11', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 5, '11:10', '12:00', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 5, '11:10', '12:00', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 5, '11:10', '12:00', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 6, '13:20', '14:10', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 6, '13:20', '14:10', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 6, '13:20', '14:10', 'BCB', 'DIOGO', 'LAB ANC', 'BCB / DIOGO / LAB ANC', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 6, '13:20', '14:10', 'MAT', 'ABRAÃO', 'SALA 07', 'MAT / ABRAÃO / SALA 07', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 6, '13:20', '14:10', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 6, '13:20', '14:10', 'LP', 'NICOLY', 'SALA 02', 'LP / NICOLY / SALA 02', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 6, '13:20', '14:10', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 6, '13:20', '14:10', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 6, '13:20', '14:10', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 6, '13:20', '14:10', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 6, '13:20', '14:10', 'Serv. W.L', 'RONAN', 'LIED 01', 'Serv. W.L / RONAN / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 6, '13:20', '14:10', 'CULTURA DIGITAL', 'CHARLES', 'SALA 13', 'CULTURA DIGITAL / CHARLES / SALA 13', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 6, '13:20', '14:10', 'P.I - CH', 'NICOLAU', 'BIBLIOTECA', 'P.I - CH / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 6, '13:20', '14:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 6, '13:20', '14:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 6, '13:20', '14:10', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 6, '13:20', '14:10', 'FS', 'MAURÍCIO', 'LAB. MAN', 'FS / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 7, '14:10', '15:00', 'MAT', 'ABRAÃO', 'SALA 07', 'MAT / ABRAÃO / SALA 07', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 7, '14:10', '15:00', 'BCB', 'DIOGO', 'LAB ANC', 'BCB / DIOGO / LAB ANC', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 7, '14:10', '15:00', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 7, '14:10', '15:00', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 7, '14:10', '15:00', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 7, '14:10', '15:00', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 7, '14:10', '15:00', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 7, '14:10', '15:00', ' / BIO', 'RAFAEL', 'SALA 09', '/ BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 7, '14:10', '15:00', 'CULTURA DIGITAL', 'CHARLES', 'SALA 13', 'CULTURA DIGITAL / CHARLES / SALA 13', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 7, '14:10', '15:00', 'PV', 'RENATA', 'SALA PV', 'PV / RENATA / SALA PV', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 7, '14:10', '15:00', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 7, '14:10', '15:00', 'Serv. W.L / LIED 01 / ', 'RONAN', null, 'Serv. W.L / RONAN / LIED 01 /', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 7, '14:10', '15:00', 'P.I - LIN', 'NICOLY', 'SALA 02', 'P.I - LIN / NICOLY / SALA 02', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 7, '14:10', '15:00', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 7, '14:10', '15:00', 'EO', 'NICOLAU', 'BIBLIOTECA', 'EO / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 7, '14:10', '15:00', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 7, '14:10', '15:00', 'FDW', 'GUILH.', 'LIED 02', 'FDW / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 8, '15:20', '16:10', 'QUI', 'RODOLFO', 'SALA 04', 'QUI / RODOLFO / SALA 04', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 8, '15:20', '16:10', 'FDA', 'AZEMAR', 'SALA 02', 'FDA / AZEMAR / SALA 02', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 8, '15:20', '16:10', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 8, '15:20', '16:10', 'FUND. DA COMP.', 'MAURÍCIO', 'LAB. MAN', 'FUND. DA COMP. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 8, '15:20', '16:10', 'IOT', 'MARCO', 'LIED 02', 'IOT / MARCO / LIED 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 8, '15:20', '16:10', 'INGL', 'QUÉZIA', 'SALA 05', 'INGL / QUÉZIA / SALA 05', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 8, '15:20', '16:10', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 8, '15:20', '16:10', 'DTAC', 'PATRICIA', 'SALA 07', 'DTAC / PATRICIA / SALA 07', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 8, '15:20', '16:10', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 8, '15:20', '16:10', ' / Serv. W.L / LIED 01 / ', 'RONAN', null, '/ Serv. W.L / RONAN / LIED 01 /', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 8, '15:20', '16:10', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 8, '15:20', '16:10', 'CULTURA DIGITAL', 'CHARLES', 'SALA 13', 'CULTURA DIGITAL / CHARLES / SALA 13', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 8, '15:20', '16:10', 'MH&AF', 'BRUNO', 'SALA 08', 'MH&AF / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 8, '15:20', '16:10', 'ULC', 'THIAGO', 'LAB ANC', 'ULC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 8, '15:20', '16:10', 'CNV', 'GUILH.', 'SALA 11', 'CNV / GUILH. / SALA 11', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 8, '15:20', '16:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 8, '15:20', '16:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('1ªI01 - EM LCH', 2, 9, '16:10', '17:00', 'ED.FÍSICA', 'JEFERSON', 'QUADRA', 'ED.FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('1ªI01-EMI ANC', 2, 9, '16:10', '17:00', 'PROJ. EMP', 'SIMONE', 'SALA 12', 'PROJ. EMP / SIMONE / SALA 12', '2026-03-02'),
  ('1ªI02-EMI ANC', 2, 9, '16:10', '17:00', 'FDA', 'AZEMAR', 'SALA 02', 'FDA / AZEMAR / SALA 02', '2026-03-02'),
  ('1ªI01-EMI IPI', 2, 9, '16:10', '17:00', 'IOT', 'MARCO', 'LIED 02', 'IOT / MARCO / LIED 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 2, 9, '16:10', '17:00', 'FUND. DA COMP.', 'MAURÍCIO', 'LAB. MAN', 'FUND. DA COMP. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('1ªI01-EMI RDC', 2, 9, '16:10', '17:00', 'DTEI', 'RONAN', 'SALA 13', 'DTEI / RONAN / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 2, 9, '16:10', '17:00', 'MAT / AP', 'YASMIN', 'SALA 04', 'MAT/AP / YASMIN / SALA 04', '2026-03-02'),
  ('2ªI01-EMI ANC', 2, 9, '16:10', '17:00', 'CULTURA DIGITAL', 'CHARLES', 'LIED 01', 'CULTURA DIGITAL / CHARLES / LIED 01', '2026-03-02'),
  ('2ªI02-EMI ANC', 2, 9, '16:10', '17:00', 'DTAC', 'PATRICIA', 'SALA 07', 'DTAC / PATRICIA / SALA 07', '2026-03-02'),
  ('2ªI01-EMI IPI', 2, 9, '16:10', '17:00', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('2ªI02-EMI IPI', 2, 9, '16:10', '17:00', 'PV', 'RENATA', 'SALA PV', 'PV / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI MSI', 2, 9, '16:10', '17:00', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('3ªI01-EM ESP', 2, 9, '16:10', '17:00', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EMI ANC', 2, 9, '16:10', '17:00', 'TTC', 'THIAGO', 'LAB ANC', 'TTC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 2, 9, '16:10', '17:00', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI02-EMI IPI', 2, 9, '16:10', '17:00', 'CNV', 'GUILH.', 'SALA 11', 'CNV / GUILH. / SALA 11', '2026-03-02'),
  ('3ªI01-EMI-MSI', 2, 9, '16:10', '17:00', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 1, '07:30', '08:20', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 1, '07:30', '08:20', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 1, '07:30', '08:20', 'BFEH', 'WILSON', 'SALA 06', 'BFEH / WILSON / SALA 06', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 1, '07:30', '08:20', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 1, '07:30', '08:20', 'FIL', 'BRUNELLY', 'BIBLIOTECA', 'FIL / BRUNELLY / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 1, '07:30', '08:20', 'LDP', 'MARCO', 'SALA 13', 'LDP / MARCO / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 1, '07:30', '08:20', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 1, '07:30', '08:20', ' / PV', 'RENATA', 'SALA PV', '/ PV / RENATA / SALA PV', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 1, '07:30', '08:20', 'EO', 'NICOLAU', 'SALA 08', 'EO / NICOLAU / SALA 08', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 1, '07:30', '08:20', 'IRCP', 'DANIEL.', 'LAB. MAN', 'IRCP DANIEL. / LAB. MAN', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 1, '07:30', '08:20', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 1, '07:30', '08:20', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 1, '07:30', '08:20', 'INGL', 'QUÉZIA', 'SALA 04', 'INGL / QUÉZIA / SALA 04', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 1, '07:30', '08:20', 'PC', 'THIAGO', 'LAB ANC', 'PC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 1, '07:30', '08:20', 'P.W.D.', 'MELISSA', 'LIED 01', 'P.W.D. / MELISSA / LIED 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 1, '07:30', '08:20', 'LPOO', 'GUILH.', 'LIED 02', 'LPOO / GUILH. / LIED 02', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 1, '07:30', '08:20', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 2, '08:20', '09:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 2, '08:20', '09:10', 'BFEH', 'WILSON', 'SALA 06', 'BFEH / WILSON / SALA 06', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 2, '08:20', '09:10', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 2, '08:20', '09:10', 'FIL', 'BRUNELLY', 'BIBLIOTECA', 'FIL / BRUNELLY / BIBLIOTECA', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 2, '08:20', '09:10', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 2, '08:20', '09:10', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 2, '08:20', '09:10', 'SOC', 'NICOLAU', 'SALA 08', 'SOC / NICOLAU / SALA 08', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 2, '08:20', '09:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 2, '08:20', '09:10', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 2, '08:20', '09:10', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 2, '08:20', '09:10', 'IRCP', 'DANIEL.', 'LAB. MAN', 'IRCP DANIEL. / LAB. MAN', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 2, '08:20', '09:10', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 2, '08:20', '09:10', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 2, '08:20', '09:10', 'PC', 'THIAGO', 'LAB ANC', 'PC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 2, '08:20', '09:10', 'LPOO', 'GUILH.', 'LIED 02', 'LPOO / GUILH. / LIED 02', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 2, '08:20', '09:10', 'P.W.D.', 'MELISSA', 'LIED 01', 'P.W.D. / MELISSA / LIED 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 2, '08:20', '09:10', 'TI', 'MARCO', 'SALA 13', 'TI / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 3, '09:30', '10:20', 'FIL', 'BRUNELLY', 'BIBLIOTECA', 'FIL / BRUNELLY / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 3, '09:30', '10:20', 'CSC', 'THIAGO', 'SALA 12', 'CSC / THIAGO / SALA 12', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 3, '09:30', '10:20', 'MAT', 'YASMIN', 'SALA 05', 'MAT / YASMIN / SALA 05', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 3, '09:30', '10:20', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 3, '09:30', '10:20', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 3, '09:30', '10:20', 'SSR', 'DANIEL', 'LIED 01', 'SSR DANIEL LIED 01', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 3, '09:30', '10:20', 'FÍS / AP', 'JORGE', 'SALA 07', 'FÍS/AP / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 3, '09:30', '10:20', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 3, '09:30', '10:20', 'PE-MAT', 'EDINALDO', 'LAB. MAT', 'PE-MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 3, '09:30', '10:20', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 3, '09:30', '10:20', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 3, '09:30', '10:20', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 3, '09:30', '10:20', 'PE.QUI', 'CLEIDE', 'LAB. BIOL', 'PE.QUI / CLEIDE / LAB. BIOL', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 3, '09:30', '10:20', 'IMUNO', 'WILSON', 'SALA 06', 'IMUNO / WILSON / SALA 06', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 3, '09:30', '10:20', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 3, '09:30', '10:20', 'HIST.', 'CAMILA', 'SALA 09', 'HIST. / CAMILA / SALA 09', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 3, '09:30', '10:20', 'ALP', 'GUILH.', 'LIED 02', 'ALP / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 4, '10:20', '11:10', 'EO', 'ABRAÃO BRUNELLY', 'SALA 07', 'EO / ABRAÃO BRUNELLY / SALA 07', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 4, '10:20', '11:10', 'MAT', 'YASMIN', 'SALA 05', 'MAT / YASMIN / SALA 05', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 4, '10:20', '11:10', 'CSC', 'THIAGO', 'SALA 12', 'CSC / THIAGO / SALA 12', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 4, '10:20', '11:10', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 4, '10:20', '11:10', 'LPG', 'GUILH.', 'LIED 02', 'LPG / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 4, '10:20', '11:10', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 4, '10:20', '11:10', 'EO', 'CLEIDE', 'SALA 10', 'EO / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 4, '10:20', '11:10', 'PE-MAT', 'EDINALDO', 'LAB. MAT', 'PE-MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 4, '10:20', '11:10', 'HIST.', 'LUCAS', 'SALA 02', 'HIST. / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 4, '10:20', '11:10', 'L.P.W.', 'MELISSA', 'LIED 01', 'L.P.W. / MELISSA / LIED 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 4, '10:20', '11:10', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 4, '10:20', '11:10', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 4, '10:20', '11:10', 'SOC', 'NICOLAU', 'SALA 08', 'SOC / NICOLAU / SALA 08', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 4, '10:20', '11:10', 'HIST.', 'CAMILA', 'SALA 09', 'HIST. / CAMILA / SALA 09', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 4, '10:20', '11:10', 'ASPJ', 'DANIEL.', 'LAB. MAN', 'ASPJ / DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 4, '10:20', '11:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 4, '10:20', '11:10', 'TI', 'MARCO', 'SALA 13', 'TI / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 5, '11:10', '12:00', 'MAT', 'ABRAÃO', 'SALA 07', 'MAT / ABRAÃO / SALA 07', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 5, '11:10', '12:00', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 5, '11:10', '12:00', 'FIL', 'BRUNELLY', 'BIBLIOTECA', 'FIL / BRUNELLY / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 5, '11:10', '12:00', 'LPG', 'GUILH.', 'LIED 02', 'LPG / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 5, '11:10', '12:00', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 5, '11:10', '12:00', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 5, '11:10', '12:00', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 5, '11:10', '12:00', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 5, '11:10', '12:00', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 5, '11:10', '12:00', 'PE-MAT', 'EDINALDO', 'LAB. MAT', 'PE-MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 5, '11:10', '12:00', 'L.P.W.', 'MELISSA', 'LIED 01', 'L.P.W. / MELISSA / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 5, '11:10', '12:00', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 5, '11:10', '12:00', 'Q&E', 'CLEIDE', 'SALA 04', 'Q&E / CLEIDE / SALA 04', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 5, '11:10', '12:00', 'MICRO', 'AZEMAR', 'LAB ANC', 'MICRO / AZEMAR / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 5, '11:10', '12:00', 'HIST. / SALA 09 / ', 'CAMILA', null, 'HIST. / CAMILA / SALA 09 /', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 5, '11:10', '12:00', 'ASPJ', 'DANIEL.', 'LAB. MAN', 'ASPJ / DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 5, '11:10', '12:00', 'SI', 'MARCO', 'SALA 13', 'SI / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 6, '13:20', '14:10', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 6, '13:20', '14:10', 'FIL', 'BRUNELLY', 'BIBLIOTECA', 'FIL / BRUNELLY / BIBLIOTECA', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 6, '13:20', '14:10', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 6, '13:20', '14:10', 'IDW', 'MARCO', 'SALA 13', 'IDW / MARCO / SALA 13', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 6, '13:20', '14:10', 'FUND. DA COMP.', 'MAURÍCIO', 'LAB. MAN', 'FUND. DA COMP. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 6, '13:20', '14:10', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 6, '13:20', '14:10', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 6, '13:20', '14:10', 'FDP', 'WILSON', 'SALA 07', 'FDP / WILSON / SALA 07', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 6, '13:20', '14:10', 'AF', 'THIAGO', 'SALA 12', 'AF / THIAGO / SALA 12', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 6, '13:20', '14:10', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 6, '13:20', '14:10', 'PE-MAT', 'EDINALDO', 'LAB. MAT', 'PE-MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 6, '13:20', '14:10', 'RC', 'DANIEL.', 'LIED 02', 'RC DANIEL. / LIED 02', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 6, '13:20', '14:10', 'HIST.', 'CAMILA', 'SALA 09', 'HIST. / CAMILA / SALA 09', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 6, '13:20', '14:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 6, '13:20', '14:10', 'CNV', 'GUILH.', 'SALA 08', 'CNV / GUILH. / SALA 08', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 6, '13:20', '14:10', 'DS', 'CHARLES', 'LIED 01', 'DS / CHARLES / LIED 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 6, '13:20', '14:10', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 7, '14:10', '15:00', 'EO', 'FERNANDA', 'SALA 02', 'EO / FERNANDA / SALA 02', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 7, '14:10', '15:00', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 7, '14:10', '15:00', 'QUI', 'RODOLFO', 'SALA 10', 'QUI / RODOLFO / SALA 10', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 7, '14:10', '15:00', 'FUND. DA COMP.', 'MAURÍCIO', 'LAB. MAN', 'FUND. DA COMP. / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 7, '14:10', '15:00', 'IDW', 'MARCO', 'SALA 13', 'IDW / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 7, '14:10', '15:00', 'FIL', 'BRUNELLY', 'BIBLIOTECA', 'FIL / BRUNELLY / BIBLIOTECA', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 7, '14:10', '15:00', 'GEOG', 'LUCIANO', 'SALA 01', 'GEOG / LUCIANO / SALA 01', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 7, '14:10', '15:00', 'AF', 'THIAGO', 'SALA 12', 'AF / THIAGO / SALA 12', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 7, '14:10', '15:00', 'FDP', 'WILSON', 'SALA 07', 'FDP / WILSON / SALA 07', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 7, '14:10', '15:00', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 7, '14:10', '15:00', 'LP', 'MARLY', 'SALA 04', 'LP / MARLY / SALA 04', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 7, '14:10', '15:00', 'PE-MAT', 'EDINALDO', 'LAB. MAT', 'PE-MAT / EDINALDO / LAB. MAT', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 7, '14:10', '15:00', 'FÍSICA', 'JORGE', 'SALA 03', 'FÍSICA / JORGE / SALA 03', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 7, '14:10', '15:00', 'PROJ. EMP', 'SIMONE', 'SALA 11', 'PROJ. EMP / SIMONE / SALA 11', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 7, '14:10', '15:00', 'DS / LIED 01 / ', 'CHARLES', null, 'DS / CHARLES / LIED 01 /', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 7, '14:10', '15:00', 'CNV', 'GUILH.', 'SALA 08', 'CNV / GUILH. / SALA 08', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 7, '14:10', '15:00', 'HIST.', 'CAMILA', 'SALA 09', 'HIST. / CAMILA / SALA 09', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 8, '15:20', '16:10', 'CLUBE', 'ABRAÃO', 'CLUBE', 'ABRAÃO / CLUBE', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 8, '15:20', '16:10', 'MAT', 'YASMIN', 'SALA 05', 'MAT / YASMIN / SALA 05', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 8, '15:20', '16:10', 'EO', 'NICOLY', 'SALA 03', 'EO / NICOLY / SALA 03', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 8, '15:20', '16:10', 'EO', 'MIRIAN', 'SALÃO ARTE', 'EO / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 8, '15:20', '16:10', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 8, '15:20', '16:10', 'EO', 'RENATA', 'SALA 04', 'EO / RENATA / SALA 04', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 8, '15:20', '16:10', 'CLUBE', 'JORGE', 'CLUBE', 'JORGE / CLUBE', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 8, '15:20', '16:10', 'CLUBE', 'LUCAS', 'CLUBE', 'LUCAS / CLUBE', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 8, '15:20', '16:10', 'CLUBE', 'NICOLAU', 'CLUBE', 'NICOLAU / CLUBE', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 8, '15:20', '16:10', 'CLUBE', 'FERNANDA', 'CLUBE', 'FERNANDA / CLUBE', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 8, '15:20', '16:10', 'CLUBE', 'RAFAEL', 'CLUBE', 'RAFAEL / CLUBE', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 8, '15:20', '16:10', 'CLUBE', 'BRUNELLY', 'CLUBE', 'BRUNELLY / CLUBE', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 8, '15:20', '16:10', 'CLUBE', 'CLEIDE', 'CLUBE', 'CLEIDE / CLUBE', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 8, '15:20', '16:10', 'CLUBE', 'QUÉZIA', 'CLUBE', 'QUÉZIA / CLUBE', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 8, '15:20', '16:10', 'CLUBE', 'RODOLFO', 'CLUBE', 'RODOLFO / CLUBE', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 8, '15:20', '16:10', 'CLUBE', 'CREUZA', 'CLUBE', 'CREUZA / CLUBE', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 8, '15:20', '16:10', 'CLUBE', 'OTÁVIO', 'CLUBE', 'OTÁVIO / CLUBE', '2026-03-02'),
  ('1ªI01 - EM LCH', 3, 9, '16:10', '17:00', 'CLUBE', 'ABRAÃO', 'CLUBE', 'ABRAÃO / CLUBE', '2026-03-02'),
  ('1ªI01-EMI ANC', 3, 9, '16:10', '17:00', 'EO', 'NICOLY', 'SALA 03', 'EO / NICOLY / SALA 03', '2026-03-02'),
  ('1ªI02-EMI ANC', 3, 9, '16:10', '17:00', 'MAT', 'YASMIN', 'SALA 05', 'MAT / YASMIN / SALA 05', '2026-03-02'),
  ('1ªI01-EMI IPI', 3, 9, '16:10', '17:00', 'ED. FÍSICA', 'JEFERSON', 'QUADRA', 'ED. FÍSICA / JEFERSON / QUADRA', '2026-03-02'),
  ('1ªI02-EMI IPI', 3, 9, '16:10', '17:00', 'EO', 'RENATA', 'SALA 04', 'EO / RENATA / SALA 04', '2026-03-02'),
  ('1ªI01-EMI RDC', 3, 9, '16:10', '17:00', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('2ªI01-EM MCN', 3, 9, '16:10', '17:00', 'CLUBE', 'JORGE', 'CLUBE', 'JORGE / CLUBE', '2026-03-02'),
  ('2ªI01-EMI ANC', 3, 9, '16:10', '17:00', 'CLUBE', 'LUCAS', 'CLUBE', 'LUCAS / CLUBE', '2026-03-02'),
  ('2ªI02-EMI ANC', 3, 9, '16:10', '17:00', 'CLUBE', 'NICOLAU', 'CLUBE', 'NICOLAU / CLUBE', '2026-03-02'),
  ('2ªI01-EMI IPI', 3, 9, '16:10', '17:00', 'CLUBE', 'FERNANDA', 'CLUBE', 'FERNANDA / CLUBE', '2026-03-02'),
  ('2ªI02-EMI IPI', 3, 9, '16:10', '17:00', 'CLUBE', 'RAFAEL', 'CLUBE', 'RAFAEL / CLUBE', '2026-03-02'),
  ('2ªI01-EMI MSI', 3, 9, '16:10', '17:00', 'CLUBE', 'BRUNELLY', 'CLUBE', 'BRUNELLY / CLUBE', '2026-03-02'),
  ('3ªI01-EM ESP', 3, 9, '16:10', '17:00', 'CLUBE', 'CLEIDE', 'CLUBE', 'CLEIDE / CLUBE', '2026-03-02'),
  ('3ªI01-EMI ANC', 3, 9, '16:10', '17:00', 'CLUBE', 'QUÉZIA', 'CLUBE', 'QUÉZIA / CLUBE', '2026-03-02'),
  ('3ªI01-EMI IPI', 3, 9, '16:10', '17:00', 'CLUBE', 'RODOLFO', 'CLUBE', 'RODOLFO / CLUBE', '2026-03-02'),
  ('3ªI02-EMI IPI', 3, 9, '16:10', '17:00', 'CLUBE', 'CREUZA', 'CLUBE', 'CREUZA / CLUBE', '2026-03-02'),
  ('3ªI01-EMI-MSI', 3, 9, '16:10', '17:00', 'CLUBE', 'OTÁVIO', 'CLUBE', 'OTÁVIO / CLUBE', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 1, '07:30', '08:20', 'QUI', 'RODOLFO', 'SALA 08', 'QUI / RODOLFO / SALA 08', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 1, '07:30', '08:20', 'SOC', 'NICOLAU', 'BIBLIOTECA', 'SOC / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 1, '07:30', '08:20', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 1, '07:30', '08:20', 'GEO', 'FERNANDA', 'SALA 01', 'GEO / FERNANDA / SALA 01', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 1, '07:30', '08:20', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 1, '07:30', '08:20', 'MAT', 'ABRAÃO', 'SALA 05', 'MAT / ABRAÃO / SALA 05', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 1, '07:30', '08:20', 'MAT', 'LEO', 'SALA 03', 'MAT / LEO / SALA 03', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 1, '07:30', '08:20', 'FDP', 'WILSON', 'SALA 11', 'FDP / WILSON / SALA 11', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 1, '07:30', '08:20', 'MAT', 'YASMIN', 'SALA 06', 'MAT / YASMIN / SALA 06', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 1, '07:30', '08:20', 'APL. WEB', 'ELIVELTO', 'LIED 01', 'APL. WEB / ELIVELTO / LIED 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 1, '07:30', '08:20', 'GEOG', 'LUCIANO', 'SALA 10', 'GEOG / LUCIANO / SALA 10', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 1, '07:30', '08:20', 'RC', 'DANIEL.', 'LAB. MAN', 'RC DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 1, '07:30', '08:20', 'MB', 'JORGE', 'SALA 07', 'MB / JORGE / SALA 07', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 1, '07:30', '08:20', 'ULC', 'THIAGO', 'LAB ANC', 'ULC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 1, '07:30', '08:20', 'A.P.S.', 'MELISSA', 'SALA 12', 'A.P.S. / MELISSA SALA 12', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 1, '07:30', '08:20', 'LPOO', 'GUILH.', 'LIED 02', 'LPOO / GUILH. / LIED 02', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 1, '07:30', '08:20', 'SI', 'MARCO', 'SALA 13', 'SI / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 2, '08:20', '09:10', 'MAT', 'ABRAÃO', 'SALA 05', 'MAT / ABRAÃO / SALA 05', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 2, '08:20', '09:10', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 2, '08:20', '09:10', 'SOC', 'NICOLAU', 'BIBLIOTECA', 'SOC / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 2, '08:20', '09:10', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 2, '08:20', '09:10', 'IDW', 'MARCO', 'SALA 13', 'IDW / MARCO / SALA 13', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 2, '08:20', '09:10', 'GEO', 'FERNANDA', 'SALA 01', 'GEO / FERNANDA / SALA 01', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 2, '08:20', '09:10', 'FIS', 'JORGE', 'SALA 07', 'FIS / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 2, '08:20', '09:10', 'MAT', 'YASMIN', 'SALA 06', 'MAT / YASMIN / SALA 06', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 2, '08:20', '09:10', 'FDP / SALA 11 / ', 'WILSON', null, 'FDP / WILSON / SALA 11 /', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 2, '08:20', '09:10', 'MAT', 'LEO', 'SALA 03', 'MAT / LEO / SALA 03', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 2, '08:20', '09:10', 'APL. WEB', 'ELIVELTO', 'LIED 01', 'APL. WEB / ELIVELTO / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 2, '08:20', '09:10', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 2, '08:20', '09:10', 'MAT', 'EDINALDO', 'SALA 08', 'MAT / EDINALDO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 2, '08:20', '09:10', 'ULC', 'THIAGO', 'LAB ANC', 'ULC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 2, '08:20', '09:10', 'LPOO', 'GUILH.', 'LIED 02', 'LPOO / GUILH. / LIED 02', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 2, '08:20', '09:10', 'A.P.S.', 'MELISSA', 'SALA 12', 'A.P.S. / MELISSA SALA 12', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 2, '08:20', '09:10', 'PRM', 'DANIEL.', 'LAB. MAN', 'PRM / DANIEL. / LAB. MAN', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 3, '09:30', '10:20', 'INGL.', 'QUÉZIA', 'SALA 05', 'INGL. / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 3, '09:30', '10:20', 'CSC', 'THIAGO', 'SALA 11', 'CSC / THIAGO / SALA 11', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 3, '09:30', '10:20', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 3, '09:30', '10:20', 'IDW', 'MARCO', 'SALA 13', 'IDW / MARCO / SALA 13', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 3, '09:30', '10:20', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 3, '09:30', '10:20', 'SSR', 'DANIEL.', 'LIED 01', 'SSR / DANIEL. / LIED 01', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 3, '09:30', '10:20', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 3, '09:30', '10:20', 'GEOG', 'LUCIANO', 'SALA 10', 'GEOG / LUCIANO / SALA 10', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 3, '09:30', '10:20', 'BIOQUI', 'WILSON', 'LAB ANC', 'BIOQUI / WILSON / LAB ANC', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 3, '09:30', '10:20', 'B.D.', 'MELISSA', 'SALA 12', 'B.D. / MELISSA SALA 12', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 3, '09:30', '10:20', 'MAT', 'LEO', 'SALA 03', 'MAT / LEO / SALA 03', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 3, '09:30', '10:20', 'FIS', 'JORGE', 'SALA 07', 'FIS / JORGE / SALA 07', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 3, '09:30', '10:20', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 3, '09:30', '10:20', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 3, '09:30', '10:20', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 3, '09:30', '10:20', 'LP', 'CREUZA', 'SALA PV', 'LP / CREUZA / SALA PV', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 3, '09:30', '10:20', 'FDW', 'GUILH.', 'LIED 02', 'FDW / GUILH. / LIED 02', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 4, '10:20', '11:10', 'QUI', 'RODOLFO', 'SALA 07', 'QUI / RODOLFO / SALA 07', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 4, '10:20', '11:10', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 4, '10:20', '11:10', 'CSC', 'THIAGO', 'SALA 11', 'CSC / THIAGO / SALA 11', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 4, '10:20', '11:10', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 4, '10:20', '11:10', 'GEO', 'FERNANDA', 'SALA 01', 'GEO / FERNANDA / SALA 01', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 4, '10:20', '11:10', 'INGL.', 'QUÉZIA', 'SALA 05', 'INGL. / QUÉZIA / SALA 05', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 4, '10:20', '11:10', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 4, '10:20', '11:10', 'BIOQUI', 'WILSON', 'LAB ANC', 'BIOQUI / WILSON / LAB ANC', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 4, '10:20', '11:10', 'GEOG', 'LUCIANO', 'SALA 10', 'GEOG / LUCIANO / SALA 10', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 4, '10:20', '11:10', 'IOT', 'MARCO', 'LIED 02', 'IOT / MARCO / LIED 02', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 4, '10:20', '11:10', 'B.D.', 'MELISSA', 'SALA 12', 'B.D. / MELISSA SALA 12', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 4, '10:20', '11:10', 'MAT', 'LEO', 'SALA 03', 'MAT / LEO / SALA 03', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 4, '10:20', '11:10', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 4, '10:20', '11:10', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 4, '10:20', '11:10', 'ASPJ', 'DANIEL.', 'LAB. MAN', 'ASPJ / DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 4, '10:20', '11:10', 'BIOL', 'BRUNO', 'SALA 08', 'BIOL / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 4, '10:20', '11:10', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 5, '11:10', '12:00', 'EO', 'CREUZA', 'SALA 03', 'EO / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 5, '11:10', '12:00', 'EO', 'MIRIAN', 'SALA 04', 'EO / MIRIAN / SALA 04', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 5, '11:10', '12:00', 'EO', 'ABRAÃO / CLEIDE', 'SALA 06', 'EO / ABRAÃO / CLEIDE / SALA 06', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 5, '11:10', '12:00', 'EO', 'YASMIN / JEFERSON', 'SALA 10', 'EO / YASMIN / JEFERSON / SALA 10', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 5, '11:10', '12:00', 'EO', 'FERNANDA / RODOLFO', 'SALA 09', 'EO / FERNANDA / RODOLFO / SALA 09', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 5, '11:10', '12:00', 'EO', 'BRUNELLY', 'SALA 13', 'EO / BRUNELLY / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 5, '11:10', '12:00', 'BIO / AP', 'BRUNO', 'SALA 08', 'BIO/AP / BRUNO / SALA 08', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 5, '11:10', '12:00', 'FIS', 'JORGE', 'SALA 07', 'FIS / JORGE / SALA 07', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 5, '11:10', '12:00', 'AF', 'THIAGO', 'SALA 11', 'AF / THIAGO / SALA 11', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 5, '11:10', '12:00', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 5, '11:10', '12:00', 'IOT', 'MARCO', 'LIED 02', 'IOT / MARCO / LIED 02', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 5, '11:10', '12:00', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 5, '11:10', '12:00', 'EM', 'QUÉZIA', 'SALA 05', 'EM / QUÉZIA / SALA 05', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 5, '11:10', '12:00', 'MICRO', 'AZEMAR', 'LAB ANC', 'MICRO / AZEMAR / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 5, '11:10', '12:00', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 5, '11:10', '12:00', 'ASPJ', 'DANIEL.', 'LAB. MAN', 'ASPJ / DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 5, '11:10', '12:00', 'B.D.', 'MELISSA', 'SALA 12', 'B.D. / MELISSA / SALA 12', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 6, '13:20', '14:10', 'GEO', 'FERNANDA', 'SALA 03', 'GEO / FERNANDA / SALA 03', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 6, '13:20', '14:10', 'BCB', 'DIOGO', 'SALA 12', 'BCB / DIOGO / SALA 12', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 6, '13:20', '14:10', 'INGL.', 'QUÉZIA', 'SALA 05', 'INGL. / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 6, '13:20', '14:10', 'SOC', 'NICOLAU', 'BIBLIOTECA', 'SOC / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 6, '13:20', '14:10', 'IOT', 'MARCO', 'LIED 02', 'IOT / MARCO / LIED 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 6, '13:20', '14:10', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 6, '13:20', '14:10', 'LP', 'RENATA', 'SALA PV', 'LP / RENATA / SALA PV', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 6, '13:20', '14:10', 'AF', 'THIAGO', 'SALA 11', 'AF / THIAGO / SALA 11', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 6, '13:20', '14:10', 'CULTURA DIGITAL', 'CHARLES', 'LIED 01', 'CULTURA DIGITAL / CHARLES / LIED 01', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 6, '13:20', '14:10', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 6, '13:20', '14:10', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 6, '13:20', '14:10', 'ICM', 'MAURÍCIO', 'LAB. MAN', 'ICM / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 6, '13:20', '14:10', 'EO', 'CREUZA / BRUNELLY', 'SALA 01', 'EO / CREUZA / BRUNELLY / SALA 01', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 6, '13:20', '14:10', 'EO', 'JEFERSON / RODOLFO', 'SALA 04', 'EO / JEFERSON / RODOLFO / SALA 04', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 6, '13:20', '14:10', 'EO', 'OTÁVIO / CLEIDE', 'SALA 06', 'EO / OTÁVIO / CLEIDE / SALA 06', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 6, '13:20', '14:10', 'EO', 'ABRAÃO', 'SALA 07', 'EO / ABRAÃO / SALA 07', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 6, '13:20', '14:10', 'EO', 'YASMIN / JORGE', 'SALA 08', 'EO / YASMIN / JORGE / SALA 08', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 7, '14:10', '15:00', 'BIO', 'RAFAEL', 'SALA 09', 'BIO / RAFAEL / SALA 09', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 7, '14:10', '15:00', 'INGL.', 'QUÉZIA', 'SALA 05', 'INGL. / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 7, '14:10', '15:00', 'BCB', 'DIOGO', 'SALA 12', 'BCB / DIOGO / SALA 12', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 7, '14:10', '15:00', 'IOT', 'MARCO', 'LIED 02', 'IOT / MARCO / LIED 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 7, '14:10', '15:00', 'SOC', 'NICOLAU', 'BIBLIOTECA', 'SOC / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 7, '14:10', '15:00', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 7, '14:10', '15:00', 'QU / API', 'RODOLFO', 'SALA 01', 'QU/API / RODOLFO / SALA 01', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 7, '14:10', '15:00', 'CULTURA DIGITAL', 'CHARLES', 'LIED 01', 'CULTURA DIGITAL / CHARLES / LIED 01', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 7, '14:10', '15:00', 'FIS', 'JORGE', 'SALA 07', 'FIS / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 7, '14:10', '15:00', 'GEOG', 'LUCIANO', 'SALA 10', 'GEOG / LUCIANO / SALA 10', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 7, '14:10', '15:00', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 7, '14:10', '15:00', 'ICM', 'MAURÍCIO', 'LAB. MAN', 'ICM / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 7, '14:10', '15:00', 'P.I - LIN', 'NICOLY', 'SALA 02', 'P.I - LIN / NICOLY / SALA 02', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 7, '14:10', '15:00', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 7, '14:10', '15:00', 'BIO', 'BRUNO', 'SALA 08', 'BIO / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 7, '14:10', '15:00', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 7, '14:10', '15:00', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 8, '15:20', '16:10', 'SOC', 'NICOLAU', 'BIBLIOTECA', 'SOC / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 8, '15:20', '16:10', 'GEO', 'FERNANDA', 'SALA 09', 'GEO / FERNANDA / SALA 09', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 8, '15:20', '16:10', 'FDA', 'AZEMAR', 'LAB ANC', 'FDA / AZEMAR / LAB ANC', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 8, '15:20', '16:10', 'INGL.', 'QUÉZIA', 'SALA 05', 'INGL. / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 8, '15:20', '16:10', 'MAT', 'ABRAÃO', 'SALA 11', 'MAT / ABRAÃO / SALA 11', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 8, '15:20', '16:10', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 8, '15:20', '16:10', 'MAT / AP', 'YASMIN', 'SALA 06', 'MAT/AP / YASMIN / SALA 06', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 8, '15:20', '16:10', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 8, '15:20', '16:10', 'DTAC', 'PATRICIA', 'SALA 12', 'DTAC / PATRICIA SALA 12', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 8, '15:20', '16:10', 'CULTURA DIGITAL', 'MAURÍCIO', 'LAB. MAN', 'CULTURA DIGITAL / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 8, '15:20', '16:10', 'FIS', 'JORGE', 'SALA 07', 'FIS / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 8, '15:20', '16:10', 'GEOG', 'LUCIANO', 'SALA 10', 'GEOG / LUCIANO / SALA 10', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 8, '15:20', '16:10', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 8, '15:20', '16:10', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 8, '15:20', '16:10', 'DS', 'CHARLES', 'LIED 01', 'DS / CHARLES / LIED 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 8, '15:20', '16:10', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 8, '15:20', '16:10', 'BIO', 'BRUNO', 'SALA 08', 'BIO / BRUNO / SALA 08', '2026-03-02'),
  ('1ªI01 - EM LCH', 4, 9, '16:10', '17:00', 'FÍSICA', 'OTÁVIO', 'SALA 04', 'FÍSICA / OTÁVIO / SALA 04', '2026-03-02'),
  ('1ªI01-EMI ANC', 4, 9, '16:10', '17:00', 'FDA', 'AZEMAR', 'LAB ANC', 'FDA / AZEMAR / LAB ANC', '2026-03-02'),
  ('1ªI02-EMI ANC', 4, 9, '16:10', '17:00', 'GEO', 'FERNANDA', 'SALA 09', 'GEO / FERNANDA / SALA 09', '2026-03-02'),
  ('1ªI01-EMI IPI', 4, 9, '16:10', '17:00', 'MAT', 'ABRAÃO', 'SALA 11', 'MAT / ABRAÃO / SALA 11', '2026-03-02'),
  ('1ªI02-EMI IPI', 4, 9, '16:10', '17:00', 'INGL.', 'QUÉZIA', 'SALA 05', 'INGL. / QUÉZIA / SALA 05', '2026-03-02'),
  ('1ªI01-EMI RDC', 4, 9, '16:10', '17:00', 'SOC', 'NICOLAU', 'BIBLIOTECA', 'SOC / NICOLAU / BIBLIOTECA', '2026-03-02'),
  ('2ªI01-EM MCN', 4, 9, '16:10', '17:00', 'ARTE', 'MIRIAN', 'SALÃO ARTE', 'ARTE / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('2ªI01-EMI ANC', 4, 9, '16:10', '17:00', 'DTAC', 'PATRICIA', 'SALA 12', 'DTAC / PATRICIA SALA 12', '2026-03-02'),
  ('2ªI02-EMI ANC', 4, 9, '16:10', '17:00', 'HIST', 'LUCAS', 'SALA 02', 'HIST / LUCAS / SALA 02', '2026-03-02'),
  ('2ªI01-EMI IPI', 4, 9, '16:10', '17:00', 'FIS', 'JORGE', 'SALA 07', 'FIS / JORGE / SALA 07', '2026-03-02'),
  ('2ªI02-EMI IPI', 4, 9, '16:10', '17:00', 'CULTURA DIGITAL', 'MAURÍCIO', 'LAB. MAN', 'CULTURA DIGITAL / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('2ªI01-EMI MSI', 4, 9, '16:10', '17:00', 'PROJ. EMP', 'SIMONE', 'SALA 13', 'PROJ. EMP / SIMONE / SALA 13', '2026-03-02'),
  ('3ªI01-EM ESP', 4, 9, '16:10', '17:00', 'BIO', 'BRUNO', 'SALA 08', 'BIO / BRUNO / SALA 08', '2026-03-02'),
  ('3ªI01-EMI ANC', 4, 9, '16:10', '17:00', 'MAT', 'EDINALDO', 'SALA 06', 'MAT / EDINALDO / SALA 06', '2026-03-02'),
  ('3ªI01-EMI IPI', 4, 9, '16:10', '17:00', 'LP', 'CREUZA', 'SALA 03', 'LP / CREUZA / SALA 03', '2026-03-02'),
  ('3ªI02-EMI IPI', 4, 9, '16:10', '17:00', 'DS', 'CHARLES', 'LIED 01', 'DS / CHARLES / LIED 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 4, 9, '16:10', '17:00', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 1, '07:30', '08:20', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 1, '07:30', '08:20', 'MAT / SALA 09 / ', 'YASMIN', null, 'MAT / YASMIN / SALA 09 /', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 1, '07:30', '08:20', 'PRIM SOC', 'THIAGO', 'LAB ANC', 'PRIM SOC / THIAGO / LAB ANC', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 1, '07:30', '08:20', 'IOT-RE', 'MARCO', 'LAB. MAN', 'IOT-RE / MARCO / LAB. MAN', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 1, '07:30', '08:20', 'HIST.', 'LUCAS', 'SALA 01', 'HIST. / LUCAS / SALA 01', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 1, '07:30', '08:20', 'GEOG', 'FERNANDA', 'SALA 12', 'GEOG / FERNANDA / SALA 12', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 1, '07:30', '08:20', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 1, '07:30', '08:20', 'BIOQUI', 'WILSON', 'SALA 10', 'BIOQUI / WILSON / SALA 10', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 1, '07:30', '08:20', 'FÍSICA', 'JORGE', 'SALA 07', 'FÍSICA / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 1, '07:30', '08:20', 'SWL', 'RONAN', 'LIED 02', 'SWL / RONAN / LIED 02', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 1, '07:30', '08:20', 'APL. WEB', 'ELIVELTO', 'LIED 01', 'APL. WEB / ELIVELTO / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 1, '07:30', '08:20', 'EO', 'BRUNELLY', 'SALA 13', 'EO / BRUNELLY / SALA 13', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 1, '07:30', '08:20', 'LP', 'RENATA', 'SALA 03', 'LP / RENATA / SALA 03', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 1, '07:30', '08:20', 'EO', 'NICOLAU', 'SALA 05', 'EO / NICOLAU / SALA 05', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 1, '07:30', '08:20', 'PRÁT. EXP. FÍSICA', 'OTÁVIO', 'LAB. MAT', 'PRÁT. EXP. FÍSICA / OTÁVIO / LAB. MAT', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 1, '07:30', '08:20', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 1, '07:30', '08:20', 'MAT', 'EDINALDO', 'SALA 11', 'MAT / EDINALDO / SALA 11', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 2, '08:20', '09:10', 'GEOG', 'FERNANDA', 'SALA 12', 'GEOG / FERNANDA / SALA 12', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 2, '08:20', '09:10', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 2, '08:20', '09:10', 'MAT / SALA 09 / ', 'YASMIN', null, 'MAT / YASMIN / SALA 09 /', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 2, '08:20', '09:10', 'HIST.', 'LUCAS', 'SALA 01', 'HIST. / LUCAS / SALA 01', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 2, '08:20', '09:10', 'IOT-RE', 'MARCO', 'LAB. MAN', 'IOT-RE / MARCO / LAB. MAN', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 2, '08:20', '09:10', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 2, '08:20', '09:10', 'LP', 'RENATA', 'SALA 03', 'LP / RENATA / SALA 03', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 2, '08:20', '09:10', 'FÍSICA', 'JORGE', 'SALA 07', 'FÍSICA / JORGE / SALA 07', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 2, '08:20', '09:10', 'BIOQUI', 'WILSON', 'SALA 10', 'BIOQUI / WILSON / SALA 10', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 2, '08:20', '09:10', 'APL. WEB', 'ELIVELTO', 'LIED 01', 'APL. WEB / ELIVELTO / LIED 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 2, '08:20', '09:10', 'SWL', 'RONAN', 'LIED 02', 'SWL / RONAN / LIED 02', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 2, '08:20', '09:10', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 2, '08:20', '09:10', 'EO', 'BRUNELLY', 'SALA 13', 'EO / BRUNELLY / SALA 13', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 2, '08:20', '09:10', 'TTC', 'THIAGO', 'LAB ANC', 'TTC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 2, '08:20', '09:10', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 2, '08:20', '09:10', 'PRÁT. EXP. FÍSICA', 'OTÁVIO', 'LAB. MAT', 'PRÁT. EXP. FÍSICA / OTÁVIO / LAB. MAT', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 2, '08:20', '09:10', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 3, '09:30', '10:20', 'LP', 'CREUZA', 'SALA 04', 'LP / CREUZA / SALA 04', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 3, '09:30', '10:20', 'HIST.', 'LUCAS', 'SALA 01', 'HIST. / LUCAS / SALA 01', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 3, '09:30', '10:20', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 3, '09:30', '10:20', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 3, '09:30', '10:20', 'GEOG', 'FERNANDA', 'SALA 12', 'GEOG / FERNANDA / SALA 12', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 3, '09:30', '10:20', 'MAT', 'ABRAÃO', 'SALA 10', 'MAT / ABRAÃO / SALA 10', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 3, '09:30', '10:20', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 3, '09:30', '10:20', 'PV', 'RENATA', 'BIBLIOTECA', 'PV / RENATA / BIBLIOTECA', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 3, '09:30', '10:20', 'LP', 'MARLY', 'SALA 03', 'LP / MARLY / SALA 03', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 3, '09:30', '10:20', 'IOT-RE', 'MARCO', 'LIED 01', 'IOT-RE / MARCO / LIED 01', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 3, '09:30', '10:20', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 3, '09:30', '10:20', 'FÍSICA', 'JORGE', 'SALA 07', 'FÍSICA / JORGE / SALA 07', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 3, '09:30', '10:20', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 3, '09:30', '10:20', 'TTC', 'THIAGO', 'LAB ANC', 'TTC / THIAGO / LAB ANC', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 3, '09:30', '10:20', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 3, '09:30', '10:20', 'MAT', 'EDINALDO', 'SALA 11', 'MAT / EDINALDO / SALA 11', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 3, '09:30', '10:20', 'PRM', 'DANIEL.', 'LAB. MAN', 'PRM / DANIEL. / LAB. MAN', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 4, '10:20', '11:10', 'LP', 'CREUZA', 'SALA 04', 'LP / CREUZA / SALA 04', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 4, '10:20', '11:10', 'PRIM SOC', 'THIAGO', 'LAB ANC', 'PRIM SOC / THIAGO / LAB ANC', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 4, '10:20', '11:10', 'HIST.', 'LUCAS', 'SALA 01', 'HIST. / LUCAS / SALA 01', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 4, '10:20', '11:10', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 4, '10:20', '11:10', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 4, '10:20', '11:10', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 4, '10:20', '11:10', 'EO', 'JORGE', 'SALA 07', 'EO / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 4, '10:20', '11:10', 'LP', 'MARLY', 'SALA 03', 'LP / MARLY / SALA 03', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 4, '10:20', '11:10', 'PV', 'RENATA', 'BIBLIOTECA', 'PV / RENATA / BIBLIOTECA', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 4, '10:20', '11:10', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 4, '10:20', '11:10', 'IOT-RE', 'MARCO', 'LIED 01', 'IOT-RE / MARCO / LIED 01', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 4, '10:20', '11:10', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 4, '10:20', '11:10', 'P.I-CH', 'NICOLAU', 'SALA 13', 'P.I-CH / NICOLAU / SALA 13', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 4, '10:20', '11:10', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 4, '10:20', '11:10', 'MAT', 'EDINALDO', 'SALA 11', 'MAT / EDINALDO / SALA 11', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 4, '10:20', '11:10', 'ASPJ', 'DANIEL.', 'LAB. MAN', 'ASPJ / DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 4, '10:20', '11:10', 'PRÁT. EXP. FÍSICA', 'OTÁVIO', 'LAB. MAT', 'PRÁT. EXP. FÍSICA / OTÁVIO / LAB. MAT', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 5, '11:10', '12:00', 'MAT', 'ABRAÃO', 'SALA 02', 'MAT / ABRAÃO / SALA 02', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 5, '11:10', '12:00', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 5, '11:10', '12:00', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 5, '11:10', '12:00', 'GEOG', 'FERNANDA', 'SALA 12', 'GEOG / FERNANDA / SALA 12', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 5, '11:10', '12:00', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 5, '11:10', '12:00', 'HIST.', 'LUCAS', 'SALA 01', 'HIST. / LUCAS / SALA 01', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 5, '11:10', '12:00', 'BIOL', 'BRUNO', 'SALA 04', 'BIOL / BRUNO / SALA 04', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 5, '11:10', '12:00', 'QUI / SALA 10 / ', 'CLEIDE', null, 'QUI / CLEIDE / SALA 10 /', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 5, '11:10', '12:00', 'MAT', 'YASMIN', 'SALA 09', 'MAT / YASMIN / SALA 09', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 5, '11:10', '12:00', 'FÍSICA', 'JORGE', 'SALA 07', 'FÍSICA / JORGE / SALA 07', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 5, '11:10', '12:00', 'MAT', 'LEO', 'SALA 06', 'MAT / LEO / SALA 06', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 5, '11:10', '12:00', 'SWL', 'RONAN', 'LIED 02', 'SWL / RONAN / LIED 02', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 5, '11:10', '12:00', 'MAT', 'EDINALDO', 'SALA 11', 'MAT / EDINALDO / SALA 11', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 5, '11:10', '12:00', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 5, '11:10', '12:00', 'ASPJ', 'DANIEL.', 'LAB. MAN', 'ASPJ / DANIEL. / LAB. MAN', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 5, '11:10', '12:00', 'EO', 'OTÁVIO', 'LAB. MAT', 'EO / OTÁVIO / LAB. MAT', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 5, '11:10', '12:00', 'SI', 'MARCOS', 'LIED 01', 'SI / MARCOS / LIED 01', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 6, '13:20', '14:10', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 6, '13:20', '14:10', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 6, '13:20', '14:10', 'GEOG', 'FERNANDA', 'SALA 12', 'GEOG / FERNANDA / SALA 12', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 6, '13:20', '14:10', 'MAT', 'ABRAÃO', 'SALA 02', 'MAT / ABRAÃO / SALA 02', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 6, '13:20', '14:10', 'LP', 'NICOLY', 'SALA 05', 'LP / NICOLY / SALA 05', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 6, '13:20', '14:10', 'FTISO', 'RONAN', 'LIED 02', 'FTISO / RONAN / LIED 02', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 6, '13:20', '14:10', 'BIOL / AP', 'BRUNO', 'SALA 04', 'BIOL/AP / BRUNO / SALA 04', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 6, '13:20', '14:10', 'MAT', 'YASMIN', 'SALA 09', 'MAT / YASMIN / SALA 09', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 6, '13:20', '14:10', 'AF', 'THIAGO', 'LAB ANC', 'AF / THIAGO / LAB ANC', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 6, '13:20', '14:10', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 6, '13:20', '14:10', 'LP', 'MARLY', 'SALA 03', 'LP / MARLY / SALA 03', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 6, '13:20', '14:10', 'AMC', 'MAURÍCIO', 'LAB. MAN', 'AMC / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 6, '13:20', '14:10', 'PRÁT.EXP.MAT', 'EDINALDO', 'SALA 11', 'PRÁT.EXP.MAT / EDINALDO / SALA 11', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 6, '13:20', '14:10', 'PRÁT. EXP. FÍSICA', 'OTÁVIO', 'LAB. MAT', 'PRÁT. EXP. FÍSICA / OTÁVIO / LAB. MAT', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 6, '13:20', '14:10', 'DG', 'MARCOS', 'LIED 01', 'DG / MARCOS / LIED 01', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 6, '13:20', '14:10', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 6, '13:20', '14:10', 'EO', 'QUÉZIA', 'SALA 06', 'EO / QUÉZIA / SALA 06', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 7, '14:10', '15:00', 'HIST.', 'CAMILA', 'SALA 01', 'HIST. / CAMILA / SALA 01', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 7, '14:10', '15:00', 'GEOG', 'FERNANDA', 'SALA 12', 'GEOG / FERNANDA / SALA 12', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 7, '14:10', '15:00', 'BIO', 'RAFAEL', 'SALA 08', 'BIO / RAFAEL / SALA 08', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 7, '14:10', '15:00', 'PV', 'MIRIAN', 'SALÃO ARTE', 'PV / MIRIAN / SALÃO ARTE', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 7, '14:10', '15:00', 'MAT', 'ABRAÃO', 'SALA 02', 'MAT / ABRAÃO / SALA 02', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 7, '14:10', '15:00', 'FTISO', 'RONAN', 'LIED 02', 'FTISO / RONAN / LIED 02', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 7, '14:10', '15:00', 'MAT / AP', 'YASMIN', 'SALA 09', 'MAT/AP / YASMIN / SALA 09', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 7, '14:10', '15:00', 'AF', 'THIAGO', 'LAB ANC', 'AF / THIAGO / LAB ANC', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 7, '14:10', '15:00', 'QUI', 'CLEIDE', 'SALA 10', 'QUI / CLEIDE / SALA 10', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 7, '14:10', '15:00', 'LP', 'MARLY', 'SALA 03', 'LP / MARLY / SALA 03', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 7, '14:10', '15:00', 'FÍSICA', 'JORGE', 'SALA 07', 'FÍSICA / JORGE / SALA 07', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 7, '14:10', '15:00', 'ICM', 'MAURÍCIO', 'LAB. MAN', 'ICM / MAURÍCIO / LAB. MAN', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 7, '14:10', '15:00', 'PRÁT. EXP. FÍSICA', 'OTÁVIO', 'LAB. MAT', 'PRÁT. EXP. FÍSICA / OTÁVIO / LAB. MAT', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 7, '14:10', '15:00', 'MAT', 'EDINALDO', 'SALA 11', 'MAT / EDINALDO / SALA 11', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 7, '14:10', '15:00', 'PRÁT. EXP. / BIOL', 'BRUNO', 'LAB. BIOL', 'PRÁT. EXP. / BIOL / BRUNO / LAB. BIOL', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 7, '14:10', '15:00', 'DG', 'MARCOS', 'LIED 01', 'DG / MARCOS / LIED 01', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 7, '14:10', '15:00', 'PV', 'JEFERSON', 'SALA PV', 'PV / JEFERSON / SALA PV', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 8, '15:20', '16:10', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01 - EM LCH', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01-EMI ANC', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI02-EMI ANC', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01-EMI IPI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI02-EMI IPI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('1ªI01-EMI RDC', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EM MCN', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EMI ANC', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI02-EMI ANC', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EMI IPI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI02-EMI IPI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('2ªI01-EMI MSI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EM ESP', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EMI ANC', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EMI IPI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI02-EMI IPI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02'),
  ('3ªI01-EMI-MSI', 5, 9, '16:10', '17:00', 'REUNIÃO GERAL (estudantes dispensados às 15h20)', null, null, 'REUNIÃO GERAL OBS: os estudantes são dispensados às 15h20', '2026-03-02');

-- Vincula automaticamente turmas cujo nome seja igual ao código do horário (ignorando espaços e maiúsculas).
-- Os demais códigos são vinculados pela tela do Calendário (Direção).
update public.horario_turmas h set turma_id = t.id
  from public.turmas t
 where h.turma_id is null
   and lower(regexp_replace(t.nome, '\s', '', 'g')) = lower(regexp_replace(h.codigo, '\s', '', 'g'));
commit;

-- ===================== migrations/004_coordenador_gerador.sql =====================
-- 004 — Papel "coordenador" + gerador de horário. Rode DEPOIS de 002 (e 003 se quiser o horário oficial).
-- Reversão: 004_coordenador_gerador_reverter.sql (antes, troque perfis 'coordenador' por outro papel).
begin;

-- 1. Novo papel ---------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.perfis'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%papel%' loop
    execute format('alter table public.perfis drop constraint %I', c);
  end loop;
end $$;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('direcao','secretaria','professor','aluno','coordenador'));

create or replace function public.eh_coordenador()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() = 'coordenador', false)
$$;
create or replace function public.pode_gerir_horario()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_direcao() or public.eh_coordenador()
$$;
grant execute on function public.eh_coordenador(), public.pode_gerir_horario() to authenticated;

-- A coordenação enxerga o calendário (feriados/eventos) para não marcar aulas em dias sem aula.
drop policy if exists eventos_select_coord on public.eventos;
create policy eventos_select_coord on public.eventos for select to authenticated using (public.eh_coordenador());

-- 2. Estruturas do gerador ----------------------------------------------
alter table public.horario_turmas add column if not exists sala_base text;

create table if not exists public.horario_salas (
  id   uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) >= 1) unique
);
create table if not exists public.horario_demandas (
  id            uuid primary key default gen_random_uuid(),
  turma_codigo  text not null references public.horario_turmas(codigo) on delete cascade on update cascade,
  disciplina    text not null check (char_length(btrim(disciplina)) >= 1),
  professor     text not null check (char_length(btrim(professor)) >= 1),
  aulas_semana  smallint not null check (aulas_semana between 1 and 20),
  sala          text,
  unique (turma_codigo, disciplina)
);
-- Horários em que o professor NÃO pode dar aula (dia_semana 1..5; aulas de..até, inclusive).
create table if not exists public.horario_indisponibilidades (
  id          uuid primary key default gen_random_uuid(),
  professor   text not null check (char_length(btrim(professor)) >= 1),
  dia_semana  smallint not null check (dia_semana between 1 and 7),
  aula_de     smallint not null check (aula_de between 1 and 12),
  aula_ate    smallint not null check (aula_ate between 1 and 12),
  motivo      text,
  check (aula_ate >= aula_de)
);
create index if not exists hind_prof_idx on public.horario_indisponibilidades (professor);

alter table public.horario_salas enable row level security;
alter table public.horario_demandas enable row level security;
alter table public.horario_indisponibilidades enable row level security;
grant select, insert, update, delete on public.horario_salas, public.horario_demandas, public.horario_indisponibilidades to authenticated;

do $$
declare t text;
begin
  foreach t in array array['horario_salas','horario_demandas','horario_indisponibilidades'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.pode_gerir_horario() or public.eh_gestao())', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.pode_gerir_horario()) with check (public.pode_gerir_horario())', t);
  end loop;
end $$;

-- 3. Quem gerencia o horário: Direção e Coordenação (substitui as políticas de 002) -------------
drop policy if exists htur_select on public.horario_turmas;
create policy htur_select on public.horario_turmas for select to authenticated
  using (public.eh_gestao() or public.eh_professor() or public.eh_coordenador()
         or (public.eh_aluno() and turma_id in (select public.turmas_do_aluno())));
drop policy if exists htur_update on public.horario_turmas;
create policy htur_update on public.horario_turmas for update to authenticated
  using (public.pode_gerir_horario()) with check (public.pode_gerir_horario());
drop policy if exists htur_insert on public.horario_turmas;
create policy htur_insert on public.horario_turmas for insert to authenticated with check (public.pode_gerir_horario());
drop policy if exists htur_delete on public.horario_turmas;
create policy htur_delete on public.horario_turmas for delete to authenticated using (public.pode_gerir_horario());
drop policy if exists hor_insert on public.horarios;
create policy hor_insert on public.horarios for insert to authenticated with check (public.pode_gerir_horario());
drop policy if exists hor_update on public.horarios;
create policy hor_update on public.horarios for update to authenticated using (public.pode_gerir_horario()) with check (public.pode_gerir_horario());
drop policy if exists hor_delete on public.horarios;
create policy hor_delete on public.horarios for delete to authenticated using (public.pode_gerir_horario());

-- 4. Operações atômicas (SECURITY INVOKER: valem as políticas acima) ----------
-- Troca de lugar duas aulas da mesma turma/vigência (a restrição de unicidade é "deferrable").
create or replace function public.trocar_aulas(p_a uuid, p_b uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare ta text; tb text; va date; vb date; n int;
begin
  if not public.pode_gerir_horario() then raise exception 'Você não tem permissão para alterar o horário.' using errcode = '42501'; end if;
  select turma_codigo, vigente_desde into ta, va from public.horarios where id = p_a;
  select turma_codigo, vigente_desde into tb, vb from public.horarios where id = p_b;
  if ta is null or tb is null then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;
  if ta <> tb or va <> vb or p_a = p_b then raise exception 'As aulas precisam ser da mesma turma e do mesmo horário.' using errcode = '22023'; end if;
  set constraints all deferred;
  update public.horarios h set dia_semana = o.dia_semana, aula = o.aula, inicio = o.inicio, fim = o.fim
    from public.horarios o
   where h.id in (p_a, p_b) and o.id in (p_a, p_b) and o.id <> h.id;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'Não foi possível trocar as aulas.' using errcode = 'P0002'; end if;
end $$;

-- Substitui TODO o horário de uma vigência pelas linhas geradas (tudo ou nada).
create or replace function public.substituir_horario(p_vigencia date, p_linhas jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not public.pode_gerir_horario() then raise exception 'Você não tem permissão para alterar o horário.' using errcode = '42501'; end if;
  delete from public.horarios where vigente_desde = p_vigencia;
  insert into public.horarios (turma_codigo, dia_semana, aula, inicio, fim, disciplina, professor, sala, vigente_desde)
  select x.turma_codigo, x.dia_semana, x.aula, x.inicio::time, x.fim::time, x.disciplina, nullif(x.professor, ''), nullif(x.sala, ''), p_vigencia
    from jsonb_to_recordset(p_linhas) as x(turma_codigo text, dia_semana smallint, aula smallint, inicio text, fim text, disciplina text, professor text, sala text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.trocar_aulas(uuid, uuid), public.substituir_horario(date, jsonb) from anon, public;
grant execute on function public.trocar_aulas(uuid, uuid), public.substituir_horario(date, jsonb) to authenticated;

commit;

-- ===================== migrations/005_horario_arquivos_disponibilidade.sql =====================
-- 005 — PDFs do horário anexados + atualização atômica da disponibilidade do professor.
-- Rode DEPOIS de 004. Reversão: 005_horario_arquivos_disponibilidade_reverter.sql
begin;

-- Bucket PRIVADO: só a service role (servidor) lê e grava arquivos; o público baixa pela rota do app.
insert into storage.buckets (id, name, public) values ('horarios', 'horarios', false) on conflict (id) do nothing;

create table if not exists public.horario_arquivos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(btrim(nome)) between 1 and 150),
  caminho       text not null unique,
  tamanho       integer not null check (tamanho > 0),
  vigente_desde date,
  enviado_por   uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em     timestamptz not null default now()
);
alter table public.horario_arquivos enable row level security;
grant select, insert, update, delete on public.horario_arquivos to authenticated;
drop policy if exists harq_select on public.horario_arquivos;
create policy harq_select on public.horario_arquivos for select to authenticated using (public.pode_gerir_horario() or public.eh_gestao());
drop policy if exists harq_write on public.horario_arquivos;
create policy harq_write on public.horario_arquivos for all to authenticated using (public.pode_gerir_horario()) with check (public.pode_gerir_horario());

-- Substitui, de uma vez, as faixas de disponibilidade (motivo "Disponibilidade: ...") de um professor.
create or replace function public.definir_disponibilidade(p_professor text, p_linhas jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not public.pode_gerir_horario() then raise exception 'Você não tem permissão para alterar o horário.' using errcode = '42501'; end if;
  delete from public.horario_indisponibilidades
   where upper(btrim(professor)) = upper(btrim(p_professor)) and motivo like 'Disponibilidade:%';
  insert into public.horario_indisponibilidades (professor, dia_semana, aula_de, aula_ate, motivo)
  select btrim(p_professor), x.dia_semana, x.aula_de, x.aula_ate, x.motivo
    from jsonb_to_recordset(p_linhas) as x(dia_semana smallint, aula_de smallint, aula_ate smallint, motivo text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.definir_disponibilidade(text, jsonb) from anon, public;
grant execute on function public.definir_disponibilidade(text, jsonb) to authenticated;

commit;

-- ===== 006_horario_professores.sql =====
-- 006 — Cadastro de professores do horário (para "Adicionar professor" em Horário de aulas > Criar horário).
-- Rode DEPOIS de 005. Reversão: 006_horario_professores_reverter.sql
begin;

create table if not exists public.horario_professores (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (char_length(btrim(nome)) between 1 and 80),
  criado_em timestamptz not null default now()
);
create unique index if not exists horario_professores_nome_uq on public.horario_professores (upper(btrim(nome)));

alter table public.horario_professores enable row level security;
grant select, insert, update, delete on public.horario_professores to authenticated;
drop policy if exists hprof_select on public.horario_professores;
create policy hprof_select on public.horario_professores for select to authenticated using (public.pode_gerir_horario() or public.eh_gestao());
drop policy if exists hprof_write on public.horario_professores;
create policy hprof_write on public.horario_professores for all to authenticated using (public.pode_gerir_horario()) with check (public.pode_gerir_horario());

commit;
