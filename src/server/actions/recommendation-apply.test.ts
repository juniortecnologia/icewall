import { describe, expect, it } from "vitest";
import { getRecommendationExecutable } from "./recommendation-apply";

describe("getRecommendationExecutable", () => {
  it("identifica troca de modelo para tier.set", () => {
    const res = getRecommendationExecutable({
      key: "bench:fast-model",
      action: 'models.json: "fast" → "qwen3.8-code:27b-128k" (botão Aplicar em Benchmarks)',
    });
    expect(res.canApply).toBe(true);
    expect(res.actionId).toBe("tier.set");
    expect(res.target).toBe("fast");
    expect(res.arg).toBe("qwen3.8-code:27b-128k");
  });

  it("identifica ajuste de keep_alive", () => {
    const res = getRecommendationExecutable({
      key: "deleg:keep-alive",
      action: 'models.json: "keep_alive": "2m" → "keep_alive": "30m"',
    });
    expect(res.canApply).toBe(true);
    expect(res.actionId).toBe("keepalive.set");
    expect(res.target).toBe("30m");
  });

  it("identifica ação de benchmark de qualidade", () => {
    const res = getRecommendationExecutable({
      key: "deleg:logic",
      action: "Rodar o benchmark de qualidade com os candidatos e revisar o models.json",
    });
    expect(res.canApply).toBe(true);
    expect(res.actionId).toBe("bench.quality.start");
  });

  it("não permite comandos de apt com sudo sem confirmação no terminal", () => {
    const res = getRecommendationExecutable({
      key: "os:updates-urgent",
      action: "sudo apt update && sudo apt install --only-upgrade curl",
    });
    expect(res.canApply).toBe(false);
  });
});
