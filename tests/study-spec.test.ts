import { describe, expect, it } from "vitest";
import { parseStudySpecification } from "@methodome/study-spec";

describe("study specification", () => {
  it("parses a valid clustered cross sectional study", () => {
    const parsed = parseStudySpecification({
      version: "1.0",
      researchQuestions: [
        {
          id: "rq1",
          text: "Is reporting completeness associated with stockout status?",
          objectiveType: "association",
          outcomes: [
            {
              concept: "stockout status",
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
              mappingStatus: "probable_match"
            }
          ],
          covariates: []
        }
      ],
      studyDesign: "cross_sectional",
      unitOfAnalysis: "health facility",
      clustered: true,
      clusterVariable: "district"
    });

    expect(parsed.clustered).toBe(true);
    expect(parsed.clusterVariable).toBe("district");
    expect(parsed.paired).toBe(false);
    expect(parsed.researchQuestions[0]?.outcomes[0]?.variableType).toBe("binary");
  });

  it("preserves explicit paired design and observed group-level metadata", () => {
    const parsed = parseStudySpecification({
      version: "1.0",
      researchQuestions: [
        {
          id: "rq1",
          text: "Did mean blood pressure change from baseline to follow-up?",
          objectiveType: "association",
          outcomes: [
            {
              concept: "follow-up blood pressure",
              datasetVariable: "bp_followup",
              variableType: "continuous",
              mappingStatus: "direct_match"
            }
          ],
          predictors: [
            {
              concept: "baseline blood pressure",
              datasetVariable: "bp_baseline",
              variableType: "continuous",
              observedLevelCount: 42,
              mappingStatus: "direct_match"
            }
          ],
          covariates: []
        }
      ],
      studyDesign: "longitudinal",
      unitOfAnalysis: "participant",
      repeatedMeasures: true,
      paired: true
    });

    expect(parsed.paired).toBe(true);
    expect(parsed.repeatedMeasures).toBe(true);
    expect(parsed.researchQuestions[0]?.predictors[0]?.observedLevelCount).toBe(42);
  });

  it("rejects a study without research questions", () => {
    expect(() =>
      parseStudySpecification({
        version: "1.0",
        researchQuestions: [],
        studyDesign: "cross_sectional",
        unitOfAnalysis: "facility"
      })
    ).toThrow();
  });
});
