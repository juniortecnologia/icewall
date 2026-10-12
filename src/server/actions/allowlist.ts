import "server-only";
import type { DockerSnapshot, OllamaSnapshot } from "@/lib/types";
import { setKeepAlive, setTierModel } from "../bench/models-json";
import { getDb, schema } from "../db/client";
import { addEvent, getSnapshot } from "../lib/store";
import { collectDocker } from "../spark/collectors/docker";
import { collectOllama, ollamaFetch } from "../spark/collectors/ollama";
import { shellArg, sparkExec } from "../spark/ssh";
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

interface ActionDef {
  label: string;
  /** Altera o Spark ou a configuração: a interface pede confirmação. */
  mutating: boolean;
  run(target: string, arg?: string): Promise<string>;
}

function requireContainer(name: string): string {
  const known = getSnapshot<DockerSnapshot>("docker")?.data?.containers.map((c) => c.name) ?? [];
  if (!known.includes(name)) throw new Error(`container desconhecido: ${name}`);
  return shellArg(name);
}

function requireModel(name: string): string {
  const known = getSnapshot<OllamaSnapshot>("ollama")?.data?.models.map((m) => m.name) ?? [];
  if (!known.includes(name)) throw new Error(`modelo não instalado: ${name}`);
  return name;
}

async function docker(cmd: string, timeoutMs = 60_000): Promise<string> {
  const res = await sparkExec(cmd, timeoutMs);
  if (res.code !== 0) throw new Error(res.stderr.trim() || `saiu com ${res.code}`);
  return res.stdout.trim();
}

const json = { "content-type": "application/json" };

export const ACTIONS: Record<ActionId, ActionDef> = {
  "container.start": {
    label: "Iniciar container",
    mutating: true,
    run: async (t) => {
      const out = await docker(`docker start ${requireContainer(t)}`);
      await collectDocker();
      return out;
    },
  },
  "container.stop": {
    label: "Parar container",
    mutating: true,
    run: async (t) => {
      const out = await docker(`docker stop ${requireContainer(t)}`);
      await collectDocker();
      return out;
    },
  },
  "container.restart": {
    label: "Reiniciar container",
    mutating: true,
    run: async (t) => {
      const out = await docker(`docker restart ${requireContainer(t)}`, 120_000);
      await collectDocker();
      return out;
    },
  },
  "container.logs": {
    label: "Últimas linhas de log",
    mutating: false,
    run: (t) => docker(`docker logs --tail 200 ${requireContainer(t)} 2>&1`),
  },
  "model.load": {
    label: "Carregar modelo (30 min)",
    mutating: true,
    run: async (t) => {
      await ollamaFetch("/api/generate", { method: "POST", headers: json, body: JSON.stringify({ model: requireModel(t), keep_alive: "30m" }) }, 300_000);
      await collectOllama();
      return `${t} carregado`;
    },
  },
  "model.unload": {
    label: "Descarregar modelo",
    mutating: true,
    run: async (t) => {
      await ollamaFetch("/api/generate", { method: "POST", headers: json, body: JSON.stringify({ model: requireModel(t), keep_alive: 0 }) });
      await collectOllama();
      return `${t} descarregado`;
    },
  },
  "model.pull": {
    label: "Baixar/atualizar modelo",
    mutating: true,
    run: async (t) => {
      shellArg(t); // mesmo formato de nome aceito em qualquer outro lugar
      const source = getModelSources()[t];
      if (source) {
        const wasLoaded = getSnapshot<OllamaSnapshot>("ollama")?.data?.loaded.some((model) => model.name === t) ?? false;
        const current = (await ollamaFetch("/api/show", {
          method: "POST",
          headers: json,
          body: JSON.stringify({ model: requireModel(t) }),
        })) as { modelfile?: string };
        if (typeof current.modelfile !== "string") throw new Error(`O Ollama não retornou o Modelfile de ${t}`);
        const updatedModelfile = modelfileFromSource(current.modelfile, source);
        await ollamaFetch("/api/pull", { method: "POST", headers: json, body: JSON.stringify({ model: source, stream: false }) }, 3_600_000);
        const created = (await ollamaFetch(
          "/api/create",
          {
            method: "POST",
            headers: json,
            body: JSON.stringify({ model: t, modelfile: updatedModelfile, stream: false }),
          },
          3_600_000,
        )) as { status?: string };
        if (wasLoaded) {
          try {
            await ollamaFetch(
              "/api/generate",
              { method: "POST", headers: json, body: JSON.stringify({ model: t, keep_alive: 0 }) },
              300_000,
            );
            await ollamaFetch(
              "/api/generate",
              { method: "POST", headers: json, body: JSON.stringify({ model: t, keep_alive: "30m" }) },
              300_000,
            );
          } catch (err) {
            await collectOllama();
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`${t} foi recriado, mas não foi possível reiniciá-lo com a nova versão: ${message}`);
          }
        }
        await collectOllama();
        return `${t} recriado a partir de ${source}${wasLoaded ? " e carregado novamente" : ""}: ${created.status ?? "ok"}`;
      }
      let res: { status?: string };
      try {
        res = (await ollamaFetch(
          "/api/pull",
          { method: "POST", headers: json, body: JSON.stringify({ model: t, stream: false }) },
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
      await collectOllama();
      return res.status ?? "ok";
    },
  },
  "model.source.set": {
    label: "Configurar origem do modelo",
    mutating: true,
    run: async (t, source) => {
      requireModel(t);
      setModelSource(t, source?.trim() || undefined);
      return source?.trim() ? `origem de ${t}: ${source.trim()}` : `origem de ${t} removida`;
    },
  },
  "model.delete": {
    label: "Remover modelo",
    mutating: true,
    run: async (t) => {
      const res = await fetch(`${process.env.OLLAMA_URL ?? "http://10.0.5.18:11434"}/api/delete`, { method: "DELETE", headers: json, body: JSON.stringify({ model: requireModel(t) }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await collectOllama();
      return `${t} removido`;
    },
  },
  "tier.set": {
    label: "Trocar modelo do nível (models.json)",
    mutating: true,
    run: async (tier, model) => {
      if (!model) throw new Error("falta o modelo");
      const diff = setTierModel(tier, requireModel(model), false);
      return `${diff.before}\n→ ${diff.after}`;
    },
  },
  "keepalive.set": {
    label: "Ajustar keep_alive (models.json)",
    mutating: true,
    run: async (keepAlive) => {
      if (!keepAlive) throw new Error("falta o tempo de keep_alive");
      const diff = setKeepAlive(keepAlive);
      return `${diff.before} → ${diff.after}`;
    },
  },
};

export function isActionId(id: string): id is ActionId {
  return id in ACTIONS;
}

/** Executa e registra em action_log (ações de leitura como logs não poluem o registro). */
export async function runAction(id: ActionId, target: string, arg?: string): Promise<{ ok: boolean; output: string }> {
  const def = ACTIONS[id];
  const started = Date.now();
  let ok = true;
  let output: string;
  try {
    output = await def.run(target, arg);
  } catch (err) {
    ok = false;
    output = err instanceof Error ? err.message : String(err);
  }
  if (def.mutating) {
    getDb()
      .insert(schema.actionLog)
      .values({ ts: Date.now(), action: id, target: arg ? `${target} → ${arg}` : target, status: ok ? "ok" : "error", output: output.slice(-4000), durationMs: Date.now() - started })
      .run();
    addEvent("action", ok ? "info" : "warn", `${def.label}: ${target}${arg ? ` → ${arg}` : ""}${ok ? "" : " (falhou)"}`);
  }
  return { ok, output };
}
