import { z } from "zod";

export const variableTypes = [
  "binary",
  "categorical_nominal",
  "categorical_ordinal",
  "count",
  "continuous",
  "time_to_event",
  "date",
  "text",
  "unknown"
] as const;

export const variableConceptSchema = z.object({
  concept: z.string().min(1),
  datasetVariable: z.string().min(1).nullable().default(null),
  variableType: z.enum(variableTypes).nullable().default(null),
  observedLevelCount: z.number().int().nonnegative().nullable().default(null),
  mappingStatus: z
    .enum(["direct_match", "probable_match", "uncertain", "no_match"])
    .nullable()
    .default(null)
});

export type VariableConcept = z.infer<typeof variableConceptSchema>;

export const researchQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  objectiveType: z
    .enum([
      "descriptive",
      "association",
      "prediction",
      "causal",
      "diagnostic",
      "prognostic",
      "qualitative",
      "exploratory"
    ])
    .nullable()
    .default(null),
  outcomes: z.array(variableConceptSchema).default([]),
  predictors: z.array(variableConceptSchema).default([]),
  covariates: z.array(variableConceptSchema).default([]),
  estimand: z.string().nullable().default(null)
});

export const studySpecificationSchema = z.object({
  version: z.string().min(1),
  researchQuestions: z.array(researchQuestionSchema).min(1),
  studyDesign: z.enum([
    "cross_sectional",
    "cohort",
    "case_control",
    "trial",
    "longitudinal",
    "time_series",
    "ecological",
    "other"
  ]),
  unitOfAnalysis: z.string().min(1),
  repeatedMeasures: z.boolean().default(false),
  paired: z.boolean().default(false),
  clustered: z.boolean().default(false),
  clusterVariable: z.string().nullable().default(null),
  surveyWeights: z.boolean().default(false),
  weightVariable: z.string().nullable().default(null),
  stratified: z.boolean().default(false),
  strataVariable: z.string().nullable().default(null),
  samplingDesign: z.string().nullable().default(null),
  missingDataPlan: z.string().nullable().default(null),
  statedAnalysisPlan: z.string().nullable().default(null)
});

export type StudySpecification = z.infer<typeof studySpecificationSchema>;
export type ResearchQuestion = z.infer<typeof researchQuestionSchema>;

export function parseStudySpecification(input: unknown): StudySpecification {
  return studySpecificationSchema.parse(input);
}
