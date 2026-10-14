import "server-only";
import { eq } from "drizzle-orm";
import type { OllamaSnapshot } from "@/lib/types";
import type { ExecResult } from "@/lib/servers/server-driver";
import { setKeepAlive, setTierModel } from "../bench/models-json";
import { getDb, schema } from "../db/client";
import { servers } from "../db/schema";
import { execOnServer, primaryServer, primaryServerId, type ServerRef } from "../executor";
import { addEvent, getServerSnapshot } from "../lib/store";
import { collectDocker } from "../spark/collectors/docker";
import { collectOllama, ollamaBaseUrl, ollamaFetchOn } from "../spark/collectors/ollama";
import { shellArg } from "../spark/ssh";
import { modelfileFromSource } from "../models/modelfile";
import { getModelSources, setModelSource } from "../models/sources";

export type ActionId =
  | "container.start"
  | "container.stop"
  | "container.restart"
  | "container.logs"
  | "model.load"
  | "model.unload"
  | "model.pull"
  | "model.source.set"
  | "model.delete"
  | "tier.set"
  | "keepalive.set";

type Exec = (serverId: number, cmd: string, timeoutMs?: number) => Promise<ExecResult>;

interface ActionDef {
  label: string;
  /** Altera um servidor ou a configuração: a interface pede confirmação. */
  mutating: boolean;
  /** `server` é o servidor do registro que a ação recebe como alvo (Etapa 04). */
  run(server: ServerRef, target: string, arg: string | undefined, exec: Exec): Promise<string>;
}

/** Resolve o servidor alvo da ação: o `serverId` explícito ou o servidor principal. */
export function resolveServer(serverId?: number | null): ServerRef {
  if (serverId !== undefined && serverId !== null) {
    const row = getDb().select().from(servers).where(eq(servers.id, serverId)).limit(1).get();
    if (!row) throw new Error(`servidor inexistente no registro: id ${serverId} (cadastre em /servers)`);
    return row;
  }
  const primary = primaryServer();
  if (!primary) throw new Error("nenhum servidor cadastrado no registro — cadastre em /servers");
  return primary;
}

/** Erros do executor (code -1) já vêm com mensagem clara: repassamos sem embrulho. */
function execError(server: ServerRef, res: ExecResult): Error {
  if (res.code === -1) return new Error(res.stderr.trim());
  const detail = res.stderr.trim() || `saiu com ${res.code}`;
  return new Error(`${detail} (servidor ${server.nome})`);
}

async function dockerOn(server: ServerRef, cmd: string, exec: Exec, timeoutMs = 60_000): Promise<string> {
  const res = await exec(server.id, cmd, timeoutMs);
  if (res.code !== 0) throw execError(server, res);
  return res.stdout.trim();
}

/**
 * Etapa 08 (item 8 do plano): o container é verificado NA HORA pelo driver do
 * servidor — nunca contra o snapshot "quente". Erros claros em vez de lista
 * vazia: "container não encontrado no servidor X", "docker indisponível no
 * servidor Y", ou a mensagem do executor se o servidor estiver indisponível.
 */
export async function verifyContainer(server: ServerRef, name: string, exec: Exec = execOnServer): Promise<string> {
  const safe = shellArg(name); // recusa qualquer coisa que não seja um nome simples
  const res = await exec(server.id, `docker inspect --type container --format ok ${safe}`, 20_000);
  if (res.code === 0) return safe;
  const detail = res.stderr.trim();
  if (res.code === -1) throw new Error(detail); // servidor fora do registro/indisponível: mensagem já é clara
  if (/no such (object|container)/i.test(detail)) {
    throw new Error(`container não encontrado no servidor ${server.nome}: ${name}`);
  }
  throw new Error(`docker indisponível no servidor ${server.nome}${detail ? `: ${detail}` : ""}`);
}

