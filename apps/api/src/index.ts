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
import type { AnalysisJob, PlannedAnalysis } from "@methodome/analysis-contracts";
import {
  createAnalysisPlan as buildAnalysisPlan,
  lockAnalysisPlan
} from "@methodome/analysis-plan";
import type { Project } from "@methodome/domain";
import { assertModelRequestAllowed, type ProjectProcessingPolicy } from "@methodome/policy-engine";
import { compareDatasetSchemas } from "@methodome/schema-harmonisation";
import { requireAuth } from "./auth";
import { consumeAnalysisQueue } from "./analysis-worker";
import { createAuth } from "./better-auth";
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
  listAuditEvents,
  listDatasetVersions,
  listProjectFiles,
  listVariableMappings,
  listProjects,
  saveAnalysisPlan,
  saveProtocolExtraction,
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
      variable.variableType =
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
          : variable.variableType;
    }
  }

  return { specification: resolved, datasetVersionId: preferred.id };
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
  if (policy) {
    try {
      assertModelRequestAllowed(policy, {
        processorId: "workers-ai",
        providerKind: "internal",
        payloadKind: instrumentText ? "document_text" : "metadata",
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
                : "Project processing policy blocks model-assisted variable mapping."
          }
        },
        409
      );
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
    ...(instrumentText ? { instrumentText } : {})
  });

  return c.json({
    datasetVersionId: preferred.id,
    variables: profile.variables,
    suggestions
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
