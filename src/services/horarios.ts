import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { medir } from "@/lib/tempos";
import { checar } from "@/lib/actions/resultado";
import { obterPerfil } from "@/lib/auth";
import { cacheCurto } from "@/lib/cache-curto";
import type { AulaHorario } from "@/lib/utils/horario";

export interface TurmaHorario { codigo: string; turma_id: string | null }
export interface DadosHorario { aulas: AulaHorario[]; turmas: TurmaHorario[] }

const COLUNAS = "id,turma_codigo,dia_semana,aula,inicio,fim,disciplina,professor,sala,vigente_desde";

/**
 * Horário visível ao usuário. Só baixa a grade quando ela será usada: aluno (o RLS já limita à própria turma)
 * ou quando uma turma foi escolhida no filtro (consulta filtrada no banco). Nos demais casos lê só a lista de turmas.
 */
export function carregarHorarios(sb: SupabaseClient, usuarioId: string, turmaId?: string): Promise<DadosHorario> {
  return cacheCurto(`hor:${usuarioId}:${turmaId ?? "-"}`, 30, () => medir("horarios", async () => {
    const perfil = await obterPerfil();
    const quer = perfil?.papel === "aluno" || Boolean(turmaId);
    const consultaAulas = !quer ? null
      : turmaId
        ? sb.from("horarios").select(`${COLUNAS},horario_turmas!inner(turma_id)`).eq("horario_turmas.turma_id", turmaId).order("aula").limit(2000)
        : sb.from("horarios").select(COLUNAS).order("aula").limit(2000);
    const [a, t] = await Promise.all([consultaAulas, sb.from("horario_turmas").select("codigo,turma_id").order("codigo")]);
    // Tabelas ainda não criadas (migração 002 pendente): o calendário segue funcionando, só sem o horário.
    const ausente = (e: { code?: string } | null | undefined) => e?.code === "42P01" || e?.code === "PGRST205";
    if (ausente(a?.error) || ausente(t.error)) return { aulas: [], turmas: [] };
    const aulas = a
      ? (checar(a) as unknown as (AulaHorario & { horario_turmas?: unknown })[]).map((x) => { const { horario_turmas, ...resto } = x; void horario_turmas; return resto as AulaHorario; })
      : [];
    return { aulas, turmas: checar(t) as TurmaHorario[] };
  }));
}
