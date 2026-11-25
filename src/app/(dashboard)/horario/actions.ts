"use server";

import { revalidatePath } from "next/cache";
import { exigirPapel } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ErroNegocio, checar, executar, validar, type EstadoForm } from "@/lib/actions/resultado";
import { lerForm, paraBanco } from "@/lib/forms";
import {
  esquemaAulaGrade, esquemaDemanda, esquemaImportarGrade, esquemaMateria, esquemaProfessor, esquemaDisponibilidade, esquemaGerar, esquemaIndisp, esquemaSala, esquemaSugestao, esquemaTurmaHorario,
} from "@/lib/validations/horario";
import { gerarHorario } from "@/lib/horario/gerador";
import { derivarDaGrade, type AulaOrigem } from "@/lib/horario/derivar";
import { detectarConflitos, sugerirSolucoes, type AulaGrade } from "@/lib/horario/conflitos";
import { descreverDisponibilidade, disponibilidadeParaRestricoes } from "@/lib/horario/disponibilidade";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { BUCKET_HORARIOS } from "@/services/horario-arquivos";
import { HORARIO_AULA, chaveProf, type Demanda, type Indisponibilidade } from "@/lib/horario/tipos";

const PAPEIS = ["direcao", "coordenador"] as const;
const atualizar = () => { revalidatePath("/horario"); revalidatePath("/calendario"); };
const semPermissao = () => new ErroNegocio("Você não tem permissão para realizar esta ação.");

async function sessao() {
  await exigirPapel([...PAPEIS]);
  return criarClienteServidor();
}

export async function salvarTurmaHorario(codigoAtual: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaTurmaHorario, lerForm(fd));
    if (codigoAtual) {
      const r = checar(await sb.from("horario_turmas").update({ turma_id: v.turma_id ?? null, sala_base: v.sala_base ?? null }).eq("codigo", codigoAtual).select("codigo"));
      if (!r?.length) throw semPermissao();
    } else {
      checar(await sb.from("horario_turmas").insert({ codigo: v.codigo, turma_id: v.turma_id ?? null, sala_base: v.sala_base ?? null }));
    }
    atualizar();
    return codigoAtual ? "Turma do horário atualizada." : "Turma adicionada ao horário.";
  });
}


type Sb = Awaited<ReturnType<typeof sessao>>;
const tabelaAusente = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

/** Cadastra, em horario_professores, os nomes que ainda não existem. Não falha se a migração 006 ainda não foi rodada. */
async function garantirProfessores(sb: Sb, textos: string[]) {
  const { data, error } = await sb.from("horario_professores").select("nome");
  if (error) return;
  const ja = new Set((data as { nome: string }[]).map((x) => chaveProf(x.nome)));
  const novos = new Map<string, string>();
  for (const t of textos) for (const n of t.split("/")) {
    const nome = n.replace(/\s+/g, " ").replace(/[.]+$/, "").trim();
    const k = chaveProf(nome);
    if (k && !ja.has(k) && !novos.has(k)) novos.set(k, nome.slice(0, 80));
  }
  if (novos.size) await sb.from("horario_professores").insert([...novos.values()].map((nome) => ({ nome })));
}

async function gravarDisponibilidade(sb: Sb, professor: string, dias: number[], de: number, ate: number) {
  const motivo = descreverDisponibilidade(dias, de, ate);
  const linhas = disponibilidadeParaRestricoes(dias, de, ate).map((x) => ({ ...x, motivo }));
  const { error } = await sb.rpc("definir_disponibilidade", { p_professor: professor, p_linhas: linhas });
  if (error) throw error;
  return { linhas: linhas.length, motivo };
}

/** Adiciona um professor (e, se informado, os dias/aulas em que ele pode dar aula). */
export async function adicionarProfessor(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaProfessor, lerForm(fd));
    const disp = validar(esquemaDisponibilidade, { professor: v.nome, dias: fd.getAll("dia"), de: fd.get("de") ?? "1", ate: fd.get("ate") ?? "7" });
    const { data, error } = await sb.from("horario_professores").select("nome");
    if (error) {
      if (tabelaAusente(error)) throw new ErroNegocio("Falta rodar a migração 006 (database/migrations/006_horario_professores.sql) no Supabase para cadastrar professores.");
      throw error;
    }
    if ((data as { nome: string }[]).some((x) => chaveProf(x.nome) === chaveProf(v.nome))) throw new ErroNegocio("Este professor já está cadastrado.");
    checar(await sb.from("horario_professores").insert({ nome: v.nome }));
    const r = await gravarDisponibilidade(sb, v.nome, disp.dias, disp.de, disp.ate);
    atualizar();
    return r.linhas ? `Professor ${v.nome} adicionado (${r.motivo.replace("Disponibilidade: ", "")}).` : `Professor ${v.nome} adicionado, disponível em toda a semana.`;
  });
}

