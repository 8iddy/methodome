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
export const QUALITATIVE_THEME_PROMPT_VERSION = "qualitative-themes-v2";

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

// Output shapes the runtime constrains the model to. They mirror the Zod
// schemas that still validate every response afterwards.
const stringList = { type: "array", items: { type: "string" } } as const;
const OUTPUT_SCHEMAS: Record<ModelPurpose, Record<string, unknown> | null> = {
  document_conversion: null,
  protocol_extraction: null,
  protocol_question_refinement: null,
  variable_mapping: null,
  project_assistant: null,
  qualitative_codebook: {
    type: "object",
    additionalProperties: false,
    properties: {
      codes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            definition: { type: "string" },
            inclusionCriteria: stringList,
            exclusionCriteria: stringList
          },
          required: ["id", "label", "definition", "inclusionCriteria", "exclusionCriteria"]
        }
      }
    },
    required: ["codes"]
  },
  qualitative_coding: {
    type: "object",
    additionalProperties: false,
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            segmentId: { type: "string" },
            codeIds: stringList,
            rationale: { type: "string" }
          },
          required: ["segmentId", "codeIds", "rationale"]
        }
      }
    },
    required: ["assignments"]
  },
  qualitative_themes: {
    type: "object",
    additionalProperties: false,
    properties: {
      themes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            summary: { type: "string" },
            codeIds: stringList,
            evidenceSegmentIds: stringList
          },
          required: ["id", "label", "summary", "codeIds", "evidenceSegmentIds"]
        }
      },
      synthesis: { type: "string" }
    },
    required: ["themes", "synthesis"]
  }
};

async function runJsonModel(
  env: Env,
  purpose: ModelPurpose,
  system: string,
  user: unknown,
  maxTokens: number
): Promise<unknown> {
  if (!env.AI) throw new Error("Workers AI is required for qualitative analysis.");
  const schema = OUTPUT_SCHEMAS[purpose];
  const response = await runModel(env, purpose, QUALITATIVE_MODEL, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) }
    ],
    temperature: 0,
    max_tokens: maxTokens,
    response_format: schema
      ? { type: "json_schema", json_schema: schema }
      : { type: "json_object" }
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
  const codeLabel = new Map(
    input.codebook.codes.map((code) => [code.id, code.label])
  );

  // The model sees every confirmed-coded segment with all of its codes, so a
  // theme can draw on the full breadth of evidence and on co-occurrence
  // between codes, rather than on two examples per code.
  const codesBySegment = new Map<string, Set<string>>();
  for (const coding of confirmed) {
    if (!segmentById.has(coding.segmentId)) continue;
    const codes = codesBySegment.get(coding.segmentId) ?? new Set<string>();
    codes.add(coding.codeId);
    codesBySegment.set(coding.segmentId, codes);
  }
  const MAX_SEGMENTS = 80;
  const codedSegments = Array.from(codesBySegment.entries())
    .map(([segmentId, codes]) => ({
      segmentId,
      segmentIndex: segmentById.get(segmentId)!.segmentIndex,
      codeIds: Array.from(codes),
      excerpt: segmentById.get(segmentId)!.text.slice(0, 500)
    }))
    .sort((a, b) => a.segmentIndex - b.segmentIndex);
  const sample =
    codedSegments.length > MAX_SEGMENTS
      ? evenlySample(codedSegments, MAX_SEGMENTS)
      : codedSegments;
  const codeSummary = input.codebook.codes.map((code) => ({
    codeId: code.id,
    label: code.label,
    definition: code.definition,
    confirmedSegments: codedSegments.filter((item) =>
      item.codeIds.includes(code.id)
    ).length
  }));

  const payload = await runJsonModel(
    input.env,
    "qualitative_themes",
    [
      "You are an experienced qualitative researcher developing candidate themes for researcher review from a confirmed codebook and confirmed coding of source segments.",
      "A theme is an interpretive pattern of meaning that answers the research question. It is not a code restated: a theme usually draws together several codes, or explains how one code plays out across different participants or conditions. Propose a theme that mirrors a single code only when the evidence genuinely shows no higher-order pattern, and say so in its summary.",
      "Look for co-occurrence: segments carrying more than one code often reveal how barriers interact (for example, how one condition produces or compounds another).",
      "Theme labels should be short analytic statements that capture the meaning (for example 'Data review is the first casualty of understaffing'), not topic nouns.",
      "Each summary must explain the pattern, name the conditions or contrasts in the evidence, and stay inside what the segments say.",
      "evidenceSegmentIds must list every supplied segment that supports the theme (not a sample of two), and codeIds must list the supplied codes the theme draws on. Use only supplied ids.",
      "Use coded-segment counts to judge breadth, but never express them as prevalence or percentages of a population.",
      "Do not invent quotations, participants, or evidence.",
      "The synthesis is two or three paragraphs: how the themes relate to each other and to the research question, where the evidence shows variation, tension or disagreement, and what the evidence cannot support given the number of sources and segments.",
      "Return JSON only as {themes:[{id,label,summary,codeIds,evidenceSegmentIds}],synthesis}."
    ].join("\n"),
    {
      researchQuestion: input.researchQuestion,
      codes: codeSummary,
      sourceSegmentCount: input.segments.length,
      codedSegmentCount: codedSegments.length,
      codedSegments: sample.map(({ segmentIndex: _index, ...rest }) => ({
        ...rest,
        codeLabels: rest.codeIds.map((id) => codeLabel.get(id) ?? id)
      }))
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
