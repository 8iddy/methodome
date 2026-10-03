import { z } from "zod";
import type { Env } from "./env";
import { runModel, type ModelPurpose } from "./model-runtime";
import {
  codingProposalSchema,
  qualitativeCodebookSchema,
  qualitativeThemeSetSchema,
  validateCodebookReferences,
  validateThemeReferences,
  type CodingProposal,
  type QualitativeCodebook,
  type QualitativeCoding,
  type QualitativeSegment,
  type QualitativeThemeSet
} from "@methodome/qualitative-analysis";

export const QUALITATIVE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const QUALITATIVE_CODEBOOK_PROMPT_VERSION = "qualitative-codebook-v1";
export const QUALITATIVE_CODING_PROMPT_VERSION = "qualitative-coding-v1";
export const QUALITATIVE_THEME_PROMPT_VERSION = "qualitative-themes-v1";

function modelPayload(result: unknown): unknown {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") {
    throw new Error("Workers AI returned an empty qualitative-analysis response.");
  }
  const record = result as Record<string, unknown>;
  if (record.response !== undefined) return record.response;
  if (record.result && typeof record.result === "object") {
    const nested = record.result as Record<string, unknown>;
    if (nested.response !== undefined) return nested.response;
  }
  if (Array.isArray(record.choices)) {
    const first = record.choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message?.content !== undefined) return message.content;
  }
  throw new Error("Workers AI returned an unsupported qualitative-analysis response.");
}

function parseModelJson(payload: unknown): unknown {
  if (payload && typeof payload === "object") return payload;
  if (typeof payload !== "string") {
    throw new Error("Qualitative analysis did not return structured JSON.");
  }

  const trimmed = payload
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("Qualitative analysis did not return valid JSON.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function evenlySample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  if (limit <= 1) return [items[0]!];
  const output: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    const position = Math.round((index * (items.length - 1)) / (limit - 1));
    output.push(items[position]!);
  }
  return output;
}

function ensureUniqueCodeIds(codebook: QualitativeCodebook): QualitativeCodebook {
  const ids = new Set<string>();
  for (const code of codebook.codes) {
    if (ids.has(code.id)) {
      throw new Error(`Qualitative codebook repeats code id ${code.id}.`);
    }
    ids.add(code.id);
  }
  return codebook;
}

async function runJsonModel(
  env: Env,
  purpose: ModelPurpose,
  system: string,
  user: unknown,
  maxTokens: number
): Promise<unknown> {
  if (!env.AI) throw new Error("Workers AI is required for qualitative analysis.");
  const response = await runModel(env, purpose, QUALITATIVE_MODEL, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) }
    ],
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: "json_object" }
  });
  return parseModelJson(modelPayload(response));
}

export async function proposeQualitativeCodebook(input: {
  env: Env;
  researchQuestion: string;
  segments: QualitativeSegment[];
}): Promise<QualitativeCodebook> {
  if (input.segments.length === 0) {
    throw new Error("Qualitative codebook generation requires source segments.");
  }

  const sample = evenlySample(input.segments, 40).map((segment) => ({
    segmentId: segment.id,
    excerpt: segment.text.slice(0, 900)
  }));

  const payload = await runJsonModel(
    input.env,
    "qualitative_codebook",
    [
      "Act as an experienced qualitative researcher proposing an initial codebook for researcher review.",
      "The codebook is a proposal, not a final finding.",
      "Stay tightly grounded in the supplied research question and excerpts.",
      "Do not invent participant claims, frequencies, quotations, context or themes.",
      "Use concise stable snake_case code ids.",
      "Codes should be analytically distinct and usable across multiple excerpts.",
      "Include clear definitions plus inclusion and exclusion criteria.",
      "Do not include demographic or sensitive categories unless they are directly relevant to the research question and evidenced in the text.",
      "Return JSON only as {codes:[{id,label,definition,inclusionCriteria,exclusionCriteria}]}."
    ].join("\n"),
    {
      researchQuestion: input.researchQuestion,
      sampledExcerpts: sample
    },
    3600
  );

  return ensureUniqueCodeIds(qualitativeCodebookSchema.parse(payload));
}