function requireModel(server: ServerRef, name: string): string {
  const snap = getServerSnapshot<OllamaSnapshot>(server.id, "ollama");
  if (snap?.error) throw new Error(`Ollama do servidor ${server.nome} indisponível: ${snap.error}`);
  if (snap?.data?.status === "offline") {
    throw new Error(`Ollama offline no servidor ${server.nome} (${snap.data.reason ?? "serviço inativo"})`);
  }
  const known = snap?.data?.models.map((m) => m.name) ?? [];
  if (!known.includes(name)) throw new Error(`modelo não instalado no servidor ${server.nome}: ${name}`);
  return name;
}

/** Relê o snapshot daquele servidor depois de uma ação (não só o principal). */
async function refreshServer(server: ServerRef, kind: "docker" | "ollama", exec: Exec = execOnServer): Promise<void> {
  if (kind === "docker") await collectDocker(server);
  else await collectOllama(server, exec);
}

const jsonHeaders = { "content-type": "application/json" };

export const ACTIONS: Record<ActionId, ActionDef> = {
  "container.start": {
    label: "Iniciar container",
    mutating: true,
    run: async (server, t, _arg, exec) => {
      const out = await dockerOn(server, `docker start ${await verifyContainer(server, t, exec)}`, exec);
      await refreshServer(server, "docker");
      return out;
    },
  },
  "container.stop": {
    label: "Parar container",
    mutating: true,
    run: async (server, t, _arg, exec) => {
      const out = await dockerOn(server, `docker stop ${await verifyContainer(server, t, exec)}`, exec);
      await refreshServer(server, "docker");
      return out;
    },
  },
  "container.restart": {
    label: "Reiniciar container",
    mutating: true,
    run: async (server, t, _arg, exec) => {
      const out = await dockerOn(server, `docker restart ${await verifyContainer(server, t, exec)}`, exec, 120_000);
      await refreshServer(server, "docker");
      return out;
    },
  },
  "container.logs": {
    label: "Últimas linhas de log",
    mutating: false,
    run: async (server, t, _arg, exec) => dockerOn(server, `docker logs --tail 200 ${await verifyContainer(server, t, exec)} 2>&1`, exec),
  },
  "model.load": {
    label: "Carregar modelo (30 min)",
    mutating: true,
    run: async (server, t, _arg, exec) => {
      await ollamaFetchOn(server, "/api/generate", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ model: requireModel(server, t), keep_alive: "30m" }) }, 300_000);
      await refreshServer(server, "ollama", exec);
      return `${t} carregado`;
    },
  },
  "model.unload": {
    label: "Descarregar modelo",
    mutating: true,
    run: async (server, t, _arg, exec) => {
      await ollamaFetchOn(server, "/api/generate", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ model: requireModel(server, t), keep_alive: 0 }) });
      await refreshServer(server, "ollama", exec);
      return `${t} descarregado`;
    },
  },
  "model.pull": {
    label: "Baixar/atualizar modelo",
    mutating: true,
    run: async (server, t, _arg, exec) => {
      shellArg(t); // mesmo formato de nome aceito em qualquer outro lugar
      const source = getModelSources()[t];
      if (source) {
        const wasLoaded = getServerSnapshot<OllamaSnapshot>(server.id, "ollama")?.data?.loaded.some((model) => model.name === t) ?? false;
        const current = (await ollamaFetchOn(server, "/api/show", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ model: requireModel(server, t) }),
        })) as { modelfile?: string };
        if (typeof current.modelfile !== "string") throw new Error(`O Ollama não retornou o Modelfile de ${t}`);
        const updatedModelfile = modelfileFromSource(current.modelfile, source);
        await ollamaFetchOn(server, "/api/pull", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ model: source, stream: false }) }, 3_600_000);
        const created = (await ollamaFetchOn(
          server,
          "/api/create",
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ model: t, modelfile: updatedModelfile, stream: false }),
          },
          3_600_000,
        )) as { status?: string };
        if (wasLoaded) {
          try {
            await ollamaFetchOn(
              server,
              "/api/generate",
              { method: "POST", headers: jsonHeaders, body: JSON.stringify({ model: t, keep_alive: 0 }) },
              300_000,
            );
            await ollamaFetchOn(
              server,
              "/api/generate",
              { method: "POST", headers: jsonHeaders, body: JSON.stringify({ model: t, keep_alive: "30m" }) },
              300_000,
            );
          } catch (err) {
            await refreshServer(server, "ollama", exec);
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`${t} foi recriado, mas não foi possível reiniciá-lo com a nova versão: ${message}`);
          }
        }
        await refreshServer(server, "ollama", exec);
        return `${t} recriado a partir de ${source}${wasLoaded ? " e carregado novamente" : ""}: ${created.status ?? "ok"}`;
      }
      let res: { status?: string };
      try {
        res = (await ollamaFetchOn(
          server,
          "/api/pull",
          { method: "POST", headers: jsonHeaders, body: JSON.stringify({ model: t, stream: false }) },
          3_600_000,
        )) as { status?: string };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/pull model manifest.*file does not exist|manifest.*not found/i.test(message)) {
          throw new Error(
            `O registro configurado do Ollama não encontrou a tag "${t}". Esse modelo pode ser uma variante local; para atualizá-la, é necessário recriá-la a partir do nome e da tag publicados do modelo de origem.`,
          );
        }
        throw err;
      }
      await refreshServer(server, "ollama", exec);
      return res.status ?? "ok";
    },
  },
  "model.source.set": {
    label: "Configurar origem do modelo",
    mutating: true,
    run: async (server, t, source) => {
      requireModel(server, t);
      setModelSource(t, source?.trim() || undefined);
      return source?.trim() ? `origem de ${t}: ${source.trim()}` : `origem de ${t} removida`;
    },
  },
  "model.delete": {
    label: "Remover modelo",
    mutating: true,
    run: async (server, t) => {
      // A base URL vem do registro (ollamaBaseUrl), nunca de IP fixo ou env.
      const res = await fetch(`${ollamaBaseUrl(server)}/api/delete`, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ model: requireModel(server, t) }) });
      if (!res.ok) throw new Error(`HTTP ${res.status} (servidor ${server.nome})`);
      await collectOllama(server);
      return `${t} removido`;
    },
  },
  "tier.set": {
    label: "Trocar modelo do nível (models.json)",
    mutating: true,
    run: async (server, tier, model) => {
      if (!model) throw new Error("falta o modelo");
      const diff = setTierModel(tier, requireModel(server, model), false);
      return `${diff.before}\n→ ${diff.after}`;
    },
  },
  "keepalive.set": {
    label: "Ajustar keep_alive (models.json)",
    mutating: true,
    run: async (server, keepAlive) => {
      if (!keepAlive) throw new Error("falta o tempo de keep_alive");
      const diff = setKeepAlive(keepAlive);
      return `${diff.before} → ${diff.after}`;
    },
  },
};

