import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a todas as rotas.
const cabecalhos = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'",
      "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Gera .next/standalone: imagem Docker enxuta (só o necessário para rodar).
  output: "standalone",
  poweredByHeader: false,
  // O horário público agora é a página inicial; o endereço antigo continua funcionando.
  async redirects() {
    return [{ source: "/horario-publico", destination: "/", permanent: false }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: cabecalhos }];
  },
};

export default config;
