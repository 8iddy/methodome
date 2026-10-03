import { z } from "zod";
import type { Env } from "./env";
import { convertDocumentToMarkdown, runModel } from "./model-runtime";
import { protocolInterpretationSystemPrompt } from "./methodology-knowledge";

// Models return null for lists that do not apply (a qualitative question has
// no outcome variables), and name designs outside the quantitative set.
// Accept both deterministically rather than fail the whole extraction.
const conceptList = z
  .array(z.string())
  .nullable()
  .default([])
  .transform((value) => value ?? []);

const KNOWN_DESIGNS = [
  "cross_sectional",
  "cohort",
  "case_control",
  "trial",
  "longitudinal",
  "time_series",
  "ecological",
  "other"
] as const;

const DESIGN_ALIASES: Record<string, (typeof KNOWN_DESIGNS)[number]> = {
  cross_sectional_survey: "cross_sectional",
  crosssectional: "cross_sectional",
  rct: "trial",
  randomised_controlled_trial: "trial",
  randomized_controlled_trial: "trial",
  prospective_cohort: "cohort",
  retrospective_cohort: "cohort",
  panel: "longitudinal",
  interrupted_time_series: "time_series"
};

export const protocolExtractionSchema = z.object({
  studyTitle: z.string().nullable().default(null),
  objectives: conceptList,
  hypotheses: conceptList,
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
        "qualitative",
        "exploratory"
      ]).nullable().default(null),
      outcomes: conceptList,
      predictors: conceptList,
      covariates: conceptList,
      estimand: z.string().nullable().default(null)
    })
  ).default([]),
  studyDesign: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const key = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if ((KNOWN_DESIGNS as readonly string[]).includes(key)) return key;
    if (key in DESIGN_ALIASES) return DESIGN_ALIASES[key];
    // Qualitative, mixed-methods and other named designs are preserved as
    // "other"; the design facts that constrain analysis are captured by the
    // separate repeated-measures, clustering, weighting and strata fields.
    return key ? "other" : null;
  }, z.enum(KNOWN_DESIGNS).nullable().default(null)),
  unitOfAnalysis: z.string().nullable().default(null),
  population: z.string().nullable().default(null),
  samplingDesign: z.string().nullable().default(null),
  repeatedMeasures: z.boolean().nullable().default(null),
  paired: z.boolean().nullable().default(null),
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
              "qualitative",
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
    paired: { type: ["boolean", "null"] },
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
    "paired",
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
export const PROTOCOL_EXTRACTION_PROMPT_VERSION = "protocol-extraction-v4";
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

function inferObjectiveType(
  text: string
): NonNullable<ProtocolExtraction["researchQuestions"][number]["objectiveType"]> {
  const value = text.toLowerCase();

  if (
    /\b(effect|impact|causal|intervention|treatment effect|attributable|counterfactual)\b/.test(
      value
    )
  ) {
    return "causal";
  }
  if (/\b(predict|prediction|classif|forecast|risk score)\b/.test(value)) {
    return "prediction";
  }
  if (
    /\b(diagnostic|diagnos|sensitivity|specificity|screening accuracy|detect)\b/.test(
      value
    )
  ) {
    return "diagnostic";
  }
  if (/\b(prognos|future risk|survival|time to event|recurrence)\b/.test(value)) {
    return "prognostic";
  }
  if (
    /\b(perception|perceptions|experience|experiences|barrier|barriers|facilitator|facilitators|theme|themes|meaning|meanings|perspective|perspectives|acceptability|feasibility|why do|how do stakeholders|how do participants)\b/.test(
      value
    )
  ) {
    return "qualitative";
  }
  if (
    /\b(associat|relationship|correlat|related to|difference between|differ by|determinant|factor associated)\b/.test(
      value
    )
  ) {
    return "association";
  }
  if (
    /\b(prevalence|proportion|frequency|distribution|level|levels|pattern|patterns|status|current|how many|how much|what are|what is)\b/.test(
      value
    )
  ) {
    return "descriptive";
  }
  return "exploratory";
}

function sanitizeSamplingDesign(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();

  const looksLikeGeneralStudyDesign =
    /mixed[ -]?methods?|triangulation|cross[- ]country|concurrent design|sequential design/.test(
      normalized
    );
  const containsSamplingLanguage =
    /sample|sampling|census|complete enumeration|random|systematic|stratif|cluster|multistage|multi-stage|purposive|convenience|consecutive|snowball|quota|probability/.test(
      normalized
    );

  if (looksLikeGeneralStudyDesign && !containsSamplingLanguage) {
    return null;
  }
  return value.trim() || null;
}

