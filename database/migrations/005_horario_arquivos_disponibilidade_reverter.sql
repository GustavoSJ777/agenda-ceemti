-- Desfaz 005. Apague antes os PDFs no painel (Storage > horarios) se quiser remover o bucket.
drop function if exists public.definir_disponibilidade(text, jsonb);
drop table if exists public.horario_arquivos;
