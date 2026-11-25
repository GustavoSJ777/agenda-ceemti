import type { EstadoForm } from "@/lib/actions/resultado";

export function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <div role="alert" className="alerta alerta-erro">{estado.erro}</div>;
  if (estado.sucesso) return <div role="status" className="alerta alerta-sucesso">{estado.sucesso}</div>;
  return null;
}