/** Remove o cadastro de um professor que não tem matérias nem aulas. */
export async function excluirProfessor(nome: string) {
  return executar(async () => {
    const sb = await sessao();
    const [d, a] = await Promise.all([
      sb.from("horario_demandas").select("professor"),
      sb.from("horarios").select("professor").ilike("professor", `%${nome.replace(/[%_]/g, "")}%`).limit(50),
    ]);
    const k = chaveProf(nome);
    const emUso = (checar(d) as { professor: string }[]).some((x) => x.professor.split("/").some((n) => chaveProf(n) === k))
      || (checar(a) as { professor: string | null }[]).some((x) => (x.professor ?? "").split("/").some((n) => chaveProf(n) === k));
    if (emUso) throw new ErroNegocio("Este professor tem matérias ou aulas no horário. Remova-as antes de excluí-lo.");
    const r = checar(await sb.from("horario_professores").delete().ilike("nome", nome.replace(/[%_]/g, "")).select("id"));
    await sb.rpc("definir_disponibilidade", { p_professor: nome, p_linhas: [] });
    if (!r?.length) throw semPermissao();
    atualizar();
    return "Professor removido.";
  });
}

/** Adiciona uma matéria a uma ou mais turmas de uma vez (se já existir na turma, atualiza professor e aulas). */
export async function adicionarMateria(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaMateria, { ...lerForm(fd), turmas: fd.getAll("turma_codigo").map(String) });
    const linhas = v.turmas.map((t) => ({ turma_codigo: t, disciplina: v.disciplina, professor: v.professor, aulas_semana: v.aulas_semana, sala: v.sala ?? null }));
    checar(await sb.from("horario_demandas").upsert(linhas, { onConflict: "turma_codigo,disciplina" }));
    await garantirProfessores(sb, [v.professor]);
    atualizar();
    return `Matéria ${v.disciplina} adicionada em ${v.turmas.length} turma(s).`;
  });
}

export async function salvarSala(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaSala, lerForm(fd));
    checar(await sb.from("horario_salas").insert({ nome: v.nome }));
    atualizar();
    return "Sala adicionada.";
  });
}
export async function excluirSala(id: string) {
  return executar(async () => {
    const sb = await sessao();
    const r = checar(await sb.from("horario_salas").delete().eq("id", id).select("id"));
    if (!r?.length) throw semPermissao();
    atualizar();
    return "Sala removida.";
  });
}

export async function salvarDemanda(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaDemanda, lerForm(fd));
    if (id) {
      const r = checar(await sb.from("horario_demandas").update(paraBanco(v)).eq("id", id).select("id"));
      if (!r?.length) throw semPermissao();
    } else {
      checar(await sb.from("horario_demandas").insert(paraBanco(v)));
    }
    await garantirProfessores(sb, [v.professor]);
    atualizar();
    return id ? "Matéria atualizada." : "Matéria adicionada à turma.";
  });
}
export async function excluirDemanda(id: string) {
  return executar(async () => {
    const sb = await sessao();
    const r = checar(await sb.from("horario_demandas").delete().eq("id", id).select("id"));
    if (!r?.length) throw semPermissao();
    atualizar();
    return "Disciplina removida da turma.";
  });
}

export async function salvarIndisponibilidade(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaIndisp, lerForm(fd));
    checar(await sb.from("horario_indisponibilidades").insert(paraBanco(v)));
    atualizar();
    return "Restrição do professor registrada.";
  });
}
export async function excluirIndisponibilidade(id: string) {
  return executar(async () => {
    const sb = await sessao();
    const r = checar(await sb.from("horario_indisponibilidades").delete().eq("id", id).select("id"));
    if (!r?.length) throw semPermissao();
    atualizar();
    return "Restrição removida.";
  });
}

