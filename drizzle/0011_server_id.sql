-- Etapa 03 do plano multi-servidor: dados por servidor.
-- As quatro tabelas de monitoração/ação ganham a coluna `server_id`
-- (nula: permite linhas de contextos que ainda não carregam servidor).
-- Toda linha existente vem do Spark (único servidor monitorado até
-- aqui): o histórico é remanejado para o servidor "Spark" do registro.

ALTER TABLE metrics ADD COLUMN server_id INTEGER;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS metrics_server_ts ON metrics (server_id, ts);--> statement-breakpoint
ALTER TABLE container_stats ADD COLUMN server_id INTEGER;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS container_stats_server_ts ON container_stats (server_id, ts);--> statement-breakpoint
ALTER TABLE events ADD COLUMN server_id INTEGER;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_server_ts ON events (server_id, ts);--> statement-breakpoint
ALTER TABLE action_log ADD COLUMN server_id INTEGER;--> statement-breakpoint
UPDATE metrics SET server_id = (SELECT id FROM servers WHERE nome = 'Spark' LIMIT 1) WHERE server_id IS NULL;--> statement-breakpoint
UPDATE container_stats SET server_id = (SELECT id FROM servers WHERE nome = 'Spark' LIMIT 1) WHERE server_id IS NULL;--> statement-breakpoint
UPDATE events SET server_id = (SELECT id FROM servers WHERE nome = 'Spark' LIMIT 1) WHERE server_id IS NULL;--> statement-breakpoint
UPDATE action_log SET server_id = (SELECT id FROM servers WHERE nome = 'Spark' LIMIT 1) WHERE server_id IS NULL;
