-- Treino `/treinar` (Fase 2 — docs/train/plans/2026-10-15-fase2-treinar-lab-producao.md).
-- Substitui as tabelas legadas do fine-tune (0006), que nunca tiveram leitura
-- (a rota legada POST /api/fine-tune foi removida nesta mesma etapa).
-- Escrita à mão, como 0006..0011: o drizzle-kit generate está sem snapshot
-- desde a 0006 e re-emite tabelas que já existem.
DROP TABLE IF EXISTS `fine_tune_exports`;
--> statement-breakpoint
DROP TABLE IF EXISTS `fine_tune_runs`;
--> statement-breakpoint
CREATE TABLE `train_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`server_id` integer NOT NULL,
	`ambiente` text DEFAULT 'lab' NOT NULL,
	`base_model` text NOT NULL,
	`method` text NOT NULL,
	`dataset_id` integer,
	`dataset_path` text,
	`params_json` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`epochs_done` integer DEFAULT 0 NOT NULL,
	`total_epochs` integer DEFAULT 0 NOT NULL,
	`loss_history` text,
	`val_loss` real,
	`current` text,
	`error` text,
	`workspace_path` text,
	`remote_pid` integer,
	`gpu_mem_used_mib` real,
	`gpu_mem_total_mib` real,
	`started_at` integer,
	`finished_at` integer,
	`updated_ts` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `train_jobs_status` ON `train_jobs` (`status`);
--> statement-breakpoint
CREATE INDEX `train_jobs_ts` ON `train_jobs` (`ts`);
--> statement-breakpoint
CREATE TABLE `train_datasets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`server_id` integer NOT NULL,
	`nome` text NOT NULL,
	`formato` text NOT NULL,
	`formato_treino` text DEFAULT 'chat' NOT NULL,
	`remote_path` text NOT NULL,
	`size_bytes` integer,
	`samples` integer,
	`validacao` text,
	`atualizado_em` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `train_datasets_server_nome` ON `train_datasets` (`server_id`,`nome`);
--> statement-breakpoint
CREATE TABLE `train_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`job_id` integer,
	`server_id` integer NOT NULL,
	`kind` text NOT NULL,
	`quant` text,
	`remote_path` text NOT NULL,
	`size_bytes` integer,
	`promovido` integer DEFAULT false NOT NULL,
	`promo_destino` text,
	`atualizado_em` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `train_artifacts_job` ON `train_artifacts` (`job_id`);
