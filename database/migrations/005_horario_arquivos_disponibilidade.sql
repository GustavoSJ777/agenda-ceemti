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
