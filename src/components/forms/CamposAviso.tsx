"use client";
import { useState } from "react";
import { CampoAreaTexto, CampoSelecao, CampoTexto, type Opcao } from "@/components/ui/Campos";

interface Props {
  publicos: Opcao[]; turmas: Opcao[];
  valores?: { titulo?: string; conteudo?: string; publico?: string; turma_id?: string | null; data_publicacao?: string; validade?: string | null };
  hoje: string;
}

/** Campos do aviso: a turma só aparece quando o público é "Turma específica". */
export function CamposAviso({ publicos, turmas, valores = {}, hoje }: Props) {
  const [publico, setPublico] = useState(valores.publico ?? "todos");
  return (
    <>
      <CampoTexto name="titulo" label="Título" obrigatorio cheio maxLength={120} valor={valores.titulo} />
      <CampoAreaTexto name="conteudo" label="Conteúdo" obrigatorio cheio linhas={6} maxLength={3000} valor={valores.conteudo} />
      <div className="campo">
        <label htmlFor="f_publico">Destinatários <span className="text-perigo" aria-hidden="true">*</span></label>
        <select id="f_publico" name="publico" required value={publico} onChange={(e) => setPublico(e.target.value)}>
          {publicos.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>
      {publico === "turma"
        ? <CampoSelecao name="turma_id" label="Turma" obrigatorio opcoes={turmas} valor={valores.turma_id} />
        : <div aria-hidden="true" />}
      <CampoTexto name="data_publicacao" label="Data de publicação" tipo="date" obrigatorio valor={valores.data_publicacao ?? hoje} />
      <CampoTexto name="validade" label="Válido até" tipo="date" valor={valores.validade} dica="Depois dessa data o aviso some do mural. Vazio = sem validade." />
    </>
  );
}