/** Gera o horário a partir das aulas por turma, salas e restrições; grava tudo ou nada (RPC atômica). */
export async function gerarGrade(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaGerar, lerForm(fd));
    const [t, d, i, s, ex] = await Promise.all([
      sb.from("horario_turmas").select("codigo,sala_base"),
      sb.from("horario_demandas").select("id,turma_codigo,disciplina,professor,aulas_semana,sala"),
      sb.from("horario_indisponibilidades").select("professor,dia_semana,aula_de,aula_ate"),
      sb.from("horario_salas").select("nome"),
      sb.from("horarios").select("id", { count: "exact", head: true }).eq("vigente_desde", v.vigencia),
    ]);
    const demandas = checar(d) as Demanda[];
    if (!demandas.length) throw new ErroNegocio("Cadastre as aulas de cada turma antes de gerar o horário.");
    if ((ex.count ?? 0) > 0 && v.substituir !== "on")
      throw new ErroNegocio("Já existe horário nesta data de vigência. Marque “Substituir o horário existente” para continuar.");

    const r = gerarHorario({
      turmas: checar(t) as { codigo: string; sala_base: string | null }[], demandas,
      indisp: checar(i) as Indisponibilidade[], salas: (checar(s) as { nome: string }[]).map((x) => x.nome),
      semente: Math.floor(Math.random() * 2 ** 31),
    });
    const linhas = r.aulas.map((a) => ({
      turma_codigo: a.turma_codigo, dia_semana: a.dia_semana, aula: a.aula, inicio: HORARIO_AULA[a.aula][0], fim: HORARIO_AULA[a.aula][1],
      disciplina: a.disciplina, professor: a.professor, sala: a.sala ?? "",
    }));
    const { error } = await sb.rpc("substituir_horario", { p_vigencia: v.vigencia, p_linhas: linhas });
    if (error) throw error;
    atualizar();
    const faltam = r.naoAlocadas.reduce((n, x) => n + x.faltam, 0);
    const base = `Horário gerado com ${linhas.length} aulas.`;
    return faltam ? `${base} ${faltam} aula(s) não couberam — veja “Aulas sem horário” e ajuste restrições ou cargas.` : `${base} Revise e ajuste na grade, se precisar.`;
  });
}

/**
 * Preenche o “Criar horário” a partir de uma grade que já existe (ex.: o horário oficial importado):
 * matérias por turma com professor e aulas/semana, sala de cada turma e lista de salas.
 * Não apaga a grade nem as restrições; as matérias de mesma turma+disciplina são atualizadas.
 */
export async function importarDaGrade(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaImportarGrade, lerForm(fd));
    const [ra, rt, rs, rd] = await Promise.all([
      sb.from("horarios").select("turma_codigo,aula,disciplina,professor,sala").eq("vigente_desde", v.vigencia).limit(5000),
      sb.from("horario_turmas").select("codigo,sala_base"),
      sb.from("horario_salas").select("nome"),
      sb.from("horario_demandas").select("id,turma_codigo,disciplina"),
    ]);
    const aulas = checar(ra) as AulaOrigem[];
    if (!aulas.length) throw new ErroNegocio("Não há aulas nessa versão do horário para importar.");
    const d = derivarDaGrade(aulas);
    if (!d.demandas.length) throw new ErroNegocio("Nenhuma matéria com professor foi encontrada nessa versão do horário.");

    const turmas = checar(rt) as { codigo: string; sala_base: string | null }[];
    const salasExistentes = new Set((checar(rs) as { nome: string }[]).map((x) => x.nome));

    // Sala da turma: só preenche as que estão em branco (não sobrescreve o que a pessoa definiu).
    let salasDeTurma = 0;
    for (const t of turmas) {
      const base = d.salaBase.get(t.codigo);
      if (!t.sala_base && base) {
        const r = checar(await sb.from("horario_turmas").update({ sala_base: base }).eq("codigo", t.codigo).select("codigo"));
        if (r?.length) salasDeTurma++;
      }
    }
    const novasSalas = d.salas.filter((s) => !salasExistentes.has(s)).map((nome) => ({ nome }));
    if (novasSalas.length) checar(await sb.from("horario_salas").insert(novasSalas));

    const codigos = new Set(turmas.map((t) => t.codigo));
    const validas = d.demandas.filter((x) => codigos.has(x.turma_codigo));
    checar(await sb.from("horario_demandas").upsert(validas, { onConflict: "turma_codigo,disciplina" }));

    let removidas = 0;
    if (v.substituir === "on") {
      const manter = new Set(validas.map((x) => `${x.turma_codigo}\u0000${x.disciplina}`));
      const sobra = (checar(rd) as { id: string; turma_codigo: string; disciplina: string }[]).filter((x) => !manter.has(`${x.turma_codigo}\u0000${x.disciplina}`));
      for (let i = 0; i < sobra.length; i += 100) {
        const r = checar(await sb.from("horario_demandas").delete().in("id", sobra.slice(i, i + 100).map((x) => x.id)).select("id"));
        removidas += r?.length ?? 0;
      }
    }
    await garantirProfessores(sb, validas.map((x) => x.professor));
    atualizar();
    const extra = [
      d.ignoradasFora7 ? `${d.ignoradasFora7} matéria(s) só da 8ª/9ª aula (eletivas/clube) ficaram de fora` : "",
      d.semProfessor ? `${d.semProfessor} sem professor na grade (cadastre à mão)` : "",
      d.variosProfessores ? `${d.variosProfessores} com mais de um professor (usei o mais frequente)` : "",
      removidas ? `${removidas} matéria(s) antigas removidas` : "",
    ].filter(Boolean).join("; ");
    return `Importado: ${validas.length} matéria(s) em ${new Set(validas.map((x) => x.turma_codigo)).size} turma(s), ${novasSalas.length} sala(s) nova(s), ${salasDeTurma} sala(s) de turma preenchida(s).${extra ? ` Atenção: ${extra}.` : ""}`;
  });
}

