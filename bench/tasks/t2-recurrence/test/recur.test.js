import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrences } from "../src/recur.js";

test("diário a cada 3 dias", () => {
  assert.deepEqual(nextOccurrences({ freq: "daily", start: "2026-02-26", interval: 3 }, undefined, 4), [
    "2026-02-26", "2026-03-01", "2026-03-04", "2026-03-07",
  ]);
});

test("diário a partir de um from no meio da série", () => {
  assert.deepEqual(nextOccurrences({ freq: "daily", start: "2026-01-01", interval: 2 }, "2026-01-04", 2), ["2026-01-05", "2026-01-07"]);
});

test("semanal: padrão é o dia da semana de start", () => {
  // 2026-10-07 é quarta-feira
  assert.deepEqual(nextOccurrences({ freq: "weekly", start: "2026-10-07" }, undefined, 3), ["2026-10-07", "2026-10-14", "2026-10-21"]);
});

test("semanal com vários dias e intervalo 2, sem dias antes de start", () => {
  // semana de start: dom 2026-10-04 .. sáb 2026-10-10; start = quarta 2026-10-07
  assert.deepEqual(nextOccurrences({ freq: "weekly", start: "2026-10-07", interval: 2, byWeekday: [1, 3, 5] }, undefined, 5), [
    "2026-10-07", "2026-10-09", "2026-10-19", "2026-10-21", "2026-10-23",
  ]);
});

test("semanal com from posterior", () => {
  assert.deepEqual(nextOccurrences({ freq: "weekly", start: "2026-10-05", byWeekday: [5, 1] }, "2026-10-13", 3), ["2026-10-16", "2026-10-19", "2026-10-23"]);
});

test("semanal com intervalo 2 e from várias semanas depois não pula semanas ativas", () => {
  // semanas ativas: 04/10, 18/10, 01/11, 15/11, 29/11 ; quartas: 07/10, 21/10, 04/11, 18/11, 02/12
  assert.deepEqual(nextOccurrences({ freq: "weekly", start: "2026-10-07", interval: 2 }, "2026-11-10", 2), ["2026-11-18", "2026-12-02"]);
});

test("mensal pula meses sem o dia", () => {
  assert.deepEqual(nextOccurrences({ freq: "monthly", start: "2026-01-31" }, undefined, 4), ["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"]);
});

test("mensal com intervalo e byMonthDay, atravessando o ano", () => {
  // nov, fev (sem dia 30: pula), mai, ago
  assert.deepEqual(nextOccurrences({ freq: "monthly", start: "2026-11-10", interval: 3, byMonthDay: 30 }, undefined, 3), ["2026-11-30", "2027-05-30", "2027-08-30"]);
});

test("mensal: 29 de fevereiro só em ano bissexto", () => {
  assert.deepEqual(nextOccurrences({ freq: "monthly", start: "2027-01-29", interval: 1 }, "2027-02-01", 2), ["2027-03-29", "2027-04-29"]);
  assert.deepEqual(nextOccurrences({ freq: "monthly", start: "2028-01-29" }, "2028-02-01", 1), ["2028-02-29"]);
});

test("count zero e intervalo inválido", () => {
  assert.deepEqual(nextOccurrences({ freq: "daily", start: "2026-01-01" }, undefined, 0), []);
  assert.throws(() => nextOccurrences({ freq: "daily", start: "2026-01-01", interval: 0 }, undefined, 1), RangeError);
  assert.throws(() => nextOccurrences({ freq: "daily", start: "2026-01-01", interval: 1.5 }, undefined, 1), RangeError);
});
