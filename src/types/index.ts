export type Papel = "direcao" | "secretaria" | "professor" | "aluno" | "coordenador";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
}
