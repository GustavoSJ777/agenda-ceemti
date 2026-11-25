-- Desfaz 002/003 (apaga somente as tabelas do horário; nenhuma outra tabela é afetada).
drop table if exists public.horarios;
drop table if exists public.horario_turmas;
