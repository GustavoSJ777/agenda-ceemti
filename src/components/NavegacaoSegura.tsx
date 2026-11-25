"use client";
import { useEffect } from "react";

/**
 * Correção para o roteador do Next.js 15: links que ficam na MESMA página e só mudam a busca (?dia=, ?aba=, ?mes=,
 * ?modo=...) às vezes baixam a página nova mas não a exibem. Aqui esses cliques viram carregamento completo,
 * que sempre funciona. Links para outras páginas continuam com a navegação rápida do Next.
 */
export function NavegacaoSegura() {
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self")) return;
      const destino = new URL(a.href, location.href);
      if (destino.origin !== location.origin || destino.pathname !== location.pathname) return;
      if (destino.search === location.search) return; // mesma página e mesma busca (ou só âncora #): deixa como está
      e.preventDefault();
      e.stopPropagation(); // o Link do Next não chega a receber o clique
      location.assign(destino.href);
    }
    window.addEventListener("click", aoClicar, true);
    return () => window.removeEventListener("click", aoClicar, true);
  }, []);
  return null;
}
