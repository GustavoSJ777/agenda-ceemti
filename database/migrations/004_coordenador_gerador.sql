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
