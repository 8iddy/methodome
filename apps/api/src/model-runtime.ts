import { AsyncLocalStorage } from "node:async_hooks";
import type { Env } from "./env";
import { makeId } from "./id";

/**
 * The one place Methodome calls Workers AI.
 *
 * Every call is recorded (purpose, model, size, duration, outcome) so usage
 * can be seen per project and per researcher, and so cheaper models can
 * later be assigned per purpose with evidence. Recording is best effort and
 * never changes the result of the call.
 */

export type ModelPurpose =
  | "document_conversion"
  | "protocol_extraction"
  | "protocol_question_refinement"
  | "variable_mapping"
  | "project_assistant"
  | "qualitative_codebook"
  | "qualitative_coding"
  | "qualitative_themes";

interface UsageContext {
  projectId?: string;
  userId?: string;
}

const usageContext = new AsyncLocalStorage<UsageContext>();

/** Runs `fn` so that model calls inside it are attributed to this context. */
export function withModelUsageContext<T>(
  context: UsageContext,
  fn: () => Promise<T>
): Promise<T> {
  return usageContext.run(context, fn);
}

function textLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value === undefined || value === null) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function messagesLength(input: Record<string, unknown>): number {
  const messages = input.messages;
  if (Array.isArray(messages)) {
    return messages.reduce(
      (total, message) =>
        total + textLength((message as { content?: unknown })?.content),
      0
    );
  }
  return textLength(input.prompt ?? input);
}

function usageTokens(response: unknown): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  const usage = (response as { usage?: Record<string, unknown> } | null)?.usage;
  const prompt = usage?.prompt_tokens;
  const completion = usage?.completion_tokens;
  return {
    promptTokens: typeof prompt === "number" ? prompt : null,
    completionTokens: typeof completion === "number" ? completion : null
  };
}

async function record(
  env: Env,
  row: {
    purpose: ModelPurpose;
    model: string;
    inputChars: number;
    outputChars: number;
    promptTokens: number | null;
    completionTokens: number | null;
    maxTokens: number | null;
    durationMs: number;
    status: "ok" | "error";
    errorMessage?: string;
  }
): Promise<void> {
  const context = usageContext.getStore() ?? {};
  try {
    await env.DB.prepare(
      `INSERT INTO model_invocations
       (id, project_id, user_id, purpose, model, input_chars, output_chars,
        prompt_tokens, completion_tokens, max_tokens, duration_ms, status,
        error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        makeId("minv"),
        context.projectId ?? null,
        context.userId ?? null,
        row.purpose,
        row.model,
        row.inputChars,
        row.outputChars,
        row.promptTokens,
        row.completionTokens,
        row.maxTokens,
        row.durationMs,
        row.status,
        row.errorMessage?.slice(0, 500) ?? null,
        new Date().toISOString()
      )
      .run();
  } catch {
    // Usage accounting must never break research work.
  }
}

export async function runModel<T = unknown>(
  env: Env,
  purpose: ModelPurpose,
  model: string,
  input: Record<string, unknown>
): Promise<T> {
  if (!env.AI) throw new Error("Workers AI is not configured.");
  const started = Date.now();
  const maxTokens =
    typeof input.max_tokens === "number" ? (input.max_tokens as number) : null;
  try {
    const response = (await (env.AI as any).run(model, input)) as T;
    const tokens = usageTokens(response);
    await record(env, {
      purpose,
      model,
      inputChars: messagesLength(input),
      outputChars: textLength(
        (response as { response?: unknown } | null)?.response ?? response
      ),
      ...tokens,
      maxTokens,
      durationMs: Date.now() - started,
      status: "ok"
    });
    return response;
  } catch (error) {
    await record(env, {
      purpose,
      model,
      inputChars: messagesLength(input),
      outputChars: 0,
      promptTokens: null,
      completionTokens: null,
      maxTokens,
      durationMs: Date.now() - started,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/** Document-to-Markdown conversion, recorded like any other model call. */
export async function convertDocumentToMarkdown(
  env: Env,
  input: { name: string; blob: Blob }
): Promise<unknown> {
  if (!env.AI) throw new Error("Workers AI is not configured.");
  const started = Date.now();
  try {
    const converted = await (env.AI as any).toMarkdown(input);
    const first = Array.isArray(converted) ? converted[0] : converted;
    await record(env, {
      purpose: "document_conversion",
      model: "toMarkdown",
      inputChars: input.blob.size,
      outputChars: textLength(first?.data),
      promptTokens: null,
      completionTokens: null,
      maxTokens: null,
      durationMs: Date.now() - started,
      status: "ok"
    });
    return converted;
  } catch (error) {
    await record(env, {
      purpose: "document_conversion",
      model: "toMarkdown",
      inputChars: input.blob.size,
      outputChars: 0,
      promptTokens: null,
      completionTokens: null,
      maxTokens: null,
      durationMs: Date.now() - started,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export interface ModelUsageSummary {
  since: string;
  totals: { calls: number; failures: number; inputChars: number; outputChars: number };
  byPurpose: Array<{
    purpose: string;
    model: string;
    calls: number;
    failures: number;
    inputChars: number;
    outputChars: number;
    promptTokens: number | null;
    completionTokens: number | null;
    averageDurationMs: number;
  }>;
  byDay: Array<{ day: string; calls: number; inputChars: number }>;
}

export async function summarizeModelUsage(
  env: Env,
  scope: { userId?: string; projectId?: string },
  days = 30
): Promise<ModelUsageSummary> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const where = scope.projectId ? "project_id = ?" : "user_id = ?";
  const key = scope.projectId ?? scope.userId ?? "";

  const byPurpose = await env.DB.prepare(
    `SELECT purpose, model, COUNT(*) AS calls,
            SUM(status = 'error') AS failures,
            SUM(input_chars) AS input_chars, SUM(output_chars) AS output_chars,
            SUM(prompt_tokens) AS prompt_tokens,
            SUM(completion_tokens) AS completion_tokens,
            AVG(duration_ms) AS avg_ms
     FROM model_invocations
     WHERE ${where} AND created_at >= ?
     GROUP BY purpose, model
     ORDER BY input_chars DESC`
  )
    .bind(key, since)
    .all<Record<string, number | string | null>>();

  const byDay = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS calls,
            SUM(input_chars) AS input_chars
     FROM model_invocations
     WHERE ${where} AND created_at >= ?
     GROUP BY day ORDER BY day`
  )
    .bind(key, since)
    .all<{ day: string; calls: number; input_chars: number }>();

  const rows = byPurpose.results.map((row) => ({
    purpose: String(row.purpose),
    model: String(row.model),
    calls: Number(row.calls ?? 0),
    failures: Number(row.failures ?? 0),
    inputChars: Number(row.input_chars ?? 0),
    outputChars: Number(row.output_chars ?? 0),
    promptTokens: row.prompt_tokens === null ? null : Number(row.prompt_tokens),
    completionTokens:
      row.completion_tokens === null ? null : Number(row.completion_tokens),
    averageDurationMs: Math.round(Number(row.avg_ms ?? 0))
  }));

  return {
    since,
    totals: rows.reduce(
      (total, row) => ({
        calls: total.calls + row.calls,
        failures: total.failures + row.failures,
        inputChars: total.inputChars + row.inputChars,
        outputChars: total.outputChars + row.outputChars
      }),
      { calls: 0, failures: 0, inputChars: 0, outputChars: 0 }
    ),
    byPurpose: rows,
    byDay: byDay.results.map((row) => ({
      day: row.day,
      calls: Number(row.calls),
      inputChars: Number(row.input_chars ?? 0)
    }))
  };
}
