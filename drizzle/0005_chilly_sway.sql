CREATE TABLE `saas_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text,
	`user_name` text,
	`action` text NOT NULL,
	`detail` text,
	`ip` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saas_audit_logs_tenant` ON `saas_audit_logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `saas_audit_logs_created` ON `saas_audit_logs` (`created_at`);