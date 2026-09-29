import type { Project, ResearchType } from "@methodome/domain";
import type { StudySpecification } from "@methodome/study-spec";
import type { AnalysisJob, AnalysisResult, JobState } from "@methodome/analysis-contracts";
import type { ProjectProcessingPolicy } from "@methodome/policy-engine";
import type { HashedAuditEvent } from "@methodome/provenance";
import type {
  QualitativeAnalysisRecord,
  QualitativeAnalysisStatus,
  QualitativeCodebook,
  QualitativeCodebookVersion,
  QualitativeCoding,
  QualitativeSegment,
  QualitativeTheme,
  QualitativeThemeVersion
} from "@methodome/qualitative-analysis";

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

export async function listAnalysisJobsForPlan(
  db: D1Database,
  projectId: string,
  analysisPlanId: string
): Promise<Array<{ job: AnalysisJob; state: JobState }>> {
  const result = await db
    .prepare(
      `SELECT job_specification_json, state
       FROM analysis_jobs
       WHERE project_id = ? AND analysis_plan_id = ?
       ORDER BY created_at ASC`
    )
    .bind(projectId, analysisPlanId)
    .all<{ job_specification_json: string; state: JobState }>();

  return result.results.map((row) => ({
    job: JSON.parse(row.job_specification_json) as AnalysisJob,
    state: row.state
  }));
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
): Promise<{
  id: string;
  projectId: string;
  objectKey: string;
  filename: string;
  fileKind: string;
  mediaType?: string;
  checksumSha256: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT f.id, f.project_id, f.object_key, f.filename,
              f.file_kind, f.media_type, f.checksum_sha256
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
        filename: String(row.filename),
        fileKind: String(row.file_kind),
        ...(row.media_type ? { mediaType: String(row.media_type) } : {}),
        checksumSha256: String(row.checksum_sha256)
      }
    : null;
}