export async function proposeQualitativeCodings(input: {
  env: Env;
  researchQuestion: string;
  codebook: QualitativeCodebook;
  segments: QualitativeSegment[];
}): Promise<CodingProposal> {
  if (input.segments.length === 0) {
    throw new Error("Coding requires at least one segment.");
  }
  if (input.segments.length > 20) {
    throw new Error("A qualitative coding batch may contain at most 20 segments.");
  }

  const payload = await runJsonModel(
    input.env,
    "qualitative_coding",
    [
      "Apply the supplied qualitative codebook to each source segment.",
      "Treat every segment independently and only assign codes directly supported by that segment.",
      "A segment may have zero, one or multiple codes.",
      "Do not create new code ids and do not infer facts absent from the text.",
      "Rationales must be brief and grounded in the segment.",
      "Return one assignment for every supplied segment, even when codeIds is empty.",
      "Return JSON only as {assignments:[{segmentId,codeIds,rationale}]}."
    ].join("\n"),
    {
      researchQuestion: input.researchQuestion,
      codebook: input.codebook,
      segments: input.segments.map((segment) => ({
        segmentId: segment.id,
        text: segment.text
      }))
    },
    4200
  );

  const parsed = validateCodebookReferences(
    codingProposalSchema.parse(payload),
    input.codebook,
    input.segments.map((segment) => segment.id)
  );
  const returnedSegmentIds = new Set(
    parsed.assignments.map((assignment) => assignment.segmentId)
  );
  const missingSegmentIds = input.segments
    .map((segment) => segment.id)
    .filter((segmentId) => !returnedSegmentIds.has(segmentId));
  if (
    parsed.assignments.length !== input.segments.length ||
    missingSegmentIds.length > 0
  ) {
    throw new Error(
      `Qualitative coding response did not account for every source segment. Missing: ${missingSegmentIds.join(", ") || "unknown"}.`
    );
  }

  return parsed;
}

export async function proposeQualitativeThemes(input: {
  env: Env;
  researchQuestion: string;
  codebook: QualitativeCodebook;
  segments: QualitativeSegment[];
  codings: QualitativeCoding[];
}): Promise<QualitativeThemeSet> {
  const confirmed = input.codings.filter(
    (coding) => coding.status === "confirmed"
  );
  if (confirmed.length === 0) {
    throw new Error(
      "Theme development requires researcher-confirmed coding decisions."
    );
  }

  const segmentById = new Map(
    input.segments.map((segment) => [segment.id, segment])
  );
  const evidenceByCode = new Map<
    string,
    { count: number; examples: Array<{ segmentId: string; excerpt: string }> }
  >();

  for (const coding of confirmed) {
    const segment = segmentById.get(coding.segmentId);
    if (!segment) continue;
    const existing = evidenceByCode.get(coding.codeId) ?? {
      count: 0,
      examples: []
    };
    existing.count += 1;
    if (
      existing.examples.length < 2 &&
      !existing.examples.some((item) => item.segmentId === segment.id)
    ) {
      existing.examples.push({
        segmentId: segment.id,
        excerpt: segment.text.slice(0, 350)
      });
    }
    evidenceByCode.set(coding.codeId, existing);
  }

  const payload = await runJsonModel(
    input.env,
    "qualitative_themes",
    [
      "Develop candidate qualitative themes from a researcher-confirmed codebook and confirmed coding evidence.",
      "Themes are proposals for researcher review, not final facts.",
      "Use the coding counts to understand pattern breadth, but do not turn counts into prevalence claims.",
      "Every theme must cite evidenceSegmentIds drawn only from supplied examples and codeIds from the supplied codebook.",
      "Do not invent quotations or evidence.",
      "Keep themes distinct, analytically meaningful and responsive to the research question.",
      "The synthesis must explicitly acknowledge meaningful variation or tension where the supplied evidence indicates it.",
      "Return JSON only as {themes:[{id,label,summary,codeIds,evidenceSegmentIds}],synthesis}."
    ].join("\n"),
    {
      researchQuestion: input.researchQuestion,
      codebook: input.codebook,
      evidenceByCode: Array.from(evidenceByCode.entries()).map(
        ([codeId, evidence]) => ({
          codeId,
          count: evidence.count,
          examples: evidence.examples
        })
      )
    },
    4800
  );

  const parsed = qualitativeThemeSetSchema.parse(payload);
  return validateThemeReferences(
    parsed,
    input.codebook,
    confirmed,
    input.segments.map((segment) => segment.id)
  );
}

export function modelProvenance(promptVersion: string): Record<string, unknown> {
  return {
    provider: "cloudflare-workers-ai",
    model: QUALITATIVE_MODEL,
    promptVersion
  };
}
