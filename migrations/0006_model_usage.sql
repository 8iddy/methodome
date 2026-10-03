-- Every Workers AI call Methodome makes, for usage visibility and model
-- selection. Rows are observational; nothing scientific depends on them.
CREATE TABLE IF NOT EXISTS model_invocations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  user_id TEXT,
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  input_chars INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  max_tokens INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_invocations_user_created
  ON model_invocations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_model_invocations_project_created
  ON model_invocations(project_id, created_at);
