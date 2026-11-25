import { addDias, diaDaSemana } from "./datas";

export type ModoCalendario = "mes" | "semana" | "dia";

const partes = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** Primeiro dia (AAAA-MM-01) do mês da data. */
export function primeiroDoMes(iso: string): string {
  const [a, m] = partes(iso);
  return `${a}-${String(m).padStart(2, "0")}-01`;
}

/** Intervalo exibido: mês = 6 semanas completas (domingo a sábado). */
export function intervaloDoModo(modo: ModoCalendario, ref: string): [string, string] {
  if (modo === "dia") return [ref, ref];
  if (modo === "semana") {
    const ini = addDias(ref, -diaDaSemana(ref));
    return [ini, addDias(ini, 6)];
  }
  const primeiro = primeiroDoMes(ref);
  const ini = addDias(primeiro, -diaDaSemana(primeiro));
  return [ini, addDias(ini, 41)];
}

/** Move a data de referência para frente/trás conforme o modo. */
export function mover(modo: ModoCalendario, ref: string, dir: 1 | -1): string {
  if (modo === "mes") {
    const [a, m] = partes(ref);
    const d = new Date(Date.UTC(a, m - 1 + dir, 1));
    return d.toISOString().slice(0, 10);
  }
  return addDias(ref, dir * (modo === "semana" ? 7 : 1));
}

export interface ItemCalendario {
  origem: "evento" | "atividade";
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string;
  data: string;
  data_fim: string;
  hora: string | null;
  turma_id: string | null;
  disciplina_id: string | null;
  professor_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bruto: any;
}

export function itensDoDia(itens: ItemCalendario[], dia: string): ItemCalendario[] {
  return itens
    .filter((i) => i.data <= dia && dia <= i.data_fim)
    .sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
}
