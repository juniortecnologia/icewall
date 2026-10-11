import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotal } from "../src/cart.js";

const D = new Date("2026-06-15T12:00:00Z");

test("soma linhas sem cupom", () => {
  assert.deepEqual(computeTotal([{ sku: "A1", qty: 2 }, { sku: "C3", qty: 3 }], undefined, D), {
    subtotalCents: 4448, discountCents: 0, totalCents: 4448, warnings: [],
  });
});

test("desconto de volume só na linha com qty >= 10", () => {
  // 10 * 150 = 1500 - 150 = 1350 ; 1 * 1999
  assert.equal(computeTotal([{ sku: "C3", qty: 10 }, { sku: "A1", qty: 1 }], null, D).subtotalCents, 3349);
  // 9 unidades: sem volume
  assert.equal(computeTotal([{ sku: "C3", qty: 9 }], null, D).subtotalCents, 1350);
});

test("volume arredonda o desconto com Math.round", () => {
  // 11 * 1999 = 21989 ; 10% = 2198.9 -> 2199 ; 19790
  assert.equal(computeTotal([{ sku: "A1", qty: 11 }], "", D).subtotalCents, 19790);
});

test("cupom percentual, código sem diferenciar caixa e com espaços", () => {
  const r = computeTotal([{ sku: "B2", qty: 1 }], "  save10 ", D);
  assert.deepEqual(r, { subtotalCents: 8990, discountCents: 899, totalCents: 8091, warnings: [] });
});

test("cupom fixo com mínimo", () => {
  assert.deepEqual(computeTotal([{ sku: "A1", qty: 2 }], "FIVEOFF", D), {
    subtotalCents: 3998, discountCents: 500, totalCents: 3498, warnings: [],
  });
  assert.deepEqual(computeTotal([{ sku: "A1", qty: 1 }], "FIVEOFF", D), {
    subtotalCents: 1999, discountCents: 0, totalCents: 1999, warnings: ["MIN_SUBTOTAL"],
  });
});

test("cupom fixo nunca deixa o total negativo", () => {
  assert.deepEqual(computeTotal([{ sku: "C3", qty: 1 }], "BIGFIX", D), {
    subtotalCents: 150, discountCents: 150, totalCents: 0, warnings: [],
  });
});

test("cupom vencido e desconhecido geram aviso e não descontam", () => {
  assert.deepEqual(computeTotal([{ sku: "B2", qty: 1 }], "OLD50", D).warnings, ["EXPIRED_COUPON"]);
  assert.equal(computeTotal([{ sku: "B2", qty: 1 }], "OLD50", D).discountCents, 0);
  assert.deepEqual(computeTotal([{ sku: "B2", qty: 1 }], "NOPE", D).warnings, ["UNKNOWN_COUPON"]);
});

test("vence no fim do dia de expires (UTC)", () => {
  assert.deepEqual(computeTotal([{ sku: "B2", qty: 1 }], "OLD50", new Date("2020-01-01T23:59:59Z")).warnings, []);
  assert.deepEqual(computeTotal([{ sku: "B2", qty: 1 }], "OLD50", new Date("2020-01-02T00:00:00Z")).warnings, ["EXPIRED_COUPON"]);
});

test("erros de SKU e quantidade", () => {
  assert.throws(() => computeTotal([{ sku: "ZZ", qty: 1 }], null, D), { message: "UNKNOWN_SKU:ZZ" });
  assert.throws(() => computeTotal([{ sku: "A1", qty: 0 }], null, D), { message: "INVALID_QTY:A1" });
  assert.throws(() => computeTotal([{ sku: "A1", qty: 1.5 }], null, D), { message: "INVALID_QTY:A1" });
});

test("carrinho vazio", () => {
  assert.deepEqual(computeTotal([], "SAVE10", D), { subtotalCents: 0, discountCents: 0, totalCents: 0, warnings: [] });
});
