CREATE TABLE `crivo_projetos` (
	`origem` text PRIMARY KEY NOT NULL,
	`cwd` text NOT NULL,
	`descricao` text,
	`desligado` integer DEFAULT false NOT NULL,
	`visto_em` integer NOT NULL
);
