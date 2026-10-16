import "server-only";

/**
 * Parser do protocolo de treino (`deploy/train/fine_tune.py`): linhas
 * `@@ICW {json}@@` carregam step/loss/epoch; o resto é log humano.
 * Parse tolerante: linha inválida é ignorada (nunca derruba o poll).
 */

export type TrainMarker =
  | { type: "start"; total_steps: number; total_epochs: number }
  | { type: "step"; step: number; loss: number; lr: number; epoch: number }
  | { type: "done"; train_loss: number | null }
  | { type: "saved"; adapter: string }
  | { type: "warning"; message: string }
  | { type: "error"; message: string };

const MARCA = /@@ICW\s+(\{.*?\})\s*@@/g;

export function parseTrainLog(texto: string): TrainMarker[] {
  const marcadores: TrainMarker[] = [];
  // Match GLOBAL (não por linha): o tqdm cola o marcador no fim da linha de
  // progresso sem \n — o marcador pode aparecer no meio de uma linha.
  for (const m of texto.matchAll(MARCA)) {
    try {
      const obj = JSON.parse(m[1]) as Record<string, unknown>;
      switch (obj.type) {
        case "start":
          if (typeof obj.total_steps === "number") {
            marcadores.push({ type: "start", total_steps: obj.total_steps, total_epochs: Number(obj.total_epochs) || 0 });
          }
          break;
        case "step":
          if (typeof obj.step === "number" && typeof obj.loss === "number") {
            marcadores.push({
              type: "step",
              step: obj.step,
              loss: obj.loss,
              lr: Number(obj.lr) || 0,
              epoch: Number(obj.epoch) || 0,
            });
          }
          break;
        case "done":
          marcadores.push({ type: "done", train_loss: typeof obj.train_loss === "number" ? obj.train_loss : null });
          break;
        case "saved":
          if (typeof obj.adapter === "string") marcadores.push({ type: "saved", adapter: obj.adapter });
          break;
        case "warning":
        case "error":
          if (typeof obj.message === "string") marcadores.push({ type: obj.type, message: obj.message });
          break;
        default:
          break; // tipo desconhecido: ignora (forward-compatible)
      }
    } catch {
      // JSON malformado no meio do log: ignora a linha
    }
  }
  return marcadores;
}

/** Funde marcadores "step" novos no histórico, dedup por step (ordena por step). */
export function fundirLossHistory(
  atual: { step: number; value: number }[] | null,
  marcadores: TrainMarker[],
  maxPontos = 2000,
): { step: number; value: number }[] {
  const mapa = new Map<number, number>();
  for (const p of atual ?? []) mapa.set(p.step, p.value);
  for (const m of marcadores) {
    if (m.type === "step") mapa.set(m.step, m.loss);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-maxPontos)
    .map(([step, value]) => ({ step, value }));
}
