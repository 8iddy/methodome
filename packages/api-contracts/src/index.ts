import type { Project, ProjectState, ResearchType } from "@methodome/domain";
import type { AnalysisJob, AnalysisResult, JobState } from "@methodome/analysis-contracts";
import type { CandidateSelection } from "@methodome/method-registry";
import type { StudySpecification } from "@methodome/study-spec";

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  researchType: ResearchType;
  state: ProjectState;
  updatedAt: string;
}

export interface ListProjectsResponse {
  projects: ProjectSummary[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  researchType: ResearchType;
}

export interface CreateProjectResponse {
  project: Project;
}

export interface GetStudySpecificationResponse {
  specification: StudySpecification | null;
}

export interface PutStudySpecificationRequest {
  specification: StudySpecification;
}

export interface PutStudySpecificationResponse {
  specification: StudySpecification;
}

export interface GetMethodCandidatesResponse {
  selections: CandidateSelection[];
  registryVersion: string;
}

export interface CreateAnalysisJobRequest {
  job: AnalysisJob;
}

export interface CreateAnalysisJobResponse {
  jobId: string;
  state: JobState;
}

export interface GetAnalysisJobResponse {
  job: AnalysisJob;
  state: JobState;
}

export interface GetAnalysisResultResponse {
  result: AnalysisResult;
}

export interface UploadIntentRequest {
  filename: string;
  mediaType?: string;
  fileKind: "protocol" | "instrument" | "codebook" | "dataset" | "transcript" | "other";
  sizeBytes?: number;
}

export interface UploadIntentResponse {
  fileId: string;
  objectKey: string;
  uploadUrl?: string;
}