async function carregarGrade(sb: Awaited<ReturnType<typeof sessao>>, vigencia: string) {
  const [a, i] = await Promise.all([
    sb.from("horarios").select("id,turma_codigo,dia_semana,aula,disciplina,professor,sala").eq("vigente_desde", vigencia).limit(5000),
    sb.from("horario_indisponibilidades").select("professor,dia_semana,aula_de,aula_ate"),
  ]);
  return { aulas: checar(a) as AulaGrade[], ind: checar(i) as Indisponibilidade[] };
}

/** Cria ou edita a aula de uma célula da grade (turma + dia + aula). */
export async function salvarAulaGrade(id: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaAulaGrade, lerForm(fd));
    const [inicio, fim] = HORARIO_AULA[v.aula];
    const dados = { turma_codigo: v.turma_codigo, dia_semana: v.dia_semana, aula: v.aula, inicio, fim, disciplina: v.disciplina,
      professor: v.professor ?? null, sala: v.sala ?? null, vigente_desde: v.vigencia };
    if (id) {
      const r = checar(await sb.from("horarios").update(dados).eq("id", id).select("id"));
      if (!r?.length) throw semPermissao();
    } else {
      checar(await sb.from("horarios").insert(dados));
    }
    atualizar();
    return "Aula salva. Conflitos, se houver, aparecem no topo da grade.";
  });
}
export async function excluirAulaGrade(id: string) {
  return executar(async () => {
    const sb = await sessao();
    const r = checar(await sb.from("horarios").delete().eq("id", id).select("id"));
    if (!r?.length) throw semPermissao();
    atualizar();
    return "Aula removida da grade.";
  });
}

/** Aplica uma das soluções sugeridas para um conflito. As opções são recalculadas no servidor. */
export async function aplicarSugestao(aulaId: string, _: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaSugestao, lerForm(fd));
    const { aulas, ind } = await carregarGrade(sb, v.vigencia);
    const alvo = aulas.find((x) => x.id === aulaId);
    if (!alvo) throw new ErroNegocio("A aula não existe mais. Atualize a página.");
    const [tipo, p1, p2] = v.escolha.split(":");
    const valida = sugerirSolucoes(aulaId, aulas, ind, 200).find((s) => (tipo === "mover" ? s.tipo === "mover" && s.dia === Number(p1) && s.aula === Number(p2) : s.tipo === "trocar" && s.com === v.escolha.slice(7)));
    if (!valida) throw new ErroNegocio("Esta solução não é mais válida porque a grade mudou. Abra “Resolver” novamente.");
    if (valida.tipo === "mover") {
      const [inicio, fim] = HORARIO_AULA[valida.aula];
      const r = checar(await sb.from("horarios").update({ dia_semana: valida.dia, aula: valida.aula, inicio, fim }).eq("id", aulaId).select("id"));
      if (!r?.length) throw semPermissao();
    } else {
      const { error } = await sb.rpc("trocar_aulas", { p_a: aulaId, p_b: valida.com });
      if (error) throw error;
    }
    atualizar();
    const restantes = detectarConflitos(aulas, ind).length;
    return `Solução aplicada.${restantes ? " Confira os conflitos restantes." : ""}`;
  });
}

/** Disponibilidade do professor: dias em que pode e a faixa de aulas. Substitui a anterior feita por este formulário. */
export async function definirDisponibilidade(_: EstadoForm, fd: FormData) {
  return executar(async () => {
    const sb = await sessao();
    const v = validar(esquemaDisponibilidade, { professor: String(fd.get("professor") ?? ""), dias: fd.getAll("dia"), de: fd.get("de"), ate: fd.get("ate") });
    const r = await gravarDisponibilidade(sb, v.professor, v.dias, v.de, v.ate);
    atualizar();
    return r.linhas ? `Disponibilidade de ${v.professor} registrada: ${r.motivo.replace("Disponibilidade: ", "")}.` : `${v.professor} está disponível em toda a semana.`;
  });
}

export async function excluirArquivoHorario(id: string) {
  return executar(async () => {
    const sb = await sessao();
    const { data } = await sb.from("horario_arquivos").select("caminho").eq("id", id).maybeSingle();
    if (!data) throw semPermissao();
    const r = checar(await sb.from("horario_arquivos").delete().eq("id", id).select("id"));
    if (!r?.length) throw semPermissao();
    await criarClienteAdmin().storage.from(BUCKET_HORARIOS).remove([data.caminho]);
    revalidatePath("/");
    atualizar();
    return "PDF removido.";
  });
}
