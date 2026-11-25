-- Reverte 006: remove o cadastro de professores do horário (a grade, matérias e restrições não são afetadas).
begin;
drop table if exists public.horario_professores;
commit;
