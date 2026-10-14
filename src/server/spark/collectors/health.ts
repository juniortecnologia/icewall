import "server-only";
import type { ComputeApp, HealthSnapshot } from "@/lib/types";
import { getDb, schema } from "../../db/client";
import { putSnapshot, serverSnapshotKey, trackReachability } from "../../lib/store";
import { parseComputeApps, parseDf, parseLoadavg, parseMeminfo, parseNvidiaGpu, parseSections } from "../../parsers";
import { execOnServer, type ServerRef } from "../../executor";

const HEALTH_CMD = [
  "echo @@gpu@@; nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,power.draw,clocks.sm --format=csv,noheader,nounits",
  "echo @@apps@@; nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits",
  "echo @@mem@@; cat /proc/meminfo",
  "echo @@load@@; cat /proc/loadavg",
  "echo @@cpus@@; nproc",
  "echo @@df@@; df -B1 --output=size,used,target /",
].join("; ");

export const isOllamaProcess = (name: string) => /ollama|llama-server|llama_server/i.test(name);

export function ollamaGpuBytes(apps: ComputeApp[]): number {
  return apps.filter((a) => isOllamaProcess(a.name)).reduce((sum, a) => sum + (a.usedMiB ?? 0) * 1048576, 0);
}

/** Coleta a saúde de UM servidor do registro, pelo driver dele (Etapa 03). */
export async function collectHealth(server: ServerRef): Promise<void> {
  const key = serverSnapshotKey(server.id, "health");
  const res = await execOnServer(server.id, HEALTH_CMD);
  const ok = res.code === 0 && res.stdout.includes("@@mem@@");
  trackReachability(`server:${server.id}`, ok, server.nome, res.stderr.trim(), "crit", server.id);
  if (!ok) {
    putSnapshot(key, null, res.stderr.trim() || `saída ${res.code}`);
    return;
  }
  const s = parseSections(res.stdout);
  const mem = parseMeminfo(s.mem ?? "");
  const load = parseLoadavg(s.load ?? "0 0 0");
  const disk = parseDf(s.df ?? "");
  const apps = parseComputeApps(s.apps ?? "");
  // O /api/ps subestima alguns modelos (o gemma4 reporta só o modelo de rascunho): a memória real vem do nvidia-smi.
  const ollamaVram = ollamaGpuBytes(apps);

  const snap: HealthSnapshot = {
    gpu: parseNvidiaGpu(s.gpu ?? ""),
    apps,
    ...mem,
    ...load,
    cpuCount: Number(s.cpus) || 0,
    diskTotal: disk?.total ?? null,
    diskUsed: disk?.used ?? null,
    ollamaVram,
  };
  putSnapshot(key, snap);
  getDb()
    .insert(schema.metrics)
    .values({
      ts: Date.now(),
      serverId: server.id,
      gpuUtil: snap.gpu?.util,
      gpuTemp: snap.gpu?.temp,
      gpuPower: snap.gpu?.power,
      gpuClock: snap.gpu?.clock,
      gpuProcMem: apps.reduce((sum, a) => sum + (a.usedMiB ?? 0), 0),
      memTotal: mem.memTotal,
      memAvailable: mem.memAvailable,
      swapTotal: mem.swapTotal,
      swapFree: mem.swapFree,
      load1: load.load1,
      load5: load.load5,
      load15: load.load15,
      cpuCount: snap.cpuCount,
      diskTotal: snap.diskTotal,
      diskUsed: snap.diskUsed,
      ollamaVram,
    })
    .run();
}
