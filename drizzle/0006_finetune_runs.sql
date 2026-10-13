CREATE TABLE IF NOT EXISTS fine_tune_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT UNIQUE NOT NULL,
  ts            INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  base_model    TEXT NOT NULL,
  method        TEXT CHECK(method IN ('lora', 'qlora', 'full')) NOT NULL,
  dataset_path  TEXT,
  params_json   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','training','exporting','deploying','completed','failed')),
  loss_history  TEXT,
  val_loss      REAL,
  progress_pct  INTEGER NOT NULL DEFAULT 0,
  epochs_done   INTEGER NOT NULL DEFAULT 0,
  total_epochs  INTEGER NOT NULL DEFAULT 0,
  spark_path    TEXT,
  gpu_mem_used  REAL, -- MiB
  gpu_mem_total REAL, -- MiB
  created_by_id TEXT,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS ft_status ON fine_tune_runs(status);
CREATE INDEX IF NOT EXISTS ft_ts    ON fine_tune_runs(ts);

CREATE TABLE IF NOT EXISTS fine_tune_exports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES fine_tune_runs(run_id),
  output_name  TEXT,
  export_path  TEXT,
  size_bytes   INTEGER,
  adapter_path TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS ft_exports_run ON fine_tune_exports(run_id);
