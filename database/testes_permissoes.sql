-- =====================================================================
-- TESTES AUTOMÁTICOS DE PERMISSÕES (RLS) — testes_permissoes.sql
--
-- Como usar: Supabase > SQL Editor > cole este arquivo > Run.
-- Roda tudo dentro de uma transação e termina com ROLLBACK:
-- NENHUM dado de teste permanece no seu banco.
-- Resultado: mensagens "OK ..." (aba Messages/Notices). Se algo estiver
-- errado, o script para com "FALHOU: ...".
--
-- Requisito: schema.sql e policies.sql já executados.
-- =====================================================================
begin;

-- Ajudantes temporários ------------------------------------------------
create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
end $$;

-- conta linhas visíveis de uma consulta, como o papel "authenticated"
create or replace function pg_temp.conta(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') x' into n;
  return n;
end $$;

-- executa um comando e informa se foi BLOQUEADO (erro de permissão/RLS/validação)
create or replace function pg_temp.bloqueou(p_sql text) returns boolean language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return false;
exception when others then
  return true;
end $$;

-- executa UPDATE/DELETE e devolve quantas linhas foram afetadas (0 = RLS filtrou)
create or replace function pg_temp.afetou(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FALHOU: %', p_msg;
  end if;
  raise notice 'OK  %', p_msg;
end $$;

grant execute on all functions in schema pg_temp to public;

-- Dados de teste (como administrador do banco) -------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'dir@teste.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'sec@teste.local'),
  ('00000000-0000-0000-0000-0000000000a1', 'prof1@teste.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'prof2@teste.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'aluno1@teste.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'aluno2@teste.local');

insert into public.perfis (id, nome, email, papel) values
  ('00000000-0000-0000-0000-0000000000d1', 'Diretora Teste',  'dir@teste.local',    'direcao'),
  ('00000000-0000-0000-0000-0000000000e1', 'Secretaria Teste','sec@teste.local',    'secretaria'),
  ('00000000-0000-0000-0000-0000000000a1', 'Professor Um',    'prof1@teste.local',  'professor'),
  ('00000000-0000-0000-0000-0000000000a2', 'Professor Dois',  'prof2@teste.local',  'professor'),
  ('00000000-0000-0000-0000-0000000000b1', 'Aluno Um',        'aluno1@teste.local', 'aluno'),
  ('00000000-0000-0000-0000-0000000000b2', 'Aluna Dois',      'aluno2@teste.local', 'aluno');

insert into public.professores (perfil_id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');

insert into public.series (id, nome) values ('00000000-0000-0000-0000-000000000501', '1ª Série');
insert into public.disciplinas (id, nome) values
  ('00000000-0000-0000-0000-000000000d01', 'Matemática'),
  ('00000000-0000-0000-0000-000000000d02', 'Português');
insert into public.turmas (id, nome, serie_id, turno, ano_letivo) values
  ('00000000-0000-0000-0000-000000000701', '1A', '00000000-0000-0000-0000-000000000501', 'integral', 2026),
  ('00000000-0000-0000-0000-000000000702', '1B', '00000000-0000-0000-0000-000000000501', 'integral', 2026);

insert into public.professor_turmas (professor_id, turma_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000d01'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000d02');

insert into public.alunos (id, perfil_id, nome, matricula) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', 'Aluno Um',  'T-001'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b2', 'Aluna Dois','T-002');
insert into public.matriculas (aluno_id, turma_id, ano_letivo) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000701', 2026),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000702', 2026);

insert into public.eventos (titulo, categoria, data, turma_id) values
  ('Evento geral',  'evento_escolar', current_date, null),
  ('Evento 1A',     'prova',          current_date, '00000000-0000-0000-0000-000000000701'),
  ('Evento 1B',     'prova',          current_date, '00000000-0000-0000-0000-000000000702');

insert into public.atividades (tipo, titulo, disciplina_id, turma_id, professor_id, data_realizacao, prazo_entrega) values
  ('prova',    'Prova 1A', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000000a1', current_date + 5, null),
  ('trabalho', 'Trab 1B',  '00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-0000000000a2', null, current_date + 5);

insert into public.recuperacoes (aluno_id, turma_id, disciplina_id, professor_id, nota_anterior) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000a1', 4.0),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-0000000000a2', 3.5);

insert into public.anotacoes (autor_id, tipo, titulo, conteudo, compartilhada) values
  ('00000000-0000-0000-0000-0000000000a1', 'pedagogica', 'Nota privada do prof 1',     'texto', false),
  ('00000000-0000-0000-0000-0000000000a1', 'pedagogica', 'Nota compartilhada prof 1',  'texto', true);

insert into public.avisos (titulo, conteudo, publico, turma_id, data_publicacao, validade) values
  ('Aviso geral',        'x', 'todos',       null, current_date - 1, null),
  ('Aviso alunos',       'x', 'alunos',      null, current_date - 1, null),
  ('Aviso professores',  'x', 'professores', null, current_date - 1, null),
  ('Aviso turma 1B',     'x', 'turma', '00000000-0000-0000-0000-000000000702', current_date - 1, null),
  ('Aviso vencido',      'x', 'todos',       null, current_date - 10, current_date - 2),
  ('Aviso agendado',     'x', 'todos',       null, current_date + 3, null);

-- A partir daqui as consultas rodam como usuário logado -----------------
set local role authenticated;

-- ===== ANÔNIMO: sem acesso ==========================================
reset role; set local role anon;
select pg_temp.ok(pg_temp.bloqueou('select * from public.alunos'), 'visitante anônimo NÃO lê alunos');
select pg_temp.ok(pg_temp.bloqueou('select * from public.avisos'), 'visitante anônimo NÃO lê avisos');
reset role; set local role authenticated;

-- ===== ALUNO 1 (turma 1A) ============================================
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok(pg_temp.conta('select 1 from public.alunos') = 1,        'aluno vê somente o próprio cadastro');
select pg_temp.ok(pg_temp.conta('select 1 from public.atividades') = 1,    'aluno vê apenas atividades da própria turma');
select pg_temp.ok(pg_temp.conta('select 1 from public.eventos') = 2,       'aluno vê evento geral + da própria turma (não vê 1B)');
select pg_temp.ok(pg_temp.conta('select 1 from public.recuperacoes') = 1,  'aluno vê apenas a própria recuperação');
select pg_temp.ok(pg_temp.conta('select 1 from public.anotacoes') = 0,     'aluno NÃO vê anotações');
select pg_temp.ok(pg_temp.conta('select 1 from public.avisos') = 2,        'aluno vê só avisos vigentes (todos + alunos); não vê professores, outra turma, vencido, agendado');
select pg_temp.ok(pg_temp.conta('select 1 from public.perfis') = 1,        'aluno vê só o próprio perfil');
select pg_temp.ok(pg_temp.conta('select 1 from public.auditoria') = 0,     'aluno NÃO vê auditoria');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.eventos(titulo,categoria,data) values ('x x x','feriado',current_date)$q$), 'aluno NÃO cria evento');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.atividades(tipo,titulo,disciplina_id,turma_id,data_realizacao) values ('prova','Hack','00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-000000000701',current_date)$q$), 'aluno NÃO cria prova');
select pg_temp.ok(pg_temp.afetou($q$update public.recuperacoes set nota_recuperacao = 10$q$) = 0, 'aluno NÃO altera recuperação');
select pg_temp.ok(pg_temp.afetou($q$update public.perfis set papel = 'direcao' where id = auth.uid()$q$) = 0, 'aluno NÃO se promove a direção');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.anotacoes(tipo,titulo,conteudo) values ('lembrete','abc','abc')$q$), 'aluno NÃO cria anotação');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.avisos(titulo,conteudo) values ('abc','abc')$q$), 'aluno NÃO publica aviso');
select pg_temp.ok(pg_temp.afetou($q$delete from public.alunos$q$) = 0, 'aluno NÃO exclui alunos');