function enrichProtocolExtraction(
  extraction: ProtocolExtraction
): ProtocolExtraction {
  return {
    ...extraction,
    samplingDesign: sanitizeSamplingDesign(extraction.samplingDesign),
    researchQuestions: extraction.researchQuestions.map((question) => ({
      ...question,
      objectiveType:
        question.objectiveType ?? inferObjectiveType(question.text)
    }))
  };
}

function validateProtocolExtraction(payload: unknown): ProtocolExtraction {
  const parsed = protocolExtractionSchema.parse(parseModelJson(payload));
  if (parsed.researchQuestions.length === 0) {
    throw new Error(
      "Methodome did not find a research question in this protocol. Review the protocol or add the study information manually."
    );
  }
  return enrichProtocolExtraction(parsed);
}

const QUESTION_WINDOW_CHAR_LIMIT = 24000;
const QUESTION_KEYWORDS =
  /research question|objective|aim|hypothes|outcome|exposure|predictor|covariate|primary|secondary|study design|unit of analysis|estimand|endpoint/i;

/**
 * The part of a protocol that bears on how its research questions are
 * framed: paragraphs that mention questions, objectives, outcomes or design,
 * in original order, up to a limit. Falls back to the opening of the protocol
 * when nothing matches. Used for the refinement pass so the full document is
 * not sent twice.
 */
export function questionFocusedWindow(
  protocol: string,
  limit = QUESTION_WINDOW_CHAR_LIMIT
): string {
  if (protocol.length <= limit) return protocol;
  const paragraphs = protocol.split(/\n{2,}/);
  const kept: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    if (!QUESTION_KEYWORDS.test(paragraph)) continue;
    const next = used + paragraph.length + 2;
    if (next > limit) break;
    kept.push(paragraph);
    used = next;
  }
  return kept.length > 0 ? kept.join("\n\n") : protocol.slice(0, limit);
}

function questionIsComplete(
  question: ProtocolExtraction["researchQuestions"][number]
): boolean {
  if (!question.objectiveType) return false;
  if (question.objectiveType === "qualitative") return true;
  return question.outcomes.length > 0;
}