export function isActionId(id: string): id is ActionId {
  return id in ACTIONS;
}

export interface RunActionOptions {
  arg?: string;
  /** Id do servidor do registro (Etapa 04); sem ele, o servidor principal. */
  serverId?: number | null;
  /** Injetado apenas em testes (mesmo padrão dos coletores). */
  exec?: Exec;
}

/** Executa e registra em action_log (ações de leitura como logs não poluem o registro). */
export async function runAction(id: ActionId, target: string, opts: RunActionOptions = {}): Promise<{ ok: boolean; output: string }> {
  const def = ACTIONS[id];
  const started = Date.now();
  let ok = true;
  let output: string;
  let server: ServerRef | null = null;
  try {
    server = resolveServer(opts.serverId);
    output = await def.run(server, target, opts.arg, opts.exec ?? execOnServer);
  } catch (err) {
    ok = false;
    output = err instanceof Error ? err.message : String(err);
  }
  if (def.mutating) {
    const serverId = server?.id ?? primaryServerId();
    getDb()
      .insert(schema.actionLog)
      .values({ ts: Date.now(), action: id, target: opts.arg ? `${target} → ${opts.arg}` : target, status: ok ? "ok" : "error", output: output.slice(-4000), durationMs: Date.now() - started, serverId })
      .run();
    const onde = server ? `${def.label} (${server.nome})` : def.label;
    addEvent("action", ok ? "info" : "warn", `${onde}: ${target}${opts.arg ? ` → ${opts.arg}` : ""}${ok ? "" : " (falhou)"}`, undefined, serverId);
  }
  return { ok, output };
}
