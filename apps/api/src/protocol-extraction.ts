import { z } from "zod";
import type { Env } from "./env";

export const protocolExtractionSchema = z.object({
  studyTitle: z.string().nullable().default(null),
  objectives: z.array(z.string()).default([]),
  hypotheses: z.array(z.string()).default([]),
  researchQuestions: z.array(
    z.object({
      text: z.string().min(1),
      objectiveType: z.enum([
        "descriptive",
        "association",
        "prediction",
        "causal",
        "diagnostic",
        "prognostic",
        "exploratory"
      ]).nullable().default(null),
      outcomes: z.array(z.string()).default([]),
      predictors: z.array(z.string()).default([]),
      covariates: z.array(z.string()).default([]),
      estimand: z.string().nullable().default(null)
    })
  ).default([]),
  studyDesign: z.enum([
    "cross_sectional",
    "cohort",
    "case_control",
    "trial",
    "longitudinal",
    "time_series",
    "ecological",
    "other"
  ]).nullable().default(null),
  unitOfAnalysis: z.string().nullable().default(null),
  population: z.string().nullable().default(null),
  samplingDesign: z.string().nullable().default(null),
  repeatedMeasures: z.boolean().nullable().default(null),
  clustered: z.boolean().nullable().default(null),
  clusterConcept: z.string().nullable().default(null),
  surveyWeights: z.boolean().nullable().default(null),
  weightConcept: z.string().nullable().default(null),
  stratified: z.boolean().nullable().default(null),
  strataConcept: z.string().nullable().default(null),
  missingDataPlan: z.string().nullable().default(null),
  statedAnalysisPlan: z.string().nullable().default(null)
});

export type ProtocolExtraction = z.infer<typeof protocolExtractionSchema>;

const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    studyTitle: { type: ["string", "null"] },
    objectives: { type: "array", items: { type: "string" } },
    hypotheses: { type: "array", items: { type: "string" } },
    researchQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          objectiveType: {
            type: ["string", "null"],
            enum: [
              "descriptive",
              "association",
              "prediction",
              "causal",
              "diagnostic",
              "prognostic",
              "exploratory",
              null
            ]
          },
          outcomes: { type: "array", items: { type: "string" } },
          predictors: { type: "array", items: { type: "string" } },
          covariates: { type: "array", items: { type: "string" } },
          estimand: { type: ["string", "null"] }
        },
        required: [
          "text",
          "objectiveType",
          "outcomes",
          "predictors",
          "covariates",
          "estimand"
        ]
      }
    },
    studyDesign: {
      type: ["string", "null"],
      enum: [
        "cross_sectional",
        "cohort",
        "case_control",
        "trial",
        "longitudinal",
        "time_series",
        "ecological",
        "other",
        null
      ]
    },
    unitOfAnalysis: { type: ["string", "null"] },
    population: { type: ["string", "null"] },
    samplingDesign: { type: ["string", "null"] },
    repeatedMeasures: { type: ["boolean", "null"] },
    clustered: { type: ["boolean", "null"] },
    clusterConcept: { type: ["string", "null"] },
    surveyWeights: { type: ["boolean", "null"] },
    weightConcept: { type: ["string", "null"] },
    stratified: { type: ["boolean", "null"] },
    strataConcept: { type: ["string", "null"] },
    missingDataPlan: { type: ["string", "null"] },
    statedAnalysisPlan: { type: ["string", "null"] }
  },
  required: [
    "studyTitle",
    "objectives",
    "hypotheses",
    "researchQuestions",
    "studyDesign",
    "unitOfAnalysis",
    "population",
    "samplingDesign",
    "repeatedMeasures",
    "clustered",
    "clusterConcept",
    "surveyWeights",
    "weightConcept",
    "stratified",
    "strataConcept",
    "missingDataPlan",
    "statedAnalysisPlan"
  ]
} as const;

export const PROTOCOL_EXTRACTION_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const PROTOCOL_EXTRACTION_PROMPT_VERSION = "protocol-extraction-v2";
const PROTOCOL_EXTRACTION_MAX_TOKENS = 4096;
const PROTOCOL_INPUT_CHAR_LIMIT = 68000;

function modelPayload(result: unknown): unknown {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") {
    throw new Error("Workers AI returned an empty extraction response.");
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

  throw new Error("Workers AI returned an unsupported extraction response.");
}

