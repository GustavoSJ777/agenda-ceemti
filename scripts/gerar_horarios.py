#!/usr/bin/env python3 -I
"""Gera database/migrations/003_horarios_dados.sql a partir do horário oficial (.docx).

Uso:  python3 -I scripts/gerar_horarios.py scripts/horario-oficial-2026-03-02.docx 2026-03-02
Requer: pip install python-docx
Tabelas 1..5 do documento = segunda a sexta (ordem do documento). Nada é inventado: o texto original de cada
célula é guardado em `texto_original`; disciplina/professor/sala são extraídos por regra e revisáveis.
"""
import re, sys, unicodedata
import docx

AULAS = {1: ("07:30", "08:20"), 2: ("08:20", "09:10"), 3: ("09:30", "10:20"), 4: ("10:20", "11:10"), 5: ("11:10", "12:00"),
         6: ("13:20", "14:10"), 7: ("14:10", "15:00"), 8: ("15:20", "16:10"), 9: ("16:10", "17:00")}
SALA = re.compile(r"(SALA\s*PV|SALA\s*\d+|SAL[ÃA]O\s*ARTE|LAB\.?\s*[A-ZÇ]+(?:\s+[A-ZÇ]+)?|LIED\s*\d+|QUADRA|BIBLIOTECA|CLUBE)\s*$", re.I)

def limpa(s): return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()
def chave_nome(s): return unicodedata.normalize("NFC", s.upper().replace(".", "").strip())
def q(s): return "null" if s is None else "'" + s.replace("'", "''") + "'"

def separa_sala(txt):
    partes = [p.strip() for p in txt.split("/")]
    ult = partes[-1]
    m = SALA.search(ult)
    if not m: return partes, None
    sala = limpa(m.group(1))
    resto = ult[:m.start()].strip()
    partes = partes[:-1] + ([resto] if resto else [])
    return partes, sala

def main(caminho, vigencia):
    d = docx.Document(caminho)
    celulas = []  # (dia, aula, codigo, texto)
    codigos = None
    nomes = set()
    for ti, t in enumerate(d.tables):
        hdr = [limpa(c.text) for c in t.rows[0].cells][1:]
        codigos = hdr
        for r in t.rows[1:]:
            cs = r.cells
            rot = limpa(cs[0].text)
            m = re.match(r"(\d)ª", rot)
            if not m: continue  # LANCHE / ALMOÇO
            aula = int(m.group(1))
            unicos = []
            for c in cs:
                if c._tc not in [u._tc for u in unicos]: unicos.append(c)
            if len(unicos) < len(cs):  # linha mesclada (ex.: reunião geral)
                texto = limpa(" ".join(c.text for c in unicos[1:]))
                for cod in hdr: celulas.append((ti + 1, aula, cod, texto, True))
                continue
            for cod, c in zip(hdr, cs[1:]):
                celulas.append((ti + 1, aula, cod, limpa(c.text.replace("\n", " / ")), False))
    # nomes de professores: células "DISC / PROF / SALA"
    for dia, aula, cod, txt, mesclada in celulas:
        if mesclada: continue
        partes, sala = separa_sala(txt)
        if sala and len(partes) == 2:
            for tk in partes[1].replace(".", " ").split(): nomes.add(chave_nome(tk))
    linhas = []
    for dia, aula, cod, txt, mesclada in celulas:
        disc = prof = sala = None
        if mesclada:
            disc = txt.split("OBS:")[0].strip() + " (estudantes dispensados às 15h20)" if "OBS" in txt else txt
        elif txt.upper() == "ELETIVA":
            disc = "ELETIVA"
        else:
            partes, sala = separa_sala(txt)
            discs, profs = [], []
            for p in partes:
                toks = p.replace(".", " ").split()
                if toks and all(chave_nome(t) in nomes for t in toks): profs.append(p)
                else:
                    # "SSR DANIEL": separa nomes no final da parte
                    k = len(toks)
                    while k > 0 and chave_nome(toks[k - 1]) in nomes: k -= 1
                    if 0 < k < len(toks) and p == partes[-1]:
                        discs.append(" ".join(p.split()[:k])); profs.append(" ".join(p.split()[k:]))
                    else: discs.append(p)
            if sala and sala.upper() == "CLUBE" and not discs:
                discs, profs = ["CLUBE"], profs
            disc = " / ".join(discs) if discs else (txt if not profs else "(ver texto original)")
            prof = " / ".join(profs) if profs else None
        ini, fim = AULAS[aula]
        linhas.append((cod, dia, aula, ini, fim, disc, prof, sala, txt))
    cods = sorted({l[0] for l in linhas}, key=lambda c: codigos.index(c))
    out = ["-- Gerado por scripts/gerar_horarios.py a partir do horário oficial. NÃO edite à mão: gere de novo.",
           f"-- Vigência: a partir de {vigencia}. Dias: tabelas 1..5 do documento = segunda a sexta.",
           "begin;"]
    out.append("insert into public.horario_turmas (codigo) values")
    out.append(",\n".join(f"  ({q(c)})" for c in cods) + "\non conflict (codigo) do nothing;")
    out.append("delete from public.horarios where vigente_desde = " + q(vigencia) + ";")
    out.append("insert into public.horarios (turma_codigo, dia_semana, aula, inicio, fim, disciplina, professor, sala, texto_original, vigente_desde) values")
    out.append(",\n".join(f"  ({q(c)}, {dia}, {a}, {q(i)}, {q(f)}, {q(di)}, {q(p)}, {q(s)}, {q(t)}, {q(vigencia)})" for c, dia, a, i, f, di, p, s, t in linhas) + ";")
    out.append("""
-- Vincula automaticamente turmas cujo nome seja igual ao código do horário (ignorando espaços e maiúsculas).
-- Os demais códigos são vinculados pela tela do Calendário (Direção).
update public.horario_turmas h set turma_id = t.id
  from public.turmas t
 where h.turma_id is null
   and lower(regexp_replace(t.nome, '\\s', '', 'g')) = lower(regexp_replace(h.codigo, '\\s', '', 'g'));
commit;""")
    open("database/migrations/003_horarios_dados.sql", "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(len(cods), "turmas;", len(linhas), "linhas")
    # relatório de revisão
    sem = [l for l in linhas if l[5].startswith("(ver") or (l[6] is None and l[5] not in ("ELETIVA",) and "dispensados" not in l[5])]
    print("sem professor/sala identificados:", len(sem))
    for l in sem[:15]: print("  ", l[0], l[1], l[2], "|", l[8])

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
