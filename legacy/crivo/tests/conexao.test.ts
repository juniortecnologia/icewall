import { beforeEach, describe, expect, it } from "vitest";
import { lerConexao, registrarSinal } from "@/lib/conexao";

beforeEach(() => {
  Reflect.deleteProperty(globalThis, "__crivoConexao");
});

describe("conexão com o projeto", () => {
  it("começa desligada e sem sinal", () => {
    expect(lerConexao()).toEqual({ conectado: false, ultimoSinal: null });
  });

  it("ferramenta antes de qualquer prompt só atualiza o último sinal", () => {
    registrarSinal("ferramenta", "2026-10-07T12:00:00.000Z");
    expect(lerConexao()).toEqual({ conectado: false, ultimoSinal: "2026-10-07T12:00:00.000Z" });
  });

  it("o primeiro prompt acende e fica aceso; o último sinal acompanha tudo", () => {
    registrarSinal("prompt", "2026-10-07T12:00:00.000Z");
    registrarSinal("ferramenta", "2026-10-07T12:05:00.000Z");
    expect(lerConexao()).toEqual({ conectado: true, ultimoSinal: "2026-10-07T12:05:00.000Z" });
  });
});