async function refineResearchQuestionsWithAi(
  env: Env,
  protocol: string,
  extraction: ProtocolExtraction
): Promise<ProtocolExtraction> {
  // A second pass is worth its cost only when the first left a question
  // without an analytical objective or outcome, or when the same outcome
  // concept appears under more than one question (the usual sign that
  // concepts leaked between questions). Complete, distinct interpretations
  // are not re-derived, and the pass that does run sees the question-bearing
  // part of the protocol rather than the whole document again.
  const seenOutcomes = new Set<string>();
  let outcomeSharedAcrossQuestions = false;
  for (const question of extraction.researchQuestions) {
    for (const outcome of new Set(question.outcomes.map(normalize))) {
      if (seenOutcomes.has(outcome)) outcomeSharedAcrossQuestions = true;
      seenOutcomes.add(outcome);
    }
  }
  const needsFocusedReview =
    outcomeSharedAcrossQuestions ||
    extraction.researchQuestions.some((question) => !questionIsComplete(question));

  if (!needsFocusedReview || !env.AI) return extraction;

  try {
    const response = await runModel(env, "protocol_question_refinement", PROTOCOL_EXTRACTION_MODEL, {
      messages: [
        {
          role: "system",
          content: [
            "Review research questions as an experienced research methodologist.",
            "Treat each research question independently so concepts from one question do not leak into another.",
            "Preserve the exact question text and question order.",
            "For each question, classify objectiveType and identify only the outcomes, predictors/exposures and covariates that belong to that question.",
            "Outcome concepts must directly correspond to what that question is trying to describe, compare, explain, predict, diagnose, prognose or causally affect.",
            "Do not copy an outcome from a different research question.",
            "Use protocol terminology and conceptual labels, never dataset column names.",
            "Infer an estimand only when the target quantity is methodologically defensible from the question and protocol.",
            "Return one JSON object with a researchQuestions array and no prose."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            protocol: questionFocusedWindow(protocol),
            currentInterpretation: extraction.researchQuestions
          })
        }
      ],
      temperature: 0,
      max_tokens: 2600,
      response_format: { type: "json_object" }
    });

    const parsed = parseModelJson(modelPayload(response));
    const refined = z
      .object({
        researchQuestions: protocolExtractionSchema.shape.researchQuestions
      })
      .safeParse(parsed);

    if (!refined.success) return extraction;
    if (
      refined.data.researchQuestions.length !==
      extraction.researchQuestions.length
    ) {
      return extraction;
    }

    return enrichProtocolExtraction({
      ...extraction,
      researchQuestions: refined.data.researchQuestions.map(
        (question, index) => ({
          ...question,
          text: extraction.researchQuestions[index]?.text ?? question.text
        })
      )
    });
  } catch {
    return extraction;
  }
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

  const converted = await convertDocumentToMarkdown(input.env, {
    name: input.filename,
    blob: new Blob([input.bytes], {
      type: input.mediaType || "application/octet-stream"
    })
  });

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
  const systemPrompt = protocolInterpretationSystemPrompt();

  try {
    const response = await runModel(env, "protocol_extraction", PROTOCOL_EXTRACTION_MODEL, {
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

    const extraction = validateProtocolExtraction(modelPayload(response));
    return refineResearchQuestionsWithAi(env, protocol, extraction);
  } catch (firstError) {
    const retry = await runModel(env, "protocol_extraction", PROTOCOL_EXTRACTION_MODEL, {
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
      const extraction = validateProtocolExtraction(modelPayload(retry));
      return refineResearchQuestionsWithAi(env, protocol, extraction);
    } catch (retryError) {
      const reason =
        firstError instanceof Error ? firstError.message : "structured extraction failed";
      const retryReason =
        retryError instanceof Error ? retryError.message : "retry failed";
      // Keep an excerpt of what the model actually returned so a failure can
      // be diagnosed from the run record without re-running the model.
      const excerpt = (() => {
        try {
          const payload = modelPayload(retry);
          const text =
            typeof payload === "string" ? payload : JSON.stringify(payload);
          return text.slice(0, 700);
        } catch {
          return "(unreadable response)";
        }
      })();
      throw new Error(
        `Methodome could not extract a complete study specification from this protocol. First attempt: ${reason} Retry: ${retryReason} Model output: ${excerpt}`
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

const mappingSuggestionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          researchConcept: { type: "string" },
          datasetVariable: { type: ["string", "null"] },
          mappingStatus: {
            type: "string",
            enum: ["probable_match", "uncertain", "no_match"]
          },
          evidence: { type: "array", items: { type: "string" } }
        },
        required: ["researchConcept", "datasetVariable", "mappingStatus", "evidence"]
      }
    }
  },
  required: ["mappings"]
} as const;

function splitDelimitedLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (character === "," || character === "\t" || character === ";" || character === "|")) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Reads tabular instrument or codebook text (for example a row such as
 * `staff_count,Number of clinical staff`) and returns the wording each
 * dataset field is explicitly paired with. Only rows that name a supplied
 * dataset field verbatim are used, so no association is inferred.
 */
