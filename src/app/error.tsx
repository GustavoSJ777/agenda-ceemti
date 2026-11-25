"use client";

/** Se o sistema foi atualizado enquanto a página estava aberta, as ações antigas deixam de existir; recarregar resolve. */
export default function Erro() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-md text-center">
        <h1 className="text-xl font-extrabold">Algo deu errado</h1>
        <p className="mb-4 text-texto-suave">Não foi possível carregar esta página. Se o sistema acabou de ser atualizado, recarregue para continuar.</p>
        <button type="button" className="btn btn-primario" onClick={() => window.location.reload()}>Recarregar página</button>
      </div>
    </main>
  );
}
