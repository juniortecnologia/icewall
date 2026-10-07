import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("abre um SQLite em memória", () => {
  const db = new Database(":memory:");
  expect(db.prepare("SELECT 1 AS um").get()).toEqual({ um: 1 });
});
