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

  it("keeps qualitative questions out of the quantitative method pipeline", () => {
    const study = clusteredBinaryStudy();
    study.researchQuestions[0]!.objectiveType = "qualitative";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates).toHaveLength(0);
    expect(selection.blockedReason).toContain("quantitative");
  });

  it("blocks causal automatic selection in the initial boundary", () => {
    const study = clusteredBinaryStudy();
    study.researchQuestions[0]!.objectiveType = "causal";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates).toHaveLength(0);
    expect(selection.blockedReason).toContain("causal");
  });

  it("returns descriptive statistics for descriptive questions", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.researchQuestions[0]!.objectiveType = "descriptive";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates.map((item) => item.methodId)).toEqual([
      "descriptive_statistics"
    ]);
    expect(selection.candidates[0]?.executable).toBe(true);
  });

  it("returns count-model families without using overdispersion as an automatic negative-binomial switch", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.researchQuestions[0]!.outcomes[0]!.variableType = "count";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates.map((item) => item.methodId)).toEqual([
      "poisson_regression",
      "negative_binomial_regression"
    ]);
    expect(selection.warnings.join(" ")).toContain(
      "Overdispersion alone does not select negative binomial"
    );
    expect(
      selection.candidates.find(
        (item) => item.methodId === "negative_binomial_regression"
      )?.decisionRequired
    ).toContain("Do not choose negative binomial solely");
  });

  it("blocks ordinary descriptive routing when the sample needs survey-aware analysis", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.surveyWeights = true;
    study.weightVariable = "survey_weight";
    study.researchQuestions[0]!.objectiveType = "descriptive";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates).toHaveLength(0);
    expect(selection.blockedReason).toContain("complex-survey");
  });

  it("blocks iid continuous methods for repeated observations", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.repeatedMeasures = true;
    study.studyDesign = "longitudinal";
    study.researchQuestions[0]!.outcomes[0]!.variableType = "continuous";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates).toHaveLength(0);
    expect(selection.blockedReason).toContain("must not be analysed with an iid method");
  });

  it("does not offer Fisher exact for a binary outcome with a non-binary nominal predictor", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.researchQuestions[0]!.predictors = [
      {
        concept: "facility type",
        datasetVariable: "facility_type",
        variableType: "categorical_nominal",
        mappingStatus: "direct_match"
      }
    ];

    const selection = selectCandidateMethods(study, "rq1");
    const methodIds = selection.candidates.map((item) => item.methodId);

    expect(methodIds).toContain("chi_square");
    expect(methodIds).not.toContain("fisher_exact");
  });

  it("keeps diagnostic questions out of ordinary association and regression routing", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.researchQuestions[0]!.objectiveType = "diagnostic";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates).toHaveLength(0);
    expect(selection.blockedReason).toContain("diagnostic-accuracy");
  });

  it("routes a simple ordinal monotonic association to Spearman", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.researchQuestions[0]!.outcomes[0]!.variableType = "categorical_ordinal";
    study.researchQuestions[0]!.predictors = [
      {
        concept: "severity score",
        datasetVariable: "severity_score",
        variableType: "continuous",
        mappingStatus: "direct_match"
      }
    ];

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.candidates.map((item) => item.methodId)).toEqual([
      "spearman_correlation"
    ]);
  });

  it("warns against population representativeness for convenience samples", () => {
    const study = clusteredBinaryStudy();
    study.clustered = false;
    study.clusterVariable = null;
    study.samplingDesign = "convenience sampling";

    const selection = selectCandidateMethods(study, "rq1");

    expect(selection.warnings.join(" ")).toContain("non-probability");
    expect(selection.warnings.join(" ")).toContain("population representativeness");
  });
});
