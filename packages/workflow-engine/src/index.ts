import type { AnalysisPlan } from "@methodome/analysis-contracts";
import type { CandidateSelection } from "@methodome/method-registry";
import type { ResearchQuestion, StudySpecification, VariableConcept } from "@methodome/study-spec";

export type WorkflowSection =
  | "overview"
  | "protocol"
  | "instruments"
  | "data"
  | "data-preparation"
  | "study-design"
  | "variables"
  | "analysis-plan"
  | "analysis"
  | "results"
  | "reports"
  | "audit-trail"
  | "settings";

export type WorkflowStageStatus =
  | "missing"
  | "needs_review"
  | "reviewed_with_gaps"
  | "ready"
  | "locked"
  | "complete"
  | "blocked";

export type QuestionReadinessStatus =
  | "ready"
  | "needs_mapping"
  | "needs_intent"
  | "method_blocked"
  | "qualitative_ready"
  | "qualitative_source_required";

export type WorkflowActionCode =
  | "add_protocol"
  | "extract_protocol"
  | "confirm_study_design"
  | "upload_dataset"
  | "review_variable_mappings"
  | "resolve_mapping_gaps"
  | "build_analysis_plan"
  | "lock_analysis_plan"
  | "run_analyses"
  | "review_results"
  | "prepare_qualitative_analysis"
  | "review_project";

export interface VariableMappingSnapshot {
  researchConcept: string;
  datasetVariable?: string;
  mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
  confirmedBy?: string;
}

export interface WorkflowBlocker {
  code:
    | "mapping_missing"
    | "mapping_unconfirmed"
    | "confirmed_not_represented"
    | "objective_type_missing"
    | "method_blocked"
    | "qualitative_source_missing";
  message: string;
  questionId: string;
  concept?: string;
  role?: "outcome" | "predictor" | "covariate";
}

export interface VariableReadiness {
  concept: string;
  role: "outcome" | "predictor" | "covariate";
  datasetVariable?: string;
  mappingStatus?: VariableMappingSnapshot["mappingStatus"];
  confirmed: boolean;
  represented: boolean;
}

export interface QuestionReadiness {
  questionId: string;
  text: string;
  objectiveType: ResearchQuestion["objectiveType"];
  mode: "quantitative" | "qualitative" | "unknown";
  status: QuestionReadinessStatus;
  variables: VariableReadiness[];
  blockers: WorkflowBlocker[];
  candidates: CandidateSelection["candidates"];
  warnings: string[];
}

export interface MappingStageSummary {
  status: WorkflowStageStatus;
  reviewedCount: number;
  totalConcepts: number;
  representedCount: number;
  gapCount: number;
  unreviewedCount: number;
}

export interface ProjectWorkflowSnapshot {
  hasProtocol: boolean;
  hasProtocolExtraction: boolean;
  transcriptCount: number;
  datasetCount: number;
  hasDerivedDataset: boolean;
  specification: StudySpecification | null;
  mappings: VariableMappingSnapshot[];
  selections: CandidateSelection[];
  plan: AnalysisPlan | null;
  completedAnalysisCount: number;
}

export interface WorkflowAction {
  code: WorkflowActionCode;
  label: string;
  detail: string;
  targetSection: WorkflowSection;
  requiresResearcher: boolean;
}

