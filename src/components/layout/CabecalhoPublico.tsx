import Link from "next/link";
import { CalendarDays, Clock, LayoutDashboard, LogIn } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { NOME_ESCOLA } from "@/constants";

/** Cabeçalho das páginas abertas (sem login): Horário, Agenda e Entrar/Painel. */
export function CabecalhoPublico({ ativo, logado }: { ativo: "horario" | "agenda"; logado: boolean }) {
  const item = (chave: "horario" | "agenda", href: string, Icone: typeof Clock, curto: string, longo: string) => (
    <Link href={href} aria-current={ativo === chave ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-campo px-2.5 py-2 text-sm font-bold sm:px-3 sm:text-base ${ativo === chave ? "bg-white/20 text-white" : "text-azul-100 hover:bg-white/10 hover:text-white"}`}>
      <Icone size={18} aria-hidden="true" /> <span className="sm:hidden">{curto}</span><span className="hidden sm:inline">{longo}</span>
    </Link>
  );
  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-azul-600 to-azul-700 text-white shadow print:hidden">
      <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${NOME_ESCOLA} — página inicial`}>
          <Logo tamanho={38} claro />
          <span className="hidden min-w-0 leading-tight md:block">
            <span className="block truncate text-lg font-extrabold">{NOME_ESCOLA}</span>
            <span className="block truncate text-sm text-azul-100">Agenda Escolar</span>
          </span>
        </Link>
        <nav aria-label="Menu principal" className="ml-auto flex items-center gap-1 sm:gap-2">
          {item("horario", "/", Clock, "Horário", "Horário de aulas")}
          {item("agenda", "/agenda", CalendarDays, "Agenda", "Agenda Escolar")}
          <Link href={logado ? "/dashboard" : "/login"} className="btn ml-1 bg-white !px-3 !py-2 text-azul-700 hover:bg-azul-100">
            {logado ? <LayoutDashboard size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
            {logado ? "Painel" : "Entrar"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
