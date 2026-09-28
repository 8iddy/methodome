import { describe, expect, it } from "vitest";
import { scoreBenchmarkCase } from "@methodome/benchmark";
import { selectCandidateMethods } from "@methodome/method-registry";
import { parseStudySpecification } from "@methodome/study-spec";

const accepted = parseStudySpecification({
  version: "1.0",
  researchQuestions: [
    {
      id: "rq1",
      text: "Is reporting completeness associated with stockout status?",
      objectiveType: "association",
      outcomes: [
        {
          concept: "stockout",
          datasetVariable: "stockout_status",
          variableType: "binary",
          mappingStatus: "direct_match"
        }
      ],
      predictors: [
        {
          concept: "reporting completeness",
          datasetVariable: "reporting_completeness",
          variableType: "continuous",
          mappingStatus: "direct_match"
        }
      ],
      covariates: []
    }
  ],
  studyDesign: "cross_sectional",
  unitOfAnalysis: "facility",
  clustered: true,
  clusterVariable: "district"
});

describe("benchmark scoring", () => {
  it("accepts any expert approved method path", () => {
    const selection = selectCandidateMethods(accepted, "rq1");
    const score = scoreBenchmarkCase(
      {
        id: "case_1",
        title: "Clustered stockout study",
        domain: "public_health",
        acceptedSpecifications: [
          { id: "expert_consensus", specification: accepted }
        ],
        acceptedMethodPaths: [
          {
            questionId: "rq1",
            acceptedMethodIds: [
              "mixed_effects_logistic_regression",
              "gee_logistic_regression"
            ]
          }
        ]
      },
      accepted,
      [selection]
    );

    expect(score.specification.proportion).toBe(1);
    expect(score.methodProportion).toBe(1);
  });
});
