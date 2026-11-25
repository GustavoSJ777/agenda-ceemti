/** Mostrado na hora ao trocar de aba, enquanto o servidor monta a página (evita a sensação de tela travada). */
export default function Carregando() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse space-y-4">
      <span className="sr-only">Carregando...</span>
      <div className="h-7 w-56 rounded-campo bg-azul-100" />
      <div className="h-4 w-80 max-w-full rounded-campo bg-azul-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-card bg-azul-100" />)}
      </div>
      <div className="h-72 rounded-card bg-azul-100" />
    </div>
  );
}
