import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { envPath } from "./paths";

describe("envPath", () => {
  afterEach(() => delete process.env.ICEWALL_TEST_PATH);
  it("expande ~/ e ~", () => {
    process.env.ICEWALL_TEST_PATH = "~/.cache/x.jsonl";
    expect(envPath("ICEWALL_TEST_PATH", "/f")).toBe(path.join(os.homedir(), ".cache/x.jsonl"));
    process.env.ICEWALL_TEST_PATH = "~";
    expect(envPath("ICEWALL_TEST_PATH", "/f")).toBe(os.homedir());
  });
  it("usa o padrão quando vazio e mantém caminhos absolutos", () => {
    expect(envPath("ICEWALL_TEST_PATH", "/f")).toBe("/f");
    process.env.ICEWALL_TEST_PATH = "  ";
    expect(envPath("ICEWALL_TEST_PATH", "/f")).toBe("/f");
    process.env.ICEWALL_TEST_PATH = "/abs/p";
    expect(envPath("ICEWALL_TEST_PATH", "/f")).toBe("/abs/p");
  });
});
