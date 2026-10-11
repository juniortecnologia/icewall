import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInvoice } from "../src/validators/invoice.js";

const ok = () => ({
  number: "INV-000123",
  customerId: "c-42",
  issuedAt: "2026-10-10",
  currency: "BRL",
  items: [
    { sku: "A1", qty: 2, priceCents: 1999 },
    { sku: "B2", qty: 1, priceCents: 0 },
  ],
  notes: "",
});

test("fatura válida", () => {
  assert.deepEqual(validateInvoice(ok()), { ok: true, errors: [] });
});

test("entrada nula não lança e acusa todos os obrigatórios em ordem", () => {
  assert.deepEqual(validateInvoice(null), {
    ok: false,
    errors: [
      { field: "number", code: "E_REQUIRED" },
      { field: "customerId", code: "E_REQUIRED" },
      { field: "issuedAt", code: "E_REQUIRED" },
      { field: "currency", code: "E_REQUIRED" },
      { field: "items", code: "E_REQUIRED" },
    ],
  });
});

test("formatos, enum, tamanho e espaços nas pontas", () => {
  const inv = { ...ok(), number: " INV-000123 ", customerId: "x".repeat(37), issuedAt: "2026-02-30", currency: "GBP", notes: "n".repeat(281) };
  assert.deepEqual(validateInvoice(inv).errors, [
    { field: "customerId", code: "E_TOO_LONG" },
    { field: "issuedAt", code: "E_FORMAT" },
    { field: "currency", code: "E_NOT_ALLOWED" },
    { field: "notes", code: "E_TOO_LONG" },
  ]);
  assert.deepEqual(validateInvoice({ ...ok(), number: "INV-12345" }).errors, [{ field: "number", code: "E_FORMAT" }]);
});

test("itens: nomes de campo com índice, duplicado, inteiro e faixa", () => {
  const inv = {
    ...ok(),
    items: [
      { sku: "A1", qty: 0, priceCents: 10 },
      { sku: "A1", qty: 1.5, priceCents: -1 },
      null,
      { sku: "C3", qty: 1000, priceCents: 2.5 },
    ],
  };
  assert.deepEqual(validateInvoice(inv).errors, [
    { field: "items[0].qty", code: "E_RANGE" },
    { field: "items[1].sku", code: "E_DUPLICATE" },
    { field: "items[1].qty", code: "E_NOT_INTEGER" },
    { field: "items[1].priceCents", code: "E_RANGE" },
    { field: "items[2].sku", code: "E_REQUIRED" },
    { field: "items[2].qty", code: "E_REQUIRED" },
    { field: "items[2].priceCents", code: "E_REQUIRED" },
    { field: "items[3].qty", code: "E_RANGE" },
    { field: "items[3].priceCents", code: "E_NOT_INTEGER" },
  ]);
});

test("lista vazia conta como ausente", () => {
  assert.deepEqual(validateInvoice({ ...ok(), items: [] }).errors, [{ field: "items", code: "E_REQUIRED" }]);
});
