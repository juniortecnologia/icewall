import { describe, expect, it } from "vitest";
import { chaveCarregada } from "@/lib/ambiente";
import { formatarDuracao, formatarHora } from "@/lib/hora";

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

describe("formatarDuracao", () => {
  it("segundos com vírgula e uma casa", () => {
    expect(formatarDuracao(1312)).toBe("1,3 s");
    expect(formatarDuracao(8000)).toBe("8,0 s");
    expect(formatarDuracao(240)).toBe("0,2 s");
  });
});
