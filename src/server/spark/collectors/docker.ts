import "server-only";
import type { ContainerInfo, ContainerStat, DockerImage, DockerSnapshot } from "@/lib/types";
import { getDb, schema } from "../../db/client";
import { addEvent, getServerSnapshot, putSnapshot, serverSnapshotKey } from "../../lib/store";
import { parseDockerJsonLines, parseDockerMem, parsePercent, parseSections } from "../../parsers";
import { execOnServer, type ServerRef } from "../../executor";

const DOCKER_CMD = [
  "echo @@ps@@; docker ps -a --format '{{json .}}'",
  "echo @@stats@@; docker stats --no-stream --format '{{json .}}'",
  "echo @@images@@; docker images --format '{{json .}}'",
].join("; ");

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Coleta os containers de UM servidor do registro, pelo driver dele (Etapa 03). */
export async function collectDocker(server: ServerRef): Promise<void> {
  const key = serverSnapshotKey(server.id, "docker");
  const res = await execOnServer(server.id, DOCKER_CMD, 40_000);
  if (res.code !== 0 || !res.stdout.includes("@@ps@@")) {
    putSnapshot(key, null, res.stderr.trim() || `docker saiu com ${res.code}`);
    return;
  }
  const s = parseSections(res.stdout);
  const containers: ContainerInfo[] = parseDockerJsonLines(s.ps ?? "").map((c) => ({
    id: str(c.ID),
    name: str(c.Names),
    image: str(c.Image),
    state: str(c.State),
    status: str(c.Status),
    ports: str(c.Ports),
    createdAt: str(c.CreatedAt),
    runningFor: str(c.RunningFor),
    gpu: str(c.Labels).includes("com.nvidia.volumes.needed") || str(c.Image).startsWith("nvcr.io/"),
  }));
  const stats: ContainerStat[] = parseDockerJsonLines(s.stats ?? "").map((c) => {
    const mem = parseDockerMem(str(c.MemUsage));
    return {
      name: str(c.Name),
      cpuPct: parsePercent(str(c.CPUPerc)),
      memUsed: mem?.used ?? null,
      memLimit: mem?.limit ?? null,
      netIO: str(c.NetIO),
      blockIO: str(c.BlockIO),
      pids: Number(c.PIDs) || null,
    };
  });
  const images: DockerImage[] = parseDockerJsonLines(s.images ?? "").map((i) => ({
    ref: `${str(i.Repository)}:${str(i.Tag)}`,
    size: str(i.Size),
    createdSince: str(i.CreatedSince),
  }));

  diffContainers(getServerSnapshot<DockerSnapshot>(server.id, "docker")?.data ?? null, containers, server.id);
  putSnapshot(key, { containers, stats, images } satisfies DockerSnapshot);
  const ts = Date.now();
  const rows = stats.map((st) => ({ ts, serverId: server.id, name: st.name, cpuPct: st.cpuPct, memBytes: st.memUsed }));
  if (rows.length) getDb().insert(schema.containerStats).values(rows).run();
}

function diffContainers(prev: DockerSnapshot | null, next: ContainerInfo[], serverId: number): void {
  if (!prev) return;
  const before = new Map(prev.containers.map((c) => [c.name, c.state]));
  for (const c of next) {
    const was = before.get(c.name);
    if (was === undefined) addEvent("container", "info", `Container novo: ${c.name} (${c.image})`, undefined, serverId);
    else if (was !== c.state) {
      const sev = c.state === "running" ? "info" : was === "running" ? "warn" : "info";
      addEvent("container", sev, `${c.name}: ${was} → ${c.state}`, { status: c.status }, serverId);
    }
  }
  const names = new Set(next.map((c) => c.name));
  for (const name of before.keys()) if (!names.has(name)) addEvent("container", "info", `Container removido: ${name}`, undefined, serverId);
}