function parseModelJson(payload: unknown): unknown {
  if (payload && typeof payload === "object") return payload;
  if (typeof payload !== "string") {
    throw new Error("Protocol extraction did not return structured JSON.");
  }

  const trimmed = payload
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("Protocol extraction did not return valid JSON.");
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new Error("Protocol extraction returned incomplete JSON.");
    }
  }
}

function protocolInputWindow(text: string): string {
  if (text.length <= PROTOCOL_INPUT_CHAR_LIMIT) return text;

  const front = text.slice(0, 42000);
  const tail = text.slice(-26000);
  return [
    front,
    "\n\n[Methodome omitted the middle of this unusually long protocol to stay within the model context window.]\n\n",
    tail
  ].join("");
}

function validateProtocolExtraction(payload: unknown): ProtocolExtraction {
  const parsed = protocolExtractionSchema.parse(parseModelJson(payload));
  if (parsed.researchQuestions.length === 0) {
    throw new Error(
      "Methodome did not find a research question in this protocol. Review the protocol or add the study information manually."
    );
  }
  return parsed;
}

export async function researchFileToText(input: {
  env: Env;
  filename: string;
  mediaType?: string;
  bytes: ArrayBuffer;
}): Promise<string> {
  const lower = input.filename.toLowerCase();
  const directText =
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    input.mediaType?.startsWith("text/");

  if (directText) {
    return new TextDecoder().decode(input.bytes).trim();
  }

  if (!input.env.AI) {
    throw new Error("Workers AI is not configured for document conversion.");
  }

  const ai = input.env.AI as any;
  const converted = await ai.toMarkdown(
    {
      name: input.filename,
      blob: new Blob([input.bytes], {
        type: input.mediaType || "application/octet-stream"
      })
    },
    {
      conversionOptions: {
        output: { format: "text" }
      }
    }
  );

  const first = Array.isArray(converted) ? converted[0] : converted;
  if (!first || first.format === "error") {
    throw new Error(
      first?.error ||
        "Methodome could not extract text from this research document."
    );
  }

  const text = typeof first.data === "string" ? first.data.trim() : "";
  if (!text) {
    throw new Error(
      "Methodome could not extract readable text from this file. Upload a text-based PDF, DOCX, TXT, or Markdown file."
    );
  }

  return text;
}

