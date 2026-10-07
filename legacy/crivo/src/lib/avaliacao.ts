import type { Criterios, Semaforo, SemaforoSaida } from "./tipos";

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

/** Nota de 0 a 100 a partir dos critérios de qualidade (o tamanho fica de fora). */
export function calcularNota(c: Criterios): number {
  return limitarPct(0.3 * c.objetivoPct + 0.2 * c.ondePct + 0.25 * c.prontoPct + 0.25 * c.focoPct);
}

/** Bateu numa regra da casa = segurado. */
export function semaforoDoComando(regra: string | null): SemaforoSaida {
  return regra?.trim() ? "segurado" : "liberado";
}

/** Sem nota ainda (sem IA), o prompt passou: verde. */
export function semaforoDoPrompt(nota: number | null): Semaforo {
  return nota === null ? "verde" : semaforoDaNota(nota);
}
