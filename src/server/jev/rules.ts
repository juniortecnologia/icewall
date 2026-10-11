/** Regras que transformam julgamentos da Jev + métricas em recomendações. Puro: sem banco, sem rede. */

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface NoulAnswer {
  type: "noul";
  noul: number;
}
export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
}
export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;
export type AnswerMap = Record<string, Answer | undefined>;

export interface Rec {
  key: string;
  area: "delegation" | "models" | "os" | "security" | "tokens" | "containers";
  severity: "info" | "warn" | "crit";
  title: string;
  detail: string;
  action: string | null;
  confidence: number | null;
  evidence: unknown;
}

/** Limiar conservador (doc da TypeSafe: começar alto e calibrar com dados reais). */
export const MIN_CHOICE_CONFIDENCE = 0.6;
export const NOUL_MARGIN = 0.15;

export function confidentChoice(a: Answer | undefined): string | null {
  return a?.type === "choice" && a.confidence >= MIN_CHOICE_CONFIDENCE ? a.choice : null;
}

/** true/false só quando a probabilidade está longe de 0,5; senão null (incerto). */
export function confidentNoul(a: Answer | undefined): boolean | null {
  if (a?.type !== "noul") return null;
  if (a.noul >= 0.5 + NOUL_MARGIN) return true;
  if (a.noul <= 0.5 - NOUL_MARGIN) return false;
  return null;
}

export interface JudgedRun {
  runId: string;
  model: string | null;
  tier: string | null;
  exitCode: number;
  verdict: "accepted" | "fixed" | "rejected" | null;
  answers: AnswerMap | null;
}

export const isSuccess = (r: Pick<JudgedRun, "exitCode" | "verdict">) => r.exitCode === 0 && r.verdict !== "rejected";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const LABEL_ROUTE: Record<string, string> = {
  local_fast: "nível fast",
  local_quality: "nível quality (--tier quality)",
  claude_direct: "o Claude escrever direto",
};

