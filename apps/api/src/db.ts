import type { Project, ResearchType } from "@methodome/domain";
import type { StudySpecification } from "@methodome/study-spec";
import type { AnalysisJob, AnalysisResult, JobState } from "@methodome/analysis-contracts";
import type { ProjectProcessingPolicy } from "@methodome/policy-engine";
import type { HashedAuditEvent } from "@methodome/provenance";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

export async function listProjects(db: D1Database, userId: string): Promise<Project[]> {
  const result = await db
    .prepare(
      `SELECT p.*
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.owner_id = ? OR pm.user_id = ?
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    )
    .bind(userId, userId)
    .all<Record<string, unknown>>();

  return result.results.map(rowToProject);
}

export async function getProject(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<Project | null> {
  const row = await db
    .prepare(
      `SELECT p.*
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = ? AND (p.owner_id = ? OR pm.user_id = ?)
       LIMIT 1`
    )
    .bind(projectId, userId, userId)
    .first<Record<string, unknown>>();

  return row ? rowToProject(row) : null;
}

export async function createProject(
  db: D1Database,
  project: Project
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO projects
         (id, owner_id, name, description, research_type, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        project.id,
        project.ownerId,
        project.name,
        project.description ?? null,
        project.researchType,
        project.state,
        project.createdAt,
        project.updatedAt
      ),
    db
      .prepare(
        `INSERT INTO project_members (project_id, user_id, role, created_at)
         VALUES (?, ?, 'owner', ?)`
      )
      .bind(project.id, project.ownerId, project.createdAt),
    db
      .prepare(
        `INSERT INTO project_policies
         (project_id, data_class, contains_identifiable_data, allowed_processors_json,
          external_model_allowed, qualitative_text_external_allowed,
          row_level_quantitative_external_allowed, export_restrictions_json, updated_at)
         VALUES (?, 'restricted', 0, '[]', 0, 0, 0, '[]', ?)`
      )
      .bind(project.id, project.createdAt)
  ]);
}

function rowToProject(row: Record<string, unknown>): Project {
  const project: Project = {
    id: String(row.id),
    name: String(row.name),
    researchType: String(row.research_type) as ResearchType,
    state: String(row.state) as Project["state"],
    ownerId: String(row.owner_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
  if (row.description != null) project.description = String(row.description);
  return project;
}

export async function getStudySpecification(
  db: D1Database,
  projectId: string
): Promise<StudySpecification | null> {
  const row = await db
    .prepare(
      `SELECT specification_json
       FROM study_specifications
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(projectId)
    .first<{ specification_json: string }>();

  return row ? JSON.parse(row.specification_json) as StudySpecification : null;
}

export async function saveStudySpecification(
  db: D1Database,
  id: string,
  projectId: string,
  specification: StudySpecification,
  confirmedBy: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO study_specifications
       (id, project_id, version, specification_json, confirmed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      projectId,
      specification.version,
      JSON.stringify(specification),
      confirmedBy,
      new Date().toISOString()
    )
    .run();
}

export async function getProjectPolicy(
  db: D1Database,
  projectId: string
): Promise<ProjectProcessingPolicy | null> {
  const row = await db
    .prepare("SELECT * FROM project_policies WHERE project_id = ?")
    .bind(projectId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    dataClass: String(row.data_class) as ProjectProcessingPolicy["dataClass"],
    containsIdentifiableData: Boolean(row.contains_identifiable_data),
    ...(row.ethics_approval_reference
      ? { ethicsApprovalReference: String(row.ethics_approval_reference) }
      : {}),
    allowedProcessors: parseJson<string[]>(String(row.allowed_processors_json ?? "[]"), []),
    externalModelAllowed: Boolean(row.external_model_allowed),
    qualitativeTextExternalAllowed: Boolean(row.qualitative_text_external_allowed),
    rowLevelQuantitativeExternalAllowed: Boolean(row.row_level_quantitative_external_allowed),
    ...(row.retention_rule ? { retentionRule: String(row.retention_rule) } : {}),
    exportRestrictions: parseJson<string[]>(String(row.export_restrictions_json ?? "[]"), [])
  };
}

export async function createAnalysisJob(
  db: D1Database,
  job: AnalysisJob,
  state: JobState
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analysis_jobs
       (id, project_id, dataset_version_id, analysis_plan_id, method_id,
        registry_version, job_specification_json, state, override_reason,
        requested_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      job.jobId,
      job.projectId,
      job.datasetVersionId,
      job.analysisPlanId ?? null,
      job.methodId,
      job.registryVersion,
      JSON.stringify(job),
      state,
      job.overrideReason ?? null,
      job.requestedBy,
      job.createdAt
    )
    .run();
}

export async function getAnalysisJob(
  db: D1Database,
  jobId: string,
  userId: string
): Promise<{ job: AnalysisJob; state: JobState } | null> {
  const row = await db
    .prepare(
      `SELECT j.job_specification_json, j.state
       FROM analysis_jobs j
       JOIN projects p ON p.id = j.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE j.id = ? AND (p.owner_id = ? OR pm.user_id = ?)
       LIMIT 1`
    )
    .bind(jobId, userId, userId)
    .first<{ job_specification_json: string; state: JobState }>();

  return row
    ? { job: JSON.parse(row.job_specification_json) as AnalysisJob, state: row.state }
    : null;
}

export async function getAnalysisResult(
  db: D1Database,
  jobId: string,
  userId: string
): Promise<AnalysisResult | null> {
  const row = await db
    .prepare(
      `SELECT r.result_json
       FROM analysis_results r
       JOIN analysis_jobs j ON j.id = r.analysis_job_id
       JOIN projects p ON p.id = j.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE r.analysis_job_id = ? AND (p.owner_id = ? OR pm.user_id = ?)
       LIMIT 1`
    )
    .bind(jobId, userId, userId)
    .first<{ result_json: string }>();

  return row ? JSON.parse(row.result_json) as AnalysisResult : null;
}

export async function getAuditHeadHash(
  db: D1Database,
  projectId: string
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT hash FROM audit_events
       WHERE project_id = ?
       ORDER BY timestamp DESC, rowid DESC
       LIMIT 1`
    )
    .bind(projectId)
    .first<{ hash: string }>();

  return row?.hash ?? null;
}

export async function appendAuditEvent(
  db: D1Database,
  event: HashedAuditEvent
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events
       (id, project_id, user_id, action, object_type, object_id,
        before_json, after_json, reason, software_version, model_id,
        timestamp, previous_hash, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.projectId,
      event.userId,
      event.action,
      event.objectType,
      event.objectId,
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
      event.reason ?? null,
      event.softwareVersion ?? null,
      event.modelId ?? null,
      event.timestamp,
      event.previousHash,
      event.hash
    )
    .run();
}

export async function listAuditEvents(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<HashedAuditEvent[]> {
  const project = await getProject(db, projectId, userId);
  if (!project) return [];

  const result = await db
    .prepare(
      `SELECT * FROM audit_events
       WHERE project_id = ?
       ORDER BY timestamp ASC, rowid ASC`
    )
    .bind(projectId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    action: String(row.action),
    objectType: String(row.object_type),
    objectId: String(row.object_id),
    ...(row.before_json ? { before: JSON.parse(String(row.before_json)) } : {}),
    ...(row.after_json ? { after: JSON.parse(String(row.after_json)) } : {}),
    ...(row.reason ? { reason: String(row.reason) } : {}),
    ...(row.software_version ? { softwareVersion: String(row.software_version) } : {}),
    ...(row.model_id ? { modelId: String(row.model_id) } : {}),
    timestamp: String(row.timestamp),
    previousHash: row.previous_hash ? String(row.previous_hash) : null,
    hash: String(row.hash)
  }));
}

export async function datasetBelongsToProject(
  db: D1Database,
  datasetVersionId: string,
  projectId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT id FROM dataset_versions WHERE id = ? AND project_id = ? LIMIT 1"
    )
    .bind(datasetVersionId, projectId)
    .first<{ id: string }>();

  return Boolean(row);
}

export async function getFileRecord(
  db: D1Database,
  fileId: string,
  userId: string
): Promise<{ id: string; projectId: string; objectKey: string; filename: string } | null> {
  const row = await db
    .prepare(
      `SELECT f.id, f.project_id, f.object_key, f.filename
       FROM files f
       JOIN projects p ON p.id = f.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE f.id = ? AND (p.owner_id = ? OR pm.user_id = ?)
       LIMIT 1`
    )
    .bind(fileId, userId, userId)
    .first<Record<string, unknown>>();

  return row
    ? {
        id: String(row.id),
        projectId: String(row.project_id),
        objectKey: String(row.object_key),
        filename: String(row.filename)
      }
    : null;
}

export async function createFileRecord(
  db: D1Database,
  input: {
    id: string;
    projectId: string;
    fileKind: string;
    filename: string;
    objectKey: string;
    mediaType?: string;
    sizeBytes?: number;
    checksumSha256?: string;
    createdBy: string;
  }
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO files
       (id, project_id, file_kind, filename, object_key, media_type,
        checksum_sha256, size_bytes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.projectId,
      input.fileKind,
      input.filename,
      input.objectKey,
      input.mediaType ?? null,
      input.checksumSha256 ?? "pending",
      input.sizeBytes ?? null,
      input.createdBy,
      now
    )
    .run();
}

export async function finaliseFileChecksum(
  db: D1Database,
  fileId: string,
  checksumSha256: string,
  sizeBytes: number
): Promise<void> {
  await db
    .prepare(
      "UPDATE files SET checksum_sha256 = ?, size_bytes = ? WHERE id = ?"
    )
    .bind(checksumSha256, sizeBytes, fileId)
    .run();
}

export async function updateProjectPolicy(
  db: D1Database,
  projectId: string,
  policy: ProjectProcessingPolicy
): Promise<void> {
  await db
    .prepare(
      `UPDATE project_policies
       SET data_class = ?,
           contains_identifiable_data = ?,
           ethics_approval_reference = ?,
           allowed_processors_json = ?,
           external_model_allowed = ?,
           qualitative_text_external_allowed = ?,
           row_level_quantitative_external_allowed = ?,
           retention_rule = ?,
           export_restrictions_json = ?,
           updated_at = ?
       WHERE project_id = ?`
    )
    .bind(
      policy.dataClass,
      policy.containsIdentifiableData ? 1 : 0,
      policy.ethicsApprovalReference ?? null,
      JSON.stringify(policy.allowedProcessors),
      policy.externalModelAllowed ? 1 : 0,
      policy.qualitativeTextExternalAllowed ? 1 : 0,
      policy.rowLevelQuantitativeExternalAllowed ? 1 : 0,
      policy.retentionRule ?? null,
      JSON.stringify(policy.exportRestrictions),
      new Date().toISOString(),
      projectId
    )
    .run();
}

export async function createDatasetVersion(
  db: D1Database,
  input: {
    id: string;
    projectId: string;
    label: string;
    sourceKind: "original" | "derived";
    objectKey: string;
    checksumSha256: string;
    rowCount?: number;
    columnCount?: number;
    createdBy: string;
    parentVersionIds?: string[];
  }
): Promise<void> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO dataset_versions
         (id, project_id, label, source_kind, object_key, checksum_sha256,
          row_count, column_count, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.projectId,
        input.label,
        input.sourceKind,
        input.objectKey,
        input.checksumSha256,
        input.rowCount ?? null,
        input.columnCount ?? null,
        input.createdBy,
        now
      )
  ];

  for (const parentId of input.parentVersionIds ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO dataset_version_parents
           (dataset_version_id, parent_dataset_version_id)
           VALUES (?, ?)`
        )
        .bind(input.id, parentId)
    );
  }

  await db.batch(statements);
}

