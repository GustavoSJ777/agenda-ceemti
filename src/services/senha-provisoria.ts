import "server-only";
import { randomInt } from "node:crypto";

// Sem caracteres ambíguos (0/O, 1/l/I) para facilitar a digitação pelo aluno.
const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const DIGITOS = "23456789";

/** Senha provisória de 10 caracteres, aleatória (crypto), com letras e números. */
export function gerarSenhaProvisoria(tamanho = 10): string {
  const todos = LETRAS + DIGITOS;
  const sorteia = (s: string) => s[randomInt(s.length)];
  const chars = [sorteia(LETRAS), sorteia(LETRAS), sorteia(DIGITOS), sorteia(DIGITOS)];
  while (chars.length < tamanho) chars.push(sorteia(todos));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
