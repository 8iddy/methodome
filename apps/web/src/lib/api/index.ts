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


export type WorkflowStageStatus =
  | "missing"
  | "needs_review"
  | "reviewed_with_gaps"
  | "ready"
  | "locked"
  | "complete"
  | "blocked";

export type OrchestratorAutomaticAction =
  | "extract_protocol"
  | "map_variables"
  | "create_draft_plan"
  | "run_analyses"
  | "prepare_qualitative_analysis"
  | "propose_qualitative_codebook"
  | "propose_qualitative_codings"
  | "propose_qualitative_themes";

export interface WorkflowAction {
  code: string;
  label: string;
  detail: string;
  targetSection: string;
  requiresResearcher: boolean;
}

export interface OrchestratorDecision {
  id: string;
  kind:
    | "provide_input"
    | "confirm_study_design"
    | "review_mapping"
    | "resolve_mapping_gap"
    | "select_method"
    | "approve_plan"
    | "review_qualitative_codebook"
    | "review_qualitative_codings"
    | "review_qualitative_themes"
    | "review_results";
  prompt: string;
  questionId?: string;
  analysisId?: string;
  options?: Array<{ id: string; label: string; detail?: string }>;
  blocking: boolean;
}

export interface OrchestratorTask {
  id: string;
  label: string;
  status: "pending" | "ready" | "waiting" | "complete" | "blocked";
  detail: string;
}

export interface QuestionReadiness {
  questionId: string;
  text: string;
  objectiveType: string | null;
  mode: "quantitative" | "qualitative" | "unknown";
  status: string;
  variables: Array<{
    concept: string;
    role: "outcome" | "predictor" | "covariate";
    datasetVariable?: string;
    mappingStatus?: "direct_match" | "probable_match" | "uncertain" | "no_match";
    confirmed: boolean;
    represented: boolean;
  }>;
  blockers: Array<{
    code: string;
    message: string;
    questionId: string;
    concept?: string;
    role?: "outcome" | "predictor" | "covariate";
  }>;
  candidates: Array<Record<string, unknown>>;
  warnings: string[];
  qualitativeWorkstream?: {
    id: string;
    researchQuestionId: string;
    status: string;
  };
}

export interface ProjectReadiness {
  stages: {
    protocol: WorkflowStageStatus;
    data: WorkflowStageStatus;
    studyDesign: WorkflowStageStatus;
    mappings: WorkflowStageStatus;
    plan: WorkflowStageStatus;
    analysis: WorkflowStageStatus;
  };
  mappingSummary: {
    status: WorkflowStageStatus;
    reviewedCount: number;
    totalConcepts: number;
    representedCount: number;
    gapCount: number;
    unreviewedCount: number;
  };
  questions: QuestionReadiness[];
  nextAction: WorkflowAction;
  guidance: {
    visible: boolean;
    reason: "next_action_elsewhere" | "already_on_action_surface";
  };
}

export interface OrchestratorView {
  status:
    | "working"
    | "waiting_for_researcher"
    | "ready_to_execute"
    | "complete"
    | "blocked";
  summary: string;
  tasks: OrchestratorTask[];
  decisions: OrchestratorDecision[];
  automaticAction?: OrchestratorAutomaticAction;
  nextAction: WorkflowAction;
}

export interface QualitativeCode {
  id: string;
  label: string;
  definition: string;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
}

export interface QualitativeCodebook {
  codes: QualitativeCode[];
}

export interface QualitativeSegment {
  id: string;
  analysisId: string;
  projectId: string;
  fileId: string;
  segmentIndex: number;
  text: string;
  startChar: number;
  endChar: number;
  codingState: "uncoded" | "proposed" | "reviewed";
  createdAt: string;
}

