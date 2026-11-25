import { z } from "zod";

export const uuid = (msg = "Seleção inválida.") => z.string().uuid(msg);
export const uuidOpc = z.string().uuid("Seleção inválida.").optional();
export const dataISO = (msg = "Data inválida.") => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
export const dataOpc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional();
export const horaOpc = z.string().regex(/^\d{2}:\d{2}/, "Horário inválido.").optional();
export const textoOpc = (max: number) => z.string().max(max, `Use no máximo ${max} caracteres.`).optional();
export const nota = z.preprocess(
  (v) => (v === undefined || v === "" ? undefined : Number(String(v).replace(",", "."))),
  z.number({ message: "Nota inválida." }).min(0, "As notas devem estar entre 0 e 10.").max(10, "As notas devem estar entre 0 e 10.").optional(),
);
