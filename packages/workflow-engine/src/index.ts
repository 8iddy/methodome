import type { AnalysisPlan } from "@methodome/analysis-contracts";
import type { CandidateSelection } from "@methodome/method-registry";
import type { ResearchQuestion, StudySpecification, VariableConcept } from "@methodome/study-spec";
import type { QualitativeAnalysisStatus } from "@methodome/qualitative-analysis";

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
  | "qualitative_source_required"
  | "qualitative_codebook_review"
  | "qualitative_coding"
  | "qualitative_coding_review"
  | "qualitative_theme_ready"
  | "qualitative_theme_review"
  | "qualitative_complete";

export type WorkflowActionCode =
  | "add_protocol"
  | "extract_protocol"
  | "confirm_study_design"
  | "upload_dataset"
  | "map_variables"
  | "review_variable_mappings"
  | "resolve_mapping_gaps"
  | "build_analysis_plan"
  | "lock_analysis_plan"
  | "run_analyses"
  | "review_results"
  | "prepare_qualitative_analysis"
  | "propose_qualitative_codebook"
  | "review_qualitative_codebook"
  | "propose_qualitative_codings"
  | "review_qualitative_codings"
  | "propose_qualitative_themes"
  | "review_qualitative_themes"
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
  qualitativeWorkstream?: QualitativeWorkstreamSnapshot;
}

export interface MappingStageSummary {
  status: WorkflowStageStatus;
  reviewedCount: number;
  totalConcepts: number;
  representedCount: number;
  gapCount: number;
  unreviewedCount: number;
}

export interface QualitativeWorkstreamSnapshot {
  id: string;
  researchQuestionId: string;
  status: QualitativeAnalysisStatus;
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
  qualitativeWorkstreams: QualitativeWorkstreamSnapshot[];
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
    const represented = Boolean(mapping?.datasetVariable);
    const confirmed = Boolean(mapping?.confirmedBy) ||
      Boolean(mapping?.mappingStatus === "direct_match" && represented);

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
  transcriptCount: number,
  qualitativeWorkstream: QualitativeWorkstreamSnapshot | undefined
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

    let status: QuestionReadinessStatus =
      transcriptCount > 0 ? "qualitative_ready" : "qualitative_source_required";

    if (qualitativeWorkstream) {
      switch (qualitativeWorkstream.status) {
        case "prepared":
          status = "qualitative_ready";
          break;
        case "codebook_review":
          status = "qualitative_codebook_review";
          break;
        case "codebook_confirmed":
        case "coding_in_progress":
          status = "qualitative_coding";
          break;
        case "coding_review":
          status = "qualitative_coding_review";
          break;
        case "coding_confirmed":
          status = "qualitative_theme_ready";
          break;
        case "theme_review":
          status = "qualitative_theme_review";
          break;
        case "complete":
          status = "qualitative_complete";
          break;
      }
    }

