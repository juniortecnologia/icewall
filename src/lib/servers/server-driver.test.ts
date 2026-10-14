import { describe, expect, it } from "vitest";
import { createDriver, registerDriver, ServerDriver, type BaseConfig } from "./server-driver";

describe("ServerDriver — factory registration", () => {
  it("createDriver falha com driver nome inexistente", () => {
    expect(() => createDriver("nonexistent", {} as never)).toThrow(/driver desconhecido: nonexistent/);
  });

  it("registerDriver + createDriver registra e recupera um driver customizado", () => {
    class MockDriver extends ServerDriver {
      exec(): Promise<{ code: number; stdout: string; stderr: string; ms: number }> {
        return Promise.resolve({ code: 0, stdout: "", stderr: "", ms: 0 });
      }
      put(): Promise<void> { return Promise.resolve(); }
      get(): Promise<void> { return Promise.resolve(); }
      ls(): Promise<string[]> { return Promise.resolve([]); }
      mkdir(): Promise<void> { return Promise.resolve(); }
      ping(): Promise<boolean> { return Promise.resolve(true); }
    }

    let captured: BaseConfig | null = null;
    registerDriver("_mock", (config: BaseConfig) => {
      captured = config;
      return new MockDriver(config);
    });

    const mockCfg: BaseConfig = { host: "mock.local", port: 2022, user: "mockuser", keyPath: "/dev/null" };
    createDriver("_mock", mockCfg);
    expect(captured).toBe(mockCfg);
  });
});
