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
