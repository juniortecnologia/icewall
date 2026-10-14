import "server-only";
import { z } from "zod";
import type { VllmModel, VllmSnapshot } from "@/lib/types";
import type { ExecResult } from "@/lib/servers/server-driver";
import { addEvent, getServerSnapshot, putSnapshot, serverSnapshotKey, trackReachability } from "../lib/store";
import { execOnServer, type ServerRef } from "../executor";

/**
 * Coletor vLLM (Etapa 03): primeiro coletor da pilha de serving por servidor.
 * vLLM é uma CAPACIDADE OPCIONAL por servidor, como o Ollama: a URL e a
 * chave vêm SEMPRE da linha do registro `servers` (nunca de env), e o
 * servidor pode simplesmente não ter vLLM cadastrado (sem snapshot).
 *
 * Endpoints: `GET /health` (sem chave), `GET /v1/models` e `GET /metrics`
 * (Prometheus, com `Authorization: Bearer <chave do registro>`).
 * 401/403 em /v1/models é um estado documentado ("auth"), nem erro nem
 * lista vazia — ex.: a borda que confere a chave ainda não foi aplicada.
 */

const modelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      object: z.string().nullish(),
      created: z.number().nullish(),
      owned_by: z.string().nullish(),
    }),
  ),
});

/** Modelos de imagem (Z-Image, Qwen-Image) — detectados pelo nome. */
export function isImageModel(id: string): boolean {
  return /(^|[^a-z0-9])z[-_]?image|qwen[-_/]image/i.test(id);
}

const METRIC_LINE = /^(vllm:[a-z0-9_]+)(\{[^}]*\})? (-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)$/;

/** Extrai as métricas `vllm:*` do texto Prometheus (sem buckets de histograma). */
export function parseMetrics(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const m = METRIC_LINE.exec(line);
    if (!m || m[1].endsWith("_bucket")) continue;
    out[`${m[1]}${m[2] ?? ""}`] = Number(m[3]);
  }
  return out;
}

/** Sonda, pelo driver do servidor, se a porta do vLLM está escutando. */
export function vllmProbeCmd(port: number): string {
  return `echo @@port@@; (ss -tlnH 2>/dev/null || netstat -tln 2>/dev/null) | grep -qE ':${port}([[:space:]]|$)' && echo LISTEN || echo NONE`;
}

function portOf(base: string): number | null {
  try {
    const u = new URL(base);
    return u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

async function fetchText(url: string, headers: Record<string, string> | undefined, timeoutMs: number): Promise<Response> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  return res;
}

type Exec = (serverId: number, cmd: string, timeoutMs?: number) => Promise<ExecResult>;

/** Coleta o estado do vLLM em UM servidor do registro (Etapa 03). */
export async function collectVllm(server: ServerRef, exec: Exec = execOnServer): Promise<void> {
  const rawUrl = server.vllmUrl?.trim();
  if (!rawUrl) return; // vLLM não é capacidade deste servidor: nada a coletar
  const base = rawUrl.replace(/\/+$/, "");
  const key = serverSnapshotKey(server.id, "vllm");
  const port = portOf(base);
  if (port === null) {
    putSnapshot(key, null, `URL inválida no registro: ${rawUrl}`);
    return;
  }

  // Primeiro, o estado do serviço — pelo driver do servidor, para distinguir
  // "serviço inativo" (legítimo) de "servidor inacessível" (erro).
  const probe = await exec(server.id, vllmProbeCmd(port), 15_000);
  if (probe.code !== 0 || !probe.stdout.includes("@@port@@")) {
    const msg = probe.stderr.trim() || `sonda saiu com ${probe.code}`;
    putSnapshot(key, null, msg);
    trackReachability(`vllm:${server.id}`, false, `vLLM de ${server.nome}`, msg, "warn", server.id);
    return;
  }
  if (probe.stdout.includes("NONE")) {
    putSnapshot(key, { status: "offline", url: base, models: [], metrics: {}, reason: "serviço inativo" } satisfies VllmSnapshot);
    trackReachability(`vllm:${server.id}`, false, `vLLM de ${server.nome}`, "serviço inativo", "warn", server.id);
    return;
  }

  const headers = server.vllmKey ? { authorization: `Bearer ${server.vllmKey}` } : undefined;
  try {
    const health = await fetchText(`${base}/health`, undefined, 8_000);
    if (!health.ok) throw new Error(`GET /health: HTTP ${health.status}`);

    const modelsRes = await fetchText(`${base}/v1/models`, headers, 10_000);
    if (modelsRes.status === 401 || modelsRes.status === 403) {
      const reason = !server.vllmKey
        ? "sem chave cadastrada no registro (HTTP 401)"
        : modelsRes.status === 401
          ? "chave do registro ainda rejeitada (HTTP 401) — aguardando borda"
          : `acesso negado (HTTP ${modelsRes.status})`;
      putSnapshot(key, { status: "auth", url: base, models: [], metrics: {}, reason } satisfies VllmSnapshot);
      // O serviço está no ar; a autenticação pendente é estado de configuração, não de alcance.
      trackReachability(`vllm:${server.id}`, true, `vLLM de ${server.nome}`, undefined, "crit", server.id);
      return;
    }
    if (!modelsRes.ok) {
      const body = (await modelsRes.text().catch(() => "")).slice(0, 200);
      throw new Error(`GET /v1/models: HTTP ${modelsRes.status} ${body}`.trim());
    }

    const listed = modelsSchema.parse(await modelsRes.json()).data;
    const models: VllmModel[] = listed
      .map((m) => ({ id: m.id, object: m.object ?? "model", created: m.created ?? null, ownedBy: m.owned_by ?? null, isImage: isImageModel(m.id) }))
      .sort((a, b) => a.id.localeCompare(b.id));

    // Métricas são opcionais: o essencial é o /health e a lista de modelos.
    let metrics: Record<string, number> = {};
    try {
      const metricsRes = await fetchText(`${base}/metrics`, headers, 10_000);
      if (metricsRes.ok) metrics = parseMetrics(await metricsRes.text());
    } catch {
      // sem métricas: o snapshot segue online com métricas vazias
    }

    const snap: VllmSnapshot = { status: "online", url: base, models, metrics };
    const prev = getServerSnapshot<VllmSnapshot>(server.id, "vllm")?.data ?? null;
    if (prev && prev.status === "online") diffModels(prev, snap, server.id);
    putSnapshot(key, snap);
    trackReachability(`vllm:${server.id}`, true, `vLLM de ${server.nome}`, undefined, "crit", server.id);
  } catch (err) {
    putSnapshot(key, null, String(err));
    trackReachability(`vllm:${server.id}`, false, `vLLM de ${server.nome}`, String(err), "crit", server.id);
  }
}

function diffModels(prev: VllmSnapshot, next: VllmSnapshot, serverId: number): void {
  const before = new Set(prev.models.map((m) => m.id));
  const after = new Set(next.models.map((m) => m.id));
  for (const m of next.models) {
    if (!before.has(m.id)) addEvent("model", "info", `Modelo vLLM disponível: ${m.id}${m.isImage ? " (imagem)" : ""}`, undefined, serverId);
  }
  for (const m of prev.models) {
    if (!after.has(m.id)) addEvent("model", "warn", `Modelo vLLM removido: ${m.id}`, undefined, serverId);
  }
}
