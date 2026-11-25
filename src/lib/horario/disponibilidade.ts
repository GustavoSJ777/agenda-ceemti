import { HORARIO_AULA, NOME_DIA } from "./tipos";

export interface FaixaIndisponivel { dia_semana: number; aula_de: number; aula_ate: number }

/**
 * Converte "o professor pode nos dias X, da aula A até a aula B" em faixas em que ele NÃO pode.
 * Dia fora da lista = dia todo bloqueado (1ª a 9ª). Nos dias liberados, bloqueia antes de A e depois de B.
 */
export function disponibilidadeParaRestricoes(dias: number[], de: number, ate: number): FaixaIndisponivel[] {
  const r: FaixaIndisponivel[] = [];
  for (const d of [1, 2, 3, 4, 5]) {
    if (!dias.includes(d)) { r.push({ dia_semana: d, aula_de: 1, aula_ate: 9 }); continue; }
    if (de > 1) r.push({ dia_semana: d, aula_de: 1, aula_ate: de - 1 });
    if (ate < 7) r.push({ dia_semana: d, aula_de: ate + 1, aula_ate: 7 });
  }
  return r;
}

const hora = (t: string) => t.replace(":", "h").replace(/h00$/, "h");

/** Texto curto gravado como motivo (também serve para o sistema reconhecer o que veio deste formulário). */
export function descreverDisponibilidade(dias: number[], de: number, ate: number): string {
  const ord = [...new Set(dias)].sort();
  const seq = ord.length > 2 && ord.every((d, i) => i === 0 || d === ord[i - 1] + 1);
  const nomes = ord.map((d) => NOME_DIA[d].slice(0, 3));
  const diasTxt = seq ? `${nomes[0]} a ${nomes[nomes.length - 1]}` : nomes.join(", ");
  const partes = [diasTxt];
  if (de > 1) partes.push(`a partir das ${hora(HORARIO_AULA[de][0])}`);
  if (ate < 7) partes.push(`até ${hora(HORARIO_AULA[ate][1])}`);
  return `Disponibilidade: ${partes.join(", ")}`;
}

/** Operação inversa: a partir das faixas bloqueadas, recupera dias liberados e a faixa de aulas (para preencher o formulário). */
export function restricoesParaDisponibilidade(faixas: FaixaIndisponivel[]): { dias: number[]; de: number; ate: number } {
  const diaTodo = (d: number) => faixas.some((f) => f.dia_semana === d && f.aula_de <= 1 && f.aula_ate >= 9);
  const dias = [1, 2, 3, 4, 5].filter((d) => !diaTodo(d));
  const doDiaLiberado = faixas.filter((f) => dias.includes(f.dia_semana));
  const antes = doDiaLiberado.filter((f) => f.aula_de <= 1 && f.aula_ate < 9).map((f) => f.aula_ate + 1);
  const depois = doDiaLiberado.filter((f) => f.aula_de > 1).map((f) => f.aula_de - 1);
  return { dias, de: antes.length ? Math.max(...antes) : 1, ate: depois.length ? Math.min(...depois) : 7 };
}
