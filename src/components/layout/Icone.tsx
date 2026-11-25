import { Bell, CalendarDays, ClipboardList, Layers, LogOut, Menu, RefreshCw, ShieldCheck, StickyNote, Users, ChartColumn, House, Clock } from "lucide-react";

const MAPA = {
  home: House, calendar: CalendarDays, clipboard: ClipboardList, refresh: RefreshCw, bell: Bell,
  note: StickyNote, users: Users, layers: Layers, chart: ChartColumn, shield: ShieldCheck,
  clock: Clock, logout: LogOut, menu: Menu,
} as const;

export type NomeIcone = keyof typeof MAPA;

export function Icone({ nome, tamanho = 20 }: { nome: string; tamanho?: number }) {
  const Componente = MAPA[nome as NomeIcone];
  return Componente ? <Componente size={tamanho} aria-hidden="true" /> : null;
}
