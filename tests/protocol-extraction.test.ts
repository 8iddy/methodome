import { describe, expect, it } from "vitest";
import {
  extractProtocolWithAi,
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
      paired: false,
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
    expect(parsed.paired).toBeNull();
  });

  it("captures a simple paired design separately from generic repeated measures", () => {
    const parsed = protocolExtractionSchema.parse({
      researchQuestions: [
        {
          text: "Did blood pressure change from baseline to follow-up in the same participants?",
          objectiveType: "association",
          outcomes: ["follow-up blood pressure"],
          predictors: ["baseline blood pressure"],
          covariates: [],
          estimand: "mean within-participant difference"
        }
      ],
      studyDesign: "longitudinal",
      unitOfAnalysis: "participant",
      repeatedMeasures: true,
      paired: true
    });

    expect(parsed.repeatedMeasures).toBe(true);
    expect(parsed.paired).toBe(true);
  });
});


describe("protocol extraction runtime", () => {
  const validExtraction = {
    studyTitle: "Synthetic study",
    objectives: ["Assess stockouts"],
    hypotheses: [],
    researchQuestions: [
      {
        text: "Is reporting completeness associated with stockout status?",
        objectiveType: "association",
        outcomes: ["stockout status"],
        predictors: ["reporting completeness"],
        covariates: [],
        estimand: null
      }
    ],
    studyDesign: "cross_sectional",
    unitOfAnalysis: "health facility",
    population: "health facilities",
    samplingDesign: null,
    repeatedMeasures: false,
    paired: false,
    clustered: false,
    clusterConcept: null,
    surveyWeights: false,
    weightConcept: null,
    stratified: false,
    strataConcept: null,
    missingDataPlan: null,
    statedAnalysisPlan: null
  };

  it("accepts the object response returned by Workers AI JSON mode", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const env = {
      AI: {
        run: async (_model: string, input: Record<string, unknown>) => {
          calls.push(input);
          return { response: validExtraction };
        }
      }
    } as never;

    const result = await extractProtocolWithAi(
      env,
      "# Protocol\nResearch question: Is reporting completeness associated with stockout status?"
    );

    expect(result.researchQuestions).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.max_tokens).toBe(4096);
  });

  it("classifies an unlabelled descriptive research question from its wording", async () => {
    const env = {
      AI: {
        run: async () => ({
          response: {
            ...validExtraction,
            researchQuestions: [
              {
                text: "What are the current functionality levels and data use patterns of the eLMIS?",
                objectiveType: null,
                outcomes: ["eLMIS functionality levels", "data use patterns"],
                predictors: [],
                covariates: [],
                estimand: null
              }
            ]
          }
        })
      }
    } as never;

    const result = await extractProtocolWithAi(env, "# Protocol\nResearch question present.");

    expect(result.researchQuestions[0]?.objectiveType).toBe("descriptive");
  });

  it("classifies qualitative intent without forcing statistical analysis", async () => {
    const env = {
      AI: {
        run: async () => ({
          response: {
            ...validExtraction,
            researchQuestions: [
              {
                text: "What barriers and facilitator experiences shape eLMIS data use among health workers?",
                objectiveType: null,
                outcomes: [],
                predictors: [],
                covariates: [],
                estimand: null
              }
            ]
          }
        })
      }
    } as never;

    const result = await extractProtocolWithAi(env, "# Protocol\nResearch question present.");

    expect(result.researchQuestions[0]?.objectiveType).toBe("qualitative");
  });

  it("does not mistake mixed-methods design language for sampling design", async () => {
    const env = {
      AI: {
        run: async () => ({
          response: {
            ...validExtraction,
            samplingDesign:
              "The study employs a cross-country mixed-methods concurrent triangulation design."
          }
        })
      }
    } as never;

    const result = await extractProtocolWithAi(env, "# Protocol\nResearch question present.");

    expect(result.samplingDesign).toBeNull();
  });

  it("reviews multiple questions independently to prevent outcome leakage", async () => {
    let call = 0;
    const firstPass = {
      ...validExtraction,
      researchQuestions: [
        {
          text: "What are the current eLMIS functionality levels and data use patterns?",
          objectiveType: "descriptive",
          outcomes: ["medicine stockout status"],
          predictors: [],
          covariates: [],
          estimand: null
        },
        {
          text: "Is reporting completeness associated with medicine stockout status?",
          objectiveType: "association",
          outcomes: ["medicine stockout status"],
          predictors: ["reporting completeness"],
          covariates: [],
          estimand: null
        }
      ]
    };

    const env = {
      AI: {
        run: async () => {
          call += 1;
          if (call === 1) return { response: firstPass };
          return {
            response: {
              researchQuestions: [
                {
                  text: firstPass.researchQuestions[0]!.text,
                  objectiveType: "descriptive",
                  outcomes: ["eLMIS functionality levels", "data use patterns"],
                  predictors: [],
                  covariates: [],
                  estimand: null
                },
                firstPass.researchQuestions[1]!
              ]
            }
          };
        }
      }
    } as never;

    const result = await extractProtocolWithAi(
      env,
      "# Protocol\nFour research questions are described in the study."
    );

    expect(call).toBe(2);
    expect(result.researchQuestions[0]?.outcomes).toEqual([
      "eLMIS functionality levels",
      "data use patterns"
    ]);
    expect(result.researchQuestions[1]?.outcomes).toEqual([
      "medicine stockout status"
    ]);
  });

  it("retries once when the first response contains incomplete JSON", async () => {
    let call = 0;
    const env = {
      AI: {
        run: async () => {
          call += 1;
          return call === 1
            ? { response: '{"studyTitle":"Synthetic study","researchQuestions":[' }
            : { response: validExtraction };
        }
      }
    } as never;

    const result = await extractProtocolWithAi(
      env,
      "# Protocol\nResearch question: Is reporting completeness associated with stockout status?"
    );

    expect(call).toBe(2);
    expect(result.studyTitle).toBe("Synthetic study");
  });

  it("accepts fenced JSON on the retry path", async () => {
    let call = 0;
    const env = {
      AI: {
        run: async () => {
          call += 1;
          return call === 1
            ? { response: "not json" }
            : { response: `\`\`\`json\n${JSON.stringify(validExtraction)}\n\`\`\`` };
        }
      }
    } as never;

    const result = await extractProtocolWithAi(env, "# Protocol\nResearch question present.");

    expect(result.researchQuestions[0]?.objectiveType).toBe("association");
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

  it("accepts an exact match to the wording an instrument pairs with a dataset field", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {} as never,
      concepts: ["number of clinical staff", "Stockout days"],
      variables: [
        { variableName: "staff_count", dataType: "count" },
        { variableName: "stockout_days", dataType: "count" }
      ],
      instrumentText:
        "FILE: questionnaire.csv\nvariable,question\nstaff_count,Number of clinical staff\nstockout_days,\"Days with any stockout, last quarter\"\n"
    });

    expect(
      suggestions.find((item) => item.researchConcept === "number of clinical staff")
    ).toMatchObject({
      datasetVariable: "staff_count",
      mappingStatus: "direct_match"
    });
    expect(
      suggestions.find((item) => item.researchConcept === "Stockout days")
    ).toMatchObject({ datasetVariable: "stockout_days", mappingStatus: "direct_match" });
  });

  it("does not treat instrument wording shared by two fields as an exact match", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {} as never,
      concepts: ["Stockout"],
      variables: [
        { variableName: "q1", dataType: "binary" },
        { variableName: "q2", dataType: "binary" }
      ],
      instrumentText: "q1,Stockout\nq2,Stockout\n"
    });

    expect(suggestions[0]?.mappingStatus).toBe("no_match");
  });

  it("keeps a model suggestion as a reviewable match, never a direct match", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {
        AI: {
          run: async () => ({
            response: {
              mappings: [
                {
                  researchConcept: "Stockout days in the last quarter",
                  datasetVariable: "stockout_days",
                  mappingStatus: "direct_match",
                  evidence: ["Field stockout_days counts stockout days."]
                }
              ]
            }
          })
        }
      } as never,
      concepts: ["stockout days in the last quarter"],
      variables: [{ variableName: "stockout_days", dataType: "count" }]
    });

    expect(suggestions[0]).toMatchObject({
      researchConcept: "stockout days in the last quarter",
      datasetVariable: "stockout_days",
      mappingStatus: "probable_match"
    });
  });

  it("keeps dataset review available when semantic mapping fails", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {
        AI: {
          run: async () => {
            throw new Error("assert");
          }
        }
      } as never,
      concepts: ["Medicine stockout status"],
      variables: [
        {
          variableName: "stockout_status",
          label: "Stockout in previous 30 days",
          dataType: "binary"
        }
      ]
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.mappingStatus).toBe("no_match");
    expect(suggestions[0]?.evidence.join(" ")).toContain(
      "dataset profile is still available"
    );
  });

  it("returns deterministic mappings when project policy disables model assistance", async () => {
    const suggestions = await suggestMappingsWithAi({
      env: {} as never,
      allowModelAssist: false,
      concepts: ["Reporting completeness", "Medicine availability"],
      variables: [
        {
          variableName: "reporting_completeness",
          label: "Reporting completeness",
          dataType: "continuous"
        },
        {
          variableName: "stockout_status",
          label: "Stockout status",
          dataType: "binary"
        }
      ]
    });

    expect(suggestions.find((item) => item.researchConcept === "Reporting completeness"))
      .toMatchObject({
        datasetVariable: "reporting_completeness",
        mappingStatus: "direct_match"
      });
    expect(suggestions.find((item) => item.researchConcept === "Medicine availability"))
      .toMatchObject({
        mappingStatus: "no_match"
      });
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
