import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { parseStudySpecification, type StudySpecification } from "@methodome/study-spec";
import {
  methodRegistry,
  registryVersion,
  selectCandidateMethods
} from "@methodome/method-registry";
import {
  hashAuditEvent,
  sha256BytesHex,
  type AuditEventPayload
} from "@methodome/provenance";
import type { AnalysisJob, AnalysisPlan, PlannedAnalysis } from "@methodome/analysis-contracts";
import {
  createAnalysisPlan as buildAnalysisPlan,
  lockAnalysisPlan,
  updateAnalysisMethodSelections
} from "@methodome/analysis-plan";
import type { Project } from "@methodome/domain";
import { assertModelRequestAllowed, type ProjectProcessingPolicy } from "@methodome/policy-engine";
import { compareDatasetSchemas } from "@methodome/schema-harmonisation";
import {
  codingProposalSchema,
  qualitativeCodebookSchema,
  qualitativeThemeSetSchema,
  segmentQualitativeText,
  validateThemeReferences,
  type QualitativeCodebook,
  type QualitativeCoding,
  type QualitativeSegment
} from "@methodome/qualitative-analysis";
import {
  assessProjectReadiness,
  buildOrchestratorView,
  type WorkflowSection
} from "@methodome/workflow-engine";
import { requireAuth } from "./auth";
import { consumeAnalysisQueue } from "./analysis-worker";
import { createAuth, emailVerificationEnabled } from "./better-auth";
import { turnstileConfigurationIncomplete, turnstileEnabled, validateTurnstile } from "./auth-security";
import type { Env, Variables } from "./env";
import { makeId } from "./id";
import {
  extractProtocolWithAi,
  protocolExtractionSchema,
  PROTOCOL_EXTRACTION_MODEL,
  PROTOCOL_EXTRACTION_PROMPT_VERSION,
  researchFileToText,
  suggestMappingsWithAi
} from "./protocol-extraction";
import {
  modelProvenance as qualitativeModelProvenance,
  proposeQualitativeCodebook,
  proposeQualitativeCodings,
  proposeQualitativeThemes,
  QUALITATIVE_CODEBOOK_PROMPT_VERSION,
  QUALITATIVE_CODING_PROMPT_VERSION,
  QUALITATIVE_MODEL,
  QUALITATIVE_THEME_PROMPT_VERSION
} from "./qualitative-analysis";
import {
  appendAuditEvent,
  createAnalysisJob,
  createDatasetVersion,
  createFileRecord,
  createTransformationEvent,
  createProject,
  datasetBelongsToProject,
  deleteApplicationAndAuthUser,
  deleteProjectRecord,
  finaliseFileChecksum,
  getAnalysisJob,
  getAnalysisPlanById,
  getAnalysisResult,
  getAuditHeadHash,
  getCurrentStudySpecificationRecord,
  getDatasetVersionRecord,
  getFileForDatasetRegistration,
  getFileRecord,
  getProject,
  getProjectPolicy,
  getStudySpecification,
  getLatestAnalysisPlan,
  getLatestProtocolExtraction,
  listAnalysisHistory,
  listAnalysisJobsForPlan,
  listAuditEvents,
  listQualitativeAnalyses,
  getQualitativeAnalysis,
  listQualitativeSegments,
  listQualitativeCodebookVersions,
  listQualitativeCodings,
  listQualitativeThemeVersions,
  listDatasetVersions,
  listProjectFiles,
  listVariableMappings,
  listProjects,
  saveAnalysisPlan,
  saveProtocolExtraction,
  createQualitativeAnalysis,
  saveQualitativeCodebookVersion,
  upsertQualitativeCodings,
  saveQualitativeThemeVersion,
  updateQualitativeAnalysisStatus,
  updateQualitativeSegmentCodingState,
  saveStudySpecification,
  saveVariableMappings,
  updateProjectPolicy,
  updateStoredAnalysisPlan,
  userOwnsProjects
} from "./db";

type AppBindings = { Bindings: Env; Variables: Variables };

const app = new Hono<AppBindings>().basePath("/api");

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = allowedOrigins(c.env);
      return allowed.includes(origin) ? origin : allowed[0] ?? "";
    },
    allowHeaders: [
      "Content-Type",
      "x-methodome-user-id",
      "x-methodome-user-email"
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400
  })
);

app.get("/health", (c) =>
  c.json({
    service: "methodome-api",
    status: "ok",
    environment: c.env.APP_ENV
  })
);

app.get("/auth-config", (c) => {
  return c.json({
    turnstileRequired: turnstileEnabled(c.env),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null,
    emailVerificationRequired: emailVerificationEnabled(c.env)
  });
});

app.post("/auth/sign-up/email", async (c) => {
  if (c.env.AUTH_MODE !== "better_auth" || !c.env.BETTER_AUTH_SECRET) {
    return c.json(
      {
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message: "Production authentication has not been enabled."
        }
      },
      503
    );
  }

  if (turnstileConfigurationIncomplete(c.env)) {
    return c.json(
      {
        error: {
          code: "TURNSTILE_CONFIG_INCOMPLETE",
          message: "Account bot protection is not completely configured."
        }
      },
      503
    );
  }

  const body = await c.req.json().catch(() => null) as
    | {
        name?: string;
        email?: string;
        password?: string;
        turnstileToken?: string;
      }
    | null;

  if (!body) {
    return c.json(
      {
        error: {
          code: "INVALID_SIGN_UP",
          message: "Account details are invalid."
        }
      },
      400
    );
  }

  if (turnstileEnabled(c.env)) {
    const token = body.turnstileToken?.trim();
    if (!token) {
      return c.json(
        {
          error: {
            code: "TURNSTILE_REQUIRED",
            message: "Complete the bot check before creating an account."
          }
        },
        400
      );
    }

    const result = await validateTurnstile(
      c.env,
      token,
      c.req.header("cf-connecting-ip")
    );
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "TURNSTILE_FAILED",
            message: "The bot check could not be verified. Try again.",
            details: result["error-codes"] ?? []
          }
        },
        400
      );
    }
  }

  const { turnstileToken: _turnstileToken, ...authBody } = body;
  const headers = new Headers(c.req.raw.headers);
  headers.set("content-type", "application/json");

  return createAuth(c.env).handler(
    new Request(c.req.raw.url, {
      method: "POST",
      headers,
      body: JSON.stringify(authBody)
    })
  );
});

app.all("/auth/*", async (c) => {
  if (c.env.AUTH_MODE !== "better_auth" || !c.env.BETTER_AUTH_SECRET) {
    return c.json(
      {
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message: "Production authentication has not been enabled."
        }
      },
      503
    );
  }

  return createAuth(c.env).handler(c.req.raw);
});

app.use("*", async (c, next) => {
  if (
    c.req.path === "/api/health" ||
    c.req.path === "/api/methods" ||
    c.req.path === "/api/auth-config" ||
    c.req.path.startsWith("/api/auth/")
  ) {
    return next();
  }
  return requireAuth(c, next);
});

