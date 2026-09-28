import { describe, expect, it } from "vitest";
import {
  addExploratoryAnalysis,
  createAnalysisPlan,
  lockAnalysisPlan
} from "@methodome/analysis-plan";

const analysis = {
  id: "ana_1",
  researchQuestionId: "rq1",
  outcome: "stockout_status",
  predictors: ["reporting_completeness"],
  covariates: [],
  candidateMethodIds: ["binary_logistic_regression"],
  selectedMethodId: "binary_logistic_regression",
  requiredDecisions: [],
  warnings: [],
  diagnostics: ["separation"],
  addedAfterLock: false
};

describe("analysis plan locking", () => {
  it("produces a deterministic lock hash", async () => {
    const plan = createAnalysisPlan({
      id: "plan_1",
      projectId: "proj_1",
      versionId: "v1",
      studySpecificationVersion: "1.0",
      status: "planned_before_analysis",
      analyses: [analysis],
      createdBy: "user_1",
      createdAt: "2026-09-28T12:00:00.000Z"
    });

    const first = await lockAnalysisPlan(plan, "2026-09-28T12:05:00.000Z");
    const second = await lockAnalysisPlan(plan, "2026-09-28T12:05:00.000Z");

    expect(first.lockHash).toBe(second.lockHash);
    expect(first.lockHash).toHaveLength(64);
  });

  it("marks additions after locking as exploratory", async () => {
    const plan = createAnalysisPlan({
      id: "plan_1",
      projectId: "proj_1",
      versionId: "v1",
      studySpecificationVersion: "1.0",
      status: "planned_before_analysis",
      analyses: [analysis],
      createdBy: "user_1",
      createdAt: "2026-09-28T12:00:00.000Z"
    });

    const locked = await lockAnalysisPlan(plan, "2026-09-28T12:05:00.000Z");

    const exploratory = addExploratoryAnalysis(locked, {
      ...analysis,
      id: "ana_2"
    });

    expect(exploratory.status).toBe("exploratory");
    expect(exploratory.analyses[1]?.addedAfterLock).toBe(true);
  });
});
