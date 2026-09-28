import { describe, expect, it } from "vitest";
import { selectCandidateMethods } from "@methodome/method-registry";
import { parseStudySpecification } from "@methodome/study-spec";

function clusteredBinaryStudy() {
  return parseStudySpecification({
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
}

describe("deterministic method registry", () => {
  it("returns clustered binary candidates without choosing the estimand", () => {
    const selection = selectCandidateMethods(clusteredBinaryStudy(), "rq1");

    expect(selection.blockedReason).toBeUndefined();
    expect(selection.candidates.map((item) => item.methodId)).toEqual([
      "mixed_effects_logistic_regression",
      "gee_logistic_regression"
    ]);
    expect(selection.candidates.every((item) => item.decisionRequired)).toBe(true);
  });

  it("blocks causal automatic selection in the initial boundary", () => {
    const study = clusteredBinaryStudy();
    study.researchQuestions[0]!.objectiveType = "causal";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates).toHaveLength(0);
    expect(selection.blockedReason).toContain("causal");
  });

  it("returns Poisson and negative binomial for count outcomes", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.researchQuestions[0]!.outcomes[0]!.variableType = "count";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates.map((item) => item.methodId)).toEqual([
      "poisson_regression",
      "negative_binomial_regression"
    ]);
  });
});
