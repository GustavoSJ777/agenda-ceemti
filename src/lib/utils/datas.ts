const FUSO = "America/Sao_Paulo";

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília, independente do fuso do servidor. */
export function hojeISO(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}
export function anoAtual(): number {
  return Number(hojeISO().slice(0, 4));
}
/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' (sem converter fuso, evita o erro de um dia). */
export function fmtData(s?: string | null): string {
  if (!s) return "—";
  const [a, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
export function fmtHora(s?: string | null): string {
  return s ? s.slice(0, 5) : "";
}
export function fmtDataHora(ts?: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(ts)).replace(",", "");
}
/** Soma dias a uma data ISO. */
export function addDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
