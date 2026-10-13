import { randomUUID } from "node:crypto";
import { z } from "zod";
import { json } from "@/server/api";
import { getDb, schema } from "@/server/db/client";
import { sparkExec, shellArg } from "@/server/spark/ssh";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const finetuneStart = z.object({
  type: z.literal("start"),
  base_model: z.string().min(1).describe("Modelo base instalado no Spark (ex.: qwen3.6:35b-a3b)").refine((v) => /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,200}$/.test(v), { message: "Nome inválido para modelo Ollama" }),
  method: z.enum(["lora", "qlora", "full"]),
  dataset_path: z.string().nullish(), // caminho já no Spark (/mnt/data/datasets/nome.jsonl)
  max_samples: z.number().int().min(1).max(50000).default(20000),
  learning_rate: z.number().positive().min(1e-8).max(1e-3).describe("Ex.: 1e-4"),
  epochs: z.number().int().min(1).max(50).default(3),
  r: z.number().int().min(4).max(256).describe("LoRA rank"),
  alpha: z.number().int().min(1).describe("LoRA alpha (recomendado: r×2)"),
  dropout: z.number().positive().max(0.5).default(0.1),
  gradient_accumulation_steps: z.number().int().min(1).max(32).default(4),
  batch_size: z.number().int().min(1).max(256).describe("Batch size — deixe auto se não souber"),
  bf16: z.boolean().default(true),
});

export async function POST(req: Request) {
  const raw = await req.json();
  const parsed = finetuneStart.safeParse(raw);
  if (!parsed.success || parsed.data.type !== "start") {
    return json(() => ({ ok: false, error: "invalid_payload", details: parsed.error.flatten().fieldErrors }), { status: 400 });
  }

  const cfg = parsed.data;
  const runId = randomUUID();
  const sparkPath = `/tmp/icewall-ft-${runId}`;
  const db = getDb();

  // Pre-criar workspace no Spark
  const preCheck = await sparkExec(
    `mkdir -p ${shellArg(sparkPath)} && echo "workspace-ok"`,
    10_000,
  );
  if (preCheck.code !== 0) {
    return json(() => ({ ok: false, error: "spark_error", message: preCheck.stderr.trim() || "Falha ao criar workspace no Spark" }), { status: 503 });
  }

  // Salvar metadata no banco
  db.insert(schema.fineTuneRuns)
    .values({
      runId,
      ts: Date.now(),
      baseModel: cfg.base_model,
      method: cfg.method,
      datasetPath: cfg.dataset_path ?? null,
      paramsJson: JSON.stringify({ max_samples: cfg.max_samples, learning_rate: cfg.learning_rate, epochs: cfg.epochs, r: cfg.r, alpha: cfg.alpha, dropout: cfg.dropout }),
      status: "queued",
      progressPct: 0,
      epochsDone: 0,
      totalEpochs: cfg.epochs,
      sparkPath,
    })
    .onConflictDoNothing()
    .run();

  // Montar o docker run do Unsloth
  const gpuSpec = '--gpus all';
  const bfFlags = ['--env', 'UNSLOUTH_BF16=1'];
  
  const params = [
    `--model ${shellArg(cfg.base_model)}`,
    cfg.dataset_path ? `--dataset ${shellArg(cfg.dataset_path)}` : `--dataset "${sparkPath}/train.jsonl"`,
    `--max_samples ${cfg.max_samples}`,
    `--learning_rate ${cfg.learning_rate}`,
    `--num_train_epochs ${cfg.epochs}`,
    `--lora_rank ${cfg.r}`,
    `--lora_alpha ${cfg.alpha}`,
    `--lora_dropout ${cfg.dropout}`,
    '--gradient_checkpointing true',
    `--output_dir "${sparkPath}/checkpoint"`,
    '--per_device_train_batch_size 1',
    `--gradient_accumulation_steps ${cfg.gradient_accumulation_steps}`,
    '--save_strategy no',
    '--logging_steps 1',
  ].join(' ');

  const runSh = `${sparkPath}/run.sh`;
  
  // Escrever script de treino no Spark via SSH
  const dockerLine = [
    `docker run --rm ${gpuSpec} ${bfFlags.join(' ')} \\`,
    `  -v /mnt/data:/data \\\\`,
    `  -v ${shellArg(sparkPath)}:/workspace \\\\`,
    `  unslothai/unsloth:latest-nvidia \\`,
    `    python3 fine_tune.py ${params}`,
  ].join('\n');

  const script = [
    'set -e',
    `echo "[${runId}] Starting fine-tune..."`,
	'docker pull unslothai/unsloth:latest-nvidia &>/dev/null || true',
	dockerLine,
	`echo "[${runId}] docker exit=$?" > "${sparkPath}/final.status"`,
  ].join('\n');

  // Escrever script no Spark
  await sparkExec(
    `printf '%s' ${shellArg(script)} > ${shellArg(runSh)}`,
    15_000,
  );

  // Rodar em segundo plano (no Spark) — não precisa keep-alive SSH open
  const jobPidPath = `${sparkPath}/job.pid`;
  await sparkExec(
    `( nohup bash ${shellArg(runSh)} > ${shellArg(sparkPath + '/train.log')} 2>&1 & echo "PID=$!" > ${shellArg(jobPidPath)} )`,
    5_000,
  );

  // Atualizar status pra training
  try {
    db.update(schema.fineTuneRuns)
      .set({ status: 'training', updatedAt: Date.now() })
      .where(schema.fineTuneRuns.runId.eq(runId))
      .run();
  } catch {}

  return json(() => ({ ok: true, type: "start", runId }), { status: 201 });
}
