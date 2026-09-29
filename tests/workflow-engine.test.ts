import { describe, expect, it } from "vitest";
import type { AnalysisPlan } from "@methodome/analysis-contracts";
import type { CandidateSelection } from "@methodome/method-registry";
import type { StudySpecification } from "@methodome/study-spec";
import {
  assessProjectReadiness,
  buildOrchestratorView,
  type ProjectWorkflowSnapshot,
  type VariableMappingSnapshot
} from "@methodome/workflow-engine";

function specification(
  objectiveType: StudySpecification["researchQuestions"][number]["objectiveType"] = "association"
): StudySpecification {
  return {
    version: "1.0",
    researchQuestions: [
      {
        id: "rq1",
        text: "Is stockout frequency associated with routine data use?",
        objectiveType,
        outcomes: [
          {
            concept: "stockout frequency",
            datasetVariable: null,
            variableType: "continuous",
            mappingStatus: null
          }
        ],
        predictors:
          objectiveType === "qualitative"
            ? []
            : [
                {
                  concept: "routine data use",
                  datasetVariable: null,
                  variableType: "continuous",
                  mappingStatus: null
                }
              ],
        covariates: [],
        estimand: null
      }
    ],
    studyDesign: "cross_sectional",
    unitOfAnalysis: "health facility",
    repeatedMeasures: false,
    paired: false,
    clustered: false,
    clusterVariable: null,
    surveyWeights: false,
    weightVariable: null,
    stratified: false,
    strataVariable: null,
    samplingDesign: null,
    missingDataPlan: null,
    statedAnalysisPlan: null
  };
}

function selection(
  executable = true,
  blockedReason?: string
): CandidateSelection {
  return {
    questionId: "rq1",
    candidates: executable
      ? [
          {
            methodId: "pearson_correlation",
            displayName: "Pearson correlation",
            maturity: "validated",
            executable: true,
            rationale: "Continuous independent association.",
            requiredChecks: ["linearity"]
          }
        ]
      : [],
    warnings: [],
    ...(blockedReason ? { blockedReason } : {})
  };
}

function mapping(
  concept: string,
  datasetVariable?: string,
  confirmed = true
): VariableMappingSnapshot {
  return {
    researchConcept: concept,
    ...(datasetVariable ? { datasetVariable } : {}),
    mappingStatus: datasetVariable ? "direct_match" : "no_match",
    ...(confirmed ? { confirmedBy: "user-1" } : {})
  };
}

function snapshot(
  patch: Partial<ProjectWorkflowSnapshot> = {}
): ProjectWorkflowSnapshot {
  return {
    hasProtocol: true,
    hasProtocolExtraction: true,
    transcriptCount: 0,
    datasetCount: 1,
    hasDerivedDataset: false,
    specification: specification(),
    mappings: [
      mapping("stockout frequency", "stockout_days"),
      mapping("routine data use", "data_use_score")
    ],
    selections: [selection()],
    plan: null,
    completedAnalysisCount: 0,
    ...patch
  };
}

function lockedPlan(): AnalysisPlan {
  return {
    id: "plan-1",
    projectId: "project-1",
    versionId: "v1",
    datasetVersionId: "dataset-1",
    studySpecificationVersion: "1.0",
    status: "planned_before_analysis",
    analyses: [
      {
        id: "analysis-1",
        researchQuestionId: "rq1",
        outcome: "stockout_days",
        predictors: ["data_use_score"],
        covariates: [],
        candidateMethodIds: ["pearson_correlation"],
        selectedMethodId: "pearson_correlation",
        requiredDecisions: [],
        warnings: [],
        diagnostics: ["linearity"],
        addedAfterLock: false
      }
    ],
    lockedAt: "2026-09-29T00:00:00.000Z",
    lockHash: "abc123",
    createdBy: "user-1",
    createdAt: "2026-09-29T00:00:00.000Z"
  };
}

