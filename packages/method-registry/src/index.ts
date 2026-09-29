import type {
  ResearchQuestion,
  StudySpecification,
  VariableConcept
} from "@methodome/study-spec";
import {
  methodologyKnowledgeStatus,
  methodologyKnowledgeVersion,
  retrieveMethodologyGuidance
} from "@methodome/methodology-knowledge";

export type MethodMaturity = "validated" | "supported" | "experimental";

export interface MethodDefinition {
  id: string;
  displayName: string;
  family: string;
  maturity: MethodMaturity;
  executable: boolean;
  outcomeTypes: string[];
  supportsClustering: boolean;
  supportsRepeatedMeasures: boolean;
  supportsSurveyWeights: boolean;
  assumptions: string[];
  diagnostics: string[];
}

export interface CandidateMethod {
  methodId: string;
  displayName: string;
  maturity: MethodMaturity;
  executable: boolean;
  rationale: string;
  requiredChecks: string[];
  decisionRequired?: string;
  methodology?: {
    version: string;
    status: string;
    ruleIds: string[];
    evidenceIds: string[];
    sourceIds: string[];
  };
}

export interface CandidateSelection {
  questionId: string;
  candidates: CandidateMethod[];
  warnings: string[];
  blockedReason?: string;
  methodology?: {
    version: string;
    status: string;
    ruleIds: string[];
    evidenceIds: string[];
    sourceIds: string[];
  };
}

export const registryVersion = "0.2.0";

