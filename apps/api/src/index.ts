import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { parseStudySpecification } from "@methodome/study-spec";
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
import type { AnalysisJob, PlannedAnalysis } from "@methodome/analysis-contracts";
import {
  createAnalysisPlan as buildAnalysisPlan,
  lockAnalysisPlan
} from "@methodome/analysis-plan";
import type { Project } from "@methodome/domain";
import type { ProjectProcessingPolicy } from "@methodome/policy-engine";
import { compareDatasetSchemas } from "@methodome/schema-harmonisation";
import { requireAuth } from "./auth";
import { createAuth } from "./better-auth";
import { consumeAnalysisQueue } from "./analysis-worker";
import type { Env, Variables } from "./env";
import { makeId } from "./id";
import {
  appendAuditEvent,
  createAnalysisJob,
  createDatasetVersion,
  createFileRecord,
  createTransformationEvent,
  createProject,
  datasetBelongsToProject,
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
  listAnalysisHistory,
  listAuditEvents,
  listDatasetVersions,
  listVariableMappings,
  listProjects,
  saveAnalysisPlan,
  saveStudySpecification,
  saveVariableMappings,
  updateProjectPolicy,
  updateStoredAnalysisPlan
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

  const selections = specification.researchQuestions.map((question) =>
    selectCandidateMethods(specification, question.id)
  );

  return c.json({ selections, registryVersion });
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

  for (const analysis of parsed.data.analyses) {
    const selection = selectCandidateMethods(
      specification,
      analysis.researchQuestionId
    );
    const allowed = new Set(
      selection.candidates.map((candidate) => candidate.methodId)
    );

    if (
      analysis.selectedMethodId &&
      !allowed.has(analysis.selectedMethodId) &&
      analysis.warnings.length === 0
    ) {
      return c.json(
        {
          error: {
            code: "ANALYSIS_PLAN_METHOD_OUTSIDE_CANDIDATES",
            message:
              "A selected method falls outside the current deterministic candidate set. Record the methodological warning before saving the plan.",
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

  const locked = await lockAnalysisPlan(plan, new Date().toISOString());
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

  if (!methodRegistry[parsed.data.methodId]) {
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

  const specification = await getStudySpecification(c.env.DB, projectId);
  const eligible = specification
    ? new Set(
        specification.researchQuestions.flatMap((question) =>
          selectCandidateMethods(specification, question.id).candidates.map(
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
