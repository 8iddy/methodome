import type {
  AnalysisJobId,
  AnalysisPlanVersionId,
  DatasetVersionId,
  ProjectId,
  UserId
} from "@methodome/domain";

export interface AnalysisJob {
  jobId: AnalysisJobId;
  projectId: ProjectId;
  datasetVersionId: DatasetVersionId;
  analysisPlanVersionId?: AnalysisPlanVersionId;
  methodId: string;
  outcome?: string;
  predictors: string[];
  covariates: string[];
  cluster?: string;
  weights?: string;
  strata?: string;
  filters: Array<Record<string, unknown>>;
  missingDataStrategy?: string;
  requestedBy: UserId;
  overrideReason?: string;
  registryVersion: string;
  createdAt: string;
}

export type DiagnosticStatus = "passed" | "review" | "failed" | "not_applicable";

export interface DiagnosticResult {
  id: string;
  label: string;
  status: DiagnosticStatus;
  value?: string | number | boolean;
  message?: string;
}

export interface AnalysisEstimate {
  term: string;
  estimate: number;
  standardError?: number;
  statistic?: number;
  pValue?: number;
  confidenceInterval?: {
    level: number;
    lower: number;
    upper: number;
  };
  exponentiatedEstimate?: number;
}

export interface AnalysisSoftware {
  engine: "r" | "python";
  engineVersion: string;
  package: string;
  packageVersion: string;
  containerImageDigest?: string;
}

export interface AnalysisResult {
  jobId: AnalysisJobId;
  methodId: string;
  n: number;
  estimates: AnalysisEstimate[];
  diagnostics: DiagnosticResult[];
  warnings: string[];
  software: AnalysisSoftware;
  rawOutputObjectKey?: string;
}

export type JobState =
  | "queued"
  | "preparing_data"
  | "checking_requirements"
  | "running_model"
  | "running_diagnostics"
  | "preparing_results"
  | "complete"
  | "failed"
  | "cancelled";

export interface AnalysisRunner {
  run(job: AnalysisJob): Promise<AnalysisResult>;
  getStatus(jobId: AnalysisJobId): Promise<JobState>;
  cancel(jobId: AnalysisJobId): Promise<void>;
}
