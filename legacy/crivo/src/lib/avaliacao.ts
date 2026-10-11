import type { Semaforo, SemaforoSaida } from "./tipos";

export const NOTA_VERDE = 70;
export const NOTA_AMARELO = 40;

export function limitarPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** A cor nunca é escolhida à mão: sai sempre da nota. */
export function semaforoDaNota(nota: number): Semaforo {
  if (nota >= NOTA_VERDE) return "verde";
  if (nota >= NOTA_AMARELO) return "amarelo";
  return "vermelho";
}

/** Bateu numa regra da casa = segurado. */
export function semaforoDoComando(regra: string | null): SemaforoSaida {
  return regra?.trim() ? "segurado" : "liberado";
}
