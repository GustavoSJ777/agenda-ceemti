"use client";
import { useEffect } from "react";
import { sairPorInatividade } from "@/app/actions-auth";
import { MINUTOS_INATIVIDADE } from "@/constants";

/** Encerra a sessão após alguns minutos sem uso. O servidor também revalida o token a cada requisição. */
export function VigiaInatividade() {
  useEffect(() => {
    const limite = MINUTOS_INATIVIDADE * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    let ultimo = 0;
    const zerar = () => {
      const agora = Date.now();
      if (agora - ultimo < 2000) return;
      ultimo = agora;
      clearTimeout(timer);
      timer = setTimeout(() => { void sairPorInatividade(); }, limite);
    };
    const eventos = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    eventos.forEach((e) => window.addEventListener(e, zerar, { passive: true }));
    zerar();
    return () => {
      clearTimeout(timer);
      eventos.forEach((e) => window.removeEventListener(e, zerar));
    };
  }, []);
  return null;
}
