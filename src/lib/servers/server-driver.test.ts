import { describe, it } from "node:test";
import assert from "node:assert";
import { createDriver, registerDriver, ServerDriver, type BaseConfig } from "./server-driver";

describe("ServerDriver — factory registration", () => {
  it("createDriver falha com driver nome inexistente", async () => {
    assert.throws(
      () => createDriver("nonexistent", {} as never),
      /driver desconhecido: nonexistent/,
    );
  });

  it("registerDriver + createDriver registra e recupera um driver customizado", async () => {
    class MockDriver extends ServerDriver {
      exec(): Promise<{ code: number; stdout: string; stderr: string; ms: number }> {
        return Promise.resolve({ code: 0, stdout: "", stderr: "", ms: 0 });
      }
      put(_l: string, _r: string): Promise<void> { return Promise.resolve(); }
      get(_r: string, _l: string): Promise<void> { return Promise.resolve(); }
      ls(): Promise<string[]> { return Promise.resolve([]); }
      mkdir(_dir: string, _mode?: string): Promise<void> { return Promise.resolve(); }
      ping(): Promise<boolean> { return Promise.resolve(true); }
    }

    let captured: BaseConfig | null = null;
    registerDriver("_mock", (config: BaseConfig) => {
      captured = config;
      return new MockDriver(config);
    });

    const mockCfg: BaseConfig = { host: "mock.local", port: 2022, user: "mockuser", keyPath: "/dev/null" };
    createDriver("_mock", mockCfg);
    assert.strictEqual(captured, mockCfg);
  });
});
