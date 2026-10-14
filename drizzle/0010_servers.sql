-- Etapa 01 do plano multi-servidor: registro central `servers`.
-- Renomeia `train_servers` → `servers` com os novos campos (tipo local|ssh,
-- vllmUrl, vllmKey, capacidades, ultimoStatus, ultimoCheck).
-- Sem perda de histórico: as linhas antigas (servidores SSH de treino, todos
-- apontando para o Spark) são copiadas com tipo 'ssh' antes de a tabela
-- antiga ser removida.

CREATE TABLE servers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT UNIQUE NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'ssh' CHECK (tipo IN ('local', 'ssh')),
  host           TEXT NOT NULL DEFAULT 'localhost',
  porta          INTEGER,
  usuario        TEXT,
  chave_ssh_path TEXT,
  vllm_url       TEXT,
  vllm_key       TEXT,
  capacidades    TEXT,
  ultimo_status  TEXT,
  ultimo_check   INTEGER,
  criado_em      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  atualizado_em  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);--> statement-breakpoint
INSERT INTO servers (id, nome, tipo, host, porta, usuario, chave_ssh_path, criado_em, atualizado_em)
SELECT id, nome, 'ssh', host, porta, usuario, chave_ssh_path, criado_em, atualizado_em
FROM train_servers;--> statement-breakpoint
DROP TABLE train_servers;
