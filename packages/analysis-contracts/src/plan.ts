import type {
  AnalysisPlanStatus,
  AnalysisPlanVersionId,
  DatasetVersionId,
  ProjectId,
  UserId
} from "@methodome/domain";

export interface PlannedAnalysis {
  id: string;
  researchQuestionId: string;
  outcome: string;
  predictors: string[];
  covariates: string[];
  candidateMethodIds: string[];
  selectedMethodId?: string;
  requiredDecisions: string[];
  warnings: string[];
  diagnostics: string[];
  addedAfterLock: boolean;
}

export interface AnalysisPlan {
  id: string;
  projectId: ProjectId;
  versionId: AnalysisPlanVersionId;
  datasetVersionId?: DatasetVersionId;
  studySpecificationVersion: string;
  status: AnalysisPlanStatus;
  analyses: PlannedAnalysis[];
  lockedAt?: string;
  lockHash?: string;
  createdBy: UserId;
  createdAt: string;
}
