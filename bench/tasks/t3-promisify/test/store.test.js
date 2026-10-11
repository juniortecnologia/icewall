import { test } from "node:test";
import assert from "node:assert/strict";
import { createLegacyStore, getMany, promisifyStore, withRetry } from "../src/index.js";

test("set/get/del/keys viram promises", async () => {
  const s = promisifyStore(createLegacyStore());
  assert.equal(await s.set("user:1", { n: 1 }), true);
  await s.set("user:2", { n: 2 });
  await s.set("team:1", "x");
  assert.deepEqual(await s.get("user:1"), { n: 1 });
  assert.equal(await s.get("nada"), undefined);
  assert.deepEqual(await s.keys("user:"), ["user:1", "user:2"]);
  assert.equal(await s.del("user:1"), true);
  assert.equal(await s.del("user:1"), false);
});

test("erro do callback vira rejeição", async () => {
  const s = promisifyStore(createLegacyStore());
  await assert.rejects(s.set("", 1), { message: "BAD_KEY" });
});

test("getMany busca em sequência e omite ausentes", async () => {
  const legacy = createLegacyStore();
  const s = promisifyStore(legacy);
  await s.set("a", 1);
  await s.set("c", 3);
  let inFlight = 0;
  let maxInFlight = 0;
  const spy = {
    get: async (k) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const v = await s.get(k);
      inFlight--;
      return v;
    },
  };
  assert.deepEqual(await getMany(spy, ["a", "b", "c"]), { a: 1, c: 3 });
  assert.equal(maxInFlight, 1);
});

test("withRetry repete erros transitórios", async () => {
  const s = promisifyStore(createLegacyStore({ failEvery: 2 }));
  await s.set("k", "v"); // chamada 1 ok
  // chamada 2 falha (TRANSIENT), chamada 3 ok
  assert.equal(await withRetry(() => s.get("k")), "v");
});

test("withRetry desiste após attempts e devolve o último erro", async () => {
  let n = 0;
  await assert.rejects(
    withRetry(async () => {
      n++;
      throw new Error("TRANSIENT");
    }, { attempts: 4 }),
    { message: "TRANSIENT" },
  );
  assert.equal(n, 4);
});

test("withRetry não repete erro que não é retentável", async () => {
  let n = 0;
  await assert.rejects(
    withRetry(async () => {
      n++;
      throw new Error("FATAL");
    }),
    { message: "FATAL" },
  );
  assert.equal(n, 1);
});

test("retryOn customizado", async () => {
  let n = 0;
  const v = await withRetry(
    async () => {
      if (++n < 3) throw new Error("BUSY");
      return "ok";
    },
    { retryOn: (e) => e.message === "BUSY" },
  );
  assert.equal(v, "ok");
});
