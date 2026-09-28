PRAGMA foreign_keys = ON;

CREATE TABLE protocol_extractions (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL,
  protocol_file_id TEXT NOT NULL,
  protocol_checksum TEXT NOT NULL,
  extraction_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (protocol_file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX idx_protocol_extractions_project_created
  ON protocol_extractions(project_id, created_at DESC);

CREATE INDEX idx_protocol_extractions_protocol_file
  ON protocol_extractions(protocol_file_id);
