CREATE TABLE `crivo_comandos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`origem` text NOT NULL,
	`sessao` text,
	`tipo` text NOT NULL,
	`alvo` text NOT NULL,
	`regra` text,
	`semaforo` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crivo_comandos_ts` ON `crivo_comandos` (`ts`);--> statement-breakpoint
CREATE TABLE `crivo_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`texto` text NOT NULL,
	`origem` text NOT NULL,
	`sessao` text,
	`tamanho` text,
	`tamanho_pct` integer,
	`objetivo_pct` integer,
	`onde_pct` integer,
	`pronto_pct` integer,
	`foco_pct` integer,
	`nota` integer,
	`semaforo` text NOT NULL,
	`avaliacao` text,
	`duracao_ms` integer,
	`faltando` text,
	`motivo` text,
	`jev_input_tokens` integer,
	`jev_output_tokens` integer
);
--> statement-breakpoint
CREATE INDEX `crivo_prompts_ts` ON `crivo_prompts` (`ts`);--> statement-breakpoint
CREATE INDEX `crivo_prompts_sessao` ON `crivo_prompts` (`sessao`,`id`);