export async function listDatasetVersions(
  db: D1Database,
  projectId: string
): Promise<Array<{
  id: string;
  projectId: string;
  label: string;
  sourceKind: "original" | "derived";
  objectKey: string;
  checksumSha256: string;
  rowCount?: number;
  columnCount?: number;
  createdAt: string;
  createdBy: string;
  parentVersionIds: string[];
}>> {
  const rows = await db
    .prepare(
      `SELECT * FROM dataset_versions
       WHERE project_id = ?
       ORDER BY created_at DESC`
    )
    .bind(projectId)
    .all<Record<string, unknown>>();

  const output = [];

  for (const row of rows.results) {
    const parents = await db
      .prepare(
        `SELECT parent_dataset_version_id
         FROM dataset_version_parents
         WHERE dataset_version_id = ?`
      )
      .bind(String(row.id))
      .all<{ parent_dataset_version_id: string }>();

    output.push({
      id: String(row.id),
      projectId: String(row.project_id),
      label: String(row.label),
      sourceKind: String(row.source_kind) as "original" | "derived",
      objectKey: String(row.object_key),
      checksumSha256: String(row.checksum_sha256),
      ...(row.row_count != null ? { rowCount: Number(row.row_count) } : {}),
      ...(row.column_count != null ? { columnCount: Number(row.column_count) } : {}),
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
      parentVersionIds: parents.results.map((item) => item.parent_dataset_version_id)
    });
  }

  return output;
}

export async function getFileForDatasetRegistration(
  db: D1Database,
  fileId: string,
  projectId: string
): Promise<{
  id: string;
  objectKey: string;
  checksumSha256: string;
  fileKind: string;
  filename: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT id, object_key, checksum_sha256, file_kind, filename
       FROM files
       WHERE id = ? AND project_id = ?
       LIMIT 1`
    )
    .bind(fileId, projectId)
    .first<Record<string, unknown>>();

  return row
    ? {
        id: String(row.id),
        objectKey: String(row.object_key),
        checksumSha256: String(row.checksum_sha256),
        fileKind: String(row.file_kind),
        filename: String(row.filename)
      }
    : null;
}
