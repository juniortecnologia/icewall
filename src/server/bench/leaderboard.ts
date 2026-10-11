/** Score composto por modelo, com pesos ajustáveis. Puro: recebe as linhas de bench_results. */

export interface ResultRow {
  model: string;
  task: string;
  ok: boolean;
  firstTry: boolean | null;
  durationS: number | null;
  tokS: number | null;
  promptTokS: number | null;
  ttftMs: number | null;
  loadMs: number | null;
  sizeVram: number | null;
}

export interface Weights {
  quality: number;
  firstTry: number;
  speed: number;
  latency: number;
  memory: number;
}

export const DEFAULT_WEIGHTS: Weights = { quality: 0.45, firstTry: 0.2, speed: 0.2, latency: 0.1, memory: 0.05 };

export interface ModelStats {
  model: string;
  qualityRuns: number;
  passRate: number | null;
  firstTryRate: number | null;
  avgQualitySeconds: number | null;
  genTokS: number | null;
  promptTokS: number | null;
  ttftMs: number | null;
  loadMs: number | null;
  memGB: number | null;
  score: number;
  perTask: Record<string, { ok: number; n: number }>;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: (number | null)[]) => xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));

function aggregate(model: string, rows: ResultRow[]): Omit<ModelStats, "score"> {
  const quality = rows.filter((r) => !r.task.startsWith("perf:"));
  const perf = rows.filter((r) => r.task.startsWith("perf:") && r.ok);
  const perTask: ModelStats["perTask"] = {};
  for (const r of quality) {
    perTask[r.task] ??= { ok: 0, n: 0 };
    perTask[r.task].n++;
    if (r.ok) perTask[r.task].ok++;
  }
  const mid = perf.filter((r) => r.task === "perf:8k");
  return {
    model,
    qualityRuns: quality.length,
    passRate: quality.length ? quality.filter((r) => r.ok).length / quality.length : null,
    firstTryRate: quality.length ? quality.filter((r) => r.firstTry).length / quality.length : null,
    avgQualitySeconds: avg(nums(quality.map((r) => r.durationS))),
    genTokS: avg(nums(perf.map((r) => r.tokS))),
    promptTokS: avg(nums((mid.length ? mid : perf).map((r) => r.promptTokS))),
    ttftMs: avg(nums((mid.length ? mid : perf).map((r) => r.ttftMs))),
    loadMs: avg(nums(rows.filter((r) => r.task === "perf:load").map((r) => r.loadMs))),
    memGB: avg(nums(perf.map((r) => (r.sizeVram ? r.sizeVram / 1e9 : null)))),
    perTask,
  };
}

/** Normaliza para 0..1 entre os modelos (maior é melhor; `invert` para métricas em que menor é melhor). */
function normalizer(values: (number | null)[], invert = false) {
  const v = nums(values);
  const min = Math.min(...v);
  const max = Math.max(...v);
  return (x: number | null) => {
    if (x === null || !v.length) return null;
    if (max === min) return 1;
    const n = (x - min) / (max - min);
    return invert ? 1 - n : n;
  };
}

export function leaderboard(rows: ResultRow[], weights: Weights = DEFAULT_WEIGHTS): ModelStats[] {
  const byModel = new Map<string, ResultRow[]>();
  for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  const stats = [...byModel].map(([m, rs]) => aggregate(m, rs));
  const nQ = normalizer(stats.map((s) => s.passRate));
  const nF = normalizer(stats.map((s) => s.firstTryRate));
  const nS = normalizer(stats.map((s) => s.genTokS));
  const nL = normalizer(stats.map((s) => s.ttftMs), true);
  const nM = normalizer(stats.map((s) => s.memGB), true);
  return stats
    .map((s) => {
      const parts: [number | null, number][] = [
        [nQ(s.passRate), weights.quality],
        [nF(s.firstTryRate), weights.firstTry],
        [nS(s.genTokS), weights.speed],
        [nL(s.ttftMs), weights.latency],
        [nM(s.memGB), weights.memory],
      ];
      // Métrica ausente (modelo sem benchmark daquele tipo) não pontua nem pesa.
      const used = parts.filter(([v, w]) => v !== null && w > 0);
      const totalW = used.reduce((a, [, w]) => a + w, 0);
      const score = totalW ? used.reduce((a, [v, w]) => a + (v as number) * w, 0) / totalW : 0;
      return { ...s, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score);
}
