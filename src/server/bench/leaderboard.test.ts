import { describe, expect, it } from "vitest";
import { leaderboard, type ResultRow } from "./leaderboard";

const q = (model: string, task: string, ok: boolean, firstTry = ok): ResultRow => ({
  model, task, ok, firstTry, durationS: 10, tokS: null, promptTokS: null, ttftMs: null, loadMs: null, sizeVram: null,
});
const p = (model: string, tokS: number, ttftMs: number, sizeVram: number): ResultRow => ({
  model, task: "perf:8k", ok: true, firstTry: null, durationS: 1, tokS, promptTokS: 1000, ttftMs, loadMs: null, sizeVram,
});

describe("leaderboard", () => {
  it("ordena pelo score composto e calcula taxas por tarefa", () => {
    const rows = [
      q("a", "t1", true), q("a", "t2", true), p("a", 100, 500, 20e9),
      q("b", "t1", true), q("b", "t2", false), p("b", 40, 900, 18e9),
    ];
    const [first, second] = leaderboard(rows);
    expect(first.model).toBe("a");
    expect(first.passRate).toBe(1);
    expect(second.perTask.t2).toEqual({ ok: 0, n: 1 });
    expect(first.score).toBeGreaterThan(second.score);
  });

  it("pesos mudam a ordem sem rodar nada", () => {
    const rows = [q("a", "t1", true), p("a", 10, 500, 20e9), q("b", "t1", false), p("b", 100, 500, 20e9)];
    expect(leaderboard(rows, { quality: 0, firstTry: 0, speed: 1, latency: 0, memory: 0 })[0].model).toBe("b");
    expect(leaderboard(rows, { quality: 1, firstTry: 0, speed: 0, latency: 0, memory: 0 })[0].model).toBe("a");
  });

  it("métrica ausente não pesa (modelo só com perf)", () => {
    const [only] = leaderboard([p("x", 50, 300, 1e9)]);
    expect(only.passRate).toBeNull();
    expect(only.score).toBe(1);
  });
});
