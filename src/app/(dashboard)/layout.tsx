import { Sidebar } from "@/components/layout/Sidebar";
import { VigiaInatividade } from "@/components/layout/VigiaInatividade";
import { Toasts } from "@/components/ui/Toasts";
import { redirect } from "next/navigation";
import { exigirPerfil, precisaTrocarSenha } from "@/lib/auth";
import { menuDoPapel, rotuloDoMenu } from "@/lib/permissions";
import { ROTULO_PAPEL } from "@/constants";

// Toda rota deste grupo exige sessão válida e perfil ativo (validado no servidor).
export default async function LayoutDashboard({ children }: { children: React.ReactNode }) {
  const [perfil, trocar] = await Promise.all([exigirPerfil(), precisaTrocarSenha()]);
  if (trocar) redirect("/trocar-senha"); // primeiro acesso: escolher uma senha própria
  const itens = menuDoPapel(perfil.papel).map((m) => ({ id: m.id, rotulo: rotuloDoMenu(m, perfil.papel), icone: m.icone }));
  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar itens={itens} nome={perfil.nome} papel={ROTULO_PAPEL[perfil.papel]} />
      <VigiaInatividade />
      <Toasts />
      <header className="sticky top-0 z-20 flex items-center justify-end border-b border-borda bg-white/90 px-4 py-3 pl-16 backdrop-blur lg:pl-6">
        <span className="text-sm capitalize text-texto-suave">{hoje}</span>
      </header>
      <main className="p-4 lg:p-6" tabIndex={-1}>{children}</main>
    </div>
  );
}
