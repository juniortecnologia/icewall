import { test } from "node:test";
import assert from "node:assert/strict";
import { get, set, unset } from "../src/paths.js";

test("get com string, colchetes e array", () => {
  const o = { a: { b: [{ c: 1 }, { c: 2 }] }, items: [null, { name: "x" }] };
  assert.equal(get(o, "a.b[1].c"), 2);
  assert.equal(get(o, ["a", "b", 0, "c"]), 1);
  assert.equal(get(o, "items.1.name"), "x");
  assert.equal(get(o, "items.0.name", "def"), "def");
  assert.equal(get(o, "a.z.y", 7), 7);
  assert.equal(get(o, ""), o);
});

test("get devolve valores falsy que existem", () => {
  assert.equal(get({ a: 0 }, "a", 9), 0);
  assert.equal(get({ a: null }, "a", 9), null);
  assert.equal(get({ a: false }, ["a"], 9), false);
});

test("set cria arrays para índices e objetos para chaves", () => {
  const o = {};
  set(o, "x[0].y", 1);
  set(o, ["x", 1, "z"], 2);
  set(o, "k.v", 3);
  assert.deepEqual(o, { x: [{ y: 1 }, { z: 2 }], k: { v: 3 } });
  assert.equal(Array.isArray(o.x), true);
});

test("set: chave string '0' no array de caminho cria objeto", () => {
  const o = {};
  set(o, ["m", "0", "n"], 1);
  assert.deepEqual(o, { m: { 0: { n: 1 } } });
  assert.equal(Array.isArray(o.m), false);
});

test("set: índice em string com pontos cria array", () => {
  const o = {};
  set(o, "list.2", "c");
  assert.equal(Array.isArray(o.list), true);
  assert.equal(o.list.length, 3);
  assert.equal(o.list[2], "c");
});

test("set substitui primitivos no meio do caminho e devolve o objeto", () => {
  const o = { a: 5, b: null };
  assert.equal(set(o, "a.b", 1), o);
  set(o, "b[0]", "x");
  assert.deepEqual(o, { a: { b: 1 }, b: ["x"] });
});

test("unset em objeto e em array (splice)", () => {
  const o = { a: { b: 1, c: 2 }, list: ["x", "y", "z"] };
  assert.equal(unset(o, "a.b"), true);
  assert.equal(unset(o, "list[0]"), true);
  assert.deepEqual(o, { a: { c: 2 }, list: ["y", "z"] });
  assert.equal(unset(o, "a.nada"), false);
  assert.equal(unset(o, "x.y.z"), false);
  assert.equal(unset(o, "list.5"), false);
});