export interface ProjectReadiness {
  stages: {
    protocol: WorkflowStageStatus;
    data: WorkflowStageStatus;
    studyDesign: WorkflowStageStatus;
    mappings: WorkflowStageStatus;
    plan: WorkflowStageStatus;
    analysis: WorkflowStageStatus;
  };
  mappingSummary: MappingStageSummary;
  questions: QuestionReadiness[];
  nextAction: WorkflowAction;
  guidance: {
    visible: boolean;
    reason: "next_action_elsewhere" | "already_on_action_surface";
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function variableEntries(question: ResearchQuestion): Array<{
  role: "outcome" | "predictor" | "covariate";
  variable: VariableConcept;
}> {
  return [
    ...question.outcomes.map((variable) => ({ role: "outcome" as const, variable })),
    ...question.predictors.map((variable) => ({ role: "predictor" as const, variable })),
    ...question.covariates.map((variable) => ({ role: "covariate" as const, variable }))
  ];
}

function variableReadiness(
  question: ResearchQuestion,
  mappings: Map<string, VariableMappingSnapshot>
): { variables: VariableReadiness[]; blockers: WorkflowBlocker[] } {
  const variables: VariableReadiness[] = [];
  const blockers: WorkflowBlocker[] = [];

  for (const { role, variable } of variableEntries(question)) {
    const mapping = mappings.get(normalize(variable.concept));
    const confirmed = Boolean(mapping?.confirmedBy);
    const represented = Boolean(mapping?.datasetVariable);

    variables.push({
      concept: variable.concept,
      role,
      ...(mapping?.datasetVariable ? { datasetVariable: mapping.datasetVariable } : {}),
      ...(mapping?.mappingStatus ? { mappingStatus: mapping.mappingStatus } : {}),
      confirmed,
      represented
    });

    if (!mapping) {
      blockers.push({
        code: "mapping_missing",
        message: `No reviewed dataset mapping exists for ${role} concept “${variable.concept}”.`,
        questionId: question.id,
        concept: variable.concept,
        role
      });
      continue;
    }

    if (!confirmed) {
      blockers.push({
        code: "mapping_unconfirmed",
        message: `The proposed mapping for ${role} concept “${variable.concept}” has not been confirmed.`,
        questionId: question.id,
        concept: variable.concept,
        role
      });
      continue;
    }

    if (!represented) {
      blockers.push({
        code: "confirmed_not_represented",
        message: `${role[0]!.toUpperCase() + role.slice(1)} concept “${variable.concept}” was reviewed and confirmed as not represented in the selected dataset.`,
        questionId: question.id,
        concept: variable.concept,
        role
      });
    }
  }

  return { variables, blockers };
}

function questionReadiness(
  question: ResearchQuestion,
  mappings: Map<string, VariableMappingSnapshot>,
  selection: CandidateSelection | undefined,
  transcriptCount: number
): QuestionReadiness {
  if (!question.objectiveType) {
    return {
      questionId: question.id,
      text: question.text,
      objectiveType: question.objectiveType,
      mode: "unknown",
      status: "needs_intent",
      variables: variableEntries(question).map(({ role, variable }) => ({
        concept: variable.concept,
        role,
        confirmed: false,
        represented: false
      })),
      blockers: [
        {
          code: "objective_type_missing",
          message: "The analytical objective type has not been confirmed.",
          questionId: question.id
        }
      ],
      candidates: selection?.candidates ?? [],
      warnings: selection?.warnings ?? []
    };
  }

  if (question.objectiveType === "qualitative") {
    const sourceBlocker: WorkflowBlocker[] =
      transcriptCount > 0
        ? []
        : [
            {
              code: "qualitative_source_missing",
              message:
                "This qualitative question needs transcript or other qualitative text sources before coding can begin.",
              questionId: question.id
            }
          ];

    return {
      questionId: question.id,
      text: question.text,
      objectiveType: question.objectiveType,
      mode: "qualitative",
      status: transcriptCount > 0 ? "qualitative_ready" : "qualitative_source_required",
      variables: [],
      blockers: sourceBlocker,
      candidates: selection?.candidates ?? [],
      warnings: selection?.warnings ?? []
    };
  }

  const mapped = variableReadiness(question, mappings);
  if (mapped.blockers.length > 0) {
    return {
      questionId: question.id,
      text: question.text,
      objectiveType: question.objectiveType,
      mode: "quantitative",
      status: "needs_mapping",
      variables: mapped.variables,
      blockers: mapped.blockers,
      candidates: selection?.candidates ?? [],
      warnings: selection?.warnings ?? []
    };
  }

  if (selection?.blockedReason || !(selection?.candidates.some((candidate) => candidate.executable) ?? false)) {
    return {
      questionId: question.id,
      text: question.text,
      objectiveType: question.objectiveType,
      mode: "quantitative",
      status: "method_blocked",
      variables: mapped.variables,
      blockers: [
        {
          code: "method_blocked",
          message:
            selection?.blockedReason ??
            "No executable method is available inside the current autonomous analysis boundary.",
          questionId: question.id
        }
      ],
      candidates: selection?.candidates ?? [],
      warnings: selection?.warnings ?? []
    };
  }

  return {
    questionId: question.id,
    text: question.text,
    objectiveType: question.objectiveType,
    mode: "quantitative",
    status: "ready",
    variables: mapped.variables,
    blockers: [],
    candidates: selection.candidates,
    warnings: selection.warnings
  };
}

function mappingSummary(
  specification: StudySpecification | null,
  mappings: VariableMappingSnapshot[]
): MappingStageSummary {
  if (!specification) {
    return {
      status: "missing",
      reviewedCount: 0,
      totalConcepts: 0,
      representedCount: 0,
      gapCount: 0,
      unreviewedCount: 0
    };
  }

  const concepts = new Map<string, string>();
  for (const question of specification.researchQuestions) {
    if (question.objectiveType === "qualitative") continue;
    for (const { variable } of variableEntries(question)) {
      concepts.set(normalize(variable.concept), variable.concept);
    }
  }

  const byConcept = new Map(
    mappings.map((mapping) => [normalize(mapping.researchConcept), mapping])
  );

  let reviewedCount = 0;
  let representedCount = 0;
  let gapCount = 0;
  let unreviewedCount = 0;

  for (const conceptKey of concepts.keys()) {
    const mapping = byConcept.get(conceptKey);
    if (!mapping?.confirmedBy) {
      unreviewedCount += 1;
      continue;
    }
    reviewedCount += 1;
    if (mapping.datasetVariable) representedCount += 1;
    else gapCount += 1;
  }

  let status: WorkflowStageStatus = "ready";
  if (concepts.size === 0) status = "ready";
  else if (unreviewedCount > 0) status = "needs_review";
  else if (gapCount > 0) status = "reviewed_with_gaps";

  return {
    status,
    reviewedCount,
    totalConcepts: concepts.size,
    representedCount,
    gapCount,
    unreviewedCount
  };
}

function action(
  code: WorkflowActionCode,
  label: string,
  detail: string,
  targetSection: WorkflowSection,
  requiresResearcher: boolean
): WorkflowAction {
  return { code, label, detail, targetSection, requiresResearcher };
}

function chooseNextAction(
  snapshot: ProjectWorkflowSnapshot,
  mapping: MappingStageSummary,
  questions: QuestionReadiness[]
): WorkflowAction {
  if (!snapshot.hasProtocol) {
    return action(
      "add_protocol",
      "Add a protocol",
      "Upload the study protocol so Methodome can reconstruct the research logic.",
      "protocol",
      true
    );
  }

  if (!snapshot.specification && !snapshot.hasProtocolExtraction) {
    return action(
      "extract_protocol",
      "Extract the study",
      "Methodome needs to extract research questions and design information from the protocol.",
      "protocol",
      false
    );
  }

  if (!snapshot.specification) {
    return action(
      "confirm_study_design",
      "Confirm the study design",
      "Review the extracted research questions, analytical objectives and study structure.",
      "study-design",
      true
    );
  }

  const hasQuantitativeQuestions = questions.some((question) => question.mode === "quantitative");
  if (hasQuantitativeQuestions && snapshot.datasetCount === 0) {
    return action(
      "upload_dataset",
      "Add analysis data",
      "A quantitative workstream needs a dataset before Methodome can resolve variables and methods.",
      "data",
      true
    );
  }

  if (mapping.status === "needs_review") {
    return action(
      "review_variable_mappings",
      "Review variable mappings",
      "Confirm the links between research concepts and observed dataset variables.",
      "variables",
      true
    );
  }

  if (mapping.status === "reviewed_with_gaps") {
    return action(
      "resolve_mapping_gaps",
      "Resolve analysis-data gaps",
      "Some research concepts were reviewed but confirmed as absent from the selected dataset. Choose another variable or dataset, revise the analytical target, or mark the affected question as not analysable.",
      "variables",
      true
    );
  }

  const qualitativeSourceNeeded = questions.some(
    (question) => question.status === "qualitative_source_required"
  );
  if (qualitativeSourceNeeded) {
    return action(
      "prepare_qualitative_analysis",
      "Add qualitative source material",
      "Upload transcripts or other qualitative text for the qualitative workstream.",
      "data",
      true
    );
  }

  if (!snapshot.plan) {
    return action(
      "build_analysis_plan",
      "Build the analysis plan",
      "Methodome has enough confirmed information to construct the executable quantitative plan and qualitative workstreams.",
      "analysis-plan",
      false
    );
  }

  if (!snapshot.plan.lockedAt) {
    return action(
      "lock_analysis_plan",
      "Review and lock the analysis plan",
      "Approve the plan before planned statistical execution.",
      "analysis-plan",
      true
    );
  }

  if (snapshot.completedAnalysisCount < snapshot.plan.analyses.length) {
    return action(
      "run_analyses",
      "Run approved analyses",
      "The locked quantitative plan is ready for deterministic execution.",
      "analysis",
      false
    );
  }

  if (
    questions.some(
      (question) =>
        question.status === "qualitative_ready" ||
        question.status === "qualitative_source_required"
    )
  ) {
    return action(
      "prepare_qualitative_analysis",
      "Continue qualitative analysis",
      "The quantitative plan is accounted for; continue the qualitative coding and synthesis workstream.",
      "analysis",
      false
    );
  }

  if (snapshot.completedAnalysisCount > 0) {
    return action(
      "review_results",
      "Review results",
      "Completed analyses are ready for interpretation, diagnostics review and reporting.",
      "results",
      true
    );
  }

  return action(
    "review_project",
    "Review project state",
    "Methodome cannot advance automatically from the current project state.",
    "overview",
    true
  );
}

export function assessProjectReadiness(
  snapshot: ProjectWorkflowSnapshot,
  currentSection?: WorkflowSection
): ProjectReadiness {
  const mapping = mappingSummary(snapshot.specification, snapshot.mappings);
  const selectionByQuestion = new Map(
    snapshot.selections.map((selection) => [selection.questionId, selection])
  );

  const questions =
    snapshot.specification?.researchQuestions.map((question) =>
      questionReadiness(
        question,
        new Map(
          snapshot.mappings.map((item) => [normalize(item.researchConcept), item])
        ),
        selectionByQuestion.get(question.id),
        snapshot.transcriptCount
      )
    ) ?? [];

  const nextAction = chooseNextAction(snapshot, mapping, questions);

  return {
    stages: {
      protocol: snapshot.hasProtocol ? "ready" : "missing",
      data: snapshot.datasetCount > 0 || snapshot.transcriptCount > 0 ? "ready" : "missing",
      studyDesign: snapshot.specification ? "ready" : "missing",
      mappings: mapping.status,
      plan: snapshot.plan ? (snapshot.plan.lockedAt ? "locked" : "ready") : "missing",
      analysis:
        snapshot.plan &&
        snapshot.plan.analyses.length > 0 &&
        snapshot.completedAnalysisCount >= snapshot.plan.analyses.length
          ? "complete"
          : snapshot.plan?.lockedAt
            ? "ready"
            : "missing"
    },
    mappingSummary: mapping,
    questions,
    nextAction,
    guidance: {
      visible: currentSection ? nextAction.targetSection !== currentSection : true,
      reason:
        currentSection && nextAction.targetSection === currentSection
          ? "already_on_action_surface"
          : "next_action_elsewhere"
    }
  };
}