async function requireProject(c: Parameters<typeof getUserId>[0], projectId: string) {
  const project = await getProject(c.env.DB, projectId, getUserId(c));
  if (!project) {
    return {
      response: c.json(
        { error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." } },
        404
      )
    };
  }
  return { project };
}

function getUserId(c: import("hono").Context<AppBindings>): string {
  return c.get("userId");
}

async function addAudit(
  c: import("hono").Context<AppBindings>,
  input: Omit<AuditEventPayload, "id" | "userId" | "timestamp">
) {
  const previousHash = await getAuditHeadHash(c.env.DB, input.projectId);
  const event = await hashAuditEvent(
    {
      ...input,
      id: makeId("evt"),
      userId: getUserId(c),
      timestamp: new Date().toISOString()
    },
    previousHash
  );
  await appendAuditEvent(c.env.DB, event);
  return event;
}


async function profileDatasetForProject(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  datasetVersionId: string
): Promise<{
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
}> {
  if (!c.env.FILES || c.env.STORAGE_MODE !== "r2") {
    throw new Error("R2 storage is required for dataset profiling.");
  }
  const dataset = await getDatasetVersionRecord(c.env.DB, datasetVersionId, projectId);
  if (!dataset) throw new Error("Dataset version was not found.");
  const object = await c.env.FILES.get(dataset.objectKey);
  if (!object) throw new Error("Stored dataset object was not found.");
  const response = await c.env.STATS.fetch(
    new Request("https://methodome-stats.internal/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: await object.text() })
    })
  );
  if (!response.ok) {
    throw new Error(`Dataset profiling failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as {
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
  };
}

function normalizeConcept(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function resolveStudySpecificationForMethods(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  specification: StudySpecification,
  requestedDatasetVersionId?: string
): Promise<{ specification: StudySpecification; datasetVersionId?: string }> {
  const [mappings, datasets] = await Promise.all([
    listVariableMappings(c.env.DB, projectId),
    listDatasetVersions(c.env.DB, projectId)
  ]);
  const confirmed = new Map(
    mappings
      .filter((mapping) => mapping.confirmedBy && mapping.datasetVariable)
      .map((mapping) => [normalizeConcept(mapping.researchConcept), mapping])
  );
  const preferred = requestedDatasetVersionId
    ? datasets.find((dataset) => dataset.id === requestedDatasetVersionId)
    : datasets.find((dataset) => dataset.sourceKind === "derived") ?? datasets[0];
  if (!preferred) return { specification };

  let profile: Awaited<ReturnType<typeof profileDatasetForProject>>;
  try {
    profile = await profileDatasetForProject(c, projectId, preferred.id);
  } catch {
    return { specification, datasetVersionId: preferred.id };
  }
  const byName = new Map(profile.variables.map((variable) => [variable.variableName, variable]));

  const resolved = structuredClone(specification);
  for (const question of resolved.researchQuestions) {
    for (const variable of [
      ...question.outcomes,
      ...question.predictors,
      ...question.covariates
    ]) {
      const mapping = confirmed.get(normalizeConcept(variable.concept));
      if (!mapping?.datasetVariable) continue;
      const profiled = byName.get(mapping.datasetVariable);
      variable.datasetVariable = mapping.datasetVariable;
      variable.mappingStatus = mapping.mappingStatus as typeof variable.mappingStatus;
      const profiledType =
        profiled?.dataType && [
          "binary",
          "categorical_nominal",
          "categorical_ordinal",
          "count",
          "continuous",
          "time_to_event",
          "date",
          "text",
          "unknown"
        ].includes(profiled.dataType)
          ? (profiled.dataType as typeof variable.variableType)
          : null;
      if (!variable.variableType || variable.variableType === "unknown") {
        variable.variableType = profiledType ?? variable.variableType;
      }
      variable.observedLevelCount =
        profiled?.uniqueCount ?? variable.observedLevelCount;
    }
  }

  return { specification: resolved, datasetVersionId: preferred.id };
}

async function computeProjectReadiness(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  currentSection?: WorkflowSection
) {
  const [
    files,
    datasets,
    specification,
    mappings,
    plan,
    history,
    extraction,
    qualitativeAnalyses
  ] = await Promise.all([
    listProjectFiles(c.env.DB, projectId),
    listDatasetVersions(c.env.DB, projectId),
    getStudySpecification(c.env.DB, projectId),
    listVariableMappings(c.env.DB, projectId),
    getLatestAnalysisPlan(c.env.DB, projectId),
    listAnalysisHistory(c.env.DB, getUserId(c)),
    getLatestProtocolExtraction(c.env.DB, projectId),
    listQualitativeAnalyses(c.env.DB, projectId)
  ]);

  let selections: ReturnType<typeof selectCandidateMethods>[] = [];
  let resolvedDatasetVersionId: string | undefined;
  let resolvedSpecification = specification;

  if (specification) {
    const resolved = await resolveStudySpecificationForMethods(
      c,
      projectId,
      specification
    );
    resolvedDatasetVersionId = resolved.datasetVersionId;
    resolvedSpecification = resolved.specification;
    selections = resolved.specification.researchQuestions.map((question) =>
      selectCandidateMethods(resolved.specification, question.id)
    );
  }

  const projectHistory = history.filter((item) => item.projectId === projectId);
  const planJobs = plan
    ? await listAnalysisJobsForPlan(c.env.DB, projectId, plan.id)
    : [];
  const completedPlanSignatures = new Set(
    planJobs
      .filter(({ state }) => state === "complete")
      .map(({ job }) => analysisJobSignature(job))
  );
  const completedAnalysisCount = Math.min(
    plan?.analyses.length ?? 0,
    completedPlanSignatures.size
  );

  const readiness = assessProjectReadiness(
    {
      hasProtocol: files.some((file) => file.fileKind === "protocol"),
      hasProtocolExtraction: Boolean(extraction),
      transcriptCount: files.filter((file) => file.fileKind === "transcript").length,
      datasetCount: datasets.length,
      hasDerivedDataset: datasets.some((dataset) => dataset.sourceKind === "derived"),
      specification,
      mappings: mappings.map((mapping) => ({
        researchConcept: mapping.researchConcept,
        ...(mapping.datasetVariable
          ? { datasetVariable: mapping.datasetVariable }
          : {}),
        mappingStatus: mapping.mappingStatus as
          | "direct_match"
          | "probable_match"
          | "uncertain"
          | "no_match",
        ...(mapping.confirmedBy ? { confirmedBy: mapping.confirmedBy } : {})
      })),
      selections,
      plan,
      completedAnalysisCount,
      qualitativeWorkstreams: qualitativeAnalyses.map((analysis) => ({
        id: analysis.id,
        researchQuestionId: analysis.researchQuestionId,
        status: analysis.status
      }))
    },
    currentSection
  );

  return {
    readiness,
    files,
    datasets,
    specification,
    resolvedSpecification,
    mappings,
    plan,
    history: projectHistory,
    extraction,
    qualitativeAnalyses,
    selections,
    ...(resolvedDatasetVersionId
      ? { resolvedDatasetVersionId }
      : {})
  };
}


async function runProtocolExtractionForProject(
  c: import("hono").Context<AppBindings>,
  projectId: string
) {
  if (!c.env.FILES) {
    throw new Error("Research file storage is required for protocol extraction.");
  }
  if (!c.env.AI) {
    throw new Error("Workers AI is required for protocol extraction.");
  }

  const policy = await getProjectPolicy(c.env.DB, projectId);
  if (policy) {
    assertModelRequestAllowed(policy, {
      processorId: "workers-ai",
      providerKind: "internal",
      payloadKind: "document_text",
      containsIdentifiers: policy.containsIdentifiableData
    });
  }

  const protocolFiles = await listProjectFiles(c.env.DB, projectId, "protocol");
  const fileId = protocolFiles[0]?.id;
  if (!fileId) throw new Error("Upload a protocol before extraction.");

  const file = await getFileRecord(c.env.DB, fileId, getUserId(c));
  if (!file || file.projectId !== projectId || file.fileKind !== "protocol") {
    throw new Error("The protocol file could not be read.");
  }
  if (file.checksumSha256 === "pending") {
    throw new Error("Finish uploading the protocol before extraction.");
  }

  const object = await c.env.FILES.get(file.objectKey);
  if (!object) throw new Error("The stored protocol file could not be read.");

  const text = await researchFileToText({
    env: c.env,
    filename: file.filename,
    ...(file.mediaType ? { mediaType: file.mediaType } : {}),
    bytes: await object.arrayBuffer()
  });
  const extraction = await extractProtocolWithAi(c.env, text);
  const id = makeId("extract");

  await saveProtocolExtraction(c.env.DB, {
    id,
    projectId,
    protocolFileId: file.id,
    protocolChecksum: file.checksumSha256,
    extraction,
    provider: "cloudflare-workers-ai",
    model: PROTOCOL_EXTRACTION_MODEL,
    promptVersion: PROTOCOL_EXTRACTION_PROMPT_VERSION
  });

  await addAudit(c, {
    projectId,
    action: "orchestrator_protocol_information_extracted",
    objectType: "protocol_extraction",
    objectId: id,
    modelId: PROTOCOL_EXTRACTION_MODEL,
    after: {
      protocolFileId: file.id,
      protocolChecksum: file.checksumSha256,
      promptVersion: PROTOCOL_EXTRACTION_PROMPT_VERSION,
      researchQuestionCount: extraction.researchQuestions.length
    }
  });

  return extraction;
}

async function createOrchestratedDraftPlan(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  state: Awaited<ReturnType<typeof computeProjectReadiness>>
): Promise<AnalysisPlan> {
  if (state.plan) return state.plan;
  if (!state.specification || !state.resolvedSpecification) {
    throw new Error("Confirm the study specification before building a plan.");
  }
  if (!state.resolvedDatasetVersionId) {
    throw new Error("A quantitative analysis dataset is required before building a plan.");
  }

  const readyQuestionIds = new Set(
    state.readiness.questions
      .filter(
        (question) =>
          question.mode === "quantitative" && question.status === "ready"
      )
      .map((question) => question.questionId)
  );

  const analyses: PlannedAnalysis[] = [];
  for (const question of state.resolvedSpecification.researchQuestions) {
    if (
      question.objectiveType === "qualitative" ||
      !readyQuestionIds.has(question.id)
    ) {
      continue;
    }

    const outcomes = question.outcomes.filter((item) => item.datasetVariable);
    const predictors = question.predictors.flatMap((item) =>
      item.datasetVariable ? [item.datasetVariable] : []
    );
    const covariates = question.covariates.flatMap((item) =>
      item.datasetVariable ? [item.datasetVariable] : []
    );

    if (outcomes.length === 0) continue;

    for (const outcome of outcomes) {
      const scoped = structuredClone(state.resolvedSpecification);
      const scopedQuestion = scoped.researchQuestions.find(
        (item) => item.id === question.id
      );
      if (!scopedQuestion) continue;
      scopedQuestion.outcomes = [outcome];

      const selection = selectCandidateMethods(scoped, question.id);
      const executable = selection.candidates.filter(
        (candidate) => candidate.executable
      );
      if (executable.length === 0) {
        throw new Error(
          `No executable candidate is available for ${question.id} outcome ${outcome.concept}.`
        );
      }

      const selected = executable.length === 1 ? executable[0] : undefined;
      const requiredDecisions = selected?.decisionRequired
        ? [selected.decisionRequired]
        : executable.length > 1
          ? [
              `Choose one method from: ${executable
                .map((candidate) => candidate.displayName)
                .join(", ")}.`
            ]
          : [];

      analyses.push({
        id: makeId("analysis"),
        researchQuestionId: question.id,
        outcome: outcome.datasetVariable!,
        predictors,
        covariates,
        candidateMethodIds: executable.map((candidate) => candidate.methodId),
        ...(selected ? { selectedMethodId: selected.methodId } : {}),
        requiredDecisions,
        warnings: selection.warnings,
        diagnostics: Array.from(
          new Set(executable.flatMap((candidate) => candidate.requiredChecks))
        ),
        addedAfterLock: false
      });
    }
  }

  if (analyses.length === 0) {
    throw new Error(
      "No quantitative research question is ready for an executable draft plan."
    );
  }

  const now = new Date().toISOString();
  const plan = buildAnalysisPlan({
    id: makeId("plan"),
    projectId,
    versionId: `plan-${Date.now()}`,
    datasetVersionId: state.resolvedDatasetVersionId,
    studySpecificationVersion: state.specification.version,
    status: "planned_before_analysis",
    analyses,
    createdBy: getUserId(c),
    createdAt: now
  });

  await saveAnalysisPlan(c.env.DB, plan);
  await addAudit(c, {
    projectId,
    action: "orchestrator_analysis_plan_created",
    objectType: "analysis_plan",
    objectId: plan.id,
    after: plan
  });
  return plan;
}

function analysisJobSignature(input: {
  methodId: string;
  outcome?: string;
  predictors: string[];
  covariates: string[];
}): string {
  return JSON.stringify({
    methodId: input.methodId,
    outcome: input.outcome ?? null,
    predictors: input.predictors,
    covariates: input.covariates
  });
}

async function enqueueOrchestratedPlan(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  plan: AnalysisPlan
) {
  if (!plan.lockedAt || !plan.lockHash) {
    throw new Error("The analysis plan must be locked before execution.");
  }
  if (!plan.datasetVersionId) {
    throw new Error("The locked plan does not identify an analysis dataset.");
  }

  const existing = await listAnalysisJobsForPlan(c.env.DB, projectId, plan.id);
  const protectedSignatures = new Set(
    existing
      .filter(({ state }) => !["failed", "cancelled"].includes(state))
      .map(({ job }) => analysisJobSignature(job))
  );

  const queued: string[] = [];
  for (const analysis of plan.analyses) {
    if (!analysis.selectedMethodId) {
      throw new Error(
        `Analysis ${analysis.id} has no approved method and cannot be executed.`
      );
    }

    const signature = analysisJobSignature({
      methodId: analysis.selectedMethodId,
      outcome: analysis.outcome,
      predictors: analysis.predictors,
      covariates: analysis.covariates
    });
    if (protectedSignatures.has(signature)) continue;

    const job: AnalysisJob = {
      jobId: makeId("job"),
      projectId,
      datasetVersionId: plan.datasetVersionId,
      analysisPlanId: plan.id,
      methodId: analysis.selectedMethodId,
      outcome: analysis.outcome,
      predictors: analysis.predictors,
      covariates: analysis.covariates,
      filters: [],
      requestedBy: getUserId(c),
      registryVersion,
      createdAt: new Date().toISOString()
    };

    await createAnalysisJob(c.env.DB, job, "queued");
    await c.env.ANALYSIS_QUEUE.send({ jobId: job.jobId, projectId });
    await addAudit(c, {
      projectId,
      action: "orchestrator_analysis_job_created",
      objectType: "analysis_job",
      objectId: job.jobId,
      after: job
    });
    protectedSignatures.add(signature);
    queued.push(job.jobId);
  }

  return queued;
}


function qualitativeSourceNeedsModelConversion(
  filename: string,
  mediaType?: string
): boolean {
  const lower = filename.toLowerCase();
  return !(
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    mediaType?.startsWith("text/")
  );
}

async function orchestratorPrepareQualitativeAnalysis(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  state: Awaited<ReturnType<typeof computeProjectReadiness>>
) {
  const target = state.readiness.questions.find(
    (question) =>
      question.status === "qualitative_ready" &&
      !question.qualitativeWorkstream
  );
  if (!target) {
    throw new Error("No qualitative question is ready to prepare.");
  }
  if (!c.env.FILES) {
    throw new Error("Research file storage is required for qualitative analysis.");
  }

  const question = await requireQualitativeQuestion(
    c,
    projectId,
    target.questionId
  );
  const transcriptFiles = await listProjectFiles(c.env.DB, projectId, "transcript");
  if (transcriptFiles.length === 0) {
    throw new Error("Upload at least one transcript before qualitative analysis.");
  }

  const analysisId = makeId("qual");
  const now = new Date().toISOString();
  const segments: QualitativeSegment[] = [];
  const sourceFileIds: string[] = [];

  for (const summary of transcriptFiles) {
    const file = await getFileRecord(c.env.DB, summary.id, getUserId(c));
    if (!file || file.projectId !== projectId || file.fileKind !== "transcript") {
      continue;
    }
    if (file.checksumSha256 === "pending") {
      throw new Error(`Finish uploading transcript ${file.filename} before analysis.`);
    }
    const object = await c.env.FILES.get(file.objectKey);
    if (!object) {
      throw new Error(`Stored transcript ${file.filename} could not be read.`);
    }
    if (
      qualitativeSourceNeedsModelConversion(file.filename, file.mediaType)
    ) {
      await assertQualitativeModelAllowed(c, projectId);
    }
    const text = await researchFileToText({
      env: c.env,
      filename: file.filename,
      ...(file.mediaType ? { mediaType: file.mediaType } : {}),
      bytes: await object.arrayBuffer()
    });
    sourceFileIds.push(file.id);
    for (const draft of segmentQualitativeText(text)) {
      segments.push({
        id: makeId("qseg"),
        analysisId,
        projectId,
        fileId: file.id,
        segmentIndex: draft.segmentIndex,
        text: draft.text,
        startChar: draft.startChar,
        endChar: draft.endChar,
        codingState: "uncoded",
        createdAt: now
      });
    }
  }

  if (segments.length === 0) {
    throw new Error("No analyzable transcript text was extracted.");
  }

  await createQualitativeAnalysis(c.env.DB, {
    analysis: {
      id: analysisId,
      projectId,
      researchQuestionId: question.id,
      status: "prepared",
      sourceFileIds,
      createdBy: getUserId(c),
      createdAt: now,
      updatedAt: now
    },
    segments
  });

  await addAudit(c, {
    projectId,
    action: "orchestrator_qualitative_analysis_prepared",
    objectType: "qualitative_analysis",
    objectId: analysisId,
    after: {
      researchQuestionId: question.id,
      sourceFileIds,
      segmentCount: segments.length
    }
  });

  return { analysisId, segmentCount: segments.length };
}

async function orchestratorProposeQualitativeCodebook(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  state: Awaited<ReturnType<typeof computeProjectReadiness>>
) {
  const target = state.readiness.questions.find(
    (question) =>
      question.status === "qualitative_ready" &&
      question.qualitativeWorkstream?.status === "prepared"
  );
  const analysisId = target?.qualitativeWorkstream?.id;
  if (!target || !analysisId) {
    throw new Error("No prepared qualitative workstream needs a codebook.");
  }

  const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
  if (!detail) throw new Error("Qualitative analysis was not found.");
  if (detail.codings.length > 0) {
    throw new Error("Coding has already started for this qualitative workstream.");
  }

  const question = await requireQualitativeQuestion(c, projectId, target.questionId);
  await assertQualitativeModelAllowed(c, projectId);
  const codebook = await proposeQualitativeCodebook({
    env: c.env,
    researchQuestion: question.text,
    segments: detail.segments
  });

  const version = (latestByVersion(detail.codebookVersions)?.version ?? 0) + 1;
  await saveQualitativeCodebookVersion(c.env.DB, {
    id: makeId("qcodebook"),
    analysisId,
    version,
    source: "model",
    codebook,
    model: qualitativeModelProvenance(QUALITATIVE_CODEBOOK_PROMPT_VERSION),
    createdBy: getUserId(c),
    createdAt: new Date().toISOString()
  });
  await updateQualitativeAnalysisStatus(
    c.env.DB,
    projectId,
    analysisId,
    "codebook_review"
  );
  await addAudit(c, {
    projectId,
    action: "orchestrator_qualitative_codebook_proposed",
    objectType: "qualitative_analysis",
    objectId: analysisId,
    modelId: QUALITATIVE_MODEL,
    after: {
      version,
      promptVersion: QUALITATIVE_CODEBOOK_PROMPT_VERSION,
      codeCount: codebook.codes.length
    }
  });

  return { analysisId, version, codeCount: codebook.codes.length };
}

async function orchestratorProposeQualitativeCodings(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  state: Awaited<ReturnType<typeof computeProjectReadiness>>
) {
  const target = state.readiness.questions.find(
    (question) =>
      question.status === "qualitative_coding" &&
      question.qualitativeWorkstream
  );
  const analysisId = target?.qualitativeWorkstream?.id;
  if (!target || !analysisId) {
    throw new Error("No qualitative workstream is ready for coding.");
  }

  const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
  if (!detail) throw new Error("Qualitative analysis was not found.");
  const codebook = latestByVersion(detail.codebookVersions);
  if (!codebook || codebook.source !== "researcher") {
    throw new Error("Confirm the qualitative codebook before coding.");
  }

  const batch = detail.segments
    .filter((segment) => segment.codingState === "uncoded")
    .slice(0, 20);

  if (batch.length === 0) {
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      "coding_review"
    );
    return { analysisId, proposedSegments: 0, remainingUncoded: 0 };
  }

  const question = await requireQualitativeQuestion(c, projectId, target.questionId);
  await assertQualitativeModelAllowed(c, projectId);
  const proposal = await proposeQualitativeCodings({
    env: c.env,
    researchQuestion: question.text,
    codebook: codebook.codebook,
    segments: batch
  });

  const now = new Date().toISOString();
  const codings: QualitativeCoding[] = proposal.assignments.flatMap(
    (assignment) =>
      assignment.codeIds.map((codeId) => ({
        id: makeId("qcoding"),
        analysisId,
        segmentId: assignment.segmentId,
        codeId,
        status: "proposed" as const,
        source: "model" as const,
        ...(assignment.rationale ? { rationale: assignment.rationale } : {}),
        createdBy: getUserId(c),
        createdAt: now,
        updatedAt: now
      }))
  );

  await upsertQualitativeCodings(c.env.DB, codings);
  await updateQualitativeSegmentCodingState(
    c.env.DB,
    analysisId,
    batch.map((segment) => segment.id),
    "proposed"
  );

  const remainingUncoded = detail.segments.filter(
    (segment) =>
      segment.codingState === "uncoded" &&
      !batch.some((item) => item.id === segment.id)
  ).length;
  await updateQualitativeAnalysisStatus(
    c.env.DB,
    projectId,
    analysisId,
    remainingUncoded === 0 ? "coding_review" : "coding_in_progress"
  );
  await addAudit(c, {
    projectId,
    action: "orchestrator_qualitative_codings_proposed",
    objectType: "qualitative_analysis",
    objectId: analysisId,
    modelId: QUALITATIVE_MODEL,
    after: {
      promptVersion: QUALITATIVE_CODING_PROMPT_VERSION,
      segmentIds: batch.map((segment) => segment.id),
      proposedCodingCount: codings.length,
      remainingUncoded
    }
  });

  return {
    analysisId,
    proposedSegments: batch.length,
    proposedCodingCount: codings.length,
    remainingUncoded
  };
}

async function orchestratorProposeQualitativeThemes(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  state: Awaited<ReturnType<typeof computeProjectReadiness>>
) {
  const target = state.readiness.questions.find(
    (question) =>
      question.status === "qualitative_theme_ready" &&
      question.qualitativeWorkstream
  );
  const analysisId = target?.qualitativeWorkstream?.id;
  if (!target || !analysisId) {
    throw new Error("No qualitative workstream is ready for theme development.");
  }

  const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
  if (!detail) throw new Error("Qualitative analysis was not found.");
  const codebook = latestByVersion(detail.codebookVersions);
  if (!codebook || codebook.source !== "researcher") {
    throw new Error("A researcher-confirmed codebook is required.");
  }

  const question = await requireQualitativeQuestion(c, projectId, target.questionId);
  await assertQualitativeModelAllowed(c, projectId);
  const themeSet = await proposeQualitativeThemes({
    env: c.env,
    researchQuestion: question.text,
    codebook: codebook.codebook,
    segments: detail.segments,
    codings: detail.codings
  });

  const version = (latestByVersion(detail.themeVersions)?.version ?? 0) + 1;
  await saveQualitativeThemeVersion(c.env.DB, {
    id: makeId("qthemes"),
    analysisId,
    version,
    source: "model",
    themes: themeSet.themes,
    synthesis: themeSet.synthesis,
    model: qualitativeModelProvenance(QUALITATIVE_THEME_PROMPT_VERSION),
    createdBy: getUserId(c),
    createdAt: new Date().toISOString()
  });
  await updateQualitativeAnalysisStatus(
    c.env.DB,
    projectId,
    analysisId,
    "theme_review"
  );
  await addAudit(c, {
    projectId,
    action: "orchestrator_qualitative_themes_proposed",
    objectType: "qualitative_analysis",
    objectId: analysisId,
    modelId: QUALITATIVE_MODEL,
    after: {
      version,
      promptVersion: QUALITATIVE_THEME_PROMPT_VERSION,
      themeCount: themeSet.themes.length
    }
  });

  return { analysisId, version, themeCount: themeSet.themes.length };
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  researchType: z.enum(["quantitative", "qualitative", "mixed_methods"])
});

app.get("/methods", (c) => {
  return c.json({
    registryVersion,
    methods: Object.values(methodRegistry)
  });
});

app.get("/analysis-history", async (c) => {
  return c.json({
    analyses: await listAnalysisHistory(c.env.DB, getUserId(c))
  });
});

app.get("/projects", async (c) => {
  const projects = await listProjects(c.env.DB, getUserId(c));
  return c.json({ projects });
});

app.post("/projects", async (c) => {
  const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_PROJECT",
          message: "Project details are invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: makeId("proj"),
    name: parsed.data.name,
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    researchType: parsed.data.researchType,
    state: "draft",
    ownerId: getUserId(c),
    createdAt: now,
    updatedAt: now
  };

  await createProject(c.env.DB, project);
  await addAudit(c, {
    projectId: project.id,
    action: "project_created",
    objectType: "project",
    objectId: project.id,
    after: project
  });

  return c.json({ project }, 201);
});

app.delete("/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const project = await getProject(c.env.DB, projectId, getUserId(c));
  if (!project || project.ownerId !== getUserId(c)) {
    return c.json(
      { error: { code: "PROJECT_NOT_FOUND", message: "Project was not found." } },
      404
    );
  }

  if (c.env.FILES) {
    const prefix = `projects/${projectId}/`;
    let cursor: string | undefined;
    do {
      const listed = await c.env.FILES.list({
        prefix,
        ...(cursor ? { cursor } : {})
      });
      const keys = listed.objects.map((object) => object.key);
      if (keys.length > 0) await c.env.FILES.delete(keys);
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  await deleteProjectRecord(c.env.DB, projectId, getUserId(c));
  return c.body(null, 204);
});

app.delete("/account", async (c) => {
  const userId = getUserId(c);
  if (await userOwnsProjects(c.env.DB, userId)) {
    return c.json(
      {
        error: {
          code: "PROJECTS_REMAIN",
          message: "Delete owned research projects before deleting the account."
        }
      },
      409
    );
  }

  await deleteApplicationAndAuthUser(c.env.DB, userId);
  return c.body(null, 204);
});

app.get("/projects/:projectId", async (c) => {
  const access = await requireProject(c, c.req.param("projectId"));
  if ("response" in access) return access.response;
  return c.json({ project: access.project });
});


const registerDatasetSchema = z.object({
  fileId: z.string().min(1),
  label: z.string().trim().min(1).max(300),
  rowCount: z.number().int().nonnegative().optional(),
  columnCount: z.number().int().nonnegative().optional()
});

app.get("/projects/:projectId/datasets", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  return c.json({
    datasets: await listDatasetVersions(c.env.DB, projectId)
  });
});

app.post("/projects/:projectId/datasets", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = registerDatasetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_DATASET_REGISTRATION",
          message: "Dataset registration is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const file = await getFileForDatasetRegistration(
    c.env.DB,
    parsed.data.fileId,
    projectId
  );

  if (!file || file.fileKind !== "dataset") {
    return c.json(
      {
        error: {
          code: "DATASET_FILE_NOT_FOUND",
          message: "The selected file is not a dataset upload for this project."
        }
      },
      404
    );
  }

  if (file.checksumSha256 === "pending") {
    return c.json(
      {
        error: {
          code: "DATASET_UPLOAD_INCOMPLETE",
          message: "Finish uploading the dataset before registering it."
        }
      },
      409
    );
  }

  const datasetId = makeId("dsv");
  await createDatasetVersion(c.env.DB, {
    id: datasetId,
    projectId,
    label: parsed.data.label,
    sourceKind: "original",
    objectKey: file.objectKey,
    checksumSha256: file.checksumSha256,
    ...(parsed.data.rowCount != null ? { rowCount: parsed.data.rowCount } : {}),
    ...(parsed.data.columnCount != null
      ? { columnCount: parsed.data.columnCount }
      : {}),
    createdBy: getUserId(c),
    parentVersionIds: []
  });

  await addAudit(c, {
    projectId,
    action: "dataset_registered",
    objectType: "dataset_version",
    objectId: datasetId,
    after: {
      label: parsed.data.label,
      sourceFileId: file.id,
      checksumSha256: file.checksumSha256
    }
  });

  return c.json({ datasetVersionId: datasetId }, 201);
});


app.get("/projects/:projectId/datasets/:datasetVersionId/profile", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  if (!c.env.FILES || c.env.STORAGE_MODE !== "r2") {
    return c.json(
      {
        error: {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          message: "R2 storage is required for dataset profiling."
        }
      },
      503
    );
  }

  const dataset = await getDatasetVersionRecord(
    c.env.DB,
    c.req.param("datasetVersionId"),
    projectId
  );
  if (!dataset) {
    return c.json(
      { error: { code: "DATASET_NOT_FOUND", message: "Dataset version was not found." } },
      404
    );
  }

  const object = await c.env.FILES.get(dataset.objectKey);
  if (!object) {
    return c.json(
      { error: { code: "DATASET_OBJECT_NOT_FOUND", message: "Stored dataset object was not found." } },
      404
    );
  }

  const response = await c.env.STATS.fetch(
    new Request("https://methodome-stats.internal/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: await object.text() })
    })
  );

  if (!response.ok) {
    return c.json(
      {
        error: {
          code: "DATASET_PROFILE_FAILED",
          message: "Methodome could not profile this dataset.",
          details: await response.text()
        }
      },
      response.status >= 500 ? 502 : 400
    );
  }

  return c.json({ profile: await response.json() });
});

const harmonisedAppendSchema = z.object({
  sourceDatasetVersionIds: z.array(z.string().min(1)).min(2),
  label: z.string().trim().min(1).max(300),
  reason: z.string().trim().max(2000).optional(),
  mappings: z.array(
    z.object({
      sourceDatasetVersionId: z.string().min(1),
      sourceVariable: z.string().min(1),
      targetVariable: z.string().min(1),
      categoryMap: z.record(z.string(), z.string()).optional()
    })
  ).min(1)
});

app.post("/projects/:projectId/datasets/append", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  if (!c.env.FILES || c.env.STORAGE_MODE !== "r2") {
    return c.json(
      {
        error: {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          message: "R2 storage is required for dataset harmonisation."
        }
      },
      503
    );
  }

  const parsed = harmonisedAppendSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_HARMONISED_APPEND",
          message: "Dataset append specification is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const sources = [];
  for (const datasetVersionId of parsed.data.sourceDatasetVersionIds) {
    const dataset = await getDatasetVersionRecord(
      c.env.DB,
      datasetVersionId,
      projectId
    );
    if (!dataset) {
      return c.json(
        {
          error: {
            code: "DATASET_NOT_FOUND",
            message: `Dataset version ${datasetVersionId} was not found in this project.`
          }
        },
        404
      );
    }
    const object = await c.env.FILES.get(dataset.objectKey);
    if (!object) {
      return c.json(
        {
          error: {
            code: "DATASET_OBJECT_NOT_FOUND",
            message: `Stored data for ${datasetVersionId} was not found.`
          }
        },
        404
      );
    }
    sources.push({
      datasetVersionId,
      csv: await object.text()
    });
  }

  const response = await c.env.STATS.fetch(
    new Request("https://methodome-stats.internal/harmonise/append", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources,
        mappings: parsed.data.mappings
      })
    })
  );

  if (!response.ok) {
    const detail = await response.text();
    return c.json(
      {
        error: {
          code: "HARMONISATION_FAILED",
          message: "Methodome could not create the harmonised dataset.",
          details: detail
        }
      },
      response.status >= 500 ? 502 : 400
    );
  }

  const harmonised = (await response.json()) as {
    csv: string;
    rowCount: number;
    columnCount: number;
    columns: string[];
  };

  const datasetVersionId = makeId("dsv");
  const filename = `${safeFilename(parsed.data.label)}.csv`;
  const objectKey = `projects/${projectId}/derived/${datasetVersionId}/${filename}`;
  const bytes = new TextEncoder().encode(harmonised.csv);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const checksum = await sha256BytesHex(buffer);

  await c.env.FILES.put(objectKey, buffer, {
    httpMetadata: { contentType: "text/csv; charset=utf-8" },
    customMetadata: {
      sha256: checksum,
      transformation: "harmonised_append"
    }
  });

  await createDatasetVersion(c.env.DB, {
    id: datasetVersionId,
    projectId,
    label: parsed.data.label,
    sourceKind: "derived",
    objectKey,
    checksumSha256: checksum,
    rowCount: harmonised.rowCount,
    columnCount: harmonised.columnCount,
    createdBy: getUserId(c),
    parentVersionIds: parsed.data.sourceDatasetVersionIds
  });

  await createTransformationEvent(c.env.DB, {
    id: makeId("transform"),
    projectId,
    outputDatasetVersionId: datasetVersionId,
    inputDatasetVersionIds: parsed.data.sourceDatasetVersionIds,
    operation: "append",
    specification: {
      mappings: parsed.data.mappings,
      columns: harmonised.columns
    },
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    createdBy: getUserId(c)
  });

  await addAudit(c, {
    projectId,
    action: "datasets_harmonised_and_appended",
    objectType: "dataset_version",
    objectId: datasetVersionId,
    after: {
      parentDatasetVersionIds: parsed.data.sourceDatasetVersionIds,
      checksumSha256: checksum,
      rowCount: harmonised.rowCount,
      columnCount: harmonised.columnCount
    }
  });

  return c.json(
    {
      datasetVersionId,
      checksumSha256: checksum,
      rowCount: harmonised.rowCount,
      columnCount: harmonised.columnCount
    },
    201
  );
});

const variableSchemaInput = z.object({
  variableName: z.string().min(1),
  label: z.string().optional(),
  dataType: z.string().min(1),
  responseChoices: z
    .array(
      z.object({
        value: z.union([z.string(), z.number()]),
        label: z.string()
      })
    )
    .optional()
});

const schemaComparisonInput = z.object({
  leftDatasetVersionId: z.string().min(1),
  rightDatasetVersionId: z.string().min(1),
  leftVariables: z.array(variableSchemaInput),
  rightVariables: z.array(variableSchemaInput)
});

app.post("/projects/:projectId/schema-comparison", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = schemaComparisonInput.safeParse(
    await c.req.json().catch(() => null)
  );

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_SCHEMA_COMPARISON",
          message: "Dataset schema comparison input is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const [leftExists, rightExists] = await Promise.all([
    datasetBelongsToProject(
      c.env.DB,
      parsed.data.leftDatasetVersionId,
      projectId
    ),
    datasetBelongsToProject(
      c.env.DB,
      parsed.data.rightDatasetVersionId,
      projectId
    )
  ]);

  if (!leftExists || !rightExists) {
    return c.json(
      {
        error: {
          code: "DATASET_NOT_FOUND",
          message:
            "Both dataset versions must belong to this project before schemas can be compared."
        }
      },
      404
    );
  }

  const comparison = compareDatasetSchemas(
    parsed.data.leftDatasetVersionId,
    parsed.data.leftVariables.map((variable) => ({
      sourceDatasetVersionId: parsed.data.leftDatasetVersionId,
      variableName: variable.variableName,
      dataType: variable.dataType,
      ...(variable.label ? { label: variable.label } : {}),
      ...(variable.responseChoices
        ? { responseChoices: variable.responseChoices }
        : {})
    })),
    parsed.data.rightDatasetVersionId,
    parsed.data.rightVariables.map((variable) => ({
      sourceDatasetVersionId: parsed.data.rightDatasetVersionId,
      variableName: variable.variableName,
      dataType: variable.dataType,
      ...(variable.label ? { label: variable.label } : {}),
      ...(variable.responseChoices
        ? { responseChoices: variable.responseChoices }
        : {})
    }))
  );

  return c.json({ comparison });
});

app.get("/projects/:projectId/protocol-extraction", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const record = await getLatestProtocolExtraction(c.env.DB, projectId);
  if (!record) return c.json({ extraction: null });

  return c.json({
    extraction: {
      ...protocolExtractionSchema.parse(record.extraction),
      provenance: {
        id: record.id,
        protocolFileId: record.protocolFileId,
        protocolChecksum: record.protocolChecksum,
        provider: record.provider,
        model: record.model,
        promptVersion: record.promptVersion,
        createdAt: record.createdAt
      }
    }
  });
});

app.post("/projects/:projectId/protocol-extraction", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  if (!c.env.FILES) {
    return c.json(
      {
        error: {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          message: "Research file storage is required for protocol extraction."
        }
      },
      503
    );
  }

  if (!c.env.AI) {
    return c.json(
      {
        error: {
          code: "AI_NOT_CONFIGURED",
          message: "Workers AI is required for protocol extraction."
        }
      },
      503
    );
  }

  const policy = await getProjectPolicy(c.env.DB, projectId);
  if (policy) {
    try {
      assertModelRequestAllowed(policy, {
        processorId: "workers-ai",
        providerKind: "internal",
        payloadKind: "document_text",
        containsIdentifiers: policy.containsIdentifiableData
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "MODEL_PROCESSING_BLOCKED",
            message:
              error instanceof Error
                ? error.message
                : "Project processing policy blocks protocol extraction."
          }
        },
        409
      );
    }
  }

  const body = await c.req.json().catch(() => ({})) as { fileId?: string };
  const protocolFiles = await listProjectFiles(c.env.DB, projectId, "protocol");
  const fileId = body.fileId ?? protocolFiles[0]?.id;
  if (!fileId) {
    return c.json(
      {
        error: {
          code: "PROTOCOL_REQUIRED",
          message: "Upload a protocol before extracting study information."
        }
      },
      409
    );
  }

  const file = await getFileRecord(c.env.DB, fileId, getUserId(c));
  if (!file || file.projectId !== projectId || file.fileKind !== "protocol") {
    return c.json(
      {
        error: {
          code: "PROTOCOL_FILE_NOT_FOUND",
          message: "The selected protocol file was not found in this project."
        }
      },
      404
    );
  }

  if (file.checksumSha256 === "pending") {
    return c.json(
      {
        error: {
          code: "PROTOCOL_UPLOAD_INCOMPLETE",
          message: "Finish uploading the protocol before extraction."
        }
      },
      409
    );
  }

  const object = await c.env.FILES.get(file.objectKey);
  if (!object) {
    return c.json(
      {
        error: {
          code: "PROTOCOL_OBJECT_NOT_FOUND",
          message: "The stored protocol file could not be read."
        }
      },
      404
    );
  }

  try {
    const bytes = await object.arrayBuffer();
    const text = await researchFileToText({
      env: c.env,
      filename: file.filename,
      ...(file.mediaType ? { mediaType: file.mediaType } : {}),
      bytes
    });
    const extraction = await extractProtocolWithAi(c.env, text);
    const id = makeId("extract");
    await saveProtocolExtraction(c.env.DB, {
      id,
      projectId,
      protocolFileId: file.id,
      protocolChecksum: file.checksumSha256,
      extraction,
      provider: "cloudflare-workers-ai",
      model: PROTOCOL_EXTRACTION_MODEL,
      promptVersion: PROTOCOL_EXTRACTION_PROMPT_VERSION
    });
    await addAudit(c, {
      projectId,
      action: "protocol_information_extracted",
      objectType: "protocol_extraction",
      objectId: id,
      modelId: PROTOCOL_EXTRACTION_MODEL,
      after: {
        protocolFileId: file.id,
        protocolChecksum: file.checksumSha256,
        promptVersion: PROTOCOL_EXTRACTION_PROMPT_VERSION,
        researchQuestionCount: extraction.researchQuestions.length
      }
    });

    return c.json({
      extraction: {
        ...extraction,
        provenance: {
          id,
          protocolFileId: file.id,
          protocolChecksum: file.checksumSha256,
          provider: "cloudflare-workers-ai",
          model: PROTOCOL_EXTRACTION_MODEL,
          promptVersion: PROTOCOL_EXTRACTION_PROMPT_VERSION,
          createdAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    return c.json(
      {
        error: {
          code: "PROTOCOL_EXTRACTION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Methodome could not extract study information from this protocol."
        }
      },
      422
    );
  }
});

app.get("/projects/:projectId/variable-mapping-suggestions", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const specification = await getStudySpecification(c.env.DB, projectId);
  if (!specification) {
    return c.json(
      {
        error: {
          code: "STUDY_SPECIFICATION_REQUIRED",
          message: "Confirm the study specification before mapping variables."
        }
      },
      409
    );
  }

  const datasets = await listDatasetVersions(c.env.DB, projectId);
  const preferred =
    datasets.find((dataset) => dataset.sourceKind === "derived") ?? datasets[0];
  if (!preferred) {
    return c.json(
      {
        error: {
          code: "DATASET_REQUIRED",
          message: "Upload a dataset before Methodome can map study concepts."
        }
      },
      409
    );
  }

  let profile;
  try {
    profile = await profileDatasetForProject(c, projectId, preferred.id);
  } catch (error) {
    return c.json(
      {
        error: {
          code: "DATASET_PROFILE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Methodome could not profile the selected dataset."
        }
      },
      422
    );
  }

  const concepts = specification.researchQuestions.flatMap((question) => [
    ...question.outcomes.map((variable) => variable.concept),
    ...question.predictors.map((variable) => variable.concept),
    ...question.covariates.map((variable) => variable.concept)
  ]);

  let instrumentText = "";
  if (c.env.FILES) {
    const researchFiles = (await listProjectFiles(c.env.DB, projectId))
      .filter((file) => file.fileKind === "instrument" || file.fileKind === "codebook")
      .slice(0, 2);
    for (const summary of researchFiles) {
      try {
        const record = await getFileRecord(c.env.DB, summary.id, getUserId(c));
        if (!record) continue;
        const object = await c.env.FILES.get(record.objectKey);
        if (!object) continue;
        const text = await researchFileToText({
          env: c.env,
          filename: record.filename,
          ...(record.mediaType ? { mediaType: record.mediaType } : {}),
          bytes: await object.arrayBuffer()
        });
        instrumentText += `\n\nFILE: ${record.filename}\n${text.slice(0, 15000)}`;
      } catch {
        // Instrument text is helpful evidence but is not required for mapping.
      }
    }
  }

  const policy = await getProjectPolicy(c.env.DB, projectId);
  let modelAssistAllowed = true;
  let modelAssistReason: string | undefined;

  if (policy) {
    try {
      assertModelRequestAllowed(policy, {
        processorId: "workers-ai",
        providerKind: "internal",
        payloadKind: instrumentText ? "document_text" : "metadata",
        containsIdentifiers: policy.containsIdentifiableData
      });
    } catch (error) {
      modelAssistAllowed = false;
      modelAssistReason =
        error instanceof Error
          ? error.message
          : "Project processing policy blocks model-assisted variable mapping.";
    }
  }

  const suggestions = await suggestMappingsWithAi({
    env: c.env,
    concepts,
    variables: profile.variables.map((variable) => ({
      variableName: variable.variableName,
      ...(variable.label ? { label: variable.label } : {}),
      dataType: variable.dataType,
      ...(variable.responseChoices
        ? { responseChoices: variable.responseChoices }
        : {})
    })),
    ...(instrumentText ? { instrumentText } : {}),
    allowModelAssist: modelAssistAllowed
  });

  return c.json({
    datasetVersionId: preferred.id,
    variables: profile.variables,
    suggestions,
    modelAssistance: modelAssistAllowed
      ? { status: "available" as const }
      : {
          status: "blocked" as const,
          reason: modelAssistReason ??
            "Model-assisted mapping is unavailable for this project."
        }
  });
});

app.get("/projects/:projectId/study-specification", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const specification = await getStudySpecification(c.env.DB, projectId);
  return c.json({ specification });
});

app.put("/projects/:projectId/study-specification", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  let specification;
  try {
    const body = await c.req.json();
    specification = parseStudySpecification(
      typeof body === "object" && body && "specification" in body
        ? (body as { specification: unknown }).specification
        : body
    );
  } catch (error) {
    return c.json(
      {
        error: {
          code: "INVALID_STUDY_SPECIFICATION",
          message: "Study specification is invalid.",
          details: error instanceof Error ? error.message : String(error)
        }
      },
      400
    );
  }

  await saveStudySpecification(
    c.env.DB,
    makeId("spec"),
    projectId,
    specification,
    getUserId(c)
  );

  await addAudit(c, {
    projectId,
    action: "study_specification_saved",
    objectType: "study_specification",
    objectId: specification.version,
    after: specification
  });

  return c.json({ specification });
});

app.get("/projects/:projectId/readiness", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const validSections = new Set<WorkflowSection>([
    "overview",
    "protocol",
    "instruments",
    "data",
    "data-preparation",
    "study-design",
    "variables",
    "analysis-plan",
    "analysis",
    "results",
    "reports",
    "audit-trail",
    "settings"
  ]);
  const requestedSection = c.req.query("section");
  const currentSection =
    requestedSection && validSections.has(requestedSection as WorkflowSection)
      ? (requestedSection as WorkflowSection)
      : undefined;

  const state = await computeProjectReadiness(c, projectId, currentSection);

  return c.json({
    readiness: state.readiness,
    registryVersion,
    ...(state.resolvedDatasetVersionId
      ? { datasetVersionId: state.resolvedDatasetVersionId }
      : {})
  });
});

const orchestratorAdvanceSchema = z.object({
  action: z.enum([
    "extract_protocol",
    "create_draft_plan",
    "run_analyses",
    "prepare_qualitative_analysis",
    "propose_qualitative_codebook",
    "propose_qualitative_codings",
    "propose_qualitative_themes"
  ]).optional()
});

app.get("/projects/:projectId/orchestrator", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const state = await computeProjectReadiness(c, projectId);
  return c.json({
    orchestrator: buildOrchestratorView(state.readiness, state.plan),
    readiness: state.readiness,
    registryVersion,
    ...(state.resolvedDatasetVersionId
      ? { datasetVersionId: state.resolvedDatasetVersionId }
      : {})
  });
});

app.post("/projects/:projectId/orchestrator/advance", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = orchestratorAdvanceSchema.safeParse(
    await c.req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_ORCHESTRATOR_ACTION",
          message: "The orchestrator action is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const before = await computeProjectReadiness(c, projectId);
  const view = buildOrchestratorView(before.readiness, before.plan);

  if (!view.automaticAction) {
    return c.json({
      advanced: false,
      orchestrator: view,
      readiness: before.readiness,
      message:
        view.status === "waiting_for_researcher"
          ? "Methodome is waiting for a researcher decision before continuing."
          : "Methodome has no safe automatic action from the current state."
    });
  }

  if (parsed.data.action && parsed.data.action !== view.automaticAction) {
    return c.json(
      {
        error: {
          code: "ORCHESTRATOR_ACTION_OUT_OF_SEQUENCE",
          message:
            "The requested action is not the current safe automatic action.",
          details: {
            requested: parsed.data.action,
            current: view.automaticAction
          }
        }
      },
      409
    );
  }

  let mutation:
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

  try {
    if (view.automaticAction === "extract_protocol") {
      const extraction = await runProtocolExtractionForProject(c, projectId);
      mutation = {
        action: "extract_protocol",
        researchQuestionCount: extraction.researchQuestions.length
      };
    } else if (view.automaticAction === "create_draft_plan") {
      const plan = await createOrchestratedDraftPlan(c, projectId, before);
      mutation = {
        action: "create_draft_plan",
        planId: plan.id,
        analysisCount: plan.analyses.length
      };
    } else if (view.automaticAction === "run_analyses") {
      if (!before.plan) {
        throw new Error("The locked analysis plan could not be loaded.");
      }
      mutation = {
        action: "run_analyses",
        queuedJobIds: await enqueueOrchestratedPlan(c, projectId, before.plan)
      };
    } else if (view.automaticAction === "prepare_qualitative_analysis") {
      mutation = {
        action: "prepare_qualitative_analysis",
        ...(await orchestratorPrepareQualitativeAnalysis(c, projectId, before))
      };
    } else if (view.automaticAction === "propose_qualitative_codebook") {
      mutation = {
        action: "propose_qualitative_codebook",
        ...(await orchestratorProposeQualitativeCodebook(c, projectId, before))
      };
    } else if (view.automaticAction === "propose_qualitative_codings") {
      mutation = {
        action: "propose_qualitative_codings",
        ...(await orchestratorProposeQualitativeCodings(c, projectId, before))
      };
    } else {
      mutation = {
        action: "propose_qualitative_themes",
        ...(await orchestratorProposeQualitativeThemes(c, projectId, before))
      };
    }
  } catch (error) {
    return c.json(
      {
        error: {
          code: "ORCHESTRATOR_ADVANCE_BLOCKED",
          message:
            error instanceof Error
              ? error.message
              : "Methodome could not safely advance the project."
        }
      },
      409
    );
  }

  const after = await computeProjectReadiness(c, projectId);
  return c.json({
    advanced: true,
    mutation,
    orchestrator: buildOrchestratorView(after.readiness, after.plan),
    readiness: after.readiness,
    ...(after.resolvedDatasetVersionId
      ? { datasetVersionId: after.resolvedDatasetVersionId }
      : {})
  });
});

app.get("/projects/:projectId/method-candidates", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const specification = await getStudySpecification(c.env.DB, projectId);
  if (!specification) {
    return c.json(
      {
        error: {
          code: "STUDY_SPECIFICATION_REQUIRED",
          message: "Confirm the study specification before evaluating methods."
        }
      },
      409
    );
  }

  const resolved = await resolveStudySpecificationForMethods(
    c,
    projectId,
    specification
  );
  const selections = resolved.specification.researchQuestions.map((question) =>
    selectCandidateMethods(resolved.specification, question.id)
  );

  return c.json({
    selections,
    registryVersion,
    datasetVersionId: resolved.datasetVersionId
  });
});

const policySchema = z.object({
  dataClass: z.enum(["public", "restricted", "identifiable"]),
  containsIdentifiableData: z.boolean(),
  ethicsApprovalReference: z.string().optional(),
  allowedProcessors: z.array(z.string()),
  externalModelAllowed: z.boolean(),
  qualitativeTextExternalAllowed: z.boolean(),
  rowLevelQuantitativeExternalAllowed: z.boolean(),
  retentionRule: z.string().optional(),
  exportRestrictions: z.array(z.string())
});

app.get("/projects/:projectId/policy", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  return c.json({ policy: await getProjectPolicy(c.env.DB, projectId) });
});

app.put("/projects/:projectId/policy", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = policySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_PROJECT_POLICY",
          message: "Project processing policy is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const before = await getProjectPolicy(c.env.DB, projectId);
  const policy = parsed.data as ProjectProcessingPolicy;
  await updateProjectPolicy(c.env.DB, projectId, policy);
  await addAudit(c, {
    projectId,
    action: "project_policy_updated",
    objectType: "project_policy",
    objectId: projectId,
    before,
    after: policy
  });

  return c.json({ policy });
});


const createQualitativeAnalysisSchema = z.object({
  researchQuestionId: z.string().min(1),
  sourceFileIds: z.array(z.string().min(1)).min(1).optional()
});

const qualitativeCodingBatchSchema = z.object({
  segmentIds: z.array(z.string().min(1)).min(1).max(20).optional()
});

const qualitativeCodingReviewSchema = z.object({
  decisions: z.array(
    z.object({
      segmentId: z.string().min(1),
      codeId: z.string().min(1),
      status: z.enum(["confirmed", "rejected"]),
      rationale: z.string().trim().max(2000).optional()
    })
  ).default([]),
  manualAssignments: z.array(
    z.object({
      segmentId: z.string().min(1),
      codeId: z.string().min(1),
      rationale: z.string().trim().max(2000).optional()
    })
  ).default([]),
  reviewedSegmentIds: z.array(z.string().min(1)).default([])
});

function latestByVersion<T extends { version: number }>(items: T[]): T | null {
  return items.length > 0
    ? [...items].sort((left, right) => right.version - left.version)[0] ?? null
    : null;
}

async function requireQualitativeQuestion(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  researchQuestionId: string
) {
  const specification = await getStudySpecification(c.env.DB, projectId);
  const question = specification?.researchQuestions.find(
    (item) => item.id === researchQuestionId
  );
  if (!question) {
    throw new Error("The qualitative analysis references an unknown research question.");
  }
  if (question.objectiveType !== "qualitative") {
    throw new Error(
      "Only research questions confirmed as qualitative can enter the qualitative analysis branch."
    );
  }
  return question;
}

async function assertQualitativeModelAllowed(
  c: import("hono").Context<AppBindings>,
  projectId: string
) {
  if (!c.env.AI) {
    throw new Error("Workers AI is required for AI-assisted qualitative analysis.");
  }
  const policy = await getProjectPolicy(c.env.DB, projectId);
  if (policy) {
    assertModelRequestAllowed(policy, {
      processorId: "workers-ai",
      providerKind: "internal",
      payloadKind: "qualitative_text",
      containsIdentifiers: policy.containsIdentifiableData
    });
  }
}

async function qualitativeAnalysisDetail(
  c: import("hono").Context<AppBindings>,
  projectId: string,
  analysisId: string
) {
  const analysis = await getQualitativeAnalysis(c.env.DB, projectId, analysisId);
  if (!analysis) return null;

  const [segments, codebookVersions, codings, themeVersions] = await Promise.all([
    listQualitativeSegments(c.env.DB, analysisId),
    listQualitativeCodebookVersions(c.env.DB, analysisId),
    listQualitativeCodings(c.env.DB, analysisId),
    listQualitativeThemeVersions(c.env.DB, analysisId)
  ]);

  return {
    analysis,
    segments,
    codebookVersions,
    latestCodebook: latestByVersion(codebookVersions),
    codings,
    themeVersions,
    latestThemes: latestByVersion(themeVersions)
  };
}

app.get("/projects/:projectId/qualitative-analyses", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  return c.json({
    analyses: await listQualitativeAnalyses(c.env.DB, projectId)
  });
});

app.post("/projects/:projectId/qualitative-analyses", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = createQualitativeAnalysisSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_QUALITATIVE_ANALYSIS",
          message: "Qualitative analysis setup is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  let question;
  try {
    question = await requireQualitativeQuestion(
      c,
      projectId,
      parsed.data.researchQuestionId
    );
  } catch (error) {
    return c.json(
      {
        error: {
          code: "QUALITATIVE_QUESTION_REQUIRED",
          message: error instanceof Error ? error.message : String(error)
        }
      },
      409
    );
  }

  const existing = (await listQualitativeAnalyses(c.env.DB, projectId)).find(
    (item) => item.researchQuestionId === question.id
  );
  if (existing) {
    const detail = await qualitativeAnalysisDetail(c, projectId, existing.id);
    return c.json({ detail });
  }

  if (!c.env.FILES) {
    return c.json(
      {
        error: {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          message: "Research file storage is required for qualitative analysis."
        }
      },
      503
    );
  }

  const availableTranscripts = await listProjectFiles(
    c.env.DB,
    projectId,
    "transcript"
  );
  const sourceFileIds =
    parsed.data.sourceFileIds ?? availableTranscripts.map((file) => file.id);
  if (sourceFileIds.length === 0) {
    return c.json(
      {
        error: {
          code: "QUALITATIVE_SOURCE_REQUIRED",
          message:
            "Upload at least one transcript before preparing qualitative analysis."
        }
      },
      409
    );
  }

  const analysisId = makeId("qual");
  const now = new Date().toISOString();
  const segments: QualitativeSegment[] = [];

  for (const fileId of sourceFileIds) {
    const file = await getFileRecord(c.env.DB, fileId, getUserId(c));
    if (
      !file ||
      file.projectId !== projectId ||
      file.fileKind !== "transcript"
    ) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_SOURCE_NOT_FOUND",
            message:
              "Every qualitative source must be a transcript file from this project.",
            details: { fileId }
          }
        },
        404
      );
    }
    if (file.checksumSha256 === "pending") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_SOURCE_UPLOAD_INCOMPLETE",
            message: "Finish uploading all qualitative sources before analysis.",
            details: { fileId }
          }
        },
        409
      );
    }

    const object = await c.env.FILES.get(file.objectKey);
    if (!object) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_SOURCE_OBJECT_NOT_FOUND",
            message: "A stored qualitative source could not be read.",
            details: { fileId }
          }
        },
        404
      );
    }

    if (
      qualitativeSourceNeedsModelConversion(file.filename, file.mediaType)
    ) {
      try {
        await assertQualitativeModelAllowed(c, projectId);
      } catch (error) {
        return c.json(
          {
            error: {
              code: "QUALITATIVE_MODEL_BLOCKED",
              message:
                error instanceof Error
                  ? error.message
                  : "Project processing policy blocks transcript conversion.",
              details: { fileId }
            }
          },
          409
        );
      }
    }

    let text: string;
    try {
      text = await researchFileToText({
        env: c.env,
        filename: file.filename,
        ...(file.mediaType ? { mediaType: file.mediaType } : {}),
        bytes: await object.arrayBuffer()
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_TEXT_EXTRACTION_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Methodome could not extract qualitative source text.",
            details: { fileId }
          }
        },
        422
      );
    }

    const drafts = segmentQualitativeText(text);
    for (const draft of drafts) {
      segments.push({
        id: makeId("qseg"),
        analysisId,
        projectId,
        fileId,
        segmentIndex: draft.segmentIndex,
        text: draft.text,
        startChar: draft.startChar,
        endChar: draft.endChar,
        codingState: "uncoded",
        createdAt: now
      });
    }
  }

  if (segments.length === 0) {
    return c.json(
      {
        error: {
          code: "QUALITATIVE_SOURCE_EMPTY",
          message: "No analyzable text was extracted from the selected transcripts."
        }
      },
      422
    );
  }

  const analysis = {
    id: analysisId,
    projectId,
    researchQuestionId: question.id,
    status: "prepared" as const,
    sourceFileIds,
    createdBy: getUserId(c),
    createdAt: now,
    updatedAt: now
  };
  await createQualitativeAnalysis(c.env.DB, { analysis, segments });
  await addAudit(c, {
    projectId,
    action: "qualitative_analysis_prepared",
    objectType: "qualitative_analysis",
    objectId: analysisId,
    after: {
      researchQuestionId: question.id,
      sourceFileIds,
      segmentCount: segments.length
    }
  });

  return c.json(
    {
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    },
    201
  );
});

app.get(
  "/projects/:projectId/qualitative-analyses/:analysisId",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const detail = await qualitativeAnalysisDetail(
      c,
      projectId,
      c.req.param("analysisId")
    );
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }
    return c.json({ detail });
  }
);

app.post(
  "/projects/:projectId/qualitative-analyses/:analysisId/codebook/propose",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const analysisId = c.req.param("analysisId");
    const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }
    if (detail.codings.length > 0) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_ALREADY_IN_USE",
            message:
              "The codebook cannot be regenerated after coding has started. Start a new qualitative workstream to use a different codebook."
          }
        },
        409
      );
    }

    let question;
    try {
      question = await requireQualitativeQuestion(
        c,
        projectId,
        detail.analysis.researchQuestionId
      );
      await assertQualitativeModelAllowed(c, projectId);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_MODEL_BLOCKED",
            message: error instanceof Error ? error.message : String(error)
          }
        },
        409
      );
    }

    let codebook: QualitativeCodebook;
    try {
      codebook = await proposeQualitativeCodebook({
        env: c.env,
        researchQuestion: question.text,
        segments: detail.segments
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_PROPOSAL_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Methodome could not propose a qualitative codebook."
          }
        },
        422
      );
    }

    const version =
      (latestByVersion(detail.codebookVersions)?.version ?? 0) + 1;
    const createdAt = new Date().toISOString();
    await saveQualitativeCodebookVersion(c.env.DB, {
      id: makeId("qcodebook"),
      analysisId,
      version,
      source: "model",
      codebook,
      model: qualitativeModelProvenance(
        QUALITATIVE_CODEBOOK_PROMPT_VERSION
      ),
      createdBy: getUserId(c),
      createdAt
    });
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      "codebook_review"
    );
    await addAudit(c, {
      projectId,
      action: "qualitative_codebook_proposed",
      objectType: "qualitative_analysis",
      objectId: analysisId,
      modelId: QUALITATIVE_MODEL,
      after: {
        version,
        promptVersion: QUALITATIVE_CODEBOOK_PROMPT_VERSION,
        codeCount: codebook.codes.length
      }
    });

    return c.json({
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    });
  }
);

app.put(
  "/projects/:projectId/qualitative-analyses/:analysisId/codebook",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const analysisId = c.req.param("analysisId");
    const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }
    if (detail.codings.length > 0) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_ALREADY_IN_USE",
            message:
              "Finish this workstream with its current codebook or start a new workstream before changing the codebook."
          }
        },
        409
      );
    }

    const body = await c.req.json().catch(() => null);
    const parsed = qualitativeCodebookSchema.safeParse(
      body && typeof body === "object" && "codebook" in body
        ? (body as { codebook: unknown }).codebook
        : body
    );
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_QUALITATIVE_CODEBOOK",
            message: "The reviewed qualitative codebook is invalid.",
            details: parsed.error.flatten()
          }
        },
        400
      );
    }

    const ids = parsed.data.codes.map((code) => code.id);
    if (new Set(ids).size !== ids.length) {
      return c.json(
        {
          error: {
            code: "DUPLICATE_QUALITATIVE_CODE_ID",
            message: "Every qualitative code must have a unique id."
          }
        },
        400
      );
    }

    const version =
      (latestByVersion(detail.codebookVersions)?.version ?? 0) + 1;
    await saveQualitativeCodebookVersion(c.env.DB, {
      id: makeId("qcodebook"),
      analysisId,
      version,
      source: "researcher",
      codebook: parsed.data,
      createdBy: getUserId(c),
      createdAt: new Date().toISOString()
    });
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      "codebook_confirmed"
    );
    await addAudit(c, {
      projectId,
      action: "qualitative_codebook_confirmed",
      objectType: "qualitative_analysis",
      objectId: analysisId,
      after: {
        version,
        codeCount: parsed.data.codes.length
      }
    });

    return c.json({
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    });
  }
);

app.post(
  "/projects/:projectId/qualitative-analyses/:analysisId/codings/propose",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const parsed = qualitativeCodingBatchSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_QUALITATIVE_CODING_BATCH",
            message: "Qualitative coding batch is invalid.",
            details: parsed.error.flatten()
          }
        },
        400
      );
    }

    const analysisId = c.req.param("analysisId");
    const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }

    const latestCodebook = latestByVersion(detail.codebookVersions);
    if (!latestCodebook || latestCodebook.source !== "researcher") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_REVIEW_REQUIRED",
            message:
              "Confirm the qualitative codebook before AI-assisted coding begins."
          }
        },
        409
      );
    }

    let question;
    try {
      question = await requireQualitativeQuestion(
        c,
        projectId,
        detail.analysis.researchQuestionId
      );
      await assertQualitativeModelAllowed(c, projectId);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_MODEL_BLOCKED",
            message: error instanceof Error ? error.message : String(error)
          }
        },
        409
      );
    }

    const segmentById = new Map(
      detail.segments.map((segment) => [segment.id, segment])
    );
    const requested = parsed.data.segmentIds
      ? parsed.data.segmentIds.map((id) => segmentById.get(id))
      : detail.segments
          .filter((segment) => segment.codingState === "uncoded")
          .slice(0, 20);
    if (requested.some((segment) => !segment)) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_SEGMENT_NOT_FOUND",
            message:
              "A requested coding segment does not belong to this qualitative analysis."
          }
        },
        404
      );
    }
    const batch = requested.filter(
      (segment): segment is QualitativeSegment => Boolean(segment)
    );
    if (batch.some((segment) => segment.codingState !== "uncoded")) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_SEGMENT_ALREADY_CODED",
            message:
              "Coding proposals can only be generated for currently uncoded segments."
          }
        },
        409
      );
    }

    if (batch.length === 0) {
      await updateQualitativeAnalysisStatus(
        c.env.DB,
        projectId,
        analysisId,
        "coding_review"
      );
      return c.json({
        proposed: 0,
        remainingUncoded: 0,
        detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
      });
    }

    let proposal;
    try {
      proposal = await proposeQualitativeCodings({
        env: c.env,
        researchQuestion: question.text,
        codebook: latestCodebook.codebook,
        segments: batch
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODING_PROPOSAL_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Methodome could not propose qualitative coding."
          }
        },
        422
      );
    }

    const now = new Date().toISOString();
    const codings: QualitativeCoding[] = proposal.assignments.flatMap(
      (assignment) =>
        assignment.codeIds.map((codeId) => ({
          id: makeId("qcoding"),
          analysisId,
          segmentId: assignment.segmentId,
          codeId,
          status: "proposed" as const,
          source: "model" as const,
          ...(assignment.rationale
            ? { rationale: assignment.rationale }
            : {}),
          createdBy: getUserId(c),
          createdAt: now,
          updatedAt: now
        }))
    );
    await upsertQualitativeCodings(c.env.DB, codings);
    await updateQualitativeSegmentCodingState(
      c.env.DB,
      analysisId,
      batch.map((segment) => segment.id),
      "proposed"
    );

    const remainingUncoded = detail.segments.filter(
      (segment) =>
        segment.codingState === "uncoded" &&
        !batch.some((item) => item.id === segment.id)
    ).length;
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      remainingUncoded === 0 ? "coding_review" : "coding_in_progress"
    );
    await addAudit(c, {
      projectId,
      action: "qualitative_codings_proposed",
      objectType: "qualitative_analysis",
      objectId: analysisId,
      modelId: QUALITATIVE_MODEL,
      after: {
        promptVersion: QUALITATIVE_CODING_PROMPT_VERSION,
        segmentIds: batch.map((segment) => segment.id),
        proposedCodingCount: codings.length,
        remainingUncoded
      }
    });

    return c.json({
      proposed: batch.length,
      remainingUncoded,
      assignments: proposal.assignments,
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    });
  }
);

app.put(
  "/projects/:projectId/qualitative-analyses/:analysisId/codings",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const parsed = qualitativeCodingReviewSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_QUALITATIVE_CODING_REVIEW",
            message: "Qualitative coding review is invalid.",
            details: parsed.error.flatten()
          }
        },
        400
      );
    }

    const analysisId = c.req.param("analysisId");
    const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }

    const latestCodebook = latestByVersion(detail.codebookVersions);
    if (!latestCodebook || latestCodebook.source !== "researcher") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_REVIEW_REQUIRED",
            message: "Confirm the codebook before reviewing coding."
          }
        },
        409
      );
    }
    const allowedCodes = new Set(
      latestCodebook.codebook.codes.map((code) => code.id)
    );
    const allowedSegments = new Set(
      detail.segments.map((segment) => segment.id)
    );
    const existingByPair = new Map(
      detail.codings.map((coding) => [
        `${coding.segmentId}\u0000${coding.codeId}`,
        coding
      ])
    );

    const now = new Date().toISOString();
    const reviewerId = getUserId(c);
    const updates: QualitativeCoding[] = [];

    for (const decision of parsed.data.decisions) {
      if (
        !allowedSegments.has(decision.segmentId) ||
        !allowedCodes.has(decision.codeId)
      ) {
        return c.json(
          {
            error: {
              code: "QUALITATIVE_CODING_REFERENCE_INVALID",
              message:
                "A coding decision references a segment or code outside the current analysis."
            }
          },
          409
        );
      }
      const existing = existingByPair.get(
        `${decision.segmentId}\u0000${decision.codeId}`
      );
      if (!existing) {
        return c.json(
          {
            error: {
              code: "QUALITATIVE_CODING_PROPOSAL_NOT_FOUND",
              message:
                "A reviewed model coding must exist before it can be confirmed or rejected."
            }
          },
          409
        );
      }
      updates.push({
        ...existing,
        status: decision.status,
        source: existing.source,
        ...(decision.rationale
          ? { rationale: decision.rationale }
          : existing.rationale
            ? { rationale: existing.rationale }
            : {}),
        reviewedBy: reviewerId,
        reviewedAt: now,
        updatedAt: now
      });
    }

    for (const assignment of parsed.data.manualAssignments) {
      if (
        !allowedSegments.has(assignment.segmentId) ||
        !allowedCodes.has(assignment.codeId)
      ) {
        return c.json(
          {
            error: {
              code: "QUALITATIVE_CODING_REFERENCE_INVALID",
              message:
                "A manual coding references a segment or code outside the current analysis."
            }
          },
          409
        );
      }
      const existing = existingByPair.get(
        `${assignment.segmentId}\u0000${assignment.codeId}`
      );
      updates.push({
        id: existing?.id ?? makeId("qcoding"),
        analysisId,
        segmentId: assignment.segmentId,
        codeId: assignment.codeId,
        status: "confirmed",
        source: existing?.source ?? "researcher",
        ...(assignment.rationale
          ? { rationale: assignment.rationale }
          : existing?.rationale
            ? { rationale: existing.rationale }
            : {}),
        createdBy: existing?.createdBy ?? reviewerId,
        reviewedBy: reviewerId,
        reviewedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    }

    const reviewIds = Array.from(new Set(parsed.data.reviewedSegmentIds));
    for (const segmentId of reviewIds) {
      if (!allowedSegments.has(segmentId)) {
        return c.json(
          {
            error: {
              code: "QUALITATIVE_SEGMENT_NOT_FOUND",
              message:
                "A reviewed segment does not belong to this qualitative analysis."
            }
          },
          404
        );
      }
    }

    const prospectiveByPair = new Map(existingByPair);
    for (const coding of updates) {
      prospectiveByPair.set(
        `${coding.segmentId}\u0000${coding.codeId}`,
        coding
      );
    }
    const unresolvedProposals = new Set(
      Array.from(prospectiveByPair.values())
        .filter((coding) => coding.status === "proposed")
        .map((coding) => coding.segmentId)
    );
    if (reviewIds.some((segmentId) => unresolvedProposals.has(segmentId))) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_SEGMENT_REVIEW_INCOMPLETE",
            message:
              "Confirm or reject every proposed code before marking a segment reviewed."
          }
        },
        409
      );
    }

    await upsertQualitativeCodings(c.env.DB, updates);

    await updateQualitativeSegmentCodingState(
      c.env.DB,
      analysisId,
      reviewIds,
      "reviewed"
    );
    const refreshedSegments = await listQualitativeSegments(
      c.env.DB,
      analysisId
    );
    const allReviewed = refreshedSegments.every(
      (segment) => segment.codingState === "reviewed"
    );
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      allReviewed ? "coding_confirmed" : "coding_review"
    );
    await addAudit(c, {
      projectId,
      action: "qualitative_codings_reviewed",
      objectType: "qualitative_analysis",
      objectId: analysisId,
      after: {
        updatedCodingCount: updates.length,
        reviewedSegmentIds: reviewIds,
        allSegmentsReviewed: allReviewed
      }
    });

    return c.json({
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    });
  }
);

app.post(
  "/projects/:projectId/qualitative-analyses/:analysisId/themes/propose",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const analysisId = c.req.param("analysisId");
    const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }
    if (detail.analysis.status !== "coding_confirmed") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODING_REVIEW_REQUIRED",
            message:
              "Complete researcher review of coding before developing themes."
          }
        },
        409
      );
    }

    const latestCodebook = latestByVersion(detail.codebookVersions);
    if (!latestCodebook || latestCodebook.source !== "researcher") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_REVIEW_REQUIRED",
            message: "A researcher-confirmed codebook is required."
          }
        },
        409
      );
    }

    let question;
    try {
      question = await requireQualitativeQuestion(
        c,
        projectId,
        detail.analysis.researchQuestionId
      );
      await assertQualitativeModelAllowed(c, projectId);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_MODEL_BLOCKED",
            message: error instanceof Error ? error.message : String(error)
          }
        },
        409
      );
    }

    let themeSet;
    try {
      themeSet = await proposeQualitativeThemes({
        env: c.env,
        researchQuestion: question.text,
        codebook: latestCodebook.codebook,
        segments: detail.segments,
        codings: detail.codings
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_THEME_PROPOSAL_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Methodome could not propose qualitative themes."
          }
        },
        422
      );
    }

    const version =
      (latestByVersion(detail.themeVersions)?.version ?? 0) + 1;
    await saveQualitativeThemeVersion(c.env.DB, {
      id: makeId("qthemes"),
      analysisId,
      version,
      source: "model",
      themes: themeSet.themes,
      synthesis: themeSet.synthesis,
      model: qualitativeModelProvenance(
        QUALITATIVE_THEME_PROMPT_VERSION
      ),
      createdBy: getUserId(c),
      createdAt: new Date().toISOString()
    });
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      "theme_review"
    );
    await addAudit(c, {
      projectId,
      action: "qualitative_themes_proposed",
      objectType: "qualitative_analysis",
      objectId: analysisId,
      modelId: QUALITATIVE_MODEL,
      after: {
        version,
        promptVersion: QUALITATIVE_THEME_PROMPT_VERSION,
        themeCount: themeSet.themes.length
      }
    });

    return c.json({
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    });
  }
);

app.put(
  "/projects/:projectId/qualitative-analyses/:analysisId/themes",
  async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProject(c, projectId);
    if ("response" in access) return access.response;

    const analysisId = c.req.param("analysisId");
    const detail = await qualitativeAnalysisDetail(c, projectId, analysisId);
    if (!detail) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_ANALYSIS_NOT_FOUND",
            message: "Qualitative analysis was not found."
          }
        },
        404
      );
    }
    if (detail.analysis.status !== "theme_review") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_THEME_REVIEW_NOT_READY",
            message:
              "Generate candidate themes after confirmed coding before final theme review."
          }
        },
        409
      );
    }

    const body = await c.req.json().catch(() => null);
    const parsed = qualitativeThemeSetSchema.safeParse(
      body && typeof body === "object" && "themeSet" in body
        ? (body as { themeSet: unknown }).themeSet
        : body
    );
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "INVALID_QUALITATIVE_THEMES",
            message: "Reviewed qualitative themes are invalid.",
            details: parsed.error.flatten()
          }
        },
        400
      );
    }

    const latestCodebook = latestByVersion(detail.codebookVersions);
    if (!latestCodebook || latestCodebook.source !== "researcher") {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_CODEBOOK_REVIEW_REQUIRED",
            message: "A researcher-confirmed codebook is required."
          }
        },
        409
      );
    }

    let reviewed;
    try {
      reviewed = validateThemeReferences(
        parsed.data,
        latestCodebook.codebook,
        detail.codings,
        detail.segments.map((segment) => segment.id)
      );
    } catch (error) {
      return c.json(
        {
          error: {
            code: "QUALITATIVE_THEME_EVIDENCE_INVALID",
            message:
              error instanceof Error
                ? error.message
                : "A theme is not supported by confirmed source-linked coding."
          }
        },
        409
      );
    }

    const version =
      (latestByVersion(detail.themeVersions)?.version ?? 0) + 1;
    await saveQualitativeThemeVersion(c.env.DB, {
      id: makeId("qthemes"),
      analysisId,
      version,
      source: "researcher",
      themes: reviewed.themes,
      synthesis: reviewed.synthesis,
      createdBy: getUserId(c),
      createdAt: new Date().toISOString()
    });
    await updateQualitativeAnalysisStatus(
      c.env.DB,
      projectId,
      analysisId,
      "complete"
    );
    await addAudit(c, {
      projectId,
      action: "qualitative_themes_confirmed",
      objectType: "qualitative_analysis",
      objectId: analysisId,
      after: {
        version,
        themeCount: reviewed.themes.length,
        evidenceSegmentIds: Array.from(
          new Set(
            reviewed.themes.flatMap((theme) => theme.evidenceSegmentIds)
          )
        )
      }
    });

    return c.json({
      detail: await qualitativeAnalysisDetail(c, projectId, analysisId)
    });
  }
);

const uploadIntentSchema = z.object({
  filename: z.string().trim().min(1).max(500),
  mediaType: z.string().trim().max(200).optional(),
  fileKind: z.enum([
    "protocol",
    "instrument",
    "codebook",
    "dataset",
    "transcript",
    "other"
  ]),
  sizeBytes: z.number().int().nonnegative().optional()
});

function safeFilename(filename: string): string {
  const cleaned = filename
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "file";
}

app.get("/projects/:projectId/files", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const kind = c.req.query("kind")?.trim();
  const files = await listProjectFiles(
    c.env.DB,
    projectId,
    kind || undefined
  );
  return c.json({ files });
});

app.post("/projects/:projectId/uploads", async (c) => {
  if (!c.env.FILES || c.env.STORAGE_MODE === "disabled") {
    return c.json(
      {
        error: {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          message: "Research file storage is not configured for this deployment."
        }
      },
      503
    );
  }

  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = uploadIntentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_UPLOAD",
          message: "Upload metadata is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const maximum = Number(c.env.MAX_DIRECT_UPLOAD_BYTES ?? "26214400");
  if (parsed.data.sizeBytes != null && parsed.data.sizeBytes > maximum) {
    return c.json(
      {
        error: {
          code: "DIRECT_UPLOAD_TOO_LARGE",
          message: "This file exceeds the direct upload limit.",
          details: { maximumBytes: maximum }
        }
      },
      413
    );
  }

  const fileId = makeId("file");
  const objectKey = `projects/${projectId}/uploads/${fileId}/${safeFilename(
    parsed.data.filename
  )}`;

  await createFileRecord(c.env.DB, {
    id: fileId,
    projectId,
    fileKind: parsed.data.fileKind,
    filename: parsed.data.filename,
    objectKey,
    ...(parsed.data.mediaType ? { mediaType: parsed.data.mediaType } : {}),
    ...(parsed.data.sizeBytes != null ? { sizeBytes: parsed.data.sizeBytes } : {}),
    createdBy: getUserId(c)
  });

  return c.json(
    {
      fileId,
      objectKey,
      uploadMethod: "PUT",
      uploadPath: `/api/files/${fileId}/content`
    },
    201
  );
});

app.put("/files/:fileId/content", async (c) => {
  if (!c.env.FILES || c.env.STORAGE_MODE === "disabled") {
    return c.json(
      {
        error: {
          code: "OBJECT_STORAGE_NOT_CONFIGURED",
          message: "Research file storage is not configured for this deployment."
        }
      },
      503
    );
  }

  const record = await getFileRecord(c.env.DB, c.req.param("fileId"), getUserId(c));
  if (!record) {
    return c.json(
      { error: { code: "FILE_NOT_FOUND", message: "File record was not found." } },
      404
    );
  }

  const maximum = Number(c.env.MAX_DIRECT_UPLOAD_BYTES ?? "26214400");
  const announcedLength = Number(c.req.header("content-length") ?? "0");

  if (announcedLength > maximum) {
    return c.json(
      {
        error: {
          code: "DIRECT_UPLOAD_TOO_LARGE",
          message: "This file exceeds the direct upload limit.",
          details: { maximumBytes: maximum }
        }
      },
      413
    );
  }

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength > maximum) {
    return c.json(
      {
        error: {
          code: "DIRECT_UPLOAD_TOO_LARGE",
          message: "This file exceeds the direct upload limit.",
          details: { maximumBytes: maximum }
        }
      },
      413
    );
  }

  const checksum = await sha256BytesHex(bytes);

  await c.env.FILES.put(record.objectKey, bytes, {
    httpMetadata: {
      contentType: c.req.header("content-type") ?? "application/octet-stream"
    },
    customMetadata: {
      sha256: checksum,
      originalFilename: record.filename
    }
  });

  await finaliseFileChecksum(c.env.DB, record.id, checksum, bytes.byteLength);
  await addAudit(c, {
    projectId: record.projectId,
    action: "file_uploaded",
    objectType: "file",
    objectId: record.id,
    after: {
      objectKey: record.objectKey,
      checksumSha256: checksum,
      sizeBytes: bytes.byteLength
    }
  });

  return c.json({
    fileId: record.id,
    checksumSha256: checksum,
    sizeBytes: bytes.byteLength
  });
});


const plannedAnalysisSchema = z.object({
  id: z.string().min(1),
  researchQuestionId: z.string().min(1),
  outcome: z.string().min(1),
  predictors: z.array(z.string()),
  covariates: z.array(z.string()),
  candidateMethodIds: z.array(z.string()).min(1),
  selectedMethodId: z.string().min(1).optional(),
  requiredDecisions: z.array(z.string()),
  warnings: z.array(z.string()),
  diagnostics: z.array(z.string()),
  addedAfterLock: z.boolean().default(false)
});

const createPlanSchema = z.object({
  versionId: z.string().min(1).max(100),
  datasetVersionId: z.string().min(1).optional(),
  status: z.enum([
    "preregistered",
    "planned_before_analysis",
    "exploratory"
  ]),
  analyses: z.array(plannedAnalysisSchema)
});

app.get("/projects/:projectId/analysis-plan", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  return c.json({
    plan: await getLatestAnalysisPlan(c.env.DB, projectId)
  });
});

const updatePlanMethodsSchema = z.object({
  methodSelections: z.array(
    z.object({
      analysisId: z.string().min(1),
      methodId: z.string().min(1)
    })
  ).min(1)
});

app.patch("/projects/:projectId/analysis-plan/:planId", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = updatePlanMethodsSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_ANALYSIS_PLAN_UPDATE",
          message: "Analysis plan method selections are invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const plan = await getAnalysisPlanById(
    c.env.DB,
    projectId,
    c.req.param("planId")
  );
  if (!plan) {
    return c.json(
      {
        error: {
          code: "ANALYSIS_PLAN_NOT_FOUND",
          message: "Analysis plan was not found."
        }
      },
      404
    );
  }
  if (plan.lockedAt || plan.lockHash) {
    return c.json(
      {
        error: {
          code: "ANALYSIS_PLAN_ALREADY_LOCKED",
          message: "A locked analysis plan cannot be changed."
        }
      },
      409
    );
  }

  for (const selection of parsed.data.methodSelections) {
    const definition = methodRegistry[selection.methodId];
    if (!definition || !definition.executable) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_PLAN_METHOD_NOT_EXECUTABLE",
            message:
              "Every selected method must be an executable Methodome method.",
            details: selection
          }
        },
        409
      );
    }
  }

  let updated: AnalysisPlan;
  try {
    updated = updateAnalysisMethodSelections(
      plan,
      parsed.data.methodSelections
    );
  } catch (error) {
    return c.json(
      {
        error: {
          code: "ANALYSIS_PLAN_METHOD_OUTSIDE_CANDIDATES",
          message:
            error instanceof Error
              ? error.message
              : "A selected method is outside the candidate set."
        }
      },
      409
    );
  }

  await updateStoredAnalysisPlan(c.env.DB, updated);
  await addAudit(c, {
    projectId,
    action: "analysis_plan_methods_selected",
    objectType: "analysis_plan",
    objectId: updated.id,
    before: plan,
    after: updated
  });

  return c.json({ plan: updated });
});

app.post("/projects/:projectId/analysis-plan", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = createPlanSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_ANALYSIS_PLAN",
          message: "Analysis plan is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const specification = await getStudySpecification(c.env.DB, projectId);
  if (!specification) {
    return c.json(
      {
        error: {
          code: "STUDY_SPECIFICATION_REQUIRED",
          message: "Confirm the study specification before creating an analysis plan."
        }
      },
      409
    );
  }

  if (
    parsed.data.datasetVersionId &&
    !(await datasetBelongsToProject(
      c.env.DB,
      parsed.data.datasetVersionId,
      projectId
    ))
  ) {
    return c.json(
      {
        error: {
          code: "DATASET_NOT_FOUND",
          message: "The selected dataset version does not belong to this project."
        }
      },
      404
    );
  }

  const resolvedForPlan = await resolveStudySpecificationForMethods(
    c,
    projectId,
    specification,
    parsed.data.datasetVersionId
  );

  for (const analysis of parsed.data.analyses) {
    const question = resolvedForPlan.specification.researchQuestions.find(
      (item) => item.id === analysis.researchQuestionId
    );
    if (!question) {
      return c.json(
        {
          error: {
            code: "RESEARCH_QUESTION_NOT_FOUND",
            message: "An analysis references a research question that is not in the current study specification."
          }
        },
        409
      );
    }

    const mappedOutcomes = new Set(
      question.outcomes.flatMap((item) =>
        item.datasetVariable ? [item.datasetVariable] : []
      )
    );
    const mappedPredictors = new Set(
      question.predictors.flatMap((item) =>
        item.datasetVariable ? [item.datasetVariable] : []
      )
    );
    const mappedCovariates = new Set(
      question.covariates.flatMap((item) =>
        item.datasetVariable ? [item.datasetVariable] : []
      )
    );

    if (
      !mappedOutcomes.has(analysis.outcome) ||
      analysis.predictors.some((item) => !mappedPredictors.has(item)) ||
      analysis.covariates.some((item) => !mappedCovariates.has(item))
    ) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_PLAN_VARIABLE_MISMATCH",
            message:
              "Planned variables must come from confirmed mappings for the referenced research question.",
            details: { researchQuestionId: analysis.researchQuestionId }
          }
        },
        409
      );
    }

    const selection = selectCandidateMethods(
      resolvedForPlan.specification,
      analysis.researchQuestionId
    );
    if (analysis.selectedMethodId) {
      const selectedCandidate = selection.candidates.find(
        (candidate) => candidate.methodId === analysis.selectedMethodId
      );

      if (!selectedCandidate) {
        return c.json(
          {
            error: {
              code: "ANALYSIS_PLAN_METHOD_OUTSIDE_CANDIDATES",
              message:
                "A selected method falls outside the current deterministic candidate set.",
              details: {
                researchQuestionId: analysis.researchQuestionId,
                methodId: analysis.selectedMethodId
              }
            }
          },
          409
        );
      }

      if (!selectedCandidate.executable) {
        return c.json(
          {
            error: {
              code: "ANALYSIS_PLAN_METHOD_NOT_EXECUTABLE",
              message:
                "The selected method is a candidate but is not executable in the current statistical runner.",
              details: {
                researchQuestionId: analysis.researchQuestionId,
                methodId: analysis.selectedMethodId
              }
            }
          },
          409
        );
      }
    }
  }

  const now = new Date().toISOString();
  const plan = buildAnalysisPlan({
    id: makeId("plan"),
    projectId,
    versionId: parsed.data.versionId,
    ...(parsed.data.datasetVersionId
      ? { datasetVersionId: parsed.data.datasetVersionId }
      : {}),
    studySpecificationVersion: specification.version,
    status: parsed.data.status,
    analyses: parsed.data.analyses as PlannedAnalysis[],
    createdBy: getUserId(c),
    createdAt: now
  });

  await saveAnalysisPlan(c.env.DB, plan);
  await addAudit(c, {
    projectId,
    action: "analysis_plan_created",
    objectType: "analysis_plan",
    objectId: plan.id,
    after: plan
  });

  return c.json({ plan }, 201);
});

app.post("/projects/:projectId/analysis-plan/:planId/lock", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const plan = await getAnalysisPlanById(
    c.env.DB,
    projectId,
    c.req.param("planId")
  );

  if (!plan) {
    return c.json(
      {
        error: {
          code: "ANALYSIS_PLAN_NOT_FOUND",
          message: "Analysis plan was not found."
        }
      },
      404
    );
  }

  if (plan.lockedAt || plan.lockHash) {
    return c.json(
      {
        error: {
          code: "ANALYSIS_PLAN_ALREADY_LOCKED",
          message: "Analysis plan is already locked."
        }
      },
      409
    );
  }

  let locked: AnalysisPlan;
  try {
    locked = await lockAnalysisPlan(plan, new Date().toISOString());
  } catch (error) {
    return c.json(
      {
        error: {
          code: "ANALYSIS_PLAN_NOT_READY_TO_LOCK",
          message:
            error instanceof Error
              ? error.message
              : "Resolve all analysis-plan decisions before locking."
        }
      },
      409
    );
  }
  await updateStoredAnalysisPlan(c.env.DB, locked);
  await addAudit(c, {
    projectId,
    action: "analysis_plan_locked",
    objectType: "analysis_plan",
    objectId: locked.id,
    after: {
      versionId: locked.versionId,
      lockedAt: locked.lockedAt,
      lockHash: locked.lockHash,
      status: locked.status
    }
  });

  return c.json({ plan: locked });
});

const variableMappingsSchema = z.object({
  mappings: z.array(
    z.object({
      id: z.string().min(1),
      researchConcept: z.string().min(1),
      datasetVariable: z.string().min(1).optional(),
      mappingStatus: z.enum([
        "direct_match",
        "probable_match",
        "uncertain",
        "no_match"
      ]),
      evidence: z.array(z.string()).default([]),
      confirmed: z.boolean().default(false)
    })
  )
});

app.get("/projects/:projectId/variable-mappings", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  return c.json({
    mappings: await listVariableMappings(c.env.DB, projectId)
  });
});

app.put("/projects/:projectId/variable-mappings", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = variableMappingsSchema.safeParse(
    await c.req.json().catch(() => null)
  );

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_VARIABLE_MAPPINGS",
          message: "Variable mappings are invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const specificationRecord = await getCurrentStudySpecificationRecord(
    c.env.DB,
    projectId
  );

  if (!specificationRecord) {
    return c.json(
      {
        error: {
          code: "STUDY_SPECIFICATION_REQUIRED",
          message: "Confirm the study specification before mapping variables."
        }
      },
      409
    );
  }

  await saveVariableMappings(c.env.DB, {
    projectId,
    studySpecificationId: specificationRecord.id,
    mappings: parsed.data.mappings.map((mapping) => ({
      id: mapping.id,
      researchConcept: mapping.researchConcept,
      ...(mapping.datasetVariable
        ? { datasetVariable: mapping.datasetVariable }
        : {}),
      mappingStatus: mapping.mappingStatus,
      evidence: mapping.evidence,
      ...(mapping.confirmed ? { confirmedBy: getUserId(c) } : {})
    }))
  });

  await addAudit(c, {
    projectId,
    action: "variable_mappings_updated",
    objectType: "variable_mapping_set",
    objectId: specificationRecord.id,
    after: parsed.data.mappings
  });

  return c.json({
    mappings: await listVariableMappings(c.env.DB, projectId)
  });
});

const createJobSchema = z.object({
  datasetVersionId: z.string().min(1),
  analysisPlanId: z.string().min(1).optional(),
  methodId: z.string().min(1),
  outcome: z.string().min(1).optional(),
  predictors: z.array(z.string()).default([]),
  covariates: z.array(z.string()).default([]),
  cluster: z.string().optional(),
  weights: z.string().optional(),
  strata: z.string().optional(),
  filters: z.array(z.record(z.string(), z.unknown())).default([]),
  missingDataStrategy: z.string().optional(),
  overrideReason: z.string().trim().min(1).max(2000).optional()
});

app.post("/projects/:projectId/analysis-jobs", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const parsed = createJobSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_ANALYSIS_JOB",
          message: "Analysis job specification is invalid.",
          details: parsed.error.flatten()
        }
      },
      400
    );
  }

  const requestedMethod = methodRegistry[parsed.data.methodId];
  if (!requestedMethod) {
    return c.json(
      {
        error: {
          code: "UNKNOWN_METHOD",
          message: "The requested statistical method is not in the registry."
        }
      },
      400
    );
  }

  if (!requestedMethod.executable) {
    return c.json(
      {
        error: {
          code: "METHOD_NOT_EXECUTABLE",
          message: "This method is listed in Methodome but its statistical execution engine is not enabled yet."
        }
      },
      409
    );
  }

  if (parsed.data.filters.length > 0) {
    return c.json(
      {
        error: {
          code: "FILTER_EXECUTION_NOT_IMPLEMENTED",
          message: "Saved analysis filters are not executable in the current statistical runner. Create the required derived dataset before running this analysis."
        }
      },
      409
    );
  }

  if (parsed.data.cluster || parsed.data.weights || parsed.data.strata) {
    return c.json(
      {
        error: {
          code: "COMPLEX_DESIGN_EXECUTION_NOT_IMPLEMENTED",
          message: "Cluster, survey weight and strata execution is not enabled for the current statistical runner."
        }
      },
      409
    );
  }

  if (
    parsed.data.missingDataStrategy &&
    parsed.data.missingDataStrategy !== "complete_case"
  ) {
    return c.json(
      {
        error: {
          code: "MISSING_DATA_STRATEGY_NOT_IMPLEMENTED",
          message: "The current statistical runner executes complete-case analysis only."
        }
      },
      409
    );
  }

  if (
    !(await datasetBelongsToProject(
      c.env.DB,
      parsed.data.datasetVersionId,
      projectId
    ))
  ) {
    return c.json(
      {
        error: {
          code: "DATASET_NOT_FOUND",
          message: "The requested dataset version does not belong to this project."
        }
      },
      404
    );
  }

  if (parsed.data.analysisPlanId) {
    const referencedPlan = await getAnalysisPlanById(
      c.env.DB,
      projectId,
      parsed.data.analysisPlanId
    );

    if (!referencedPlan) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_PLAN_NOT_FOUND",
            message: "The analysis plan referenced by this job was not found."
          }
        },
        404
      );
    }

    if (!referencedPlan.lockedAt || !referencedPlan.lockHash) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_PLAN_NOT_LOCKED",
            message: "Lock the analysis plan before running it as planned analysis."
          }
        },
        409
      );
    }

    if (
      referencedPlan.datasetVersionId &&
      referencedPlan.datasetVersionId !== parsed.data.datasetVersionId
    ) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_PLAN_DATASET_MISMATCH",
            message: "The requested dataset does not match the locked analysis plan."
          }
        },
        409
      );
    }

    const inPlan = referencedPlan.analyses.some(
      (analysis) =>
        analysis.selectedMethodId === parsed.data.methodId &&
        analysis.outcome === parsed.data.outcome &&
        JSON.stringify(analysis.predictors) === JSON.stringify(parsed.data.predictors) &&
        JSON.stringify(analysis.covariates) === JSON.stringify(parsed.data.covariates)
    );

    if (!inPlan) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_JOB_NOT_IN_LOCKED_PLAN",
            message:
              "The requested analysis does not match an analysis recorded in the locked plan."
          }
        },
        409
      );
    }
  }

  const specification = await getStudySpecification(c.env.DB, projectId);
  const resolvedForJob = specification
    ? await resolveStudySpecificationForMethods(
        c,
        projectId,
        specification,
        parsed.data.datasetVersionId
      )
    : null;
  const eligible = resolvedForJob
    ? new Set(
        resolvedForJob.specification.researchQuestions.flatMap((question) =>
          selectCandidateMethods(resolvedForJob.specification, question.id).candidates.map(
            (candidate) => candidate.methodId
          )
        )
      )
    : new Set<string>();

  if (!eligible.has(parsed.data.methodId) && !parsed.data.overrideReason) {
    return c.json(
      {
        error: {
          code: "METHOD_OVERRIDE_REASON_REQUIRED",
          message:
            "This method is outside the current deterministic candidate set. Provide a reason to continue in manual mode."
        }
      },
      409
    );
  }

  const now = new Date().toISOString();
  const job: AnalysisJob = {
    jobId: makeId("job"),
    projectId,
    datasetVersionId: parsed.data.datasetVersionId,
    ...(parsed.data.analysisPlanId
      ? { analysisPlanId: parsed.data.analysisPlanId }
      : {}),
    methodId: parsed.data.methodId,
    ...(parsed.data.outcome ? { outcome: parsed.data.outcome } : {}),
    predictors: parsed.data.predictors,
    covariates: parsed.data.covariates,
    ...(parsed.data.cluster ? { cluster: parsed.data.cluster } : {}),
    ...(parsed.data.weights ? { weights: parsed.data.weights } : {}),
    ...(parsed.data.strata ? { strata: parsed.data.strata } : {}),
    filters: parsed.data.filters,
    ...(parsed.data.missingDataStrategy
      ? { missingDataStrategy: parsed.data.missingDataStrategy }
      : {}),
    requestedBy: getUserId(c),
    ...(parsed.data.overrideReason
      ? { overrideReason: parsed.data.overrideReason }
      : {}),
    registryVersion,
    createdAt: now
  };

  await createAnalysisJob(c.env.DB, job, "queued");
  await c.env.ANALYSIS_QUEUE.send({ jobId: job.jobId, projectId });

  await addAudit(c, {
    projectId,
    action: parsed.data.overrideReason
      ? "analysis_job_created_with_override"
      : "analysis_job_created",
    objectType: "analysis_job",
    objectId: job.jobId,
    ...(parsed.data.overrideReason ? { reason: parsed.data.overrideReason } : {}),
    after: job
  });

  return c.json({ jobId: job.jobId, state: "queued" }, 202);
});

app.get("/analysis-jobs/:jobId", async (c) => {
  const found = await getAnalysisJob(
    c.env.DB,
    c.req.param("jobId"),
    getUserId(c)
  );

  if (!found) {
    return c.json(
      { error: { code: "JOB_NOT_FOUND", message: "Analysis job was not found." } },
      404
    );
  }

  return c.json(found);
});

app.get("/analysis-jobs/:jobId/result", async (c) => {
  const result = await getAnalysisResult(
    c.env.DB,
    c.req.param("jobId"),
    getUserId(c)
  );

  if (!result) {
    return c.json(
      {
        error: {
          code: "RESULT_NOT_AVAILABLE",
          message: "The analysis result is not available."
        }
      },
      404
    );
  }

  return c.json({ result });
});

app.get("/projects/:projectId/audit", async (c) => {
  const projectId = c.req.param("projectId");
  const access = await requireProject(c, projectId);
  if ("response" in access) return access.response;

  const events = await listAuditEvents(c.env.DB, projectId, getUserId(c));
  return c.json({ events });
});

app.onError((error, c) => {
  console.error(error);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Methodome could not complete the request."
      }
    },
    500
  );
});

export default {
  fetch: app.fetch,
  queue: consumeAnalysisQueue
} satisfies ExportedHandler<Env>;