function majority(values: (string | null)[]): { value: string; share: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = values.filter(Boolean).length;
  if (!total) return null;
  const [value, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { value, share: n / total };
}

export function delegationRecs(runs: JudgedRun[], keepAlive: string | null): Rec[] {
  const recs: Rec[] = [];
  const judged = runs.filter((r) => r.answers);

  // 1. Tipo de tarefa × modelo com baixa taxa de sucesso → rota sugerida pela maioria dos julgamentos.
  const groups = new Map<string, JudgedRun[]>();
  for (const r of judged) {
    const kind = confidentChoice(r.answers?.task_kind);
    if (!kind || !r.model) continue;
    const key = `${kind}|${r.model}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const rate = list.filter(isSuccess).length / list.length;
    if (rate >= 0.6) continue;
    const [kind, model] = key.split("|");
    const route = majority(list.map((r) => confidentChoice(r.answers?.best_route)));
    const target = route && route.value !== "local_fast" ? route.value : null;
    recs.push({
      key: `deleg:kind-model:${key}`,
      area: "delegation",
      severity: "warn",
      title: `Tarefas de ${kind} acertam só ${pct(rate)} no ${model}`,
      detail:
        `${list.length} delegações de ${kind} com ${model}; ${list.filter(isSuccess).length} aproveitadas.` +
        (target ? ` A Jev indica ${LABEL_ROUTE[target]} em ${pct(route!.share)} delas.` : ""),
      action: target === "claude_direct"
        ? `Rubrica do SKILL.md: mover "${kind}" para "Faça você mesmo"`
        : target === "local_quality"
          ? `Para ${kind}, delegar com --tier quality`
          : null,
      confidence: route?.share ?? null,
      evidence: list.map((r) => r.runId),
    });
  }

  // 2. Tipos de tarefa em que delegar não compensa (spec ≈ código, ou muito retrabalho).
  const byKind = new Map<string, boolean[]>();
  for (const r of judged) {
    const kind = confidentChoice(r.answers?.task_kind);
    const worth = confidentNoul(r.answers?.worth_delegating);
    if (kind && worth !== null) byKind.set(kind, [...(byKind.get(kind) ?? []), worth]);
  }
  for (const [kind, worths] of byKind) {
    if (worths.length < 3) continue;
    const share = worths.filter(Boolean).length / worths.length;
    if (share >= 0.4) continue;
    recs.push({
      key: `deleg:not-worth:${kind}`,
      area: "tokens",
      severity: "info",
      title: `Delegar ${kind} não está economizando tokens`,
      detail: `Em ${worths.length} delegações de ${kind}, só ${pct(share)} valeram a pena segundo a Jev (spec do tamanho do código ou retrabalho).`,
      action: `SKILL.md: "${kind}" só se o código esperado for bem maior que o pedido`,
      confidence: 1 - share,
      evidence: { kind, n: worths.length },
    });
  }

  // 3. Causas de falha dominantes.
  const failed = judged.filter((r) => !isSuccess(r) || r.verdict === "fixed");
  const causes = failed.map((r) => confidentChoice(r.answers?.failure_cause)).filter((c) => c && c !== "none");
  if (causes.length >= 3) {
    const specIssues = causes.filter((c) => c === "ambiguous_spec" || c === "missing_context").length / causes.length;
    if (specIssues >= 0.35) {
      recs.push({
        key: "deleg:spec-quality",
        area: "delegation",
        severity: "warn",
        title: `${pct(specIssues)} das falhas vêm do pedido, não do modelo`,
        detail: "A Jev atribui essas falhas a spec ambíguo ou a contexto faltando. Pedidos mais completos evitam rodadas e retrabalho do Claude.",
        action: "No pedido: assinaturas exatas, casos de borda explícitos e os arquivos de tipos/teste em --context",
        confidence: specIssues,
        evidence: { causes },
      });
    }
    const logic = causes.filter((c) => c === "logic_error" || c === "too_complex").length / causes.length;
    if (logic >= 0.5) {
      recs.push({
        key: "deleg:logic",
        area: "models",
        severity: "info",
        title: `${pct(logic)} das falhas são de lógica do modelo`,
        detail: "O pedido estava claro e mesmo assim o modelo errou. Vale comparar outro modelo no benchmark de qualidade.",
        action: "Rodar o benchmark de qualidade com os candidatos e revisar o models.json",
        confidence: logic,
        evidence: { causes },
      });
    }
  }

  // 4. Gargalo de carga do modelo → keep_alive.
  const bottlenecks = judged.map((r) => confidentChoice(r.answers?.bottleneck)).filter(Boolean);
  const loads = bottlenecks.filter((b) => b === "model_load").length;
  if (bottlenecks.length >= 5 && loads / bottlenecks.length >= 0.3) {
    recs.push({
      key: "deleg:keep-alive",
      area: "models",
      severity: "warn",
      title: `Carga do modelo domina ${pct(loads / bottlenecks.length)} das delegações`,
      detail: `O keep_alive atual (${keepAlive ?? "?"}) descarrega o modelo entre pedidos. O Spark tem memória de sobra para manter o modelo fast carregado.`,
      action: `models.json: "keep_alive": "${keepAlive ?? "2m"}" → "keep_alive": "30m"`,
      confidence: loads / bottlenecks.length,
      evidence: { loads, n: bottlenecks.length },
    });
  }
  return recs;
}

export function tokenRecs(stats: { cacheRead: number; input: number; cacheCreation: number; days: number }): Rec[] {
  const totalIn = stats.cacheRead + stats.input + stats.cacheCreation;
  if (totalIn < 1_000_000) return [];
  const hit = stats.cacheRead / totalIn;
  if (hit >= 0.7) return [];
  return [
    {
      key: "tokens:cache-hit",
      area: "tokens",
      severity: "info",
      title: `Só ${pct(hit)} da entrada do Claude vem do cache`,
      detail: `Nos últimos ${stats.days} dias, ${(stats.cacheCreation / 1e6).toFixed(1)} M tokens foram gravados em cache e ${(stats.cacheRead / 1e6).toFixed(1)} M lidos. Sessões curtas ou CLAUDE.md que muda muito desperdiçam o cache.`,
      action: "Preferir sessões contínuas por tarefa; evitar editar CLAUDE.md/skills no meio da sessão",
      confidence: null,
      evidence: stats,
    },
  ];
}