export interface QualitativeCoding {
  id: string;
  analysisId: string;
  segmentId: string;
  codeId: string;
  status: "proposed" | "confirmed" | "rejected";
  source: "model" | "researcher";
  rationale?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualitativeAnalysisRecord {
  id: string;
  projectId: string;
  researchQuestionId: string;
  status: string;
  sourceFileIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualitativeCodebookVersion {
  id: string;
  analysisId: string;
  version: number;
  source: "model" | "researcher";
  codebook: QualitativeCodebook;
  createdBy: string;
  createdAt: string;
}

export interface QualitativeTheme {
  id: string;
  label: string;
  summary: string;
  codeIds: string[];
  evidenceSegmentIds: string[];
}

export interface QualitativeThemeVersion {
  id: string;
  analysisId: string;
  version: number;
  source: "model" | "researcher";
  themes: QualitativeTheme[];
  synthesis: string;
  createdBy: string;
  createdAt: string;
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

export interface ProjectFile {
  id: string;
  projectId: string;
  fileKind: string;
  filename: string;
  mediaType?: string;
  checksumSha256: string;
  sizeBytes?: number;
  createdBy: string;
  createdAt: string;
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
      | "qualitative"
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

export interface ProtocolExtraction {
  studyTitle: string | null;
  objectives: string[];
  hypotheses: string[];
  researchQuestions: Array<{
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
    outcomes: string[];
    predictors: string[];
    covariates: string[];
    estimand: string | null;
  }>;
  studyDesign: StudySpecification["studyDesign"] | null;
  unitOfAnalysis: string | null;
  population: string | null;
  samplingDesign: string | null;
  repeatedMeasures: boolean | null;
  clustered: boolean | null;
  clusterConcept: string | null;
  surveyWeights: boolean | null;
  weightConcept: string | null;
  stratified: boolean | null;
  strataConcept: string | null;
  missingDataPlan: string | null;
  statedAnalysisPlan: string | null;
  provenance?: {
    id: string;
    protocolFileId: string;
    protocolChecksum: string;
    provider: string;
    model: string;
    promptVersion: string;
    createdAt: string;
  };
}

export interface VariableMapping {
  id: string;
  researchConcept: string;
  datasetVariable?: string;
  mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
  evidence: string[];
  confirmedBy?: string;
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

export interface MethodRegistryEntry {
  id: string;
  displayName: string;
  family: string;
  maturity: "validated" | "supported" | "experimental";
  executable: boolean;
  outcomeTypes: string[];
  supportsClustering: boolean;
  supportsRepeatedMeasures: boolean;
  supportsSurveyWeights: boolean;
  assumptions: string[];
  diagnostics: string[];
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

export interface AuthConfig {
  turnstileRequired: boolean;
  turnstileSiteKey: string | null;
  emailVerificationRequired: boolean;
}

export async function getAuthConfig() {
  return request<AuthConfig>("/auth-config");
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  turnstileToken?: string;
}) {
  return request<unknown>("/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function verifyEmailOtp(input: {
  email: string;
  otp: string;
}) {
  return request<unknown>("/auth/email-otp/verify-email", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function resendEmailVerificationOtp(email: string) {
  return request<unknown>("/auth/email-otp/send-verification-otp", {
    method: "POST",
    body: JSON.stringify({
      email,
      type: "email-verification"
    })
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

export async function getProjectFiles(projectId: string, kind?: string) {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return (
    await request<{ files: ProjectFile[] }>(
      `/projects/${projectId}/files${query}`
    )
  ).files;
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

export async function getProtocolExtraction(projectId: string) {
  return (
    await request<{ extraction: ProtocolExtraction | null }>(
      `/projects/${projectId}/protocol-extraction`
    )
  ).extraction;
}

export async function extractProtocol(projectId: string, fileId?: string) {
  return (
    await request<{ extraction: ProtocolExtraction }>(
      `/projects/${projectId}/protocol-extraction`,
      {
        method: "POST",
        body: JSON.stringify(fileId ? { fileId } : {})
      }
    )
  ).extraction;
}

export async function getVariableMappingSuggestions(projectId: string) {
  return request<{
    datasetVersionId: string;
    variables: DatasetProfile["variables"];
    suggestions: Array<{
      researchConcept: string;
      datasetVariable?: string;
      mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
      evidence: string[];
    }>;
  }>(`/projects/${projectId}/variable-mapping-suggestions`);
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
    await request<{ mappings: VariableMapping[] }>(
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
    methods: MethodRegistryEntry[];
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


export async function getProjectReadiness(projectId: string, section?: string) {
  const query = section ? `?section=${encodeURIComponent(section)}` : "";
  return request<{
    readiness: ProjectReadiness;
    registryVersion: string;
    datasetVersionId?: string;
  }>(`/projects/${projectId}/readiness${query}`);
}

export async function getProjectOrchestrator(projectId: string) {
  return request<{
    orchestrator: OrchestratorView;
    readiness: ProjectReadiness;
    registryVersion: string;
    datasetVersionId?: string;
  }>(`/projects/${projectId}/orchestrator`);
}

export interface ProjectConversationMessage {
  id: string;
  projectId: string;
  role: "researcher" | "methodome" | "activity" | "system";
  messageKind: "message" | "checkpoint" | "result" | "activity" | "error";
  content: string;
  metadata: Record<string, unknown>;
  attachmentFileIds: string[];
  createdAt: string;
}

export async function getProjectConversation(projectId: string) {
  return request<{
    messages: ProjectConversationMessage[];
    orchestrator: OrchestratorView;
    methodologyKnowledgeVersion: string;
  }>(`/projects/${projectId}/conversation`);
}

export async function sendProjectConversationMessage(
  projectId: string,
  content: string,
  attachmentFileIds: string[] = []
) {
  return request<{ messageId: string; runId: string | null; queued: boolean }>(
    `/projects/${projectId}/conversation/messages`,
    { method: "POST", body: JSON.stringify({ content, attachmentFileIds }) }
  );
}

export async function askProjectAssistant(
  projectId: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
) {
  return request<{
    reply: string;
    grounded: boolean;
    modelUsed: boolean;
  }>(`/projects/${projectId}/assistant`, {
    method: "POST",
    body: JSON.stringify({ message, history })
  });
}

export async function advanceProjectOrchestrator(
  projectId: string,
  action?: OrchestratorAutomaticAction
) {
  return request<{
    advanced: boolean;
    orchestrator: OrchestratorView;
    readiness: ProjectReadiness;
    datasetVersionId?: string;
    message?: string;
    mutation?: Record<string, unknown>;
  }>(`/projects/${projectId}/orchestrator/advance`, {
    method: "POST",
    body: JSON.stringify(action ? { action } : {})
  });
}

export async function updateAnalysisPlanMethods(
  projectId: string,
  planId: string,
  methodSelections: Array<{ analysisId: string; methodId: string }>
) {
  return request<{ plan: AnalysisPlan }>(
    `/projects/${projectId}/analysis-plan/${planId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ methodSelections })
    }
  );
}

export async function getQualitativeAnalyses(projectId: string) {
  return (
    await request<{ analyses: QualitativeAnalysisRecord[] }>(
      `/projects/${projectId}/qualitative-analyses`
    )
  ).analyses;
}

export async function getQualitativeAnalysis(
  projectId: string,
  analysisId: string
) {
  return (
    await request<{ detail: QualitativeAnalysisDetail | null }>(
      `/projects/${projectId}/qualitative-analyses/${analysisId}`
    )
  ).detail;
}

export async function confirmQualitativeCodebook(
  projectId: string,
  analysisId: string,
  codebook: QualitativeCodebook
) {
  return request<{ detail: QualitativeAnalysisDetail }>(
    `/projects/${projectId}/qualitative-analyses/${analysisId}/codebook`,
    {
      method: "PUT",
      body: JSON.stringify({ codebook })
    }
  );
}

export async function reviewQualitativeCodings(
  projectId: string,
  analysisId: string,
  input: {
    decisions: Array<{
      segmentId: string;
      codeId: string;
      status: "confirmed" | "rejected";
      rationale?: string;
    }>;
    manualAssignments: Array<{
      segmentId: string;
      codeId: string;
      rationale?: string;
    }>;
    reviewedSegmentIds: string[];
  }
) {
  return request<{ detail: QualitativeAnalysisDetail }>(
    `/projects/${projectId}/qualitative-analyses/${analysisId}/codings`,
    {
      method: "PUT",
      body: JSON.stringify(input)
    }
  );
}

export async function confirmQualitativeThemes(
  projectId: string,
  analysisId: string,
  themeSet: { themes: QualitativeTheme[]; synthesis: string }
) {
  return request<{ detail: QualitativeAnalysisDetail }>(
    `/projects/${projectId}/qualitative-analyses/${analysisId}/themes`,
    {
      method: "PUT",
      body: JSON.stringify({ themeSet })
    }
  );
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
