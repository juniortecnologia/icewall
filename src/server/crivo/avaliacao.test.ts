import { describe, expect, it } from "vitest";
import { limitarPct, semaforoDaNota, semaforoDoComando } from "@/server/crivo/avaliacao";

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
