import { describe, expect, it } from "vitest";
import { confidentChoice, confidentNoul, delegationRecs, tokenRecs, type AnswerMap, type JudgedRun } from "./rules";

const choice = (c: string, confidence = 0.9) => ({ type: "choice" as const, choice: c, confidence, probabilities: { [c]: confidence } });
const noul = (p: number) => ({ type: "noul" as const, noul: p });

function run(i: number, over: Partial<JudgedRun>, answers: AnswerMap): JudgedRun {
  return { runId: `r${i}`, model: "qwen", tier: "fast", exitCode: 0, verdict: "accepted", answers, ...over };
}

describe("limiares de confiança", () => {
  it("choice abaixo de 0,6 é ignorada", () => {
    expect(confidentChoice(choice("tests", 0.59))).toBeNull();
    expect(confidentChoice(choice("tests", 0.6))).toBe("tests");
  });
  it("noul perto de 0,5 é incerto", () => {
    expect(confidentNoul(noul(0.49))).toBeNull();
    expect(confidentNoul(noul(0.66))).toBe(true);
    expect(confidentNoul(noul(0.3))).toBe(false);
  });
});

describe("delegationRecs", () => {
  it("tipo × modelo com acerto baixo sugere a rota que a maioria da Jev indica", () => {
    const runs = [0, 1, 2, 3].map((i) =>
      run(i, { exitCode: i === 0 ? 0 : 6, verdict: i === 0 ? "accepted" : null }, { task_kind: choice("parsing"), best_route: choice("local_quality") }),
    );
    const [rec] = delegationRecs(runs, "2m");
    expect(rec.key).toBe("deleg:kind-model:parsing|qwen");
    expect(rec.title).toContain("25%");
    expect(rec.action).toContain("--tier quality");
  });

  it("menos de 3 execuções não gera recomendação", () => {
    const runs = [0, 1].map((i) => run(i, { exitCode: 6 }, { task_kind: choice("parsing") }));
    expect(delegationRecs(runs, "2m")).toEqual([]);
  });

  it("rejeitado conta como falha mesmo com exit 0", () => {
    const runs = [0, 1, 2].map((i) => run(i, { verdict: "rejected" }, { task_kind: choice("docs"), best_route: choice("claude_direct") }));
    const [rec] = delegationRecs(runs, null);
    expect(rec.action).toContain('"docs"');
  });

  it("delegar não compensa quando a maioria dos worth é falso", () => {
    const runs = [0, 1, 2].map((i) => run(i, {}, { task_kind: choice("types"), worth_delegating: noul(0.1) }));
    expect(delegationRecs(runs, null).map((r) => r.key)).toContain("deleg:not-worth:types");
  });

  it("falhas de pedido dominantes geram recomendação de spec", () => {
    const runs = [0, 1, 2].map((i) => run(i, { exitCode: 6, verdict: null }, { failure_cause: choice(i < 2 ? "missing_context" : "logic_error") }));
    expect(delegationRecs(runs, null).map((r) => r.key)).toContain("deleg:spec-quality");
  });

  it("carga do modelo frequente sugere keep_alive maior", () => {
    const runs = [0, 1, 2, 3, 4].map((i) => run(i, {}, { bottleneck: choice(i < 2 ? "model_load" : "generation") }));
    const rec = delegationRecs(runs, "2m").find((r) => r.key === "deleg:keep-alive");
    expect(rec?.action).toBe('models.json: "keep_alive": "2m" → "keep_alive": "30m"');
  });
});

describe("tokenRecs", () => {
  it("só fala de cache com volume e taxa baixa", () => {
    expect(tokenRecs({ cacheRead: 10, input: 10, cacheCreation: 10, days: 7 })).toEqual([]);
    expect(tokenRecs({ cacheRead: 900_000, input: 50_000, cacheCreation: 100_000, days: 7 })).toEqual([]);
    expect(tokenRecs({ cacheRead: 400_000, input: 300_000, cacheCreation: 400_000, days: 7 })[0].key).toBe("tokens:cache-hit");
  });
});