export function instrumentWordingByVariable(
  instrumentText: string | undefined,
  variableNames: string[]
): Map<string, string[]> {
  const wording = new Map<string, string[]>();
  if (!instrumentText) return wording;

  const byNormalizedName = new Map(
    variableNames.map((name) => [normalize(name), name])
  );
  for (const line of instrumentText.split(/\r?\n/)) {
    if (!/[,\t;|]/.test(line)) continue;
    const cells = splitDelimitedLine(line).filter(Boolean);
    if (cells.length < 2) continue;
    const named = cells.filter((cell) => byNormalizedName.has(normalize(cell)));
    if (named.length !== 1) continue;
    const variableName = byNormalizedName.get(normalize(named[0]!))!;
    const labels = cells.filter((cell) => cell !== named[0] && normalize(cell));
    wording.set(variableName, [...(wording.get(variableName) ?? []), ...labels]);
  }
  return wording;
}

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
  allowModelAssist?: boolean;
}): Promise<MappingSuggestion[]> {
  const uniqueConcepts = Array.from(
    new Set(input.concepts.map((item) => item.trim()).filter(Boolean))
  );

  if (uniqueConcepts.length === 0) return [];

  const instrumentWording = instrumentWordingByVariable(
    input.instrumentText,
    input.variables.map((variable) => variable.variableName)
  );
  const instrumentExact = new Map<string, string>();
  for (const concept of uniqueConcepts) {
    const normalizedConcept = normalize(concept);
    if (!normalizedConcept) continue;
    const matches = Array.from(instrumentWording.entries())
      .filter(([, labels]) =>
        labels.some((label) => normalize(label) === normalizedConcept)
      )
      .map(([variableName]) => variableName);
    // Identical wording on more than one field is ambiguous, not exact.
    if (matches.length === 1) instrumentExact.set(concept, matches[0]!);
  }

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

  const unresolved = uniqueConcepts.filter(
    (concept) => !exact.has(concept) && !instrumentExact.has(concept)
  );
  const output: MappingSuggestion[] = uniqueConcepts
    .filter((concept) => exact.has(concept) || instrumentExact.has(concept))
    .map((researchConcept) =>
      exact.has(researchConcept)
        ? {
            researchConcept,
            datasetVariable: exact.get(researchConcept)!,
            mappingStatus: "direct_match" as const,
            evidence: [
              "Exact normalized match to a dataset variable name or dataset label."
            ]
          }
        : {
            researchConcept,
            datasetVariable: instrumentExact.get(researchConcept)!,
            mappingStatus: "direct_match" as const,
            evidence: [
              `Exact normalized match to the wording the research instrument or codebook pairs with dataset field “${instrumentExact.get(researchConcept)!}”.`
            ]
          }
    );

  if (unresolved.length === 0) return output;

  if (input.allowModelAssist === false || !input.env.AI) {
    output.push(
      ...unresolved.map((researchConcept) => ({
        researchConcept,
        mappingStatus: "no_match" as const,
        evidence: [
          input.allowModelAssist === false
            ? "Model-assisted mapping is unavailable under the current project processing policy. Review the profiled dataset variables manually."
            : "Workers AI is unavailable for semantic mapping. Review the profiled dataset variables manually."
        ]
      }))
    );
    return output;
  }

  let response: unknown;
  try {
    response = await runModel(input.env, "variable_mapping", PROTOCOL_EXTRACTION_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You resolve research concepts to the supplied dataset variables using metadata and research instruments only; never use or request row-level data. For every concept, identify the most plausible operational variable when the evidence supports one. Use instrument or codebook text to connect coded field names to questionnaire wording. Use probable_match when one supplied variable is clearly the best semantic match, uncertain when multiple supplied variables are plausible or the evidence is weak, and no_match only when no supplied variable plausibly operationalises the concept. A direct_match is forbidden here because deterministic exact matching is handled separately. Never invent a variable. Evidence must name the supplied field, label, type, response choices, or instrument wording that supports the mapping. Return one JSON object of the form {\"mappings\":[{\"researchConcept\":string,\"datasetVariable\":string|null,\"mappingStatus\":\"probable_match\"|\"uncertain\"|\"no_match\",\"evidence\":string[]}]} with exactly one entry per supplied research concept, copying each researchConcept and datasetVariable verbatim."
      },
      {
        role: "user",
        content: JSON.stringify({
          researchConcepts: unresolved,
          datasetVariables: input.variables.map((variable) => ({
            ...variable,
            ...(instrumentWording.get(variable.variableName)?.length
              ? { instrumentWording: instrumentWording.get(variable.variableName) }
              : {})
          })),
          instrumentText: input.instrumentText?.slice(0, 30000) || null
        })
      }
    ],
    temperature: 0,
    max_tokens: 2048,
      response_format: {
        type: "json_schema",
        json_schema: mappingSuggestionsJsonSchema
      }
    });
  } catch {
    output.push(
      ...unresolved.map((researchConcept) => ({
        researchConcept,
        mappingStatus: "no_match" as const,
        evidence: [
          "Automatic semantic mapping could not be completed. The dataset profile is still available for manual mapping review."
        ]
      }))
    );
    return output;
  }

  let parsed: unknown;
  try {
    parsed = parseModelJson(modelPayload(response));
  } catch {
    parsed = [];
  }

  const candidateArray =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Array.isArray((parsed as any).mappings)
          ? (parsed as any).mappings
          : (Object.values(parsed as Record<string, unknown>).find((value) =>
              Array.isArray(value)
            ) as unknown[] | undefined) ?? []
        : [];

  const suggestions = mappingSuggestionsSchema.safeParse(candidateArray);
  const byConcept = new Map<string, MappingSuggestion>();
  if (suggestions.success) {
    const allowedVariables = new Set(input.variables.map((v) => v.variableName));
    const unresolvedByNormalized = new Map(
      unresolved.map((concept) => [normalize(concept), concept])
    );
    for (const raw of suggestions.data) {
      const researchConcept = unresolvedByNormalized.get(
        normalize(raw.researchConcept)
      );
      if (!researchConcept) continue;
      const suggestion = { ...raw, researchConcept };
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