-- ===== PROFESSOR 1 (Matemática na 1A) ================================
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.conta('select 1 from public.alunos') = 1,        'professor vê só alunos das suas turmas');
select pg_temp.ok(pg_temp.conta('select 1 from public.atividades') = 1,    'professor vê atividades das suas turmas');
select pg_temp.ok(pg_temp.conta('select 1 from public.recuperacoes') = 1,  'professor vê recuperações da sua turma/disciplina');
select pg_temp.ok(pg_temp.conta('select 1 from public.anotacoes') = 2,     'professor vê as próprias anotações');
select pg_temp.ok(pg_temp.conta('select 1 from public.avisos') = 2,        'professor vê avisos: todos + professores (e não os de turma alheia)');
select pg_temp.ok(pg_temp.conta('select 1 from public.perfis') = 1,        'professor vê só o próprio perfil (nome de colegas só pela view v_professores)');
select pg_temp.ok(pg_temp.conta('select 1 from public.v_professores') = 2, 'professor lista nomes de professores pela view');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.atividades(tipo,titulo,disciplina_id,turma_id,professor_id,data_realizacao) values ('prova','Prova nova','00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-000000000701',auth.uid(),current_date+9)$q$), 'professor cria prova na sua turma/disciplina');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.atividades(tipo,titulo,disciplina_id,turma_id,professor_id,data_realizacao) values ('prova','Prova indevida','00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-000000000702',auth.uid(),current_date+9)$q$), 'professor NÃO cria prova em turma alheia');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.atividades(tipo,titulo,disciplina_id,turma_id,professor_id,data_realizacao) values ('prova','Prova indevida','00000000-0000-0000-0000-000000000d02','00000000-0000-0000-0000-000000000701',auth.uid(),current_date+9)$q$), 'professor NÃO cria prova de disciplina que não leciona');
select pg_temp.ok(pg_temp.afetou($q$update public.atividades set titulo = 'Alterada por outro' where titulo = 'Trab 1B'$q$) = 0, 'professor NÃO altera atividade de outro professor');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.eventos(titulo,categoria,data) values ('abc','feriado',current_date)$q$), 'professor NÃO cria evento do calendário');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.avisos(titulo,conteudo) values ('abc','abc')$q$), 'professor NÃO publica aviso');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.alunos(nome,matricula) values ('Novo Aluno','T-999')$q$), 'professor NÃO cadastra aluno');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.recuperacoes(aluno_id,turma_id,disciplina_id,professor_id,nota_anterior) values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000d01',auth.uid(),5)$q$), 'professor cadastra recuperação na sua turma/disciplina');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.recuperacoes(aluno_id,turma_id,disciplina_id,professor_id,nota_anterior) values ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000d02',auth.uid(),5)$q$), 'professor NÃO cadastra recuperação em turma alheia');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.anotacoes(tipo,titulo,conteudo) values ('lembrete','Meu lembrete','texto')$q$), 'professor cria anotação própria');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.anotacoes(autor_id,tipo,titulo,conteudo) values ('00000000-0000-0000-0000-0000000000a2','lembrete','Em nome de outro','texto')$q$), 'professor NÃO cria anotação em nome de outra pessoa');

