import type {
  ResearchQuestion,
  StudySpecification,
  VariableConcept
} from "@methodome/study-spec";

export type MethodMaturity = "validated" | "supported" | "experimental";

export interface MethodDefinition {
  id: string;
  displayName: string;
  family: string;
  maturity: MethodMaturity;
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
  rationale: string;
  requiredChecks: string[];
  decisionRequired?: string;
}

export interface CandidateSelection {
  questionId: string;
  candidates: CandidateMethod[];
  warnings: string[];
  blockedReason?: string;
}

export const registryVersion = "0.1.0";

export const methodRegistry: Record<string, MethodDefinition> = {
  pearson_correlation: {
    id: "pearson_correlation",
    displayName: "Pearson correlation",
    family: "association",
    maturity: "validated",
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
    outcomeTypes: ["count"],
    supportsClustering: false,
    supportsRepeatedMeasures: false,
    supportsSurveyWeights: false,
    assumptions: ["count outcome", "overdispersion parameter estimable"],
    diagnostics: ["overdispersion", "zero inflation", "influence"]
  },
  chi_square: {
    id: "chi_square",
    displayName: "Chi square test",
    family: "association",
    maturity: "validated",
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

function candidate(id: string, rationale: string, decisionRequired?: string): CandidateMethod {
  const method = methodRegistry[id];
  if (!method) throw new Error(`Unknown method: ${id}`);

  return {
    methodId: method.id,
    displayName: method.displayName,
    maturity: method.maturity,
    rationale,
    requiredChecks: method.diagnostics,
    ...(decisionRequired ? { decisionRequired } : {})
  };
}

export function selectCandidateMethods(
  study: StudySpecification,
  questionId: string
): CandidateSelection {
  const question = study.researchQuestions.find((item) => item.id === questionId);

  if (!question) {
    return {
      questionId,
      candidates: [],
      warnings: [],
      blockedReason: "Research question was not found."
    };
  }

  if (question.objectiveType === "causal") {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Causal analyses require additional design and estimand information before Methodome can narrow the method set."
      ],
      blockedReason: "Automatic causal method selection is outside the initial validated boundary."
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

  if (study.surveyWeights) {
    return {
      questionId,
      candidates: [],
      warnings: [
        "Survey weighted analysis is not yet in the initial deterministic candidate rules."
      ],
      blockedReason: "A survey aware method path is required."
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
        warnings: study.clusterVariable
          ? []
          : ["Clustering is declared but the cluster variable has not been confirmed."]
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

    if (question.predictors.length === 1 && categoricalPredictor && question.covariates.length === 0) {
      candidates.push(
        candidate(
          "chi_square",
          "A single categorical predictor can be assessed as an unadjusted association.",
          "Use this for an unadjusted contingency table analysis, not as a replacement for adjusted regression."
        ),
        candidate(
          "fisher_exact",
          "A single categorical predictor can be assessed with an exact test when expected cell counts are small.",
          "Use only when the contingency table structure is suitable."
        )
      );
    }

    return { questionId, candidates, warnings: [] };
  }

  if (outcome.variableType === "count") {
    return {
      questionId,
      candidates: [
        candidate(
          "poisson_regression",
          "The outcome is a count. Poisson regression is a candidate if dispersion is acceptable.",
          "Run the dispersion check before choosing this model."
        ),
        candidate(
          "negative_binomial_regression",
          "The outcome is a count. Negative binomial regression is a candidate when overdispersion is present.",
          "Use the dispersion diagnostic to distinguish this from Poisson regression."
        )
      ],
      warnings: []
    };
  }

  if (outcome.variableType === "continuous") {
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

    return { questionId, candidates, warnings: [] };
  }

  return {
    questionId,
    candidates: [],
    warnings: [],
    blockedReason: `No initial deterministic rule exists for outcome type ${outcome.variableType}.`
  };
}
