import type { Metadata } from "next";
import { PaginaPublica } from "@/components/horario/PaginaPublica";
import { NOME_ESCOLA } from "@/constants";

export const metadata: Metadata = {
  title: `Horário de aulas — ${NOME_ESCOLA}`,
  description: `Quadro de horários de aulas do ${NOME_ESCOLA}.`,
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

/** Página inicial: horário público, com o menu "Entrar" para o sistema. */
export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <PaginaPublica sp={await searchParams} />;
}
