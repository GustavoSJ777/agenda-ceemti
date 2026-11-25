import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio } from "@/lib/actions/resultado";
import { NOME_ESCOLA, NOME_SISTEMA } from "@/constants";
import { emailDaMatricula } from "@/lib/utils/login-aluno";
import { COLUNAS, LIMITE_BYTES, LIMITE_LINHAS, esquemaLinhaAluno, normalizarCabecalho } from "@/lib/validations/importar-alunos";
import { gerarSenhaProvisoria } from "./senha-provisoria";
import type { Perfil } from "@/types";

export interface LinhaPlanilha { linha: number; matricula: string; nome: string; turma?: string }
export interface Credencial { matricula: string; nome: string; turma: string; senha: string }
export interface ResultadoImportacao {
  credenciais: Credencial[];
  ignorados: { linha: number; matricula: string; motivo: string }[];
  total: number;
}

const textoCelula = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text ?? "").trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
};

/** Lê a planilha (.xlsx): primeira aba, cabeçalho na primeira linha com Matrícula e Nome (Turma opcional). */
export async function lerPlanilha(buffer: Buffer): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new ErroNegocio("Arquivo inválido. Envie uma planilha .xlsx."); }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErroNegocio("A planilha está vazia.");

  const cab: Record<string, number> = {};
  ws.getRow(1).eachCell((c, col) => {
    const n = normalizarCabecalho(textoCelula(c.value));
    for (const [campo, nomes] of Object.entries(COLUNAS)) if ((nomes as readonly string[]).includes(n) && !(campo in cab)) cab[campo] = col;
  });
  if (!cab.matricula || !cab.nome) throw new ErroNegocio("A primeira linha precisa ter as colunas “Matrícula” e “Nome”.");

  const linhas: LinhaPlanilha[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const matricula = textoCelula(r.getCell(cab.matricula).value);
    const nome = textoCelula(r.getCell(cab.nome).value);
    const turma = cab.turma ? textoCelula(r.getCell(cab.turma).value) : undefined;
    if (!matricula && !nome) continue;
    linhas.push({ linha: i, matricula, nome, turma });
    if (linhas.length > LIMITE_LINHAS) throw new ErroNegocio(`A planilha tem mais de ${LIMITE_LINHAS} alunos. Divida em partes.`);
  }
  if (!linhas.length) throw new ErroNegocio("Nenhum aluno encontrado na planilha.");
  return linhas;
}

export function validarTamanho(arquivo: File) {
  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) throw new ErroNegocio("Envie um arquivo .xlsx.");
  if (arquivo.size > LIMITE_BYTES) throw new ErroNegocio("Arquivo muito grande (máximo 2 MB).");
}

const chaveTurma = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");

/**
 * Cadastra aluno + matrícula (RPC com o RLS do usuário) e cria o login (matrícula) com senha provisória.
 * Alunos já cadastrados com acesso são ignorados; alunos sem acesso apenas ganham o login.
 */
