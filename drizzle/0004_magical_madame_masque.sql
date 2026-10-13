CREATE TABLE `saas_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'dgx-spark' NOT NULL,
	`endpoint` text NOT NULL,
	`ssh_host` text,
	`ssh_port` integer DEFAULT 22,
	`ssh_user` text DEFAULT 'junior',
	`ssh_key` text,
	`status` text DEFAULT 'online' NOT NULL,
	`gpu_model` text DEFAULT 'NVIDIA GB10 Blackwell (Spark)',
	`total_memory_gb` real DEFAULT 128,
	`active_models_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saas_clusters_tenant` ON `saas_clusters` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `saas_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`plan` text DEFAULT 'standard' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saas_tenants_slug_unique` ON `saas_tenants` (`slug`);--> statement-breakpoint
CREATE TABLE `saas_users` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`two_factor_enabled` integer DEFAULT false NOT NULL,
	`two_factor_secret` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saas_users_email_unique` ON `saas_users` (`email`);--> statement-breakpoint
CREATE INDEX `saas_users_tenant` ON `saas_users` (`tenant_id`);