"use client";
import { useEffect, useState } from "react";

interface Toast { id: number; texto: string; tipo: "sucesso" | "erro" }

/** Dispara um aviso temporário de qualquer componente cliente. */
export function mostrarToast(texto: string, tipo: "sucesso" | "erro" = "sucesso") {
  window.dispatchEvent(new CustomEvent("toast", { detail: { texto, tipo } }));
}

export function Toasts() {
  const [itens, setItens] = useState<Toast[]>([]);
  useEffect(() => {
    const ouvir = (e: Event) => {
      const { texto, tipo } = (e as CustomEvent).detail as Omit<Toast, "id">;
      const id = Date.now() + Math.random();
      setItens((l) => [...l, { id, texto, tipo }]);
      setTimeout(() => setItens((l) => l.filter((t) => t.id !== id)), tipo === "erro" ? 7000 : 3800);
    };
    window.addEventListener("toast", ouvir);
    return () => window.removeEventListener("toast", ouvir);
  }, []);
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
      {itens.map((t) => (
        <div key={t.id} role={t.tipo === "erro" ? "alert" : "status"}
          className={`alerta shadow-modal ${t.tipo === "erro" ? "alerta-erro bg-perigo-bg" : "alerta-sucesso bg-sucesso-bg"}`}>
          {t.texto}
        </div>
      ))}
    </div>
  );
}