export async function importarAlunos(
  chamador: Perfil, linhas: LinhaPlanilha[], turmas: { id: string; nome: string }[], turmaPadrao: string | undefined, ano: number,
): Promise<ResultadoImportacao> {
  if (chamador.papel !== "direcao" && chamador.papel !== "secretaria") throw new ErroNegocio("Você não tem permissão para importar alunos.");
  const sb = await criarClienteServidor();
  const admin = criarClienteAdmin();
  const porNome = new Map(turmas.map((t) => [chaveTurma(t.nome), t]));
  const padrao = turmas.find((t) => t.id === turmaPadrao);
  const res: ResultadoImportacao = { credenciais: [], ignorados: [], total: linhas.length };
  const vistas = new Set<string>();

  for (const l of linhas) {
    const pular = (motivo: string) => res.ignorados.push({ linha: l.linha, matricula: l.matricula, motivo });
    const v = esquemaLinhaAluno.safeParse(l);
    if (!v.success) { pular(v.error.issues[0].message); continue; }
    const chave = v.data.matricula.toLowerCase();
    if (vistas.has(chave)) { pular("Matrícula repetida na planilha."); continue; }
    vistas.add(chave);
    const turma = l.turma ? porNome.get(chaveTurma(l.turma)) : padrao;
    if (!turma) { pular(l.turma ? `Turma “${l.turma}” não existe neste ano letivo.` : "Sem turma: escolha uma turma padrão."); continue; }

    try {
      const { data: ex } = await admin.from("alunos").select("id,nome,perfil_id").eq("matricula", v.data.matricula).maybeSingle();
      let alunoId = ex?.id as string | undefined;
      if (ex?.perfil_id) { pular("Aluno já possui acesso."); continue; }
      if (!alunoId) {
        const { data, error } = await sb.rpc("salvar_aluno", {
          p_aluno_id: null, p_nome: v.data.nome, p_matricula: v.data.matricula, p_email: null,
          p_turma_id: turma.id, p_ano: ano, p_situacao: "ativa",
        });
        if (error || !data) { pular("Não foi possível cadastrar o aluno."); continue; }
        alunoId = data as string;
      }
      const senha = gerarSenhaProvisoria();
      const email = emailDaMatricula(v.data.matricula);
      const nome = ex?.nome ?? v.data.nome;
      const { data: novo, error: ec } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome, trocar_senha: true },
      });
      if (ec || !novo?.user) { pular(/already|registered/i.test(ec?.message ?? "") ? "Já existe login para esta matrícula." : "Não foi possível criar o login."); continue; }
      const id = novo.user.id;
      const desfazer = async (m: string) => { await admin.auth.admin.deleteUser(id); pular(m); };
      const p = await admin.from("perfis").insert({ id, nome, email, papel: "aluno", ativo: true });
      if (p.error) { await desfazer("Não foi possível criar o perfil."); continue; }
      const vin = await admin.from("alunos").update({ perfil_id: id }).eq("id", alunoId).is("perfil_id", null).select("id");
      if (vin.error || !vin.data?.length) { await desfazer("Não foi possível vincular o acesso."); continue; }
      res.credenciais.push({ matricula: v.data.matricula, nome, turma: turma.nome, senha });
    } catch (e) {
      console.error("importar aluno falhou", l.linha, e instanceof Error ? e.message : e);
      pular("Erro inesperado nesta linha.");
    }
  }
  return res;
}

/** PDF com login (matrícula) e senha provisória de cada aluno. A senha só existe aqui: não é gravada em lugar nenhum. */
export function gerarPdfCredenciais(creds: Credencial[], emitidoPor: string, hoje: string): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(15); doc.setTextColor(29, 93, 147); doc.text(NOME_SISTEMA, 14, 14);
  doc.setFontSize(12); doc.setTextColor(27, 51, 80); doc.text("Acessos dos alunos — login e senha provisória", 14, 21);
  doc.setFontSize(9); doc.setTextColor(90, 112, 136);
  doc.text(`${NOME_ESCOLA} | Emitido em ${hoje} por ${emitidoPor}`, 14, 27);
  doc.text("Login = matrícula. Na primeira entrada o aluno deverá criar uma senha própria. Entregue cada linha somente ao próprio aluno.", 14, 32);
  const ordenado = [...creds].sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
  autoTable(doc, {
    head: [["Turma", "Nome", "Login (matrícula)", "Senha provisória"]],
    body: ordenado.map((c) => [c.turma, c.nome, c.matricula, c.senha]),
    startY: 36, styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [40, 120, 189] },
    alternateRowStyles: { fillColor: [245, 250, 255] }, margin: { left: 14, right: 14, bottom: 16 },
    columnStyles: { 3: { font: "courier", fontStyle: "bold" } },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
      doc.text("CONFIDENCIAL — contém credenciais e dados pessoais (LGPD, Lei 13.709/2018). Guarde com segurança e destrua após a entrega.", 14, h - 8);
    },
  });
  return doc.output("arraybuffer");
}

/** Modelo de planilha para download. */
export async function gerarModelo(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Alunos");
  ws.addRow(["Matrícula", "Nome", "Turma"]).font = { bold: true };
  ws.columns = [{ width: 18 }, { width: 44 }, { width: 14 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
