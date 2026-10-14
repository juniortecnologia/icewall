CREATE TABLE IF NOT EXISTS train_servers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT UNIQUE NOT NULL,
  tipo           TEXT CHECK(tipo IN ('spark', 'generic')) NOT NULL,
  host           TEXT NOT NULL,
  porta          INTEGER DEFAULT 22,
  usuario        TEXT NOT NULL,
  chave_ssh_path TEXT NOT NULL,
  criado_em      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  atualizado_em  INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
