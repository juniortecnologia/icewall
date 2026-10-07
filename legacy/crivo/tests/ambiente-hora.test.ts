import { describe, expect, it } from "vitest";
import { chaveCarregada } from "@/lib/ambiente";
import { formatarHora } from "@/lib/hora";

describe("chaveCarregada", () => {
  it("vazia, ausente ou só espaços = sem chave", () => {
    expect(chaveCarregada(undefined)).toBe(false);
    expect(chaveCarregada("")).toBe(false);
    expect(chaveCarregada("   ")).toBe(false);
  });
  it("qualquer valor real = carregada", () => {
    expect(chaveCarregada("ts_abc123")).toBe(true);
  });
});

describe("formatarHora", () => {
  it("usa sempre o horário de Brasília, com segundos", () => {
    expect(formatarHora("2026-10-06T15:04:05.000Z")).toBe("12:04:05");
  });
});
