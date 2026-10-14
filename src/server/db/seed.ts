import "server-only";
import { eq } from "drizzle-orm";
import os from "node:os";
import path from "node:path";
import type { DB } from "./client";
import { servers } from "./schema";

/**
 * Seed do registro central de servidores — Etapa 01 do plano multi-servidor.
 * Roda em todo boot (idempotente): garante que Station (local) e Spark (SSH)
 * existam a partir do primeiro boot. Uma linha já cadastrada com o mesmo
 * nome é preservada como está (não é duplicada nem sobrescrita).
 */

export interface ServerSeed {
  nome: string;
  tipo: "local" | "ssh";
  host: string;
  porta: number | null;
  usuario: string | null;
  chaveSshPath: string | null;
  vllmUrl: string | null;
  vllmKey: string | null;
  capacidades: Record<string, boolean> | null;
  ultimoStatus: string | null;
  ultimoCheck: number | null;
}

export const SEED_SERVERS: ServerSeed[] = [
  {
    nome: "Station",
    tipo: "local",
    host: "localhost",
    porta: null,
    usuario: null,
    chaveSshPath: null,
    vllmUrl: null,
    vllmKey: null,
    capacidades: { local: true },
    ultimoStatus: null,
    ultimoCheck: null,
  },
  {
    nome: "Spark",
    tipo: "ssh",
    host: "10.0.5.18",
    porta: 22,
    usuario: "facini",
    // Chave verificada nesta estação (BatchMode) em 2026-10-14.
    chaveSshPath: path.join(os.homedir(), ".ssh", "id_ed25519_faciniltda"),
    vllmUrl: "http://10.0.5.18:8001",
    vllmKey: null,
    capacidades: { ssh: true, vllm: true },
    ultimoStatus: null,
    ultimoCheck: null,
  },
];

export function ensureServerSeed(db: DB): void {
  const now = Date.now();
  for (const seed of SEED_SERVERS) {
    const exists = db.select({ id: servers.id }).from(servers).where(eq(servers.nome, seed.nome)).limit(1).get();
    if (!exists) {
      db.insert(servers)
        .values({ ...seed, criadoEm: now, atualizadoEm: now })
        .run();
    }
  }
}
