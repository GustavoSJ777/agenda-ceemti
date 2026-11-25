import { horaCurta, type AulaHorario } from "@/lib/utils/horario";
import { fmtData } from "@/lib/utils/datas";
import { NOME_ESCOLA } from "@/constants";

export const NOME_DIA_LONGO = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
const NOME = NOME_DIA_LONGO;
const CURTO = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

/** Regras de impressão: A4 na horizontal e uma página por quadro. */
export const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 landscape; margin: 6mm; }
  html, body { background: #fff !important; }
  .dia-bloco { break-after: page; break-inside: avoid; }
  .dia-bloco:last-of-type { break-after: auto; }
  .dia-bloco h2 { font-size: 12pt; margin: 0 0 3px; }
  .quadro { font-size: 9pt !important; line-height: 1.15 !important; width: 100% !important; min-width: 0 !important; }
  .quadro tr { break-inside: avoid; }
  .quadro th, .quadro td { border: 1px solid #777 !important; padding: 4px 2px !important; background: #fff !important; color: #000 !important; position: static !important; }
  .quadro small { font-size: 7.5pt !important; line-height: 1.1 !important; color: #000 !important; }
}`;

/** "1ªI01-EMI ANC" → "1ªI01\nEMI ANC": cabeçalho em 2 linhas para caber todas as turmas na tela. */
function rotuloTurma(t: string) {
  return t.replace(/\s*-\s*/, "\n");
}

function Celula({ itens }: { itens: AulaHorario[] }) {
  if (itens.length === 0) return <span className="text-texto-suave">—</span>;
  return (
    <>
      {itens.map((a) => (
        <span key={a.id} className="block">
          <strong className="block font-extrabold">{a.disciplina}</strong>
          {a.professor && <small className="block text-[0.9em] text-texto-suave">{a.professor}</small>}
          {a.sala && <small className="block text-[0.9em] text-texto-suave">{a.sala}</small>}
        </span>
      ))}
    </>
  );
}

/** Horário (linha) de cada aula, a partir da primeira aula encontrada com aquele número. */
function Horario({ n, aulas }: { n: number; aulas: AulaHorario[] }) {
  const ref = aulas.find((a) => a.aula === n);
  return (
    <th scope="row" className="sticky left-0 z-10 bg-azul-50 px-1 py-1 text-center font-extrabold">
      {n}ª
      {ref && <small className="block font-normal text-texto-suave">{horaCurta(ref.inicio)}<br />{horaCurta(ref.fim)}</small>}
    </th>
  );
}

function Moldura({ titulo, vigencia, rotulo, colunas, children }: { titulo: string; vigencia?: string; rotulo: string; colunas: number; children: React.ReactNode }) {
  // Até ~10 colunas a tabela cabe até no celular; com todas as turmas, o celular rola para o lado.
  const minimo = colunas > 8 ? "min-w-[1000px] xl:min-w-0" : colunas > 5 ? "min-w-[640px] md:min-w-0" : "";
  return (
    <section className="dia-bloco space-y-2" aria-label={rotulo}>
      <div className="hidden text-center print:block"><div className="text-lg font-extrabold">{NOME_ESCOLA}</div></div>
      <h2 className="text-lg font-extrabold">
        {titulo}
        {vigencia ? <span className="ml-2 text-sm font-normal text-texto-suave print:text-black">vale desde {fmtData(vigencia)}</span> : null}
      </h2>
      <div className="overflow-x-auto rounded-card border border-borda bg-white shadow-card print:overflow-visible print:border-0 print:shadow-none">
        <table className={`quadro w-full table-fixed border-collapse text-center text-[11px] leading-tight ${minimo}`} aria-label={rotulo}>
          {children}
        </table>
      </div>
    </section>
  );
}

/** Um dia, todas as turmas: turmas nas colunas, aulas nas linhas. */
export function QuadroDia({ dia, aulas, turmas, vigencia }: { dia: number; aulas: AulaHorario[]; turmas: string[]; vigencia?: string }) {
  const doDia = aulas.filter((a) => a.dia_semana === dia);
  const nums = [...new Set(doDia.map((a) => a.aula))].sort((a, b) => a - b);
  const cols = turmas.filter((t) => doDia.some((a) => a.turma_codigo === t));
  if (cols.length === 0) {
    return (
      <section className="dia-bloco space-y-2">
        <h2 className="text-lg font-extrabold">Horário de {NOME[dia]}</h2>
        <div className="card text-center text-texto-suave">Sem aulas cadastradas neste dia.</div>
      </section>
    );
  }
  return (
    <Moldura titulo={`Horário de ${NOME[dia]}`} vigencia={vigencia} rotulo={`Quadro de horários de ${NOME[dia]}`} colunas={cols.length}>
      <colgroup><col className="w-[52px]" />{cols.map((t) => <col key={t} />)}</colgroup>
      <thead>
        <tr>
          <th scope="col" className="sticky left-0 z-10 bg-azul-100 px-1 py-1.5 font-extrabold">Aula</th>
          {cols.map((t) => (
            <th key={t} scope="col" className="whitespace-pre-line break-words border-l border-borda bg-azul-100 px-0.5 py-1.5 font-extrabold">{rotuloTurma(t)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {nums.map((n) => (
          <tr key={n} className="border-t border-borda odd:bg-white even:bg-azul-50/40">
            <Horario n={n} aulas={doDia} />
            {cols.map((t) => (
              <td key={t} className="break-words border-l border-borda px-0.5 py-1 align-middle">
                <Celula itens={doDia.filter((a) => a.turma_codigo === t && a.aula === n)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Moldura>
  );
}

/** Uma turma, semana toda: dias nas colunas, aulas nas linhas. */
export function QuadroTurma({ turma, aulas, vigencia }: { turma: string; aulas: AulaHorario[]; vigencia?: string }) {
  const daTurma = aulas.filter((a) => a.turma_codigo === turma);
  const nums = [...new Set(daTurma.map((a) => a.aula))].sort((a, b) => a - b);
  const dias = [1, 2, 3, 4, 5];
  if (daTurma.length === 0) return <div className="card text-center text-texto-suave">Sem aulas cadastradas para esta turma.</div>;
  return (
    <Moldura titulo={`Horário da turma ${turma}`} vigencia={vigencia} rotulo={`Horário semanal da turma ${turma}`} colunas={5}>
      <colgroup><col className="w-[56px]" />{dias.map((d) => <col key={d} />)}</colgroup>
      <thead>
        <tr>
          <th scope="col" className="sticky left-0 z-10 bg-azul-100 px-1 py-1.5 font-extrabold">Aula</th>
          {dias.map((d) => <th key={d} scope="col" className="border-l border-borda bg-azul-100 px-1 py-1.5 font-extrabold">{CURTO[d]}</th>)}
        </tr>
      </thead>
      <tbody className="text-[10px] sm:text-xs">
        {nums.map((n) => (
          <tr key={n} className="border-t border-borda odd:bg-white even:bg-azul-50/40">
            <Horario n={n} aulas={daTurma} />
            {dias.map((d) => (
              <td key={d} className="break-words border-l border-borda px-1 py-1 align-middle">
                <Celula itens={daTurma.filter((a) => a.dia_semana === d && a.aula === n)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Moldura>
  );
}
