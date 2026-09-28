import { describe, expect, it } from "vitest";
import {
  protocolExtractionSchema,
  suggestMappingsWithAi
} from "../apps/api/src/protocol-extraction";

describe("protocol extraction schema", () => {
  it("keeps multiple research questions and nullable design fields", () => {
    const parsed = protocolExtractionSchema.parse({
      studyTitle: "Synthetic study",
      objectives: ["Describe stockouts", "Assess association"],
      hypotheses: [],
      researchQuestions: [
        {
          text: "What proportion of facilities had a stockout?",
          objectiveType: "descriptive",
          outcomes: ["medicine stockout status"],
          predictors: [],
          covariates: [],
          estimand: null
        },
        {
          text: "Is reporting completeness associated with stockout status?",
          objectiveType: "association",
          outcomes: ["medicine stockout status"],
          predictors: ["reporting completeness"],
          covariates: [],
          estimand: null
        }
      ],
      studyDesign: "cross_sectional",
      unitOfAnalysis: "health facility",
      population: null,
      samplingDesign: null,
      repeatedMeasures: false,
      clustered: false,
      clusterConcept: null,
      surveyWeights: false,
      weightConcept: null,
      stratified: false,
      strataConcept: null,
      missingDataPlan: null,
      statedAnalysisPlan: null
    });

    expect(parsed.researchQuestions).toHaveLength(2);
    expect(parsed.researchQuestions[0]?.objectiveType).toBe("descriptive");
    expect(parsed.unitOfAnalysis).toBe("health facility");
  });

  it("does not require unsupported details to be invented", () => {
    const parsed = protocolExtractionSchema.parse({
      researchQuestions: [
        {
          text: "What is the prevalence of stockout?",
          objectiveType: "descriptive",
          outcomes: ["stockout"],
          predictors: [],
          covariates: [],
          estimand: null
        }
      ]
    });

    expect(parsed.studyTitle).toBeNull();
    expect(parsed.studyDesign).toBeNull();
    expect(parsed.unitOfAnalysis).toBeNull();
    expect(parsed.samplingDesign).toBeNull();
  });
});

describe("mapping evidence rules", () => {
  it("uses direct match only for exact normalized metadata evidence", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {} as never,
      concepts: ["Reporting completeness"],
      variables: [
        {
          variableName: "reporting_completeness",
          label: "Reporting completeness",
          dataType: "continuous"
        }
      ]
    });

    expect(suggestions).toEqual([
      {
        researchConcept: "Reporting completeness",
        datasetVariable: "reporting_completeness",
        mappingStatus: "direct_match",
        evidence: [
          "Exact normalized match to a dataset variable name or dataset label."
        ]
      }
    ]);
  });

  it("does not promote an unsupported semantic guess to direct match", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {} as never,
      concepts: ["Medicine availability"],
      variables: [
        {
          variableName: "stockout_status",
          label: "Stockout status",
          dataType: "binary"
        }
      ]
    });

    expect(suggestions[0]?.mappingStatus).toBe("no_match");
    expect(suggestions[0]?.datasetVariable).toBeUndefined();
  });
});
