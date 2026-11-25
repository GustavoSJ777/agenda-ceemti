import { Logo } from "@/components/ui/Logo";

/** Moldura das telas públicas (login, recuperar, nova senha). */
export function CartaoAuth({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(320px,2fr)_3fr]">
      <aside className="hidden flex-col justify-center gap-3 bg-gradient-to-br from-azul-600 to-azul-700 p-12 text-white lg:flex">
        <Logo tamanho={72} claro />
        <h1 className="text-3xl font-extrabold">Agenda Escolar</h1>
        <p className="text-lg font-bold text-azul-200">CEEMTI Baixo Guandu</p>
        <p>Centro Estadual de Ensino Médio em Tempo Integral de Baixo Guandu</p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-azul-100">
          <li>Calendário de provas, trabalhos e eventos</li>
          <li>Avisos da direção e da secretaria</li>
          <li>Acompanhamento da recuperação escolar</li>
        </ul>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="card w-full max-w-md">
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <Logo />
            <strong>Agenda Escolar CEEMTI</strong>
          </div>
          <h2 className="text-xl font-extrabold">{titulo}</h2>
          <p className="mb-4 text-texto-suave">{descricao}</p>
          {children}
          <p className="mt-6 text-center text-xs text-texto-suave">
            Os dados de estudantes são protegidos conforme a LGPD (Lei nº 13.709/2018).
          </p>
        </div>
      </main>
    </div>
  );
}
