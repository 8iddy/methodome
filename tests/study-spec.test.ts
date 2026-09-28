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
    expect(parsed.researchQuestions[0]?.outcomes[0]?.variableType).toBe("binary");
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
