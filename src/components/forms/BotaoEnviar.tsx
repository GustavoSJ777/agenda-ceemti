"use client";
import { useFormStatus } from "react-dom";

export function BotaoEnviar({ children, ocupado }: { children: React.ReactNode; ocupado: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primario btn-grande" disabled={pending}>
      {pending ? ocupado : children}
    </button>
  );
}
