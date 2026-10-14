CREATE TABLE IF NOT EXISTS `fine_tune_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`base_model` text NOT NULL,
	`method` text CHECK(method IN ('lora', 'qlora', 'full')) NOT NULL,
	`dataset_path` text,
	`params_json` text,
	`status` text DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'training', 'exporting', 'deploying', 'completed', 'failed')) NOT NULL,
	`loss_history` text,
	`val_loss` real,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`epochs_done` integer DEFAULT 0 NOT NULL,
	`total_epochs` integer DEFAULT 0 NOT NULL,
	`spark_path` text,
	`gpu_mem_used_mib` real,
	`gpu_mem_total_mib` real,
	`created_by_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ft_status` ON `fine_tune_runs` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ft_ts` ON `fine_tune_runs` (`ts`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fine_tune_exports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`output_name` text,
	`export_path` text,
	`size_bytes` integer,
	`adapter_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ft_exports_run` ON `fine_tune_exports` (`run_id`);
