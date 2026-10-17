-- T3 (Fase 2 /treinar): exports GGUF rastreáveis em train_artifacts.
-- O registro nasce 'pending' com o caminho final esperado e é atualizado
-- pelo tick da fila de exports (running → done|failed).
-- Escrita à mão, como 0006..0012: drizzle-kit sem snapshot desde a 0006.
ALTER TABLE `train_artifacts` ADD `status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `train_artifacts` ADD `error` text;
