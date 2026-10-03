-- Cached deterministic profiles of immutable dataset versions. A profile is
-- a pure function of the stored object (keyed by its checksum), so it is
-- computed once by the statistical worker and reused.
CREATE TABLE IF NOT EXISTS dataset_profiles (
  dataset_version_id TEXT PRIMARY KEY,
  checksum_sha256 TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE
);