-- ===== PROFESSOR 2 ===================================================
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(pg_temp.conta('select 1 from public.anotacoes') = 0, 'professor NÃO vê anotações de outro professor');
select pg_temp.ok(pg_temp.conta('select 1 from public.alunos') = 1,    'professor 2 vê só alunos da sua turma');

-- ===== SECRETARIA ====================================================
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok(pg_temp.conta('select 1 from public.alunos') = 2,        'secretaria vê todos os alunos');
select pg_temp.ok(pg_temp.conta('select 1 from public.recuperacoes') >= 2, 'secretaria consulta recuperações (relatórios)');
select pg_temp.ok(pg_temp.conta('select 1 from public.avisos') = 6,        'secretaria vê todos os avisos (inclui vencido e agendado)');
select pg_temp.ok(pg_temp.conta('select 1 from public.anotacoes') = 0,     'secretaria NÃO lê anotações alheias');
select pg_temp.ok(not pg_temp.bloqueou($q$select public.salvar_aluno(null,'Aluno Novo Teste','T-777','novo@teste.local','00000000-0000-0000-0000-000000000701',2026,'ativa')$q$), 'secretaria cadastra aluno + matrícula');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.avisos(titulo,conteudo) values ('Aviso novo','texto')$q$), 'secretaria publica aviso');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.eventos(titulo,categoria,data) values ('Feriado teste','feriado',current_date)$q$), 'secretaria cria evento');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.turmas(nome,serie_id,turno,ano_letivo) values ('1C','00000000-0000-0000-0000-000000000501','integral',2026)$q$), 'secretaria gerencia turmas');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.recuperacoes(aluno_id,turma_id,disciplina_id,nota_anterior) values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000d01',5)$q$), 'secretaria NÃO cadastra recuperação');
select pg_temp.ok(pg_temp.afetou($q$delete from public.alunos where matricula = 'T-777'$q$) = 0, 'secretaria NÃO exclui aluno (só a Direção)');
select pg_temp.ok(pg_temp.afetou($q$update public.perfis set papel='direcao' where id <> auth.uid()$q$) = 0, 'secretaria NÃO altera perfis');
select pg_temp.ok(pg_temp.conta('select 1 from public.auditoria') = 0, 'secretaria NÃO vê auditoria');

