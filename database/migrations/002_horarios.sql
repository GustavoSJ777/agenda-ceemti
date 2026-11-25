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