export async function saveProtocolExtraction(
  db: D1Database,
  input: {
    id: string;
    projectId: string;
    protocolFileId: string;
    protocolChecksum: string;
    extraction: unknown;
    provider: string;
    model: string;
    promptVersion: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO protocol_extractions
       (id, project_id, protocol_file_id, protocol_checksum,
        extraction_json, provider, model, prompt_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.projectId,
      input.protocolFileId,
      input.protocolChecksum,
      JSON.stringify(input.extraction),
      input.provider,
      input.model,
      input.promptVersion,
      new Date().toISOString()
    )
    .run();
}

export async function getLatestProtocolExtraction(
  db: D1Database,
  projectId: string
): Promise<{
  id: string;
  projectId: string;
  protocolFileId: string;
  protocolChecksum: string;
  extraction: unknown;
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, protocol_file_id, protocol_checksum,
              extraction_json, provider, model, prompt_version, created_at
       FROM protocol_extractions
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(projectId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    protocolFileId: String(row.protocol_file_id),
    protocolChecksum: String(row.protocol_checksum),
    extraction: JSON.parse(String(row.extraction_json)),
    provider: String(row.provider),
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    createdAt: String(row.created_at)
  };
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

export async function saveAnalysisPlan(
  db: D1Database,
  plan: import("@methodome/analysis-contracts").AnalysisPlan
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analysis_plans
       (id, project_id, version, status, plan_json, locked_at, lock_hash,
        created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      plan.id,
      plan.projectId,
      plan.versionId,
      plan.status,
      JSON.stringify(plan),
      plan.lockedAt ?? null,
      plan.lockHash ?? null,
      plan.createdBy,
      plan.createdAt
    )
    .run();
}

export async function updateStoredAnalysisPlan(
  db: D1Database,
  plan: import("@methodome/analysis-contracts").AnalysisPlan
): Promise<void> {
  await db
    .prepare(
      `UPDATE analysis_plans
       SET status = ?, plan_json = ?, locked_at = ?, lock_hash = ?
       WHERE id = ? AND project_id = ?`
    )
    .bind(
      plan.status,
      JSON.stringify(plan),
      plan.lockedAt ?? null,
      plan.lockHash ?? null,
      plan.id,
      plan.projectId
    )
    .run();
}

export async function getLatestAnalysisPlan(
  db: D1Database,
  projectId: string
): Promise<import("@methodome/analysis-contracts").AnalysisPlan | null> {
  const row = await db
    .prepare(
      `SELECT plan_json
       FROM analysis_plans
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(projectId)
    .first<{ plan_json: string }>();

  return row
    ? (JSON.parse(row.plan_json) as import("@methodome/analysis-contracts").AnalysisPlan)
    : null;
}

export async function getAnalysisPlanById(
  db: D1Database,
  projectId: string,
  planId: string
): Promise<import("@methodome/analysis-contracts").AnalysisPlan | null> {
  const row = await db
    .prepare(
      `SELECT plan_json
       FROM analysis_plans
       WHERE project_id = ? AND id = ?
       LIMIT 1`
    )
    .bind(projectId, planId)
    .first<{ plan_json: string }>();

  return row
    ? (JSON.parse(row.plan_json) as import("@methodome/analysis-contracts").AnalysisPlan)
    : null;
}

export async function saveVariableMappings(
  db: D1Database,
  input: {
    projectId: string;
    studySpecificationId: string;
    mappings: Array<{
      id: string;
      researchConcept: string;
      datasetVariable?: string;
      mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
      evidence: string[];
      confirmedBy?: string;
    }>;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = input.mappings.map((mapping) =>
    db
      .prepare(
        `INSERT INTO variable_mappings
         (id, project_id, study_specification_id, research_concept,
          dataset_variable, mapping_status, evidence_json, confirmed_by,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           study_specification_id = excluded.study_specification_id,
           research_concept = excluded.research_concept,
           dataset_variable = excluded.dataset_variable,
           mapping_status = excluded.mapping_status,
           evidence_json = excluded.evidence_json,
           confirmed_by = excluded.confirmed_by,
           updated_at = excluded.updated_at`
      )
      .bind(
        mapping.id,
        input.projectId,
        input.studySpecificationId,
        mapping.researchConcept,
        mapping.datasetVariable ?? null,
        mapping.mappingStatus,
        JSON.stringify(mapping.evidence),
        mapping.confirmedBy ?? null,
        now,
        now
      )
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function listVariableMappings(
  db: D1Database,
  projectId: string
): Promise<Array<{
  id: string;
  researchConcept: string;
  datasetVariable?: string;
  mappingStatus: string;
  evidence: string[];
  confirmedBy?: string;
}>> {
  const result = await db
    .prepare(
      `SELECT vm.id, vm.research_concept, vm.dataset_variable,
              vm.mapping_status, vm.evidence_json, vm.confirmed_by
       FROM variable_mappings vm
       WHERE vm.project_id = ?
         AND vm.study_specification_id = (
           SELECT ss.id
           FROM study_specifications ss
           WHERE ss.project_id = ?
           ORDER BY ss.created_at DESC, ss.rowid DESC
           LIMIT 1
         )
       ORDER BY vm.research_concept ASC`
    )
    .bind(projectId, projectId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    researchConcept: String(row.research_concept),
    ...(row.dataset_variable ? { datasetVariable: String(row.dataset_variable) } : {}),
    mappingStatus: String(row.mapping_status),
    evidence: parseJson<string[]>(String(row.evidence_json ?? "[]"), []),
    ...(row.confirmed_by ? { confirmedBy: String(row.confirmed_by) } : {})
  }));
}

export async function getCurrentStudySpecificationRecord(
  db: D1Database,
  projectId: string
): Promise<{ id: string; version: string } | null> {
  const row = await db
    .prepare(
      `SELECT id, version
       FROM study_specifications
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(projectId)
    .first<{ id: string; version: string }>();

  return row ?? null;
}

export async function getDatasetVersionRecord(
  db: D1Database,
  datasetVersionId: string,
  projectId: string
): Promise<{
  id: string;
  projectId: string;
  objectKey: string;
  checksumSha256: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, object_key, checksum_sha256
       FROM dataset_versions
       WHERE id = ? AND project_id = ?
       LIMIT 1`
    )
    .bind(datasetVersionId, projectId)
    .first<Record<string, unknown>>();

  return row
    ? {
        id: String(row.id),
        projectId: String(row.project_id),
        objectKey: String(row.object_key),
        checksumSha256: String(row.checksum_sha256)
      }
    : null;
}

export async function getAnalysisJobForWorker(
  db: D1Database,
  jobId: string,
  projectId: string
): Promise<AnalysisJob | null> {
  const row = await db
    .prepare(
      `SELECT job_specification_json
       FROM analysis_jobs
       WHERE id = ? AND project_id = ?
       LIMIT 1`
    )
    .bind(jobId, projectId)
    .first<{ job_specification_json: string }>();

  return row ? (JSON.parse(row.job_specification_json) as AnalysisJob) : null;
}

export async function updateAnalysisJobState(
  db: D1Database,
  jobId: string,
  state: JobState,
  timestamps?: {
    startedAt?: string;
    completedAt?: string;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE analysis_jobs
       SET state = ?,
           started_at = COALESCE(?, started_at),
           completed_at = COALESCE(?, completed_at)
       WHERE id = ?`
    )
    .bind(
      state,
      timestamps?.startedAt ?? null,
      timestamps?.completedAt ?? null,
      jobId
    )
    .run();
}

export async function saveAnalysisResult(
  db: D1Database,
  input: {
    id: string;
    result: AnalysisResult;
    provenance: Record<string, unknown>;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analysis_results
       (id, analysis_job_id, result_json, provenance_json, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(analysis_job_id) DO UPDATE SET
         result_json = excluded.result_json,
         provenance_json = excluded.provenance_json,
         created_at = excluded.created_at`
    )
    .bind(
      input.id,
      input.result.jobId,
      JSON.stringify(input.result),
      JSON.stringify(input.provenance),
      new Date().toISOString()
    )
    .run();
}

export async function listAnalysisHistory(
  db: D1Database,
  userId: string
): Promise<Array<{
  jobId: string;
  projectId: string;
  projectName: string;
  methodId: string;
  datasetVersionId: string;
  state: JobState;
  createdAt: string;
  completedAt?: string;
}>> {
  const result = await db
    .prepare(
      `SELECT j.id AS job_id, j.project_id, p.name AS project_name,
              j.method_id, j.dataset_version_id, j.state,
              j.created_at, j.completed_at
       FROM analysis_jobs j
       JOIN projects p ON p.id = j.project_id
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.owner_id = ? OR pm.user_id = ?
       GROUP BY j.id
       ORDER BY j.created_at DESC`
    )
    .bind(userId, userId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    jobId: String(row.job_id),
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    methodId: String(row.method_id),
    datasetVersionId: String(row.dataset_version_id),
    state: String(row.state) as JobState,
    createdAt: String(row.created_at),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {})
  }));
}

export async function createTransformationEvent(
  db: D1Database,
  input: {
    id: string;
    projectId: string;
    outputDatasetVersionId: string;
    inputDatasetVersionIds: string[];
    operation: string;
    specification: Record<string, unknown>;
    reason?: string;
    createdBy: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO transformation_events
         (id, project_id, output_dataset_version_id, operation,
          specification_json, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.projectId,
        input.outputDatasetVersionId,
        input.operation,
        JSON.stringify(input.specification),
        input.reason ?? null,
        input.createdBy,
        now
      )
  ];

  for (const datasetVersionId of input.inputDatasetVersionIds) {
    statements.push(
      db
        .prepare(
          `INSERT INTO transformation_inputs
           (transformation_event_id, dataset_version_id)
           VALUES (?, ?)`
        )
        .bind(input.id, datasetVersionId)
    );
  }

  await db.batch(statements);
}

export async function deleteProjectRecord(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await db
    .prepare(
      "SELECT id FROM projects WHERE id = ? AND owner_id = ? LIMIT 1"
    )
    .bind(projectId, userId)
    .first<{ id: string }>();

  if (!project) return false;

  await db.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
  return true;
}

export async function userOwnsProjects(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM projects WHERE owner_id = ? LIMIT 1")
    .bind(userId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function deleteApplicationAndAuthUser(
  db: D1Database,
  userId: string
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
    db.prepare("DELETE FROM auth_user WHERE id = ?").bind(userId)
  ]);
}

export async function listProjectFiles(
  db: D1Database,
  projectId: string,
  fileKind?: string
): Promise<Array<{
  id: string;
  projectId: string;
  fileKind: string;
  filename: string;
  mediaType?: string;
  checksumSha256: string;
  sizeBytes?: number;
  createdBy: string;
  createdAt: string;
}>> {
  const statement = fileKind
    ? db
        .prepare(
          `SELECT id, project_id, file_kind, filename, media_type,
                  checksum_sha256, size_bytes, created_by, created_at
           FROM files
           WHERE project_id = ? AND file_kind = ?
           ORDER BY created_at DESC`
        )
        .bind(projectId, fileKind)
    : db
        .prepare(
          `SELECT id, project_id, file_kind, filename, media_type,
                  checksum_sha256, size_bytes, created_by, created_at
           FROM files
           WHERE project_id = ?
           ORDER BY created_at DESC`
        )
        .bind(projectId);

  const result = await statement.all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    fileKind: String(row.file_kind),
    filename: String(row.filename),
    ...(row.media_type ? { mediaType: String(row.media_type) } : {}),
    checksumSha256: String(row.checksum_sha256),
    ...(row.size_bytes != null ? { sizeBytes: Number(row.size_bytes) } : {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  }));
}


export async function createQualitativeAnalysis(
  db: D1Database,
  input: {
    analysis: QualitativeAnalysisRecord;
    segments: QualitativeSegment[];
  }
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO qualitative_analyses
         (id, project_id, research_question_id, status, source_file_ids_json,
          created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.analysis.id,
        input.analysis.projectId,
        input.analysis.researchQuestionId,
        input.analysis.status,
        JSON.stringify(input.analysis.sourceFileIds),
        input.analysis.createdBy,
        input.analysis.createdAt,
        input.analysis.updatedAt
      )
  ];

  for (const segment of input.segments) {
    statements.push(
      db
        .prepare(
          `INSERT INTO qualitative_segments
           (id, analysis_id, project_id, file_id, segment_index, text,
            start_char, end_char, coding_state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          segment.id,
          segment.analysisId,
          segment.projectId,
          segment.fileId,
          segment.segmentIndex,
          segment.text,
          segment.startChar,
          segment.endChar,
          segment.codingState,
          segment.createdAt
        )
    );
  }

  await db.batch(statements);
}

export async function listQualitativeAnalyses(
  db: D1Database,
  projectId: string
): Promise<QualitativeAnalysisRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, project_id, research_question_id, status,
              source_file_ids_json, created_by, created_at, updated_at
       FROM qualitative_analyses
       WHERE project_id = ?
       ORDER BY created_at ASC`
    )
    .bind(projectId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    researchQuestionId: String(row.research_question_id),
    status: String(row.status) as QualitativeAnalysisStatus,
    sourceFileIds: parseJson<string[]>(
      String(row.source_file_ids_json ?? "[]"),
      []
    ),
    createdBy: String(row.created_by),
    ...(row.reviewed_by ? { reviewedBy: String(row.reviewed_by) } : {}),
    ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }));
}

export async function getQualitativeAnalysis(
  db: D1Database,
  projectId: string,
  analysisId: string
): Promise<QualitativeAnalysisRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, research_question_id, status,
              source_file_ids_json, created_by, created_at, updated_at
       FROM qualitative_analyses
       WHERE project_id = ? AND id = ?
       LIMIT 1`
    )
    .bind(projectId, analysisId)
    .first<Record<string, unknown>>();

  return row
    ? {
        id: String(row.id),
        projectId: String(row.project_id),
        researchQuestionId: String(row.research_question_id),
        status: String(row.status) as QualitativeAnalysisStatus,
        sourceFileIds: parseJson<string[]>(
          String(row.source_file_ids_json ?? "[]"),
          []
        ),
        createdBy: String(row.created_by),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
      }
    : null;
}

export async function updateQualitativeAnalysisStatus(
  db: D1Database,
  projectId: string,
  analysisId: string,
  status: QualitativeAnalysisStatus
): Promise<void> {
  await db
    .prepare(
      `UPDATE qualitative_analyses
       SET status = ?, updated_at = ?
       WHERE project_id = ? AND id = ?`
    )
    .bind(status, new Date().toISOString(), projectId, analysisId)
    .run();
}

export async function listQualitativeSegments(
  db: D1Database,
  analysisId: string
): Promise<QualitativeSegment[]> {
  const result = await db
    .prepare(
      `SELECT id, analysis_id, project_id, file_id, segment_index,
              text, start_char, end_char, coding_state, created_at
       FROM qualitative_segments
       WHERE analysis_id = ?
       ORDER BY file_id ASC, segment_index ASC`
    )
    .bind(analysisId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    analysisId: String(row.analysis_id),
    projectId: String(row.project_id),
    fileId: String(row.file_id),
    segmentIndex: Number(row.segment_index),
    text: String(row.text),
    startChar: Number(row.start_char),
    endChar: Number(row.end_char),
    codingState: String(row.coding_state) as "uncoded" | "proposed" | "reviewed",
    createdAt: String(row.created_at)
  }));
}

