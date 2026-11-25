import type { Metadata } from "next";
import "./globals.css";
import { NavegacaoSegura } from "@/components/NavegacaoSegura";

export const metadata: Metadata = {
  title: "Agenda Escolar CEEMTI Baixo Guandu",
  description: "Agenda Escolar Digital do CEEMTI Baixo Guandu",
  robots: { index: false, follow: false },
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <NavegacaoSegura />
        {children}
      </body>
    </html>
  );
}
