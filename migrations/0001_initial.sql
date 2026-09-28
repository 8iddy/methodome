PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  organisation TEXT,
  role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  research_type TEXT NOT NULL CHECK (research_type IN ('quantitative','qualitative','mixed_methods')),
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','analyst','coder','reviewer','viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE project_policies (
  project_id TEXT PRIMARY KEY,
  data_class TEXT NOT NULL CHECK (data_class IN ('public','restricted','identifiable')),
  contains_identifiable_data INTEGER NOT NULL DEFAULT 0,
  ethics_approval_reference TEXT,
  allowed_processors_json TEXT NOT NULL DEFAULT '[]',
  external_model_allowed INTEGER NOT NULL DEFAULT 0,
  qualitative_text_external_allowed INTEGER NOT NULL DEFAULT 0,
  row_level_quantitative_external_allowed INTEGER NOT NULL DEFAULT 0,
  retention_rule TEXT,
  export_restrictions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT,
  checksum_sha256 TEXT NOT NULL,
  size_bytes INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE dataset_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('original','derived')),
  object_key TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT NOT NULL,
  row_count INTEGER,
  column_count INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE dataset_version_parents (
  dataset_version_id TEXT NOT NULL,
  parent_dataset_version_id TEXT NOT NULL,
  PRIMARY KEY (dataset_version_id, parent_dataset_version_id),
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_dataset_version_id) REFERENCES dataset_versions(id)
);

CREATE TABLE transformation_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  output_dataset_version_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  specification_json TEXT NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (output_dataset_version_id) REFERENCES dataset_versions(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE transformation_inputs (
  transformation_event_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  PRIMARY KEY (transformation_event_id, dataset_version_id),
  FOREIGN KEY (transformation_event_id) REFERENCES transformation_events(id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id)
);

CREATE TABLE study_specifications (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version TEXT NOT NULL,
  specification_json TEXT NOT NULL,
  source_model_json TEXT,
  confirmed_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, version),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (confirmed_by) REFERENCES users(id)
);

CREATE TABLE variable_mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  study_specification_id TEXT NOT NULL,
  research_concept TEXT NOT NULL,
  dataset_variable TEXT,
  mapping_status TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  confirmed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (study_specification_id) REFERENCES study_specifications(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id)
);

CREATE TABLE analysis_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('preregistered','planned_before_analysis','exploratory')),
  plan_json TEXT NOT NULL,
  locked_at TEXT,
  lock_hash TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, version),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE analysis_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  analysis_plan_id TEXT,
  method_id TEXT NOT NULL,
  registry_version TEXT NOT NULL,
  job_specification_json TEXT NOT NULL,
  state TEXT NOT NULL,
  override_reason TEXT,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id),
  FOREIGN KEY (analysis_plan_id) REFERENCES analysis_plans(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE TABLE analysis_results (
  id TEXT PRIMARY KEY,
  analysis_job_id TEXT NOT NULL UNIQUE,
  result_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  result_object_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (analysis_job_id) REFERENCES analysis_jobs(id) ON DELETE CASCADE
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  software_version TEXT,
  model_id TEXT,
  timestamp TEXT NOT NULL,
  previous_hash TEXT,
  hash TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE model_calls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task TEXT NOT NULL,
  processor_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  model_revision TEXT,
  prompt_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd REAL,
  policy_decision TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE validation_profiles (
  id TEXT PRIMARY KEY,
  registry_version TEXT NOT NULL,
  study_schema_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  model_provider TEXT,
  model_id TEXT,
  model_revision TEXT,
  prompt_version TEXT,
  benchmark_version TEXT NOT NULL,
  benchmark_score REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('current','stale')),
  validated_at TEXT NOT NULL
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_datasets_project ON dataset_versions(project_id);
CREATE INDEX idx_jobs_project ON analysis_jobs(project_id);
CREATE INDEX idx_jobs_state ON analysis_jobs(state);
CREATE INDEX idx_audit_project_time ON audit_events(project_id, timestamp);
CREATE INDEX idx_model_calls_project ON model_calls(project_id);
