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
