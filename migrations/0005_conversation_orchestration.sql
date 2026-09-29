PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('researcher', 'methodome', 'activity', 'system')),
  message_kind TEXT NOT NULL CHECK (message_kind IN ('message', 'checkpoint', 'result', 'activity', 'error')),
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  attachment_file_ids_json TEXT NOT NULL DEFAULT '[]',
  deduplication_key TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (project_id, deduplication_key)
);

CREATE INDEX IF NOT EXISTS idx_project_messages_project_created
  ON project_messages(project_id, created_at, id);

CREATE TABLE IF NOT EXISTS project_conversation_decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  decision_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  domain_context_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'superseded')),
  response_json TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES project_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (project_id, decision_key)
);

CREATE INDEX IF NOT EXISTS idx_project_conversation_decisions_open
  ON project_conversation_decisions(project_id, status, created_at);

CREATE TABLE IF NOT EXISTS project_orchestration_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  trigger_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting', 'complete', 'failed')),
  iteration_count INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_message_id) REFERENCES project_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_orchestration_one_active
  ON project_orchestration_runs(project_id)
  WHERE status IN ('queued', 'running');
