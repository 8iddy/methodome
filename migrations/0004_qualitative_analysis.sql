PRAGMA foreign_keys = ON;

CREATE TABLE qualitative_analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  research_question_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'prepared',
      'codebook_review',
      'codebook_confirmed',
      'coding_in_progress',
      'coding_review',
      'coding_confirmed',
      'theme_review',
      'complete'
    )
  ),
  source_file_ids_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, research_question_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE qualitative_segments (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (analysis_id, file_id, segment_index),
  FOREIGN KEY (analysis_id) REFERENCES qualitative_analyses(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE qualitative_codebook_versions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('model','researcher')),
  codebook_json TEXT NOT NULL,
  model_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (analysis_id, version),
  FOREIGN KEY (analysis_id) REFERENCES qualitative_analyses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE qualitative_codings (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  code_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','confirmed','rejected')),
  source TEXT NOT NULL CHECK (source IN ('model','researcher')),
  rationale TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (analysis_id, segment_id, code_id),
  FOREIGN KEY (analysis_id) REFERENCES qualitative_analyses(id) ON DELETE CASCADE,
  FOREIGN KEY (segment_id) REFERENCES qualitative_segments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE qualitative_theme_versions (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('model','researcher')),
  themes_json TEXT NOT NULL,
  synthesis TEXT NOT NULL,
  model_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (analysis_id, version),
  FOREIGN KEY (analysis_id) REFERENCES qualitative_analyses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_qual_analyses_project
  ON qualitative_analyses(project_id, status);
CREATE INDEX idx_qual_segments_analysis
  ON qualitative_segments(analysis_id, segment_index);
CREATE INDEX idx_qual_codings_analysis
  ON qualitative_codings(analysis_id, status);
CREATE INDEX idx_qual_codebooks_analysis
  ON qualitative_codebook_versions(analysis_id, version);
CREATE INDEX idx_qual_themes_analysis
  ON qualitative_theme_versions(analysis_id, version);