describe("project readiness", () => {
  it("distinguishes reviewed mappings from analysis-ready mappings", () => {
    const readiness = assessProjectReadiness(
      snapshot({
        mappings: [
          mapping("stockout frequency"),
          mapping("routine data use", "data_use_score")
        ]
      })
    );

    expect(readiness.mappingSummary.reviewedCount).toBe(2);
    expect(readiness.mappingSummary.gapCount).toBe(1);
    expect(readiness.mappingSummary.unreviewedCount).toBe(0);
    expect(readiness.stages.mappings).toBe("reviewed_with_gaps");
    expect(readiness.questions[0]?.status).toBe("needs_mapping");
    expect(readiness.questions[0]?.blockers[0]?.code).toBe(
      "confirmed_not_represented"
    );
    expect(readiness.nextAction.code).toBe("resolve_mapping_gaps");
  });

  it("does not treat an unconfirmed suggestion as a completed mapping", () => {
    const readiness = assessProjectReadiness(
      snapshot({
        mappings: [
          mapping("stockout frequency", "stockout_days", false),
          mapping("routine data use", "data_use_score")
        ]
      })
    );

    expect(readiness.stages.mappings).toBe("needs_review");
    expect(readiness.mappingSummary.unreviewedCount).toBe(1);
    expect(readiness.nextAction.code).toBe("review_variable_mappings");
  });

  it("hides next-action guidance when the researcher is already on its work surface", () => {
    const readiness = assessProjectReadiness(snapshot(), "analysis-plan");

    expect(readiness.nextAction.code).toBe("build_analysis_plan");
    expect(readiness.nextAction.targetSection).toBe("analysis-plan");
    expect(readiness.guidance.visible).toBe(false);
    expect(readiness.guidance.reason).toBe("already_on_action_surface");
  });

  it("requires actual mappings for every quantitative analytical concept", () => {
    const spec = specification();
    spec.researchQuestions[0]!.covariates.push({
      concept: "facility level",
      datasetVariable: null,
      variableType: "categorical_nominal",
      mappingStatus: null
    });

    const readiness = assessProjectReadiness(
      snapshot({
        specification: spec,
        mappings: [
          mapping("stockout frequency", "stockout_days"),
          mapping("routine data use", "data_use_score"),
          mapping("facility level")
        ]
      })
    );

    expect(readiness.questions[0]?.status).toBe("needs_mapping");
    expect(
      readiness.questions[0]?.blockers.some(
        (blocker) =>
          blocker.code === "confirmed_not_represented" &&
          blocker.role === "covariate"
      )
    ).toBe(true);
  });

  it("routes qualitative questions by source readiness rather than dataset-variable mapping", () => {
    const qualitative = specification("qualitative");
    qualitative.researchQuestions[0]!.outcomes = [
      {
        concept: "implementation experience",
        datasetVariable: null,
        variableType: "text",
        mappingStatus: null
      }
    ];

    const missingSource = assessProjectReadiness(
      snapshot({
        specification: qualitative,
        mappings: [],
        selections: [
          selection(
            false,
            "This question should not be forced into the quantitative statistical pipeline."
          )
        ],
        transcriptCount: 0
      })
    );
    expect(missingSource.mappingSummary.totalConcepts).toBe(0);
    expect(missingSource.questions[0]?.status).toBe(
      "qualitative_source_required"
    );
    expect(missingSource.nextAction.code).toBe("prepare_qualitative_analysis");

    const withSource = assessProjectReadiness(
      snapshot({
        specification: qualitative,
        mappings: [],
        selections: [selection(false, "Qualitative branch.")],
        transcriptCount: 2
      })
    );
    expect(withSource.questions[0]?.status).toBe("qualitative_ready");
    expect(withSource.nextAction.code).toBe("prepare_qualitative_analysis");
  });

  it("moves from a locked quantitative plan to results only after planned analyses complete", () => {
    const plan = lockedPlan();

    const pending = assessProjectReadiness(
      snapshot({ plan, completedAnalysisCount: 0 })
    );
    expect(pending.nextAction.code).toBe("run_analyses");

    const complete = assessProjectReadiness(
      snapshot({ plan, completedAnalysisCount: 1 })
    );
    expect(complete.stages.analysis).toBe("complete");
    expect(complete.nextAction.code).toBe("review_results");
  });

  it("keeps method blockers separate from mapping blockers", () => {
    const readiness = assessProjectReadiness(
      snapshot({
        selections: [
          selection(
            false,
            "A complex-survey analysis path is required before Methodome can select an iid method."
          )
        ]
      })
    );

    expect(readiness.stages.mappings).toBe("ready");
    expect(readiness.questions[0]?.status).toBe("method_blocked");
    expect(readiness.questions[0]?.blockers[0]?.code).toBe("method_blocked");
  });
});