export const methodRegistry: Record<string, MethodDefinition> = {
  descriptive_statistics: {
    id: "descriptive_statistics",
    displayName: "Descriptive statistics",
    family: "descriptive",
    maturity: "validated",
    executable: true,
    outcomeTypes: [
      "binary",
      "categorical_nominal",
      "categorical_ordinal",
      "count",
      "continuous"
    ],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["variables are interpreted according to their measurement type"],
    diagnostics: ["numeric observations available"]
  },
  pearson_correlation: {
    id: "pearson_correlation",
    displayName: "Pearson correlation",
    family: "association",
    maturity: "validated",
    executable: true,
    outcomeTypes: ["continuous"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["approximately linear relationship", "suitable handling of influential observations"],
    diagnostics: ["scatter pattern", "influential observations"]
  },
  spearman_correlation: {
    id: "spearman_correlation",
    displayName: "Spearman correlation",
    family: "association",
    maturity: "validated",
    executable: true,
    outcomeTypes: ["continuous", "categorical_ordinal"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["monotonic relationship"],
    diagnostics: ["monotonicity", "ties"]
  },
  linear_regression: {
    id: "linear_regression",
    displayName: "Linear regression",
    family: "regression",
    maturity: "validated",
    executable: true,
    outcomeTypes: ["continuous"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["linearity", "independent errors", "appropriate residual behaviour"],
    diagnostics: ["residuals", "influence", "multicollinearity"]
  },
  binary_logistic_regression: {
    id: "binary_logistic_regression",
    displayName: "Binary logistic regression",
    family: "regression",
    maturity: "validated",
    executable: true,
    outcomeTypes: ["binary"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["independent observations", "sufficient events"],
    diagnostics: ["separation", "sparse cells", "multicollinearity", "influence"]
  },
  mixed_effects_logistic_regression: {
    id: "mixed_effects_logistic_regression",
    displayName: "Mixed effects logistic regression",
    family: "multilevel",
    maturity: "supported",
    executable: false,
    outcomeTypes: ["binary"],
    supportsClustering: true,
    supportsRepeatedMeasures: true,
    supportsSurveyWeights: false,
    assumptions: ["adequate clusters", "appropriate random effect structure"],
    diagnostics: ["cluster count", "convergence", "separation", "random effects"]
  },
  gee_logistic_regression: {
    id: "gee_logistic_regression",
    displayName: "GEE logistic regression",
    family: "multilevel",
    maturity: "supported",
    executable: false,
    outcomeTypes: ["binary"],
    supportsClustering: true,
    supportsRepeatedMeasures: true,
    supportsSurveyWeights: false,
    assumptions: ["adequate clusters", "working correlation specified"],
    diagnostics: ["cluster count", "convergence", "sparse outcomes"]
  },
  poisson_regression: {
    id: "poisson_regression",
    displayName: "Poisson regression",
    family: "count_regression",
    maturity: "validated",
    executable: false,
    outcomeTypes: ["count"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["count outcome", "mean variance relationship assessed"],
    diagnostics: ["overdispersion", "zero inflation", "influence"]
  },
  negative_binomial_regression: {
    id: "negative_binomial_regression",
    displayName: "Negative binomial regression",
    family: "count_regression",
    maturity: "validated",
    executable: false,
    outcomeTypes: ["count"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["count outcome", "overdispersion parameter estimable"],
    diagnostics: ["overdispersion", "zero inflation", "influence"]
  },
  independent_two_sample_t: {
    id: "independent_two_sample_t",
    displayName: "Independent two-sample t-test (Welch)",
    family: "group_comparison",
    maturity: "supported",
    executable: true,
    outcomeTypes: ["continuous"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: [
      "two independent groups",
      "mean difference is the target",
      "t-based inference is adequate"
    ],
    diagnostics: ["group sizes", "group distributions", "outliers", "variance structure"]
  },
  paired_t: {
    id: "paired_t",
    displayName: "Paired t-test",
    family: "paired_comparison",
    maturity: "supported",
    executable: true,
    outcomeTypes: ["continuous"],
    supportsClustering: false,
    supportsRepeatedMeasures: true,
    supportsSurveyWeights: false,
    assumptions: [
      "exactly two correctly matched measurements",
      "independent pairs",
      "mean within-pair difference is the target"
    ],
    diagnostics: ["complete pairs", "difference distribution", "outlying differences"]
  },
  one_way_anova: {
    id: "one_way_anova",
    displayName: "One-way ANOVA",
    family: "group_comparison",
    maturity: "supported",
    executable: true,
    outcomeTypes: ["continuous"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: [
      "independent groups",
      "group means are the target",
      "ordinary fixed-effect ANOVA error structure is adequate"
    ],
    diagnostics: ["group sizes", "group variance pattern", "residual structure", "outliers"]
  },
  wilcoxon_signed_rank: {
    id: "wilcoxon_signed_rank",
    displayName: "Wilcoxon signed-rank test",
    family: "paired_comparison",
    maturity: "supported",
    executable: true,
    outcomeTypes: ["continuous", "categorical_ordinal"],
    supportsClustering: false,
    supportsRepeatedMeasures: true,
    supportsSurveyWeights: false,
    assumptions: [
      "exactly two correctly matched measurements",
      "independent pairs",
      "rankable within-pair differences",
      "symmetric difference distribution for the usual signed-rank interpretation"
    ],
    diagnostics: ["complete pairs", "zero differences", "ties", "difference symmetry"]
  },
  mann_whitney: {
    id: "mann_whitney",
    displayName: "Mann-Whitney U test",
    family: "group_comparison",
    maturity: "supported",
    executable: true,
    outcomeTypes: ["continuous", "categorical_ordinal"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["two independent groups", "rankable outcome"],
    diagnostics: ["group sizes", "ties", "group shapes", "group spreads"]
  },
  kruskal_wallis: {
    id: "kruskal_wallis",
    displayName: "Kruskal-Wallis test",
    family: "group_comparison",
    maturity: "supported",
    executable: true,
    outcomeTypes: ["continuous", "categorical_ordinal"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["three or more independent groups", "rankable outcome"],
    diagnostics: ["group sizes", "ties", "group shapes", "group spreads"]
  },
  chi_square: {
    id: "chi_square",
    displayName: "Chi square test",
    family: "association",
    maturity: "validated",
    executable: true,
    outcomeTypes: ["binary", "categorical_nominal", "categorical_ordinal"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["independent observations", "adequate expected cell counts"],
    diagnostics: ["expected cell counts"]
  },
  fisher_exact: {
    id: "fisher_exact",
    displayName: "Fisher exact test",
    family: "association",
    maturity: "validated",
    executable: true,
    outcomeTypes: ["binary", "categorical_nominal"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["independent observations"],
    diagnostics: ["table dimensions", "cell counts"]
  }
};

function firstOutcome(question: ResearchQuestion): VariableConcept | undefined {
  return question.outcomes[0];
}

function samplingDesignText(study: StudySpecification): string {
  return (study.samplingDesign ?? "").trim().toLowerCase();
}

function requiresSurveyAwareAnalysis(study: StudySpecification): boolean {
  const sampling = samplingDesignText(study);
  return (
    study.surveyWeights ||
    study.stratified ||
    sampling.includes("stratified") ||
    sampling.includes("multistage") ||
    sampling.includes("multi-stage") ||
    sampling.includes("probability proportional") ||
    sampling.includes("pps") ||
    sampling.includes("cluster sampling")
  );
}

function contextualWarnings(
  study: StudySpecification,
  question: ResearchQuestion
): string[] {
  const warnings: string[] = [];
  const sampling = samplingDesignText(study);

  if (
    sampling.includes("convenience") ||
    sampling.includes("purposive") ||
    sampling.includes("volunteer") ||
    sampling.includes("self-select") ||
    sampling.includes("non-probability") ||
    sampling.includes("nonprobability")
  ) {
    warnings.push(
      "The sampling design is non-probability. Do not present design-based population representativeness or invent sampling weights."
    );
  }

  if (question.objectiveType === "prediction") {
    warnings.push(
      "A fitted regression model is not a complete prediction analysis. Predictive performance requires validation and appropriate calibration/discrimination assessment for the outcome."
    );
  }

  return warnings;
}

const methodRuleIds: Record<string, string[]> = {
  descriptive_statistics: ["descriptive-categorical-001", "descriptive-continuous-001"],
  pearson_correlation: ["pearson-001"],
  spearman_correlation: ["spearman-correlation-001"],
  linear_regression: ["linear-regression-001", "multicollinearity-001"],
  binary_logistic_regression: ["logistic-regression-001", "logistic-separation-001", "logistic-sparse-events-001"],
  poisson_regression: ["poisson-regression-001", "count-overdispersion-001"],
  negative_binomial_regression: ["count-overdispersion-001"],
  independent_two_sample_t: ["independent-two-sample-t-001"],
  paired_t: ["paired-t-001"],
  one_way_anova: ["multi-group-gate-001", "one-way-anova-001"],
  wilcoxon_signed_rank: ["wilcoxon-signed-rank-001"],
  mann_whitney: ["mann-whitney-001"],
  kruskal_wallis: ["kruskal-wallis-001"],
  chi_square: ["chi-square-001"],
  fisher_exact: ["fisher-exact-001"],
  mixed_effects_logistic_regression: ["cluster-001", "repeated-001"],
  gee_logistic_regression: ["cluster-001", "repeated-001"]
};

function provenance(ruleIds: string[]) {
  const guidance = retrieveMethodologyGuidance({ ruleIds, limit: Math.max(ruleIds.length, 1) });
  return {
    version: methodologyKnowledgeVersion,
    status: methodologyKnowledgeStatus,
    ruleIds: guidance.rules.map((rule) => rule.ruleId),
    evidenceIds: guidance.evidenceIds,
    sourceIds: guidance.sourceIds
  };
}

function candidate(id: string, rationale: string, decisionRequired?: string): CandidateMethod {
  const method = methodRegistry[id];
  if (!method) throw new Error(`Unknown method: ${id}`);

  return {
    methodId: method.id,
    displayName: method.displayName,
    maturity: method.maturity,
    executable: method.executable,
    rationale,
    requiredChecks: method.diagnostics,
    methodology: provenance(methodRuleIds[id] ?? []),
    ...(decisionRequired ? { decisionRequired } : {})
  };
}

function selectCandidateMethodsInternal(
  study: StudySpecification,
  questionId: string
): Omit<CandidateSelection, "methodology"> {
  const question = study.researchQuestions.find((item) => item.id === questionId);

  if (!question) {
    return {
      questionId,
      candidates: [],
      warnings: [],
      blockedReason: "Research question was not found."
    };
  }

  if (!question.objectiveType) {
    return {
      questionId,
      candidates: [],
      warnings: [],
      blockedReason:
        "Objective type must be confirmed before automatic method selection."
    };
  }

  if (question.objectiveType === "qualitative") {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Methodome recognised this as a qualitative research question. It is routed to the source-linked qualitative coding and synthesis workflow rather than the quantitative statistical method registry."
      ],
      blockedReason:
        "This question should not be forced into the quantitative statistical pipeline."
    };
  }

  if (question.objectiveType === "causal") {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Causal analyses require an explicit causal estimand and identification argument before Methodome can narrow the estimator set."
      ],
      blockedReason:
        "Automatic causal estimator selection is outside the current autonomous execution boundary."
    };
  }

  if (question.objectiveType === "diagnostic") {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Diagnostic-accuracy questions require an index test, reference standard, and threshold-aware performance workflow."
      ],
      blockedReason:
        "Do not reduce a diagnostic-accuracy question to an ordinary association or regression analysis."
    };
  }

  if (question.objectiveType === "prognostic") {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Prognostic analyses require a prediction/time-to-event workflow with validation and performance assessment that is not yet executable in the current release."
      ],
      blockedReason:
        "Automatic prognostic method selection is outside the current autonomous execution boundary."
    };
  }

  if (question.objectiveType === "exploratory") {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Exploratory intent is too broad for Methodome to choose a single inferential procedure safely."
      ],
      blockedReason:
        "Confirm a descriptive, association, prediction, causal, diagnostic, prognostic, or qualitative target before automatic method selection."
    };
  }

  const outcome = firstOutcome(question);
  if (!outcome?.variableType || outcome.variableType === "unknown") {
    return {
      questionId,
      candidates: [],
      warnings: [],
      blockedReason: "Outcome type must be confirmed before methods can be selected."
    };
  }

  const baseWarnings = contextualWarnings(study, question);

  if (requiresSurveyAwareAnalysis(study)) {
    return {
      questionId,
      candidates: [],
      warnings: [
        ...baseWarnings,
        "The sampling design requires survey-aware estimation that carries the relevant weight, strata, and PSU/cluster information into variance estimation."
      ],
      blockedReason:
        "A complex-survey analysis path is required before Methodome can select an iid method."
    };
  }

  if (question.objectiveType === "descriptive") {
    return {
      questionId,
      candidates: [
        candidate(
          "descriptive_statistics",
          "The research question is descriptive and the outcome mapping has been confirmed."
        )
      ],
      warnings: baseWarnings
    };
  }

  if (study.clustered && outcome.variableType !== "binary") {
    return {
      questionId,
      candidates: [],
      warnings: [
        ...baseWarnings,
        "The current deterministic registry has no cluster-aware executable method for this outcome type."
      ],
      blockedReason:
        "Clustered observations must not be analysed with an iid method."
    };
  }

  if (
    study.paired &&
    outcome.variableType === "continuous" &&
    question.objectiveType === "association" &&
    question.predictors.length === 1 &&
    question.predictors[0]?.variableType === "continuous" &&
    question.covariates.length === 0
  ) {
    return {
      questionId,
      candidates: [
        candidate(
          "paired_t",
          "The study declares an exactly paired design and the analysis concerns a quantitative within-pair difference.",
          "Use when the mean within-pair difference is the target and the difference-score distribution supports t-based inference."
        ),
        candidate(
          "wilcoxon_signed_rank",
          "The study declares an exactly paired design and a rank-based within-pair comparison is available.",
          "Use only when a signed-rank interpretation is appropriate, including plausible symmetry of the difference distribution."
        )
      ],
      warnings: baseWarnings
    };
  }

  if (study.repeatedMeasures && outcome.variableType !== "binary") {
    return {
      questionId,
      candidates: [],
      warnings: [
        ...baseWarnings,
        "Repeated measures with more than a simple two-measurement paired structure require a correlation-aware repeated-measures method."
      ],
      blockedReason:
        "Repeated observations must not be analysed with an iid method."
    };
  }

  if (outcome.variableType === "binary") {
    if (study.clustered || study.repeatedMeasures) {
      return {
        questionId,
        candidates: [
          candidate(
            "mixed_effects_logistic_regression",
            "The outcome is binary and observations are clustered or repeated.",
            "Choose this when a cluster specific effect is the scientific target."
          ),
          candidate(
            "gee_logistic_regression",
            "The outcome is binary and observations are clustered or repeated.",
            "Choose this when a population average effect is the scientific target."
          )
        ],
        warnings: [
          ...baseWarnings,
          ...(study.clusterVariable
            ? []
            : ["Clustering is declared but the cluster variable has not been confirmed."])
        ]
      };
    }

    const categoricalPredictor = question.predictors.some((p) =>
      ["binary", "categorical_nominal", "categorical_ordinal"].includes(
        p.variableType ?? "unknown"
      )
    );

    const candidates = [
      candidate(
        "binary_logistic_regression",
        "The outcome is binary and no clustering or repeated observations are declared."
      )
    ];

    if (
      question.predictors.length === 1 &&
      categoricalPredictor &&
      question.covariates.length === 0
    ) {
      candidates.push(
        candidate(
          "chi_square",
          "A single categorical predictor can be assessed as an unadjusted association.",
          "Use this for an unadjusted contingency table analysis, not as a replacement for adjusted regression."
        )
      );

      if (question.predictors[0]?.variableType === "binary") {
        candidates.push(
          candidate(
            "fisher_exact",
            "A binary predictor with a binary outcome forms a 2x2 table that can use Fisher's exact test when an exact analysis is needed.",
            "Use only for a suitable independent 2x2 table; sparse expected counts do not repair dependence or survey design."
          )
        );
      }
    }

    return { questionId, candidates, warnings: baseWarnings };
  }

  if (outcome.variableType === "count") {
    return {
      questionId,
      candidates: [
        candidate(
          "poisson_regression",
          "The outcome is a count, so Poisson regression is one future count-model candidate.",
          "Assess the mean-variance relationship, exposure/offset structure, excess zeros, influence, and study design before choosing a count model."
        ),
        candidate(
          "negative_binomial_regression",
          "Negative binomial regression is one possible future model for some overdispersed count processes.",
          "Do not choose negative binomial solely because overdispersion is present; compare the mean-variance structure and other defensible count-model alternatives."
        )
      ],
      warnings: [
        ...baseWarnings,
        "Automatic count-model selection and execution are deferred in methodology v1. Overdispersion alone does not select negative binomial regression."
      ]
    };
  }

  if (
    outcome.variableType === "categorical_ordinal" &&
    question.objectiveType === "association" &&
    question.predictors.length === 1 &&
    question.covariates.length === 0 &&
    ["continuous", "categorical_ordinal"].includes(
      question.predictors[0]?.variableType ?? "unknown"
    )
  ) {
    return {
      questionId,
      candidates: [
        candidate(
          "spearman_correlation",
          "The outcome is ordinal and the unadjusted research question concerns a rank-based monotonic association.",
          "Use only when the paired observations are independent across units and the relationship is meaningfully monotonic."
        )
      ],
      warnings: baseWarnings
    };
  }

  if (outcome.variableType === "continuous") {
    if (
      question.objectiveType === "association" &&
      question.predictors.length === 1 &&
      question.covariates.length === 0 &&
      ["binary", "categorical_nominal", "categorical_ordinal"].includes(
        question.predictors[0]?.variableType ?? "unknown"
      )
    ) {
      const group = question.predictors[0]!;
      const levelCount =
        group.variableType === "binary"
          ? 2
          : group.observedLevelCount;

      if (levelCount === 2) {
        return {
          questionId,
          candidates: [
            candidate(
              "independent_two_sample_t",
              "A quantitative outcome is being compared across exactly two independent groups.",
              "Use Welch's two-sample t-test when the mean difference is the target; do not use a universal sample-size or normality-test cutoff."
            ),
            candidate(
              "mann_whitney",
              "A quantitative outcome is being compared across exactly two independent groups using ranks.",
              "Use only when a rank/distribution comparison matches the estimand; do not describe this automatically as a median test."
            )
          ],
          warnings: baseWarnings
        };
      }

      if (typeof levelCount === "number" && levelCount >= 3) {
        return {
          questionId,
          candidates: [
            candidate(
              "one_way_anova",
              "A quantitative outcome is being compared across three or more independent groups.",
              "Use only when an ordinary fixed-effect mean-comparison model matches the design and residual structure."
            ),
            candidate(
              "kruskal_wallis",
              "A quantitative outcome is being compared across three or more independent groups using ranks.",
              "Use only when a rank/distribution comparison matches the estimand; do not treat this as an automatic median test."
            )
          ],
          warnings: baseWarnings
        };
      }

      return {
        questionId,
        candidates: [],
        warnings: [
          ...baseWarnings,
          "Confirm the observed number of grouping levels before Methodome chooses a two-group or multi-group comparison procedure."
        ],
        blockedReason:
          "The grouping-variable level count is required for automatic comparison-method routing."
      };
    }

    const continuousPredictors = question.predictors.filter(
      (p) => p.variableType === "continuous"
    );

    const candidates: CandidateMethod[] = [
      candidate(
        "linear_regression",
        "The outcome is continuous and the research question concerns association or prediction."
      )
    ];

    if (
      question.objectiveType === "association" &&
      continuousPredictors.length === 1 &&
      question.predictors.length === 1 &&
      question.covariates.length === 0
    ) {
      candidates.push(
        candidate(
          "pearson_correlation",
          "Both variables are continuous and the analysis is an unadjusted association.",
          "Use when the relationship and influential observations support Pearson correlation."
        ),
        candidate(
          "spearman_correlation",
          "The analysis is an unadjusted monotonic association.",
          "Use when rank based association is more suitable than Pearson correlation."
        )
      );
    }

    return { questionId, candidates, warnings: baseWarnings };
  }

  return {
    questionId,
    candidates: [],
    warnings: baseWarnings,
    blockedReason: `No current deterministic rule exists for outcome type ${outcome.variableType}.`
  };
}

function selectionRuleIds(
  study: StudySpecification,
  question: ResearchQuestion | undefined,
  selection: Omit<CandidateSelection, "methodology">
): string[] {
  const ids = new Set(selection.candidates.flatMap((item) => item.methodology?.ruleIds ?? []));
  if (question?.objectiveType === "causal") ids.add("causal-gate-001");
  if (question?.objectiveType === "diagnostic") ids.add("diagnostic-accuracy-001");
  if (question?.objectiveType === "prediction") ids.add("prediction-001");
  if (study.repeatedMeasures) ids.add("repeated-001");
  if (study.clustered) ids.add("cluster-001");
  if (requiresSurveyAwareAnalysis(study)) {
    ids.add("survey-weight-001");
    ids.add("survey-variance-001");
  }
  if (samplingDesignText(study).match(/convenience|purposive|volunteer|self-select|non-probability|nonprobability/)) {
    ids.add("nonprobability-sampling-001");
  }
  return [...ids];
}

export function selectCandidateMethods(
  study: StudySpecification,
  questionId: string
): CandidateSelection {
  const selection = selectCandidateMethodsInternal(study, questionId) as Omit<CandidateSelection, "methodology">;
  return {
    ...selection,
    methodology: provenance(
      selectionRuleIds(
        study,
        study.researchQuestions.find((item) => item.id === questionId),
        selection
      )
    )
  };
}
