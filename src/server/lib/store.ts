import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";

export interface Snapshot<T> {
  ts: number;
  data: T;
  error: string | null;
}

export function getSnapshot<T>(key: string): Snapshot<T> | null {
  const row = getDb().select().from(schema.snapshots).where(eq(schema.snapshots.key, key)).get();
  return row ? { ts: row.ts, data: row.data as T, error: row.error } : null;
}

/** Grava o estado atual. Com erro, mantém o último dado bom e só registra o erro. */
export function putSnapshot(key: string, data: unknown, error: string | null = null): void {
  const db = getDb();
  if (error) {
    const prev = getSnapshot(key);
    db.insert(schema.snapshots)
      .values({ key, ts: Date.now(), data: prev?.data ?? null, error })
      .onConflictDoUpdate({ target: schema.snapshots.key, set: { ts: Date.now(), error } })
      .run();
    return;
  }
  db.insert(schema.snapshots)
    .values({ key, ts: Date.now(), data, error: null })
    .onConflictDoUpdate({ target: schema.snapshots.key, set: { ts: Date.now(), data, error: null } })
    .run();
}

export type Severity = "info" | "warn" | "crit";

export function addEvent(kind: string, severity: Severity, title: string, detail?: unknown): void {
  getDb().insert(schema.events).values({ ts: Date.now(), kind, severity, title, detail: detail ?? null }).run();
}

export function recentEvents(limit = 50) {
  return getDb().select().from(schema.events).orderBy(desc(schema.events.ts)).limit(limit).all();
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row ? (row.value as T) : fallback;
}

export function putSetting(key: string, value: unknown): void {
  getDb()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

/** Registra a transição online/offline de uma fonte uma vez só (sem um evento por coleta). */
export function trackReachability(key: string, ok: boolean, title: string, error?: string): void {
  const prevOk = getSetting<boolean>(`reach:${key}`, true);
  if (prevOk !== ok) {
    addEvent("reachability", ok ? "info" : "crit", ok ? `${title} voltou` : `${title} inacessível`, error ? { error } : undefined);
    putSetting(`reach:${key}`, ok);
  }
}