describe("project orchestrator view", () => {
  it("automatically advances a fully ready quantitative project to draft planning", () => {
    const readiness = assessProjectReadiness(snapshot());
    const orchestrator = buildOrchestratorView(readiness, null);

    expect(orchestrator.status).toBe("ready_to_execute");
    expect(orchestrator.automaticAction).toBe("create_draft_plan");
    expect(orchestrator.decisions).toHaveLength(0);
  });

  it("surfaces method choice as a researcher decision instead of guessing", () => {
    const draft: AnalysisPlan = {
      id: "plan-draft",
      projectId: "project-1",
      versionId: "v1",
      datasetVersionId: "dataset-1",
      studySpecificationVersion: "1.0",
      status: "planned_before_analysis",
      analyses: [
        {
          id: "analysis-choice",
          researchQuestionId: "rq1",
          outcome: "stockout_days",
          predictors: ["data_use_score"],
          covariates: [],
          candidateMethodIds: [
            "pearson_correlation",
            "spearman_correlation"
          ],
          requiredDecisions: ["Choose association estimand."],
          warnings: [],
          diagnostics: ["relationship form"],
          addedAfterLock: false
        }
      ],
      createdBy: "user-1",
      createdAt: "2026-09-29T00:00:00.000Z"
    };
    const readiness = assessProjectReadiness(
      snapshot({ plan: draft })
    );
    const orchestrator = buildOrchestratorView(readiness, draft);

    expect(orchestrator.status).toBe("waiting_for_researcher");
    expect(
      orchestrator.decisions.some(
        (decision) =>
          decision.kind === "select_method" &&
          decision.analysisId === "analysis-choice"
      )
    ).toBe(true);
    expect(orchestrator.automaticAction).toBeUndefined();
  });

  it("requires researcher approval before locking a fully specified draft plan", () => {
    const locked = lockedPlan();
    const { lockedAt: _lockedAt, lockHash: _lockHash, ...draft } = locked;
    const readiness = assessProjectReadiness(
      snapshot({ plan: draft })
    );
    const orchestrator = buildOrchestratorView(readiness, draft);

    expect(orchestrator.status).toBe("waiting_for_researcher");
    expect(
      orchestrator.decisions.some(
        (decision) => decision.kind === "approve_plan"
      )
    ).toBe(true);
  });

  it("automatically queues execution only after the plan is locked", () => {
    const plan = lockedPlan();
    const readiness = assessProjectReadiness(
      snapshot({ plan, completedAnalysisCount: 0 })
    );
    const orchestrator = buildOrchestratorView(readiness, plan);

    expect(orchestrator.status).toBe("ready_to_execute");
    expect(orchestrator.automaticAction).toBe("run_analyses");
  });

  it("routes qualitative-only work to the qualitative branch rather than quantitative planning", () => {
    const qualitative = specification("qualitative");
    qualitative.researchQuestions[0]!.outcomes = [
      {
        concept: "implementation experience",
        datasetVariable: null,
        variableType: "text",
        mappingStatus: null
      }
    ];

    const readiness = assessProjectReadiness(
      snapshot({
        specification: qualitative,
        mappings: [],
        selections: [selection(false, "Qualitative branch.")],
        transcriptCount: 2,
        datasetCount: 0
      })
    );
    const orchestrator = buildOrchestratorView(readiness, null);

    expect(readiness.nextAction.code).toBe("prepare_qualitative_analysis");
    expect(orchestrator.status).toBe("blocked");
    expect(orchestrator.automaticAction).toBeUndefined();
  });
});
