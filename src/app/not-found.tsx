import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-md text-center">
        <h1 className="text-xl font-extrabold">Página não encontrada</h1>
        <p className="mb-4 text-texto-suave">O endereço não existe ou foi movido.</p>
        <Link href="/dashboard" className="btn btn-primario">Voltar ao painel</Link>
      </div>
    </main>
  );
}
