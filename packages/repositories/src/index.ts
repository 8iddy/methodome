import type {
  AnalysisJobId,
  DatasetVersionId,
  Project,
  ProjectId,
  UserId
} from "@methodome/domain";
import type { AnalysisJob, AnalysisResult } from "@methodome/analysis-contracts";
import type { StudySpecification } from "@methodome/study-spec";
import type { HashedAuditEvent } from "@methodome/provenance";

export interface ProjectRepository {
  listForUser(userId: UserId): Promise<Project[]>;
  getById(projectId: ProjectId): Promise<Project | null>;
  create(project: Project): Promise<void>;
  update(project: Project): Promise<void>;
}

export interface DatasetRepository {
  getVersion(projectId: ProjectId, versionId: DatasetVersionId): Promise<unknown | null>;
  listVersions(projectId: ProjectId): Promise<unknown[]>;
}

export interface StudySpecificationRepository {
  getCurrent(projectId: ProjectId): Promise<StudySpecification | null>;
  save(projectId: ProjectId, specification: StudySpecification): Promise<void>;
}

export interface AnalysisRepository {
  createJob(job: AnalysisJob): Promise<void>;
  getJob(jobId: AnalysisJobId): Promise<AnalysisJob | null>;
  saveResult(result: AnalysisResult): Promise<void>;
  getResult(jobId: AnalysisJobId): Promise<AnalysisResult | null>;
}

export interface AuditRepository {
  append(event: HashedAuditEvent): Promise<void>;
  getHeadHash(projectId: ProjectId): Promise<string | null>;
  list(projectId: ProjectId): Promise<HashedAuditEvent[]>;
}
