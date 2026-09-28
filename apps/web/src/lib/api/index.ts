const API_BASE =
  process.env.NEXT_PUBLIC_METHODOME_API_URL?.replace(/\/$/, "") ??
  "https://api.methodome.com/api";

const API_ORIGIN = API_BASE.replace(/\/api$/, "");

export class MethodomeApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "MethodomeApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  absolute = false
): Promise<T> {
  const url = absolute
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (
    init.body != null &&
    !(init.body instanceof FormData) &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    let payload: {
      error?: { code?: string; message?: string; details?: unknown };
      detail?: string;
    } = {};
    try {
      payload = await response.json();
    } catch {
      // Keep the HTTP fallback below.
    }
    throw new MethodomeApiError(
      response.status,
      payload.error?.code ?? "HTTP_ERROR",
      payload.error?.message ?? payload.detail ?? `Request failed with HTTP ${response.status}.`,
      payload.error?.details
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type ResearchType = "quantitative" | "qualitative" | "mixed_methods";

export interface BackendProject {
  id: string;
  name: string;
  description?: string;
  researchType: ResearchType;
  state: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetVersion {
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
}

export interface StudyVariable {
  concept: string;
  datasetVariable: string | null;
  variableType:
    | "binary"
    | "categorical_nominal"
    | "categorical_ordinal"
    | "count"
    | "continuous"
    | "time_to_event"
    | "date"
    | "text"
    | "unknown"
    | null;
  mappingStatus:
    | "direct_match"
    | "probable_match"
    | "uncertain"
    | "no_match"
    | null;
}

export interface StudySpecification {
  version: string;
  researchQuestions: Array<{
    id: string;
    text: string;
    objectiveType:
      | "descriptive"
      | "association"
      | "prediction"
      | "causal"
      | "diagnostic"
      | "prognostic"
      | "exploratory"
      | null;
    outcomes: StudyVariable[];
    predictors: StudyVariable[];
    covariates: StudyVariable[];
    estimand: string | null;
  }>;
  studyDesign:
    | "cross_sectional"
    | "cohort"
    | "case_control"
    | "trial"
    | "longitudinal"
    | "time_series"
    | "ecological"
    | "other";
  unitOfAnalysis: string;
  repeatedMeasures: boolean;
  clustered: boolean;
  clusterVariable: string | null;
  surveyWeights: boolean;
  weightVariable: string | null;
  stratified: boolean;
  strataVariable: string | null;
  samplingDesign: string | null;
  missingDataPlan: string | null;
  statedAnalysisPlan: string | null;
}

export interface DatasetVariableSchema {
  sourceDatasetVersionId?: string;
  variableName: string;
  label?: string;
  dataType: string;
  responseChoices?: Array<{ value: string | number; label: string }>;
}

export interface SchemaComparison {
  leftDatasetVersionId: string;
  rightDatasetVersionId: string;
  mappings: Array<{
    left: DatasetVariableSchema;
    right?: DatasetVariableSchema;
    status: "direct_match" | "probable_match" | "uncertain" | "no_match";
    evidence: string[];
    requiresConfirmation: boolean;
  }>;
  leftOnly: DatasetVariableSchema[];
  rightOnly: DatasetVariableSchema[];
}

export interface CandidateMethod {
  methodId: string;
  displayName: string;
  maturity: "validated" | "supported" | "experimental";
  executable: boolean;
  rationale: string;
  requiredChecks: string[];
  decisionRequired?: string;
}

export interface CandidateSelection {
  questionId: string;
  candidates: CandidateMethod[];
  warnings: string[];
  blockedReason?: string;
}

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
  projectId: string;
  versionId: string;
  datasetVersionId?: string;
  studySpecificationVersion: string;
  status: "preregistered" | "planned_before_analysis" | "exploratory";
  analyses: PlannedAnalysis[];
  lockedAt?: string;
  lockHash?: string;
  createdBy: string;
  createdAt: string;
}

export interface AnalysisResult {
  jobId: string;
  methodId: string;
  n: number;
  estimates: Array<{
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
  }>;
  diagnostics: Array<{
    id: string;
    label: string;
    status: "passed" | "review" | "failed" | "not_applicable";
    value?: string | number | boolean;
    message?: string;
  }>;
  warnings: string[];
  software: {
    engine: "r" | "python";
    engineVersion: string;
    package: string;
    packageVersion: string;
    containerImageDigest?: string;
  };
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}) {
  return request<unknown>("/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function signIn(input: { email: string; password: string }) {
  return request<unknown>("/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function signOut() {
  return request<unknown>("/auth/sign-out", { method: "POST" });
}

export async function getSession() {
  return request<{
    session?: { id: string; expiresAt: string };
    user?: { id: string; name: string; email: string };
  } | null>("/auth/get-session");
}

export async function getProjects() {
  return (await request<{ projects: BackendProject[] }>("/projects")).projects;
}

export async function createProject(input: {
  name: string;
  description?: string;
  researchType: ResearchType;
}) {
  return (
    await request<{ project: BackendProject }>("/projects", {
      method: "POST",
      body: JSON.stringify(input)
    })
  ).project;
}

export async function getProject(projectId: string) {
  return (
    await request<{ project: BackendProject }>(`/projects/${projectId}`)
  ).project;
}

export async function getDatasets(projectId: string) {
  return (
    await request<{ datasets: DatasetVersion[] }>(
      `/projects/${projectId}/datasets`
    )
  ).datasets;
}

export async function createUpload(
  projectId: string,
  input: {
    filename: string;
    mediaType?: string;
    fileKind:
      | "protocol"
      | "instrument"
      | "codebook"
      | "dataset"
      | "transcript"
      | "other";
    sizeBytes?: number;
  }
) {
  return request<{
    fileId: string;
    objectKey: string;
    uploadMethod: "PUT";
    uploadPath: string;
  }>(`/projects/${projectId}/uploads`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function uploadFile(
  uploadPath: string,
  file: File | Blob,
  mediaType = "application/octet-stream"
) {
  const url = uploadPath.startsWith("http")
    ? uploadPath
    : `${API_ORIGIN}${uploadPath}`;
  return request<{
    fileId: string;
    checksumSha256: string;
    sizeBytes: number;
  }>(
    url,
    {
      method: "PUT",
      headers: { "content-type": mediaType },
      body: file
    },
    true
  );
}

export async function registerDataset(
  projectId: string,
  input: {
    fileId: string;
    label: string;
    rowCount?: number;
    columnCount?: number;
  }
) {
  return request<{ datasetVersionId: string }>(
    `/projects/${projectId}/datasets`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export async function getStudySpecification(projectId: string) {
  return (
    await request<{ specification: StudySpecification | null }>(
      `/projects/${projectId}/study-specification`
    )
  ).specification;
}

export async function saveStudySpecification(
  projectId: string,
  specification: StudySpecification
) {
  return (
    await request<{ specification: StudySpecification }>(
      `/projects/${projectId}/study-specification`,
      {
        method: "PUT",
        body: JSON.stringify({ specification })
      }
    )
  ).specification;
}

export async function compareDatasetSchemas(
  projectId: string,
  input: {
    leftDatasetVersionId: string;
    rightDatasetVersionId: string;
    leftVariables: Array<{
      variableName: string;
      label?: string;
      dataType: string;
      responseChoices?: Array<{ value: string | number; label: string }>;
    }>;
    rightVariables: Array<{
      variableName: string;
      label?: string;
      dataType: string;
      responseChoices?: Array<{ value: string | number; label: string }>;
    }>;
  }
) {
  return (
    await request<{ comparison: SchemaComparison }>(
      `/projects/${projectId}/schema-comparison`,
      { method: "POST", body: JSON.stringify(input) }
    )
  ).comparison;
}

export async function getVariableMappings(projectId: string) {
  return (
    await request<{ mappings: Array<Record<string, unknown>> }>(
      `/projects/${projectId}/variable-mappings`
    )
  ).mappings;
}

export async function saveVariableMappings(
  projectId: string,
  mappings: Array<{
    id: string;
    researchConcept: string;
    datasetVariable?: string;
    mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
    evidence: string[];
    confirmed: boolean;
  }>
) {
  return request<{ mappings: Array<Record<string, unknown>> }>(
    `/projects/${projectId}/variable-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({ mappings })
    }
  );
}

export async function getMethodCandidates(projectId: string) {
  return request<{
    selections: CandidateSelection[];
    registryVersion: string;
  }>(`/projects/${projectId}/method-candidates`);
}

export async function getMethods() {
  return request<{
    registryVersion: string;
    methods: Array<Record<string, unknown>>;
  }>("/methods");
}

export async function getAnalysisPlan(projectId: string) {
  return (
    await request<{ plan: AnalysisPlan | null }>(
      `/projects/${projectId}/analysis-plan`
    )
  ).plan;
}

export async function createAnalysisPlan(
  projectId: string,
  input: {
    versionId: string;
    datasetVersionId?: string;
    status: "preregistered" | "planned_before_analysis" | "exploratory";
    analyses: PlannedAnalysis[];
  }
) {
  return (
    await request<{ plan: AnalysisPlan }>(
      `/projects/${projectId}/analysis-plan`,
      { method: "POST", body: JSON.stringify(input) }
    )
  ).plan;
}

export async function lockAnalysisPlan(projectId: string, planId: string) {
  return (
    await request<{ plan: AnalysisPlan }>(
      `/projects/${projectId}/analysis-plan/${planId}/lock`,
      { method: "POST" }
    )
  ).plan;
}

export async function createAnalysisJob(
  projectId: string,
  input: {
    datasetVersionId: string;
    analysisPlanId?: string;
    methodId: string;
    outcome?: string;
    predictors?: string[];
    covariates?: string[];
    cluster?: string;
    weights?: string;
    strata?: string;
    filters?: Array<Record<string, unknown>>;
    missingDataStrategy?: string;
    overrideReason?: string;
  }
) {
  return request<{ jobId: string; state: string }>(
    `/projects/${projectId}/analysis-jobs`,
    {
      method: "POST",
      body: JSON.stringify({
        predictors: [],
        covariates: [],
        filters: [],
        ...input
      })
    }
  );
}

export async function getAnalysisJob(jobId: string) {
  return request<{ job: Record<string, unknown>; state: string }>(
    `/analysis-jobs/${jobId}`
  );
}

export async function getAnalysisResult(jobId: string) {
  return (
    await request<{ result: AnalysisResult }>(
      `/analysis-jobs/${jobId}/result`
    )
  ).result;
}

export async function getAnalysisHistory() {
  return (
    await request<{ analyses: Array<Record<string, unknown>> }>(
      "/analysis-history"
    )
  ).analyses;
}

export async function getAuditTrail(projectId: string) {
  return (
    await request<{ events: Array<Record<string, unknown>> }>(
      `/projects/${projectId}/audit`
    )
  ).events;
}

export async function getProjectPolicy(projectId: string) {
  return (
    await request<{ policy: Record<string, unknown> | null }>(
      `/projects/${projectId}/policy`
    )
  ).policy;
}

export async function updateProjectPolicy(
  projectId: string,
  policy: Record<string, unknown>
) {
  return (
    await request<{ policy: Record<string, unknown> }>(
      `/projects/${projectId}/policy`,
      { method: "PUT", body: JSON.stringify(policy) }
    )
  ).policy;
}

export { API_BASE };


export async function appendDatasets(
  projectId: string,
  input: {
    sourceDatasetVersionIds: string[];
    label: string;
    reason?: string;
    mappings: Array<{
      sourceDatasetVersionId: string;
      sourceVariable: string;
      targetVariable: string;
      categoryMap?: Record<string, string>;
    }>;
  }
) {
  return request<{
    datasetVersionId: string;
    checksumSha256: string;
    rowCount: number;
    columnCount: number;
  }>(`/projects/${projectId}/datasets/append`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function deleteProject(projectId: string) {
  return request<void>(`/projects/${projectId}`, { method: "DELETE" });
}

export async function deleteAccount() {
  return request<void>("/account", { method: "DELETE" });
}


export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  variables: Array<{
    variableName: string;
    label?: string;
    dataType: string;
    missingCount: number;
    uniqueCount: number;
    responseChoices?: Array<{ value: string | number; label: string }>;
    range?: { min: number; max: number };
  }>;
}

export async function getDatasetProfile(
  projectId: string,
  datasetVersionId: string
) {
  return (
    await request<{ profile: DatasetProfile }>(
      `/projects/${projectId}/datasets/${datasetVersionId}/profile`
    )
  ).profile;
}
