import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// O MODELS_JSON é lido na importação: aponta para um arquivo temporário antes de importar o módulo.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "icewall-models-"));
const file = path.join(dir, "models.json");
process.env.DELEGATE_MODELS_JSON = file;

const cfg = {
  hosts: ["http://10.0.5.18:11434"],
  keep_alive: "2m",
  tiers: {
    fast: { model: "chat", backend: "openai", hosts: ["http://10.0.5.18:8000"], priority: 10, fallback: [] },
    quality: { model: "gemma4:26b", fallback: ["qwen3.8-code:27b-128k"] },
  },
};

let mod: typeof import("./models-json");
beforeAll(async () => {
  fs.writeFileSync(file, JSON.stringify(cfg));
  mod = await import("./models-json");
});

describe("níveis do delegate-local fora do Ollama", () => {
  it("o backend vem do nível, senão do topo, senão é ollama", () => {
    expect(mod.tierBackend(cfg, "fast")).toBe("openai");
    expect(mod.tierBackend(cfg, "quality")).toBe("ollama");
    expect(mod.tierBackend({ ...cfg, backend: "openai" }, "quality")).toBe("openai");
  });

  it("não troca o modelo de um nível que roda no vLLM", () => {
    expect(() => mod.setTierModel("fast", "qwen3.6:35b-a3b", true)).toThrow(/vLLM/);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).tiers.fast.model).toBe("chat");
  });

  it("troca o de um nível do Ollama e preserva os campos dos outros níveis", () => {
    const diff = mod.setTierModel("quality", "qwen3.6:35b-a3b", false);
    expect(diff.after).toContain("qwen3.6:35b-a3b");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved.tiers.quality.fallback[0]).toBe("gemma4:26b");
    expect(saved.tiers.fast).toEqual(cfg.tiers.fast);
  });
});
