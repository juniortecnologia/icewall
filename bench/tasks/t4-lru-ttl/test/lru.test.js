import { test } from "node:test";
import assert from "node:assert/strict";
import { LruCache } from "../src/lru.js";

const clock = () => {
  let t = 0;
  const now = () => t;
  now.advance = (ms) => (t += ms);
  return now;
};

test("despeja a menos recente", () => {
  const c = new LruCache({ max: 2 });
  c.set("a", 1).set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.deepEqual(c.keys(), ["a", "c"]);
  assert.equal(c.get("b"), undefined);
});

test("has não muda a ordem", () => {
  const c = new LruCache({ max: 2 });
  c.set("a", 1).set("b", 2);
  assert.equal(c.has("a"), true);
  c.set("c", 3);
  assert.deepEqual(c.keys(), ["b", "c"]);
});

test("regravar atualiza valor e recência", () => {
  const c = new LruCache({ max: 2 });
  c.set("a", 1).set("b", 2).set("a", 10).set("c", 3);
  assert.deepEqual(c.keys(), ["a", "c"]);
  assert.equal(c.get("a"), 10);
});

test("TTL expira com o relógio injetado", () => {
  const now = clock();
  const c = new LruCache({ max: 5, ttlMs: 100, now });
  c.set("a", 1);
  now.advance(99);
  assert.equal(c.get("a"), 1);
  now.advance(1);
  assert.equal(c.has("a"), false);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.size, 0);
});

test("regravar reinicia o TTL", () => {
  const now = clock();
  const c = new LruCache({ max: 5, ttlMs: 100, now });
  c.set("a", 1);
  now.advance(80);
  c.set("a", 2);
  now.advance(80);
  assert.equal(c.get("a"), 2);
});

test("ao passar do limite, expiradas saem antes da LRU", () => {
  const now = clock();
  const c = new LruCache({ max: 2, ttlMs: 100, now });
  c.set("velha", 1);
  now.advance(50);
  c.set("b", 2);
  now.advance(60); // velha expirou (110 >= 100); b ainda vale
  c.set("c", 3);
  assert.deepEqual(c.keys(), ["b", "c"]);
});

test("size e keys ignoram expiradas; delete conta expirada", () => {
  const now = clock();
  const c = new LruCache({ max: 3, ttlMs: 10, now });
  c.set("a", 1);
  now.advance(5);
  c.set("b", 2);
  now.advance(5);
  assert.equal(c.size, 1);
  assert.deepEqual(c.keys(), ["b"]);
  assert.equal(c.delete("a"), true);
  assert.equal(c.delete("a"), false);
});

test("set abaixo do limite não remove expiradas (delete ainda as encontra)", () => {
  const now = clock();
  const c = new LruCache({ max: 3, ttlMs: 10, now });
  c.set("a", 1);
  now.advance(20);
  c.set("b", 2);
  assert.equal(c.delete("a"), true);
});

test("max inválido", () => {
  assert.throws(() => new LruCache({ max: 0 }), RangeError);
});
