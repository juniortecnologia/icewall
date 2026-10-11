import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { CLAUDE_PROJECTS } from "../lib/paths";
import { readNewLines } from "./jsonl";


const usageSchema = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().nullish(),
  cache_creation_input_tokens: z.number().nullish(),
  output_tokens_details: z.object({ thinking_tokens: z.number().nullish() }).nullish(),
});

const lineSchema = z.object({
  type: z.literal("assistant"),
  timestamp: z.string(),
  sessionId: z.string().nullish(),
  cwd: z.string().nullish(),
  isSidechain: z.boolean().nullish(),
  message: z.object({ id: z.string(), model: z.string().nullish(), usage: usageSchema }),
});

async function listJsonl(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listJsonl(full)));
    else if (e.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

/**
 * Lê o `message.usage` das respostas do Claude nos transcripts do Claude Code.
 * O transcript repete o mesmo usage em uma linha por bloco de conteúdo: dedup pelo id da mensagem.
 */
export async function ingestClaudeUsage(): Promise<number> {
  const db = getDb();
  let total = 0;
  for (const file of await listJsonl(CLAUDE_PROJECTS)) {
    const rows: (typeof schema.claudeUsage.$inferInsert)[] = [];
    await readNewLines(file, (line) => {
      if (!line.includes('"usage"') || !line.includes('"assistant"')) return;
      let parsed;
      try {
        parsed = lineSchema.safeParse(JSON.parse(line));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const d = parsed.data;
      const model = d.message.model ?? null;
      if (model === "<synthetic>") return;
      const u = d.message.usage;
      rows.push({
        messageId: d.message.id,
        ts: Date.parse(d.timestamp),
        sessionId: d.sessionId ?? null,
        project: d.cwd ? path.basename(d.cwd) : null,
        model,
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheCreation: u.cache_creation_input_tokens ?? 0,
        thinkingTokens: u.output_tokens_details?.thinking_tokens ?? 0,
        sidechain: d.isSidechain ?? false,
      });
    });
    if (!rows.length) continue;
    // Última versão vence: o usage final de uma mensagem em streaming chega na última linha.
    db.transaction((tx) => {
      for (const r of rows) {
        tx.insert(schema.claudeUsage)
          .values(r)
          .onConflictDoUpdate({
            target: schema.claudeUsage.messageId,
            set: { outputTokens: r.outputTokens, thinkingTokens: r.thinkingTokens, inputTokens: r.inputTokens },
          })
          .run();
      }
    });
    total += rows.length;
  }
  return total;
}
