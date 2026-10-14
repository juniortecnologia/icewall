import "server-only";
import { desc, eq } from "drizzle-orm";
import { primaryServerId } from "../executor";
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

/** Chave de snapshot por servidor (Etapa 03): `server:{id}:{tipo}`. */
export function serverSnapshotKey(serverId: number, tipo: string): string {
  return `server:${serverId}:${tipo}`;
}

export function getServerSnapshot<T>(serverId: number, tipo: string): Snapshot<T> | null {
  return getSnapshot<T>(serverSnapshotKey(serverId, tipo));
}

/**
 * Leitura compatível (Etapa 03): o snapshot do servidor "principal"
 * (Spark, quando cadastrado — é dele toda a série histórica; senão, o
 * primeiro do registro). Null se o registro estiver vazio.
 */
export function primarySnapshot<T>(tipo: string): Snapshot<T> | null {
  const id = primaryServerId();
  return id === null ? null : getServerSnapshot<T>(id, tipo);
}

/** Grava o estado atual. Com erro, mantém o último dado bom e só registra o erro. */
export function putSnapshot(key: string, data: unknown, error: string | null = null): void {
  const db = getDb();
  if (error) {
    const prev = getSnapshot(key);
    // Sem dado anterior, um objeto vazio (a coluna não aceita NULL): o
    // consumidor faz o guard com `?.` e `?? []`.
    db.insert(schema.snapshots)
      .values({ key, ts: Date.now(), data: prev?.data ?? {}, error })
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

export function addEvent(kind: string, severity: Severity, title: string, detail?: unknown, serverId?: number | null): void {
  getDb()
    .insert(schema.events)
    .values({ ts: Date.now(), kind, severity, title, detail: detail ?? null, serverId: serverId ?? null })
    .run();
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

/**
 * Registra a transição online/offline de uma fonte uma vez só (sem um evento
 * por coleta). `severityDown` cobre estados legítimos "fora do ar" (ex.:
 * serviço intencionalmente inativo), que merecem atenção sem alarde.
 */
export function trackReachability(key: string, ok: boolean, title: string, error?: string, severityDown: Severity = "crit", serverId?: number | null): void {
  const prevOk = getSetting<boolean>(`reach:${key}`, true);
  if (prevOk !== ok) {
    addEvent("reachability", ok ? "info" : severityDown, ok ? `${title} voltou` : `${title} inacessível`, error ? { error } : undefined, serverId);
    putSetting(`reach:${key}`, ok);
  }
}