    return {
      questionId: question.id,
      text: question.text,
      objectiveType: question.objectiveType,
      mode: "qualitative",
      status,
      variables: [],
      blockers: sourceBlocker,
      candidates: selection?.candidates ?? [],
      warnings: selection?.warnings ?? [],
      ...(qualitativeWorkstream ? { qualitativeWorkstream } : {})
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

  const readySelection = selection!;

  return {
    questionId: question.id,
    text: question.text,
    objectiveType: question.objectiveType,
    mode: "quantitative",
    status: "ready",
    variables: mapped.variables,
    blockers: [],
    candidates: readySelection.candidates,
    warnings: readySelection.warnings
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
    const safelyResolved =
      Boolean(mapping?.confirmedBy) ||
      Boolean(mapping?.mappingStatus === "direct_match" && mapping.datasetVariable);
    if (!safelyResolved) {
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

function qualitativeNextAction(
  questions: QuestionReadiness[]
): WorkflowAction | null {
  const question =
    questions.find(
      (item) =>
        item.mode === "qualitative" &&
        item.status !== "qualitative_complete" &&
        item.status !== "qualitative_source_required"
    ) ?? null;

  if (!question) return null;

  if (question.status === "qualitative_ready") {
    if (!question.qualitativeWorkstream) {
      return action(
        "prepare_qualitative_analysis",
        "Prepare qualitative analysis",
        "Create a source-linked qualitative workstream from the uploaded transcripts.",
        "analysis",
        false
      );
    }
    return action(
      "propose_qualitative_codebook",
      "Propose an initial codebook",
      "Methodome can draft a source-grounded codebook for researcher review.",
      "analysis",
      false
    );
  }

  if (question.status === "qualitative_codebook_review") {
    return action(
      "review_qualitative_codebook",
      "Review the qualitative codebook",
      "A researcher must confirm or edit the proposed codebook before coding begins.",
      "analysis",
      true
    );
  }

  if (question.status === "qualitative_coding") {
    return action(
      "propose_qualitative_codings",
      "Continue source coding",
      "Methodome can apply the confirmed codebook to the next uncoded source segments.",
      "analysis",
      false
    );
  }

  if (question.status === "qualitative_coding_review") {
    return action(
      "review_qualitative_codings",
      "Review qualitative coding",
      "A researcher must confirm or reject proposed codes and review uncoded segments.",
      "analysis",
      true
    );
  }

  if (question.status === "qualitative_theme_ready") {
    return action(
      "propose_qualitative_themes",
      "Develop candidate themes",
      "Confirmed coding is ready for source-linked theme development and synthesis.",
      "analysis",
      false
    );
  }

  if (question.status === "qualitative_theme_review") {
    return action(
      "review_qualitative_themes",
      "Review themes and synthesis",
      "A researcher must confirm or revise candidate themes before qualitative analysis is complete.",
      "analysis",
      true
    );
  }

  return null;
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

  if (mapping.totalConcepts > 0 && snapshot.mappings.length === 0) {
    return action(
      "map_variables",
      "Resolve analytical variables",
      "Methodome can compare the study concepts with dataset metadata, instruments and codebooks and resolve the mappings it can support from evidence.",
      "variables",
      false
    );
  }

  if (mapping.status === "needs_review") {
    return action(
      "review_variable_mappings",
      "Resolve ambiguous variables",
      `Methodome resolved ${mapping.reviewedCount} of ${mapping.totalConcepts} analytical concepts. Only the remaining ambiguous or unresolved mappings need your decision.`,
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
    const readyQuantitative = questions.some(
      (question) =>
        question.mode === "quantitative" && question.status === "ready"
    );

    if (readyQuantitative) {
      return action(
        "build_analysis_plan",
        "Build the analysis plan",
        "Methodome has enough confirmed information to construct the executable quantitative plan.",
        "analysis-plan",
        false
      );
    }

    const qualitativeAction = qualitativeNextAction(questions);
    if (qualitativeAction) return qualitativeAction;

    const hasQualitative = questions.some(
      (question) => question.mode === "qualitative"
    );
    const qualitativeComplete =
      hasQualitative &&
      questions
        .filter((question) => question.mode === "qualitative")
        .every((question) => question.status === "qualitative_complete");
    if (qualitativeComplete) {
      return action(
        "review_results",
        "Review results",
        "The qualitative analysis is complete and ready for interpretation and reporting.",
        "results",
        true
      );
    }

    return action(
      "review_project",
      "Resolve analysis blockers",
      "No research question is currently inside an executable analysis boundary. Review the question-level blockers before continuing.",
      "overview",
      true
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

  const qualitativeAction = qualitativeNextAction(questions);
  if (qualitativeAction) return qualitativeAction;

  const hasQualitative = questions.some(
    (question) => question.mode === "qualitative"
  );
  const qualitativeComplete =
    !hasQualitative ||
    questions
      .filter((question) => question.mode === "qualitative")
      .every((question) => question.status === "qualitative_complete");

  if (snapshot.completedAnalysisCount > 0 && qualitativeComplete) {
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
        snapshot.transcriptCount,
        snapshot.qualitativeWorkstreams.find(
          (workstream) => workstream.researchQuestionId === question.id
        )
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
      analysis: (() => {
        const quantitativeQuestions = questions.filter(
          (question) => question.mode === "quantitative"
        );
        const qualitativeQuestions = questions.filter(
          (question) => question.mode === "qualitative"
        );
        const quantitativeComplete =
          quantitativeQuestions.length === 0 ||
          Boolean(
            snapshot.plan &&
              snapshot.plan.analyses.length > 0 &&
              snapshot.completedAnalysisCount >= snapshot.plan.analyses.length
          );
        const qualitativeComplete =
          qualitativeQuestions.length === 0 ||
          qualitativeQuestions.every(
            (question) => question.status === "qualitative_complete"
          );

        if (quantitativeComplete && qualitativeComplete) return "complete";
        if (
          snapshot.plan?.lockedAt ||
          snapshot.qualitativeWorkstreams.length > 0
        ) {
          return "ready";
        }
        return "missing";
      })()
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


export type OrchestratorStatus =
  | "working"
  | "waiting_for_researcher"
  | "ready_to_execute"
  | "complete"
  | "blocked";

export type OrchestratorAutomaticAction =
  | "extract_protocol"
  | "map_variables"
  | "create_draft_plan"
  | "run_analyses"
  | "prepare_qualitative_analysis"
  | "propose_qualitative_codebook"
  | "propose_qualitative_codings"
  | "propose_qualitative_themes";

export interface OrchestratorDecision {
  id: string;
  kind:
    | "provide_input"
    | "confirm_study_design"
    | "review_mapping"
    | "resolve_mapping_gap"
    | "select_method"
    | "approve_plan"
    | "review_qualitative_codebook"
    | "review_qualitative_codings"
    | "review_qualitative_themes"
    | "review_results";
  prompt: string;
  questionId?: string;
  analysisId?: string;
  options?: Array<{
    id: string;
    label: string;
    detail?: string;
  }>;
  blocking: boolean;
}

export interface OrchestratorTask {
  id: string;
  label: string;
  status: "pending" | "ready" | "waiting" | "complete" | "blocked";
  detail: string;
}

export interface OrchestratorView {
  status: OrchestratorStatus;
  summary: string;
  tasks: OrchestratorTask[];
  decisions: OrchestratorDecision[];
  automaticAction?: OrchestratorAutomaticAction;
  nextAction: WorkflowAction;
}

function taskStatus(
  value: WorkflowStageStatus
): OrchestratorTask["status"] {
  if (value === "complete" || value === "locked") return "complete";
  if (value === "ready") return "ready";
  if (value === "needs_review" || value === "reviewed_with_gaps") return "waiting";
  if (value === "blocked") return "blocked";
  return "pending";
}

function mappingDecisions(readiness: ProjectReadiness): OrchestratorDecision[] {
  const output: OrchestratorDecision[] = [];
  const seen = new Set<string>();

  for (const question of readiness.questions) {
    for (const blocker of question.blockers) {
      if (
        ![
          "mapping_missing",
          "mapping_unconfirmed",
          "confirmed_not_represented",
          "objective_type_missing",
          "method_blocked",
          "qualitative_source_missing"
        ].includes(blocker.code)
      ) {
        continue;
      }

      const key = [
        blocker.code,
        blocker.questionId,
        blocker.concept ?? ""
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);

      if (blocker.code === "objective_type_missing") {
        output.push({
          id: `decision:intent:${blocker.questionId}`,
          kind: "confirm_study_design",
          prompt: blocker.message,
          questionId: blocker.questionId,
          blocking: true
        });
        continue;
      }

      if (
        blocker.code === "mapping_missing" ||
        blocker.code === "mapping_unconfirmed"
      ) {
        const variable = question.variables.find(
          (item) =>
            item.concept === blocker.concept &&
            (!blocker.role || item.role === blocker.role)
        );
        output.push({
          id: `decision:mapping:${blocker.questionId}:${normalize(
            blocker.concept ?? "concept"
          )}`,
          kind: "review_mapping",
          prompt: variable?.datasetVariable
            ? `Methodome matched “${blocker.concept}” to dataset field “${variable.datasetVariable}”, but the evidence is not strong enough to accept silently. Confirm or change this one mapping.`
            : `Methodome could not resolve “${blocker.concept}” from the available dataset metadata and research instruments. Choose the field only if you can identify it, or leave the concept unresolved.`,
          questionId: blocker.questionId,
          blocking: true
        });
        continue;
      }

      if (blocker.code === "confirmed_not_represented") {
        output.push({
          id: `decision:mapping-gap:${blocker.questionId}:${normalize(
            blocker.concept ?? "concept"
          )}`,
          kind: "resolve_mapping_gap",
          prompt: blocker.message,
          questionId: blocker.questionId,
          blocking: true
        });
        continue;
      }

      if (blocker.code === "qualitative_source_missing") {
        output.push({
          id: `decision:qualitative-source:${blocker.questionId}`,
          kind: "provide_input",
          prompt: blocker.message,
          questionId: blocker.questionId,
          blocking: true
        });
        continue;
      }

      output.push({
        id: `decision:method-blocked:${blocker.questionId}`,
        kind: "provide_input",
        prompt: blocker.message,
        questionId: blocker.questionId,
        blocking: true
      });
    }
  }

  return output;
}

export function buildOrchestratorView(
  readiness: ProjectReadiness,
  plan: AnalysisPlan | null
): OrchestratorView {
  const tasks: OrchestratorTask[] = [
    {
      id: "protocol",
      label: "Understand the protocol",
      status: taskStatus(readiness.stages.protocol),
      detail: "Extract and preserve the study questions, objectives and design."
    },
    {
      id: "data",
      label: "Prepare research data",
      status: taskStatus(readiness.stages.data),
      detail: "Profile quantitative datasets and register qualitative source material."
    },
    {
      id: "study-design",
      label: "Confirm research design",
      status: taskStatus(readiness.stages.studyDesign),
      detail: "Confirm the design features that constrain valid analysis."
    },
    {
      id: "mappings",
      label: "Resolve analytical variables",
      status: taskStatus(readiness.stages.mappings),
      detail: "Connect research concepts to observed variables without silently dropping gaps."
    },
    {
      id: "plan",
      label: "Construct analysis workstreams",
      status: taskStatus(readiness.stages.plan),
      detail: "Build the quantitative analysis plan and qualitative workstreams."
    },
    {
      id: "analysis",
      label: "Execute approved analyses",
      status: taskStatus(readiness.stages.analysis),
      detail: "Run deterministic statistics and auditable qualitative analysis."
    }
  ];

  const decisions = mappingDecisions(readiness);

  if (plan && !plan.lockedAt) {
    for (const analysis of plan.analyses) {
      if (analysis.selectedMethodId) continue;
      const question = readiness.questions.find(
        (item) => item.questionId === analysis.researchQuestionId
      );
      decisions.push({
        id: `decision:method:${analysis.id}`,
        kind: "select_method",
        prompt: question
          ? `Methodome found more than one defensible way to answer “${question.text}”. The options below differ in what they estimate. Choose the interpretation that matches the study intent.`
          : "Methodome found more than one defensible method. Choose the interpretation that matches the study intent.",
        questionId: analysis.researchQuestionId,
        analysisId: analysis.id,
        options: analysis.candidateMethodIds.map((methodId) => {
          const candidate = question?.candidates.find(
            (item) => item.methodId === methodId
          );
          return {
            id: methodId,
            label: candidate?.displayName ?? methodId.replaceAll("_", " "),
            ...(candidate?.rationale ? { detail: candidate.rationale } : {})
          };
        }),
        blocking: true
      });
    }

    if (plan.analyses.length > 0 && plan.analyses.every((analysis) => analysis.selectedMethodId)) {
      decisions.push({
        id: `decision:approve-plan:${plan.id}`,
        kind: "approve_plan",
        prompt:
          "The executable plan is fully specified. Review it and approve locking before planned analysis runs.",
        blocking: true
      });
    }
  }

  const activeQualitativeQuestion = readiness.questions.find(
    (question) =>
      question.mode === "qualitative" &&
      question.qualitativeWorkstream &&
      [
        "qualitative_codebook_review",
        "qualitative_coding_review",
        "qualitative_theme_review"
      ].includes(question.status)
  );

  if (
    readiness.nextAction.code === "review_qualitative_codebook" &&
    activeQualitativeQuestion?.qualitativeWorkstream
  ) {
    decisions.push({
      id: `decision:qualitative-codebook:${activeQualitativeQuestion.qualitativeWorkstream.id}`,
      kind: "review_qualitative_codebook",
      prompt:
        "Review, edit if needed, and confirm the proposed qualitative codebook before coding begins.",
      questionId: activeQualitativeQuestion.questionId,
      analysisId: activeQualitativeQuestion.qualitativeWorkstream.id,
      blocking: true
    });
  }

  if (
    readiness.nextAction.code === "review_qualitative_codings" &&
    activeQualitativeQuestion?.qualitativeWorkstream
  ) {
    decisions.push({
      id: `decision:qualitative-codings:${activeQualitativeQuestion.qualitativeWorkstream.id}`,
      kind: "review_qualitative_codings",
      prompt:
        "Confirm or reject proposed coding and explicitly review segments with no proposed code.",
      questionId: activeQualitativeQuestion.questionId,
      analysisId: activeQualitativeQuestion.qualitativeWorkstream.id,
      blocking: true
    });
  }

  if (
    readiness.nextAction.code === "review_qualitative_themes" &&
    activeQualitativeQuestion?.qualitativeWorkstream
  ) {
    decisions.push({
      id: `decision:qualitative-themes:${activeQualitativeQuestion.qualitativeWorkstream.id}`,
      kind: "review_qualitative_themes",
      prompt:
        "Review the candidate themes, source evidence and synthesis before confirming qualitative results.",
      questionId: activeQualitativeQuestion.questionId,
      analysisId: activeQualitativeQuestion.qualitativeWorkstream.id,
      blocking: true
    });
  }

  if (readiness.nextAction.code === "review_results") {
    decisions.push({
      id: "decision:review-results",
      kind: "review_results",
      prompt:
        "Analysis outputs are ready. Review estimates, diagnostics, warnings and provenance before reporting.",
      blocking: false
    });
  }

  const blockingDecisions = decisions.filter((decision) => decision.blocking);
  let status: OrchestratorStatus = "working";
  let automaticAction: OrchestratorAutomaticAction | undefined;

  if (readiness.nextAction.code === "review_results") {
    status = "complete";
  } else if (blockingDecisions.length > 0 || readiness.nextAction.requiresResearcher) {
    status = "waiting_for_researcher";
  } else {
    const automatic = new Map<WorkflowActionCode, OrchestratorAutomaticAction>([
      ["extract_protocol", "extract_protocol"],
      ["map_variables", "map_variables"],
      ["build_analysis_plan", "create_draft_plan"],
      ["run_analyses", "run_analyses"],
      ["prepare_qualitative_analysis", "prepare_qualitative_analysis"],
      ["propose_qualitative_codebook", "propose_qualitative_codebook"],
      ["propose_qualitative_codings", "propose_qualitative_codings"],
      ["propose_qualitative_themes", "propose_qualitative_themes"]
    ]);
    automaticAction = automatic.get(readiness.nextAction.code);
    status = automaticAction ? "ready_to_execute" : "blocked";
  }

  const summary =
    status === "waiting_for_researcher"
      ? `Methodome is waiting on ${blockingDecisions.length || 1} researcher decision${blockingDecisions.length === 1 ? "" : "s"} before it can continue.`
      : status === "ready_to_execute"
        ? `Methodome can continue automatically with: ${readiness.nextAction.label}.`
        : status === "complete"
          ? "The currently supported analysis work is complete and ready for review."
          : status === "blocked"
            ? "Methodome cannot advance automatically from the current state."
            : "Methodome is working through the project.";

  return {
    status,
    summary,
    tasks,
    decisions,
    ...(automaticAction ? { automaticAction } : {}),
    nextAction: readiness.nextAction
  };
}
