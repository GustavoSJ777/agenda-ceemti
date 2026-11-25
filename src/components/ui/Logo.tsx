export function Logo({ tamanho = 40, claro = false }: { tamanho?: number; claro?: boolean }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="8" width="36" height="34" rx="8" fill={claro ? "#fff" : "#2878bd"} />
      <rect x="6" y="8" width="36" height="10" rx="5" fill={claro ? "#a9d3f2" : "#1d5d93"} />
      <path d="M15 5v7M33 5v7" stroke={claro ? "#fff" : "#a9d3f2"} strokeWidth="3" strokeLinecap="round" />
      <path d="M15 27h18M15 34h11" stroke={claro ? "#2878bd" : "#fff"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
