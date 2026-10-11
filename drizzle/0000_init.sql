CREATE TABLE `action_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`status` text NOT NULL,
	`output` text,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE TABLE `bench_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bench_run_id` integer NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`model` text NOT NULL,
	`task` text NOT NULL,
	`sample` integer NOT NULL,
	`ok` integer NOT NULL,
	`first_try` integer,
	`rounds` integer,
	`exit_code` integer,
	`duration_s` real,
	`tok_s` real,
	`prompt_tok_s` real,
	`ttft_ms` real,
	`load_ms` real,
	`prompt_tokens` integer,
	`eval_tokens` integer,
	`size_vram` real,
	`delegate_run_id` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `bench_results_run` ON `bench_results` (`bench_run_id`);--> statement-breakpoint
CREATE TABLE `bench_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`models` text NOT NULL,
	`tasks` text NOT NULL,
	`samples` integer DEFAULT 1 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`current` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `claude_usage` (
	`message_id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`session_id` text,
	`project` text,
	`model` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read` integer DEFAULT 0 NOT NULL,
	`cache_creation` integer DEFAULT 0 NOT NULL,
	`thinking_tokens` integer DEFAULT 0 NOT NULL,
	`sidechain` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claude_usage_ts` ON `claude_usage` (`ts`);--> statement-breakpoint
CREATE TABLE `container_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`name` text NOT NULL,
	`cpu_pct` real,
	`mem_bytes` real
);
--> statement-breakpoint
CREATE INDEX `container_stats_ts` ON `container_stats` (`ts`);--> statement-breakpoint
CREATE TABLE `delegate_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`ts` integer NOT NULL,
	`verdict` text NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `delegate_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`workdir` text,
	`project` text,
	`label` text,
	`tier` text,
	`model` text,
	`fallback_used` integer,
	`exit_code` integer NOT NULL,
	`rounds` integer,
	`max_rounds` integer,
	`tests_passed` integer,
	`eval_tokens` integer,
	`prompt_tokens` integer,
	`tok_s` real,
	`duration_s` real,
	`test_cmd` text,
	`context_count` integer,
	`task_sha` text,
	`task_chars` integer,
	`task_excerpt` text,
	`files` text,
	`warnings` text,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `delegate_runs_ts` ON `delegate_runs` (`ts`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `events_ts` ON `events` (`ts`);--> statement-breakpoint
CREATE TABLE `ingest_offsets` (
	`file` text PRIMARY KEY NOT NULL,
	`offset` integer NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jev_judgments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`model` text,
	`answers` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jev_request_hash` ON `jev_judgments` (`request_hash`);--> statement-breakpoint
CREATE INDEX `jev_subject` ON `jev_judgments` (`subject_kind`,`subject_id`);--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`gpu_util` real,
	`gpu_temp` real,
	`gpu_power` real,
	`gpu_clock` real,
	`gpu_proc_mem` real,
	`mem_total` real,
	`mem_available` real,
	`swap_total` real,
	`swap_free` real,
	`load1` real,
	`load5` real,
	`load15` real,
	`cpu_count` integer,
	`disk_total` real,
	`disk_used` real,
	`ollama_vram` real
);
--> statement-breakpoint
CREATE INDEX `metrics_ts` ON `metrics` (`ts`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`ts` integer NOT NULL,
	`area` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`action` text,
	`confidence` real,
	`evidence` text,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendations_key_unique` ON `recommendations` (`key`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`key` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`data` text NOT NULL,
	`error` text
);
