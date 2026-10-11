/** Diz só se a chave existe. O valor nunca sai do servidor. */
export function chaveCarregada(valor: string | undefined): boolean {
  return Boolean(valor?.trim());
}
