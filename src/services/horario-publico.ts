import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cacheCurto } from "@/lib/cache-curto";
import type { AulaHorario } from "@/lib/utils/horario";

export interface ArquivoPublico { id: string; nome: string; vigente_desde: string | null }
export interface HorarioPublico { aulas: AulaHorario[]; turmas: string[]; arquivos: ArquivoPublico[] }

/**
 * Horário para a página PÚBLICA (sem login). Lê com a service role, só no servidor, e devolve apenas os campos
 * do quadro de horários (turma, dia, aula, matéria, professor, sala). Nada de alunos, e-mails ou ids de turma.
 */
export function carregarHorarioPublico(): Promise<HorarioPublico> {
  return cacheCurto("horario-publico", 300, async () => {
    const sb = criarClienteAdmin();
    const [a, t, f] = await Promise.all([
      sb.from("horarios").select("id,turma_codigo,dia_semana,aula,inicio,fim,disciplina,professor,sala,vigente_desde").order("aula").limit(5000),
      sb.from("horario_turmas").select("codigo").order("codigo"),
      sb.from("horario_arquivos").select("id,nome,vigente_desde").order("criado_em", { ascending: false }).limit(3),
    ]);
    const ausente = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";
    if (ausente(a.error) || ausente(t.error)) return { aulas: [], turmas: [], arquivos: [] };
    if (a.error || t.error) throw new Error("Falha ao carregar o horário público.");
    return { aulas: a.data as AulaHorario[], turmas: (t.data as { codigo: string }[]).map((x) => x.codigo), arquivos: f.error ? [] : (f.data as ArquivoPublico[]) };
  });
}
