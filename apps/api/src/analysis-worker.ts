import type { AnalysisResult } from "@methodome/analysis-contracts";
import { hashAuditEvent } from "@methodome/provenance";
import type { AnalysisQueueMessage, Env } from "./env";
import { makeId } from "./id";
import {
  appendAuditEvent,
  getAnalysisJobForWorker,
  getAuditHeadHash,
  getDatasetVersionRecord,
  saveAnalysisResult,
  updateAnalysisJobState
} from "./db";

async function markFailed(env: Env, jobId: string): Promise<void> {
  await updateAnalysisJobState(env.DB, jobId, "failed", {
    completedAt: new Date().toISOString()
  });
}

export async function processAnalysisMessage(
  message: AnalysisQueueMessage,
  env: Env
): Promise<void> {
  const job = await getAnalysisJobForWorker(
    env.DB,
    message.jobId,
    message.projectId
  );

  if (!job) {
    throw new Error(`Analysis job ${message.jobId} was not found.`);
  }

  const startedAt = new Date().toISOString();
  await updateAnalysisJobState(env.DB, job.jobId, "preparing_data", {
    startedAt
  });

  const dataset = await getDatasetVersionRecord(
    env.DB,
    job.datasetVersionId,
    job.projectId
  );

  if (!dataset) {
    await markFailed(env, job.jobId);
    return;
  }

  if (!env.FILES) {
    await markFailed(env, job.jobId);
    throw new Error("R2 FILES binding is not configured.");
  }

  const object = await env.FILES.get(dataset.objectKey);
  if (!object) {
    await markFailed(env, job.jobId);
    return;
  }

  const csv = await object.text();

  await updateAnalysisJobState(env.DB, job.jobId, "checking_requirements");
  await updateAnalysisJobState(env.DB, job.jobId, "running_model");

  const response = await env.STATS.fetch(
    new Request("https://methodome-stats.internal/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        methodId: job.methodId,
        csv,
        ...(job.outcome ? { outcome: job.outcome } : {}),
        predictors: job.predictors,
        covariates: job.covariates
      })
    })
  );

  if (!response.ok) {
    const detail = await response.text();
    if (response.status >= 500) {
      throw new Error(
        `Statistics service failed with ${response.status}: ${detail}`
      );
    }
    await markFailed(env, job.jobId);
    return;
  }

  await updateAnalysisJobState(env.DB, job.jobId, "running_diagnostics");

  const raw = (await response.json()) as Omit<AnalysisResult, "jobId">;
  const result: AnalysisResult = {
    ...raw,
    jobId: job.jobId
  };

  await updateAnalysisJobState(env.DB, job.jobId, "preparing_results");

  const provenance = {
    analysisJobId: job.jobId,
    projectId: job.projectId,
    datasetVersionId: job.datasetVersionId,
    datasetChecksumSha256: dataset.checksumSha256,
    registryVersion: job.registryVersion,
    methodId: job.methodId,
    filters: job.filters,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt,
    executedAt: new Date().toISOString(),
    software: result.software
  };

  await saveAnalysisResult(env.DB, {
    id: makeId("result"),
    result,
    provenance
  });

  const previousHash = await getAuditHeadHash(env.DB, job.projectId);
  const audit = await hashAuditEvent(
    {
      id: makeId("evt"),
      projectId: job.projectId,
      userId: job.requestedBy,
      action: "analysis_completed",
      objectType: "analysis_job",
      objectId: job.jobId,
      after: {
        methodId: job.methodId,
        datasetVersionId: job.datasetVersionId,
        datasetChecksumSha256: dataset.checksumSha256,
        n: result.n
      },
      timestamp: new Date().toISOString()
    },
    previousHash
  );
  await appendAuditEvent(env.DB, audit);

  await updateAnalysisJobState(env.DB, job.jobId, "complete", {
    completedAt: new Date().toISOString()
  });
}

function isAnalysisQueueMessage(value: unknown): value is AnalysisQueueMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.jobId === "string" && typeof record.projectId === "string";
}

export async function consumeAnalysisQueue(
  batch: MessageBatch<unknown>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    if (!isAnalysisQueueMessage(message.body)) {
      console.error("Invalid analysis queue message", message.body);
      message.ack();
      continue;
    }

    try {
      await processAnalysisMessage(message.body, env);
      message.ack();
    } catch (error) {
      console.error("Analysis queue processing failed", error);
      message.retry();
    }
  }
}
