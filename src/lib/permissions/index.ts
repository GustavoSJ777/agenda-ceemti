import type { Papel } from "@/types";

export interface ItemMenu {
  id: string;
  rotulo: string;
  rotuloAluno?: string;
  rotuloProfessor?: string;
  icone: string;
  papeis: Papel[];
  /** false = módulo ainda não migrado (não aparece no menu). */
  disponivel: boolean;
}

const TODOS: Papel[] = ["direcao", "secretaria", "professor", "aluno"];
const COM_COORD: Papel[] = [...TODOS, "coordenador"];

// Espelha o menu do sistema original. Serve só para a interface: quem decide é o banco (RLS).
export const MENU: ItemMenu[] = [
  { id: "dashboard", rotulo: "Painel", icone: "home", papeis: COM_COORD, disponivel: true },
  { id: "calendario", rotulo: "Calendário", icone: "calendar", papeis: COM_COORD, disponivel: true },
  { id: "atividades", rotulo: "Provas e Trabalhos", icone: "clipboard", papeis: TODOS, disponivel: true },
  { id: "recuperacoes", rotulo: "Recuperação", rotuloAluno: "Minha recuperação", icone: "refresh", papeis: TODOS, disponivel: true },
  { id: "avisos", rotulo: "Avisos", icone: "bell", papeis: TODOS, disponivel: true },
  { id: "anotacoes", rotulo: "Anotações", icone: "note", papeis: ["direcao", "secretaria", "professor"], disponivel: true },
  { id: "alunos", rotulo: "Alunos", icone: "users", papeis: ["direcao", "secretaria", "professor"], disponivel: true },
  { id: "turmas", rotulo: "Turmas e Disciplinas", rotuloProfessor: "Minhas turmas", icone: "layers", papeis: ["direcao", "secretaria", "professor"], disponivel: true },
  { id: "horario", rotulo: "Horário de aulas", icone: "clock", papeis: ["direcao", "coordenador"], disponivel: true },
  { id: "relatorios", rotulo: "Relatórios", icone: "chart", papeis: ["direcao", "secretaria"], disponivel: true },
  { id: "usuarios", rotulo: "Usuários", icone: "shield", papeis: ["direcao"], disponivel: true },
];

export function rotuloDoMenu(item: ItemMenu, papel: Papel): string {
  if (papel === "aluno" && item.rotuloAluno) return item.rotuloAluno;
  if (papel === "professor" && item.rotuloProfessor) return item.rotuloProfessor;
  return item.rotulo;
}

export function menuDoPapel(papel: Papel): ItemMenu[] {
  return MENU.filter((m) => m.disponivel && m.papeis.includes(papel));
}

export function podeAcessar(papel: Papel, rotaId: string): boolean {
  return MENU.some((m) => m.id === rotaId && m.papeis.includes(papel));
}

export const ehGestao = (p: Papel) => p === "direcao" || p === "secretaria";
