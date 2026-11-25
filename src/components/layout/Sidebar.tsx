"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sair } from "@/app/actions-auth";
import { Icone } from "./Icone";
import { Logo } from "@/components/ui/Logo";

export interface ItemSidebar { id: string; rotulo: string; icone: string }

interface Props { itens: ItemSidebar[]; nome: string; papel: string }

export function Sidebar({ itens, nome, papel }: Props) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();

  return (
    <>
      <button type="button" className="fixed left-3 top-3 z-30 rounded-campo border border-borda bg-white p-2 shadow-card lg:hidden"
        aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto(true)}>
        <Icone nome="menu" tamanho={22} />
      </button>
      {aberto && <div className="fixed inset-0 z-30 bg-texto/40 lg:hidden" onClick={() => setAberto(false)} aria-hidden="true" />}
      <aside aria-label="Menu principal"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-borda bg-white transition-transform lg:translate-x-0 ${aberto ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 border-b border-borda p-4">
          <Logo tamanho={36} />
          <div className="leading-tight">
            <strong className="block">Agenda Escolar</strong>
            <span className="text-xs text-texto-suave">CEEMTI Baixo Guandu</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <Link href="/" onClick={() => setAberto(false)}
            className="flex items-center gap-3 rounded-campo px-3 py-2 font-bold text-texto hover:bg-azul-50">
            <Icone nome="clock" /> <span>Página inicial (horário)</span>
          </Link>
          {itens.map((i) => {
            const ativo = caminho === `/${i.id}` || caminho.startsWith(`/${i.id}/`);
            return (
              <Link key={i.id} href={`/${i.id}`} onClick={() => setAberto(false)} aria-current={ativo ? "page" : undefined}
                className={`flex items-center gap-3 rounded-campo px-3 py-2 font-bold ${ativo ? "bg-azul-100 text-azul-700" : "text-texto hover:bg-azul-50"}`}>
                <Icone nome={i.icone} /> <span>{i.rotulo}</span>
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-borda p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-azul-600 font-extrabold text-white" aria-hidden="true">
              {nome.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <strong className="block truncate">{nome}</strong>
              <span className="text-xs text-texto-suave">{papel}</span>
            </div>
          </div>
          <form action={sair}>
            <button type="submit" className="btn btn-secundario w-full"><Icone nome="logout" tamanho={18} /> Sair da conta</button>
          </form>
        </div>
      </aside>
    </>
  );
}
