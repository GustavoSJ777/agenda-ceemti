-- Desfaz 004. ANTES: update public.perfis set papel = 'professor' where papel = 'coordenador'; (ou exclua esses usuários)
-- restaura as políticas da 002 (somente Direção grava)
drop policy if exists htur_select on public.horario_turmas;
create policy htur_select on public.horario_turmas for select to authenticated
  using (public.eh_gestao() or public.eh_professor() or (public.eh_aluno() and turma_id in (select public.turmas_do_aluno())));
drop policy if exists htur_update on public.horario_turmas;
create policy htur_update on public.horario_turmas for update to authenticated using (public.eh_direcao()) with check (public.eh_direcao());
drop policy if exists htur_insert on public.horario_turmas;
create policy htur_insert on public.horario_turmas for insert to authenticated with check (public.eh_direcao());
drop policy if exists htur_delete on public.horario_turmas;
create policy htur_delete on public.horario_turmas for delete to authenticated using (public.eh_direcao());
drop policy if exists hor_insert on public.horarios;
create policy hor_insert on public.horarios for insert to authenticated with check (public.eh_direcao());
drop policy if exists hor_update on public.horarios;
create policy hor_update on public.horarios for update to authenticated using (public.eh_direcao()) with check (public.eh_direcao());
drop policy if exists hor_delete on public.horarios;
create policy hor_delete on public.horarios for delete to authenticated using (public.eh_direcao());
drop function if exists public.substituir_horario(date, jsonb);
drop function if exists public.trocar_aulas(uuid, uuid);
drop table if exists public.horario_indisponibilidades, public.horario_demandas, public.horario_salas;
alter table public.horario_turmas drop column if exists sala_base;
drop policy if exists eventos_select_coord on public.eventos;
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('direcao','secretaria','professor','aluno'));
drop function if exists public.pode_gerir_horario();
drop function if exists public.eh_coordenador();
