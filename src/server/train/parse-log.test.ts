import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fundirLossHistory, parseTrainLog } from "./parse-log";

/**
 * Parser do protocolo @@ICW do fine_tune.py — fixture real do log esperado
 * (precedente: src/server/parsers/fixtures/).
 */

const fixture = readFileSync(path.join(__dirname, "fixtures", "train-sample.log"), "utf8");

describe("parseTrainLog", () => {
  it("extrai start/step/done/saved/warning e ignora ruído do Trainer", () => {
    const m = parseTrainLog(fixture);
    expect(m[0]).toEqual({ type: "start", total_steps: 12, total_epochs: 3 });
    const steps = m.filter((x) => x.type === "step");
    expect(steps).toHaveLength(3); // step 2 + step 5 duplicado (dedup é no fundirLossHistory)
    expect(steps[1]).toEqual({ type: "step", step: 5, loss: 1.7321, lr: 0.00012, epoch: 1 });
    expect(m.filter((x) => x.type === "warning")).toHaveLength(1);
    expect(m.at(-1)).toEqual({ type: "saved", adapter: "/workspace/out/adapter" });
    expect(m.filter((x) => x.type === "done")).toEqual([{ type: "done", train_loss: 1.4123 }]);
  });

  it("extrai marcador colado à barra de progresso do tqdm (sem \\n antes)", () => {
    const colado = " 62%|██████▎   | 5/8 [00:01<00:00]@@ICW {\"type\":\"step\",\"step\":5,\"loss\":4.19,\"lr\":0.00016,\"epoch\":0.625}@@";
    expect(parseTrainLog(colado)).toEqual([{ type: "step", step: 5, loss: 4.19, lr: 0.00016, epoch: 0.625 }]);
  });

  it("ignora linhas malformadas sem quebrar", () => {
    expect(parseTrainLog('lixo\n@@ICW {quebrado@@\n@@ICW {"type":"step","step":1,"loss":0.5,"lr":0,"epoch":0}@@\n@@ICW []@@\n')).toEqual([
      { type: "step", step: 1, loss: 0.5, lr: 0, epoch: 0 },
    ]);
  });

  it("log vazio → nenhum marcador", () => {
    expect(parseTrainLog("")).toEqual([]);
  });
});

describe("fundirLossHistory", () => {
  it("dedup por step mantendo o valor mais novo e ordena", () => {
    const atual = [{ step: 1, value: 2.0 }, { step: 2, value: 1.8 }];
    const fundido = fundirLossHistory(atual, [
      { type: "step", step: 2, loss: 1.75, lr: 0, epoch: 0 },
      { type: "step", step: 3, loss: 1.5, lr: 0, epoch: 0 },
      { type: "done", train_loss: 1.4 },
    ]);
    expect(fundido).toEqual([
      { step: 1, value: 2.0 },
      { step: 2, value: 1.75 },
      { step: 3, value: 1.5 },
    ]);
  });

  it("limita ao máximo de pontos (mais recentes)", () => {
    const atual = Array.from({ length: 10 }, (_, i) => ({ step: i + 1, value: i }));
    const fundido = fundirLossHistory(atual, [], 5);
    expect(fundido).toHaveLength(5);
    expect(fundido[0].step).toBe(6);
  });
});
