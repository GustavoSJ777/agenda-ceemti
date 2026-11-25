const CORES = {
  azul: "bg-azul-100 text-azul-700", verde: "bg-sucesso-bg text-sucesso", amarelo: "bg-aviso-bg text-aviso",
  vermelho: "bg-perigo-bg text-perigo", cinza: "bg-slate-100 text-slate-600", roxo: "bg-violet-100 text-violet-700",
} as const;
export type CorSelo = keyof typeof CORES;

export function Selo({ children, cor = "azul" }: { children: React.ReactNode; cor?: CorSelo }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${CORES[cor]}`}>{children}</span>;
}