export async function saveQualitativeCodebookVersion(
  db: D1Database,
  input: QualitativeCodebookVersion
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO qualitative_codebook_versions
       (id, analysis_id, version, source, codebook_json, model_json,
        created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.analysisId,
      input.version,
      input.source,
      JSON.stringify(input.codebook),
      input.model ? JSON.stringify(input.model) : null,
      input.createdBy,
      input.createdAt
    )
    .run();
}

export async function listQualitativeCodebookVersions(
  db: D1Database,
  analysisId: string
): Promise<QualitativeCodebookVersion[]> {
  const result = await db
    .prepare(
      `SELECT id, analysis_id, version, source, codebook_json, model_json,
              created_by, created_at
       FROM qualitative_codebook_versions
       WHERE analysis_id = ?
       ORDER BY version ASC`
    )
    .bind(analysisId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    analysisId: String(row.analysis_id),
    version: Number(row.version),
    source: String(row.source) as "model" | "researcher",
    codebook: parseJson<QualitativeCodebook>(
      String(row.codebook_json),
      { codes: [] }
    ),
    ...(row.model_json
      ? {
          model: parseJson<Record<string, unknown>>(
            String(row.model_json),
            {}
          )
        }
      : {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  }));
}

export async function upsertQualitativeCodings(
  db: D1Database,
  codings: QualitativeCoding[]
): Promise<void> {
  if (codings.length === 0) return;
  const statements = codings.map((coding) =>
    db
      .prepare(
        `INSERT INTO qualitative_codings
         (id, analysis_id, segment_id, code_id, status, source, rationale,
          created_by, reviewed_by, reviewed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(analysis_id, segment_id, code_id) DO UPDATE SET
           status = excluded.status,
           source = excluded.source,
           rationale = excluded.rationale,
           reviewed_by = excluded.reviewed_by,
           reviewed_at = excluded.reviewed_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        coding.id,
        coding.analysisId,
        coding.segmentId,
        coding.codeId,
        coding.status,
        coding.source,
        coding.rationale ?? null,
        coding.createdBy,
        coding.reviewedBy ?? null,
        coding.reviewedAt ?? null,
        coding.createdAt,
        coding.updatedAt
      )
  );
  await db.batch(statements);
}

export async function listQualitativeCodings(
  db: D1Database,
  analysisId: string
): Promise<QualitativeCoding[]> {
  const result = await db
    .prepare(
      `SELECT id, analysis_id, segment_id, code_id, status, source,
              rationale, created_by, reviewed_by, reviewed_at, created_at, updated_at
       FROM qualitative_codings
       WHERE analysis_id = ?
       ORDER BY segment_id ASC, code_id ASC`
    )
    .bind(analysisId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    analysisId: String(row.analysis_id),
    segmentId: String(row.segment_id),
    codeId: String(row.code_id),
    status: String(row.status) as "proposed" | "confirmed" | "rejected",
    source: String(row.source) as "model" | "researcher",
    ...(row.rationale ? { rationale: String(row.rationale) } : {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }));
}

export async function saveQualitativeThemeVersion(
  db: D1Database,
  input: QualitativeThemeVersion
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO qualitative_theme_versions
       (id, analysis_id, version, source, themes_json, synthesis, model_json,
        created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.analysisId,
      input.version,
      input.source,
      JSON.stringify(input.themes),
      input.synthesis,
      input.model ? JSON.stringify(input.model) : null,
      input.createdBy,
      input.createdAt
    )
    .run();
}

export async function listQualitativeThemeVersions(
  db: D1Database,
  analysisId: string
): Promise<QualitativeThemeVersion[]> {
  const result = await db
    .prepare(
      `SELECT id, analysis_id, version, source, themes_json, synthesis,
              model_json, created_by, created_at
       FROM qualitative_theme_versions
       WHERE analysis_id = ?
       ORDER BY version ASC`
    )
    .bind(analysisId)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    analysisId: String(row.analysis_id),
    version: Number(row.version),
    source: String(row.source) as "model" | "researcher",
    themes: parseJson<QualitativeTheme[]>(
      String(row.themes_json),
      []
    ),
    synthesis: String(row.synthesis),
    ...(row.model_json
      ? {
          model: parseJson<Record<string, unknown>>(
            String(row.model_json),
            {}
          )
        }
      : {}),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at)
  }));
}


export async function updateQualitativeSegmentCodingState(
  db: D1Database,
  analysisId: string,
  segmentIds: string[],
  codingState: "uncoded" | "proposed" | "reviewed"
): Promise<void> {
  if (segmentIds.length === 0) return;
  const statements = segmentIds.map((segmentId) =>
    db
      .prepare(
        `UPDATE qualitative_segments
         SET coding_state = ?
         WHERE analysis_id = ? AND id = ?`
      )
      .bind(codingState, analysisId, segmentId)
  );
  await db.batch(statements);
}