-- ===== DIREÇÃO =======================================================
select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select pg_temp.ok(pg_temp.conta('select 1 from public.perfis') = 6,         'direção vê todos os perfis');
select pg_temp.ok(pg_temp.conta('select 1 from public.atividades') >= 3,    'direção vê todas as atividades');
select pg_temp.ok(pg_temp.conta('select 1 from public.anotacoes') = 1,      'direção só lê anotação COMPARTILHADA pelo autor');
select pg_temp.ok(pg_temp.conta('select 1 from public.auditoria') > 0,      'direção consulta a auditoria');
select pg_temp.ok(pg_temp.afetou($q$update public.perfis set ativo = false where email = 'prof2@teste.local'$q$) = 1, 'direção desativa usuário');
select pg_temp.ok(pg_temp.bloqueou($q$update public.perfis set ativo = false where id = auth.uid()$q$), 'direção NÃO desativa a si mesma');
select pg_temp.ok(pg_temp.bloqueou($q$update public.perfis set papel = 'aluno' where id = auth.uid()$q$), 'direção NÃO rebaixa a si mesma');
select pg_temp.ok(pg_temp.afetou($q$delete from public.alunos where matricula = 'T-777'$q$) = 1, 'direção exclui aluno (direito de eliminação LGPD)');
select pg_temp.ok(not pg_temp.bloqueou($q$insert into public.recuperacoes(aluno_id,turma_id,disciplina_id,nota_anterior) values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000d01',5)$q$), 'direção cadastra recuperação');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.recuperacoes(aluno_id,turma_id,disciplina_id,situacao) values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000d01','concluida')$q$), 'banco recusa recuperação concluída sem nota (validação)');
select pg_temp.ok(pg_temp.bloqueou($q$insert into public.recuperacoes(aluno_id,turma_id,disciplina_id,nota_anterior) values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000d01',11)$q$), 'banco recusa nota maior que 10 (validação)');

-- ===== USUÁRIO DESATIVADO perde o acesso ==============================
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(pg_temp.conta('select 1 from public.alunos') = 0, 'usuário desativado não enxerga mais nada');

reset role;
select 'TODOS OS TESTES DE PERMISSÃO PASSARAM' as resultado;
rollback;  -- nada do que foi criado acima permanece no banco

-- ---------------------------------------------------------------------
-- HORÁRIOS (migração 002): aluno só lê a própria turma; só Direção grava.
-- Rodar manualmente após aplicar 002 e 003, simulando cada papel como nos testes acima.
--   select count(*) from public.horarios;                     -- direção/secretaria/professor: todas as linhas
--   select count(*) from public.horarios;                     -- aluno: apenas a turma vinculada à sua matrícula
--   update public.horario_turmas set turma_id = null;         -- secretaria/professor/aluno: 0 linhas afetadas
-- ---------------------------------------------------------------------
