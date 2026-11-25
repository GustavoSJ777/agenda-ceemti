"use client";
import { Printer } from "lucide-react";

export function BotaoImprimir({ rotulo = "Imprimir" }: { rotulo?: string }) {
  return (
    <button type="button" className="btn btn-primario" onClick={() => window.print()}>
      <Printer size={18} aria-hidden="true" /> {rotulo}
    </button>
  );
}
