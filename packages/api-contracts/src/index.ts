import type { Project, ProjectState, ResearchType } from "@methodome/domain";
import type { AnalysisJob, AnalysisPlan, AnalysisResult, JobState } from "@methodome/analysis-contracts";
import type { CandidateSelection } from "@methodome/method-registry";
import type { StudySpecification } from "@methodome/study-spec";
import type {
  QualitativeAnalysisRecord,
  QualitativeCodebook,
  QualitativeCodebookVersion,
  QualitativeCoding,
  QualitativeSegment,
  QualitativeThemeSet,
  QualitativeThemeVersion
} from "@methodome/qualitative-analysis";
import type {
  OrchestratorAutomaticAction,
  OrchestratorView,
  ProjectReadiness
} from "@methodome/workflow-engine";

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


export interface GetProjectReadinessResponse {
  readiness: ProjectReadiness;
  registryVersion: string;
  datasetVersionId?: string;
}

export interface GetProjectOrchestratorResponse {
  orchestrator: OrchestratorView;
  readiness: ProjectReadiness;
  registryVersion: string;
  datasetVersionId?: string;
}

export interface AdvanceProjectOrchestratorRequest {
  action?: OrchestratorAutomaticAction;
}

export interface AdvanceProjectOrchestratorResponse {
  advanced: boolean;
  mutation?:
    | { action: "extract_protocol"; researchQuestionCount: number }
    | { action: "create_draft_plan"; planId: string; analysisCount: number }
    | { action: "run_analyses"; queuedJobIds: string[] }
    | { action: "prepare_qualitative_analysis"; analysisId: string; segmentCount: number }
    | { action: "propose_qualitative_codebook"; analysisId: string; version: number; codeCount: number }
    | {
        action: "propose_qualitative_codings";
        analysisId: string;
        proposedSegments: number;
        proposedCodingCount?: number;
        remainingUncoded: number;
      }
    | { action: "propose_qualitative_themes"; analysisId: string; version: number; themeCount: number };
  orchestrator: OrchestratorView;
  readiness: ProjectReadiness;
  datasetVersionId?: string;
  message?: string;
}

export interface UpdateAnalysisPlanMethodsRequest {
  methodSelections: Array<{
    analysisId: string;
    methodId: string;
  }>;
}

export interface UpdateAnalysisPlanMethodsResponse {
  plan: AnalysisPlan;
}


export interface QualitativeAnalysisDetail {
  analysis: QualitativeAnalysisRecord;
  segments: QualitativeSegment[];
  codebookVersions: QualitativeCodebookVersion[];
  latestCodebook: QualitativeCodebookVersion | null;
  codings: QualitativeCoding[];
  themeVersions: QualitativeThemeVersion[];
  latestThemes: QualitativeThemeVersion | null;
}

export interface ListQualitativeAnalysesResponse {
  analyses: QualitativeAnalysisRecord[];
}

export interface CreateQualitativeAnalysisRequest {
  researchQuestionId: string;
  sourceFileIds?: string[];
}

export interface QualitativeAnalysisDetailResponse {
  detail: QualitativeAnalysisDetail | null;
}

export interface ConfirmQualitativeCodebookRequest {
  codebook: QualitativeCodebook;
}

export interface ProposeQualitativeCodingRequest {
  segmentIds?: string[];
}

export interface ReviewQualitativeCodingRequest {
  decisions?: Array<{
    segmentId: string;
    codeId: string;
    status: "confirmed" | "rejected";
    rationale?: string;
  }>;
  manualAssignments?: Array<{
    segmentId: string;
    codeId: string;
    rationale?: string;
  }>;
  reviewedSegmentIds?: string[];
}

export interface ConfirmQualitativeThemesRequest {
  themeSet: QualitativeThemeSet;
}