export async function extractProtocolWithAi(
  env: Env,
  protocolText: string
): Promise<ProtocolExtraction> {
  if (!env.AI) {
    throw new Error("Workers AI is not configured for protocol extraction.");
  }

  const trimmed = protocolText.trim();
  if (!trimmed) {
    throw new Error("The protocol contains no readable text.");
  }

  const protocol = protocolInputWindow(trimmed);
  const ai = env.AI as any;
  const systemPrompt =
    "You extract research design information from study protocols. Use only information supported by the supplied protocol. Do not invent missing fields, dataset variable names, methods, outcomes, predictors, covariates, sampling features, or design features. Use null or an empty array when the protocol does not state something. Preserve every distinct research question as a separate item. Return only structured JSON that matches the requested schema.";

  try {
    const response = await ai.run(PROTOCOL_EXTRACTION_MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Extract the study information from this protocol.\n\nPROTOCOL\n${protocol}`
        }
      ],
      temperature: 0,
      max_tokens: PROTOCOL_EXTRACTION_MAX_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: extractionJsonSchema
      }
    });

    return validateProtocolExtraction(modelPayload(response));
  } catch (firstError) {
    const retry = await ai.run(PROTOCOL_EXTRACTION_MODEL, {
      messages: [
        {
          role: "system",
          content:
            systemPrompt +
            " The previous structured extraction failed. Be concise. Do not add prose, Markdown fences, comments, or trailing text."
        },
        {
          role: "user",
          content: `Return one JSON object for this protocol with these exact top-level keys: studyTitle, objectives, hypotheses, researchQuestions, studyDesign, unitOfAnalysis, population, samplingDesign, repeatedMeasures, clustered, clusterConcept, surveyWeights, weightConcept, stratified, strataConcept, missingDataPlan, statedAnalysisPlan. Each researchQuestions item must contain text, objectiveType, outcomes, predictors, covariates, estimand.\n\nPROTOCOL\n${protocol}`
        }
      ],
      temperature: 0,
      max_tokens: PROTOCOL_EXTRACTION_MAX_TOKENS,
      response_format: {
        type: "json_object"
      }
    });

    try {
      return validateProtocolExtraction(modelPayload(retry));
    } catch {
      const reason =
        firstError instanceof Error ? firstError.message : "structured extraction failed";
      throw new Error(
        `Methodome could not extract a complete study specification from this protocol. ${reason}`
      );
    }
  }
}

export interface MappingSuggestion {
  researchConcept: string;
  datasetVariable?: string;
  mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
  evidence: string[];
}

const mappingSuggestionsSchema = z.array(
  z.object({
    researchConcept: z.string().min(1),
    datasetVariable: z.string().nullable().default(null),
    mappingStatus: z.enum([
      "direct_match",
      "probable_match",
      "uncertain",
      "no_match"
    ]),
    evidence: z.array(z.string()).default([])
  })
);

export async function suggestMappingsWithAi(input: {
  env: Env;
  concepts: string[];
  variables: Array<{
    variableName: string;
    label?: string;
    dataType: string;
    responseChoices?: Array<{ value: string | number; label: string }>;
  }>;
  instrumentText?: string;
}): Promise<MappingSuggestion[]> {
  const uniqueConcepts = Array.from(
    new Set(input.concepts.map((item) => item.trim()).filter(Boolean))
  );

  if (uniqueConcepts.length === 0) return [];

  const exact = new Map<string, string>();
  for (const variable of input.variables) {
    const normalizedName = normalize(variable.variableName);
    const normalizedLabel = normalize(variable.label || "");
    for (const concept of uniqueConcepts) {
      const normalizedConcept = normalize(concept);
      if (
        normalizedConcept &&
        (normalizedConcept === normalizedName ||
          normalizedConcept === normalizedLabel)
      ) {
        exact.set(concept, variable.variableName);
      }
    }
  }

  const unresolved = uniqueConcepts.filter((concept) => !exact.has(concept));
  const output: MappingSuggestion[] = uniqueConcepts
    .filter((concept) => exact.has(concept))
    .map((researchConcept) => ({
      researchConcept,
      datasetVariable: exact.get(researchConcept)!,
      mappingStatus: "direct_match",
      evidence: [
        "Exact normalized match to a dataset variable name or dataset label."
      ]
    }));

  if (unresolved.length === 0) return output;

  if (!input.env.AI) {
    output.push(
      ...unresolved.map((researchConcept) => ({
        researchConcept,
        mappingStatus: "no_match" as const,
        evidence: ["Workers AI is not configured for semantic mapping."]
      }))
    );
    return output;
  }

  const ai = input.env.AI as any;
  const response = await ai.run(PROTOCOL_EXTRACTION_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You suggest mappings between research concepts and dataset variables. Do not use row-level data. A direct_match is forbidden unless there is explicit exact metadata evidence. For semantic suggestions use probable_match or uncertain. Use no_match if the evidence is insufficient. Never invent a dataset variable. Evidence must refer to supplied variable names, labels, types, response choices, or supplied instrument text."
      },
      {
        role: "user",
        content: JSON.stringify({
          researchConcepts: unresolved,
          datasetVariables: input.variables,
          instrumentText: input.instrumentText?.slice(0, 30000) || null
        })
      }
    ],
    temperature: 0,
    max_tokens: 2048,
    response_format: {
      type: "json_object"
    }
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(modelText(response));
  } catch {
    parsed = [];
  }

  const candidateArray =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as any).mappings)
        ? (parsed as any).mappings
        : [];

  const suggestions = mappingSuggestionsSchema.safeParse(candidateArray);
  const byConcept = new Map<string, MappingSuggestion>();
  if (suggestions.success) {
    const allowedVariables = new Set(input.variables.map((v) => v.variableName));
    for (const suggestion of suggestions.data) {
      if (!unresolved.includes(suggestion.researchConcept)) continue;
      const datasetVariable =
        suggestion.datasetVariable &&
        allowedVariables.has(suggestion.datasetVariable)
          ? suggestion.datasetVariable
          : undefined;
      byConcept.set(suggestion.researchConcept, {
        researchConcept: suggestion.researchConcept,
        ...(datasetVariable ? { datasetVariable } : {}),
        mappingStatus: datasetVariable
          ? suggestion.mappingStatus === "direct_match"
            ? "probable_match"
            : suggestion.mappingStatus
          : "no_match",
        evidence: suggestion.evidence
      });
    }
  }

  for (const researchConcept of unresolved) {
    output.push(
      byConcept.get(researchConcept) ?? {
        researchConcept,
        mappingStatus: "no_match",
        evidence: ["No evidence-backed dataset variable suggestion was produced."]
      }
    );
  }

  return output;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
