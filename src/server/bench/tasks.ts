import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const TASKS_DIR = path.join(process.cwd(), "bench", "tasks");

const metaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  context: z.array(z.string()),
  test: z.string(),
  singleFile: z.string().optional(),
});

export type TaskMeta = z.infer<typeof metaSchema>;

export const PERF_SIZES = { "perf:1k": 1000, "perf:8k": 8000, "perf:32k": 32000 } as const;

export function listTasks(): TaskMeta[] {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs
    .readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(TASKS_DIR, d.name, "meta.json")))
    .map((d) => metaSchema.parse(JSON.parse(fs.readFileSync(path.join(TASKS_DIR, d.name, "meta.json"), "utf8"))))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Copia a tarefa para uma pasta de trabalho, sem a solução de referência. */
export function stageTask(task: TaskMeta, dest: string): void {
  const src = path.join(TASKS_DIR, task.id);
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => !path.relative(src, p).startsWith("solution"),
  });
}
