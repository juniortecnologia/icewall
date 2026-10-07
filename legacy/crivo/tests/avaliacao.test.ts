import { describe, expect, it } from "vitest";
import { calcularNota, limitarPct, semaforoDaNota, semaforoDoComando } from "@/lib/avaliacao";
import type { Criterios } from "@/lib/tipos";

const criterios = (o: number, w: number, p: number, f: number): Criterios => ({
  tamanho: "funcionalidade",
  tamanhoPct: 50,
  objetivoPct: o,
  ondePct: w,
  prontoPct: p,
  focoPct: f,
});

describe("semaforoDaNota", () => {
  it.each([
    [0, "vermelho"],
    [39, "vermelho"],
    [40, "amarelo"],
    [69, "amarelo"],
    [70, "verde"],
    [100, "verde"],
  ] as const)("nota %i → %s", (nota, cor) => {
    expect(semaforoDaNota(nota)).toBe(cor);
  });
});

describe("calcularNota", () => {
  it("tudo 100 dá 100 e tudo 0 dá 0", () => {
    expect(calcularNota(criterios(100, 100, 100, 100))).toBe(100);
    expect(calcularNota(criterios(0, 0, 0, 0))).toBe(0);
  });
  it("pesa objetivo 30%, onde 20%, pronto 25%, foco 25%", () => {
    expect(calcularNota(criterios(100, 0, 0, 0))).toBe(30);
    expect(calcularNota(criterios(0, 100, 0, 0))).toBe(20);
    expect(calcularNota(criterios(0, 0, 100, 0))).toBe(25);
    expect(calcularNota(criterios(0, 0, 0, 100))).toBe(25);
  });
  it("o tamanho não entra na nota", () => {
    const a = calcularNota({ ...criterios(80, 80, 80, 80), tamanho: "ajuste", tamanhoPct: 5 });
    const b = calcularNota({ ...criterios(80, 80, 80, 80), tamanho: "sistema", tamanhoPct: 95 });
    expect(a).toBe(b);
  });
});

describe("semaforoDoComando", () => {
  it("sem regra é liberado; com regra é segurado", () => {
    expect(semaforoDoComando(null)).toBe("liberado");
    expect(semaforoDoComando("   ")).toBe("liberado");
    expect(semaforoDoComando("Nada de DROP")).toBe("segurado");
  });
});

describe("limitarPct", () => {
  it("prende entre 0 e 100 e arredonda", () => {
    expect(limitarPct(-5)).toBe(0);
    expect(limitarPct(130)).toBe(100);
    expect(limitarPct(41.6)).toBe(42);
  });
});
