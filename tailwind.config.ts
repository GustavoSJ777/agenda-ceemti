import type { Config } from "tailwindcss";

// Paleta herdada do style.css original (identidade visual do CEEMTI).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        azul: {
          50: "#f5faff", 100: "#eaf4fc", 200: "#d3e8f8", 300: "#a9d3f2", 400: "#6fb7ea",
          500: "#3b95d9", 600: "#2878bd", 700: "#1d5d93",
        },
        texto: { DEFAULT: "#1b3350", suave: "#5a7088" },
        borda: "#dce9f5",
        fundo: "#f3f8fd",
        sucesso: { DEFAULT: "#23865a", bg: "#e4f5ec" },
        aviso: { DEFAULT: "#a86a10", bg: "#fff3dc" },
        perigo: { DEFAULT: "#c13d3d", bg: "#fdeaea" },
      },
      borderRadius: { card: "14px", campo: "9px" },
      boxShadow: {
        card: "0 2px 12px rgba(40,120,189,.08)",
        modal: "0 12px 40px rgba(29,93,147,.18)",
      },
      fontFamily: {
        sans: ["Nunito", "Segoe UI", "system-ui", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
