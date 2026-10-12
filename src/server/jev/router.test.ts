import { describe, expect, it } from "vitest";
import { estimateTaskKind } from "./router";

describe("estimateTaskKind", () => {
  it("detecta testes", () => {
    expect(estimateTaskKind("Escreva os testes com vitest para o módulo X")).toBe("tests");
  });

  it("detecta tipos", () => {
    expect(estimateTaskKind("Crie as interfaces e schemas zod para a API")).toBe("types");
  });

  it("detecta boilerplate", () => {
    expect(estimateTaskKind("Gere o scaffolding do componente e o setup básico")).toBe("boilerplate");
  });

  it("detecta utility", () => {
    expect(estimateTaskKind("Implemente a função utilitária slugify")).toBe("utility");
  });

  it("detecta conversão", () => {
    expect(estimateTaskKind("Faça o parser de markdown para JSON")).toBe("conversion");
  });
});
