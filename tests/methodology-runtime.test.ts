import { describe, expect, it } from "vitest";
import {
  getMethodologyRule,
  methodologyKnowledgeStatus,
  methodologyKnowledgeVersion,
  methodologyRules,
  retrieveMethodologyGuidance
} from "@methodome/methodology-knowledge";
import { parseStudySpecification } from "@methodome/study-spec";
import { selectCandidateMethods } from "@methodome/method-registry";

function study(overrides: Record<string, unknown> = {}) {
  return parseStudySpecification({
    version: "1.0",
    researchQuestions: [{
      id: "rq1",
      text: "Does clinic type differ in outcome score?",
      objectiveType: "association",
      outcomes: [{ concept: "outcome score", variableType: "continuous" }],
      predictors: [{ concept: "clinic type", variableType: "categorical_nominal", observedLevelCount: 3 }],
      covariates: []
    }],
    studyDesign: "cross_sectional",
    unitOfAnalysis: "participant",
    repeatedMeasures: false,
    paired: false,
    clustered: false,
    surveyWeights: false,
    stratified: false,
    ...overrides
  });
}

describe("runtime methodology knowledge", () => {
  it("bundles the complete source-supported v1 corpus", () => {
    expect(methodologyKnowledgeVersion).toBe("methodome-methodology-knowledge-v1");
    expect(methodologyKnowledgeStatus).toBe("source_supported");
    expect(methodologyRules).toHaveLength(62);
    expect(methodologyRules.every((rule) => rule.evidence.length > 0)).toBe(true);
  });

  it("retrieves reporting guidance with evidence and source traceability", () => {
    const guidance = retrieveMethodologyGuidance({
      topics: ["observational reporting", "missing data reporting"],
      limit: 6
    });
    expect(guidance.rules.some((rule) => rule.ruleId === "report-observational-001")).toBe(true);
    expect(guidance.evidenceIds.length).toBeGreaterThan(0);
    expect(guidance.sourceIds.length).toBeGreaterThan(0);
  });

  it("exposes the hard causal identification gate", () => {
    const causal = study();
    causal.researchQuestions[0]!.objectiveType = "causal";
    const selection = selectCandidateMethods(causal, "rq1");
    expect(selection.candidates).toHaveLength(0);
    expect(selection.methodology?.ruleIds).toContain("causal-gate-001");
    expect(selection.methodology?.evidenceIds.length).toBeGreaterThan(0);
  });

  it("does not automatically reduce three groups to ordinary ANOVA", () => {
    const selection = selectCandidateMethods(study(), "rq1");
    expect(selection.candidates.map((candidate) => candidate.methodId)).toEqual([
      "one_way_anova",
      "kruskal_wallis"
    ]);
    expect(selection.candidates.every((candidate) => Boolean(candidate.decisionRequired))).toBe(true);
    expect(selection.methodology?.ruleIds).toContain("multi-group-gate-001");
  });

  it("keeps nonprobability, survey, repeated, Mann-Whitney and count safeguards queryable", () => {
    for (const ruleId of [
      "nonprobability-sampling-001", "survey-variance-001", "repeated-001",
      "mann-whitney-001", "count-overdispersion-001"
    ]) {
      const rule = getMethodologyRule(ruleId);
      expect(rule?.status).toBe("supported");
      expect(rule?.evidence.length).toBeGreaterThan(0);
    }
    expect(getMethodologyRule("mann-whitney-001")?.warnings.join(" ").toLowerCase()).toContain("median");
    expect(getMethodologyRule("count-overdispersion-001")?.warnings.join(" ").toLowerCase()).toMatch(/negative[- ]binomial/);
  });
});
