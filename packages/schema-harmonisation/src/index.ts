import {
  containsNumeral,
  normaliseExactToken,
  safeExactCategoryMatch,
  type SchemaMappingStatus,
  type VariableSchema,
  type VariableMappingCandidate
} from "@methodome/data-pipeline";

export interface SchemaComparison {
  leftDatasetVersionId: string;
  rightDatasetVersionId: string;
  mappings: VariableMappingCandidate[];
  leftOnly: VariableSchema[];
  rightOnly: VariableSchema[];
}

function normaliseWords(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function responseChoiceAgreement(left: VariableSchema, right: VariableSchema): number | null {
  if (!left.responseChoices?.length || !right.responseChoices?.length) return null;

  const leftLabels = left.responseChoices.map((choice) =>
    normaliseExactToken(String(choice.label))
  );
  const rightLabels = right.responseChoices.map((choice) =>
    normaliseExactToken(String(choice.label))
  );

  const leftSet = new Set(leftLabels);
  const rightSet = new Set(rightLabels);
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export function compareVariableSchemas(
  left: VariableSchema,
  right: VariableSchema
): VariableMappingCandidate {
  const evidence: string[] = [];

  if (left.variableName === right.variableName) {
    evidence.push("Variable names are identical.");

    if (left.dataType === right.dataType) {
      evidence.push("Data types match.");
      return {
        left,
        right,
        status: "direct_match",
        evidence,
        requiresConfirmation: false
      };
    }

    evidence.push("Variable names match but data types differ.");
    return {
      left,
      right,
      status: "uncertain",
      evidence,
      requiresConfirmation: true
    };
  }

  if (
    safeExactCategoryMatch(left.variableName, right.variableName) &&
    left.dataType === right.dataType
  ) {
    evidence.push("Variable names match after deterministic normalisation.");
    return {
      left,
      right,
      status: "probable_match",
      evidence,
      requiresConfirmation: true
    };
  }

  const leftLabel = left.label?.trim();
  const rightLabel = right.label?.trim();

  if (leftLabel && rightLabel) {
    if (leftLabel === rightLabel) {
      evidence.push("Question labels are identical.");
      if (left.dataType === right.dataType) evidence.push("Data types match.");
      return {
        left,
        right,
        status:
          left.dataType === right.dataType ? "probable_match" : "uncertain",
        evidence:
          left.dataType === right.dataType
            ? evidence
            : [...evidence, "Question labels match but data types differ."],
        requiresConfirmation: true
      };
    }

    if (safeExactCategoryMatch(leftLabel, rightLabel)) {
      evidence.push("Question labels match after deterministic normalisation.");
      return {
        left,
        right,
        status:
          left.dataType === right.dataType ? "probable_match" : "uncertain",
        evidence,
        requiresConfirmation: true
      };
    }

    const numeralSensitive =
      containsNumeral(leftLabel) || containsNumeral(rightLabel);

    if (!numeralSensitive) {
      const labelSimilarity = jaccard(
        normaliseWords(leftLabel),
        normaliseWords(rightLabel)
      );

      if (labelSimilarity >= 0.8 && left.dataType === right.dataType) {
        evidence.push(
          `Question wording has high token agreement (${labelSimilarity.toFixed(2)}).`
        );
        return {
          left,
          right,
          status: "probable_match",
          evidence,
          requiresConfirmation: true
        };
      }

      if (labelSimilarity >= 0.5) {
        evidence.push(
          `Question wording has partial token agreement (${labelSimilarity.toFixed(2)}).`
        );
      }
    } else {
      evidence.push(
        "Question labels contain numerals, so fuzzy label matching was disabled."
      );
    }
  }

  const responseAgreement = responseChoiceAgreement(left, right);
  if (responseAgreement != null && responseAgreement >= 0.8) {
    evidence.push(
      `Response labels have high agreement (${responseAgreement.toFixed(2)}).`
    );
  }

  const compatibleType = left.dataType === right.dataType;
  if (compatibleType) evidence.push("Data types match.");

  const status: SchemaMappingStatus =
    evidence.some((item) => item.startsWith("Response labels have high")) &&
    compatibleType
      ? "uncertain"
      : "no_match";

  return {
    left,
    right,
    status,
    evidence,
    requiresConfirmation: true
  };
}

function candidateScore(candidate: VariableMappingCandidate): number {
  if (candidate.status === "direct_match") return 100;
  if (candidate.status === "probable_match") return 70;
  if (candidate.status === "uncertain") return 40;
  return 0;
}

export function compareDatasetSchemas(
  leftDatasetVersionId: string,
  leftVariables: VariableSchema[],
  rightDatasetVersionId: string,
  rightVariables: VariableSchema[]
): SchemaComparison {
  const unusedRight = new Set(rightVariables.map((_, index) => index));
  const mappings: VariableMappingCandidate[] = [];
  const leftOnly: VariableSchema[] = [];

  for (const left of leftVariables) {
    const candidates = [...unusedRight].map((index) => ({
      index,
      candidate: compareVariableSchemas(left, rightVariables[index]!)
    }));

    candidates.sort(
      (a, b) => candidateScore(b.candidate) - candidateScore(a.candidate)
    );

    const best = candidates[0];

    if (!best || candidateScore(best.candidate) === 0) {
      leftOnly.push(left);
      continue;
    }

    mappings.push(best.candidate);
    unusedRight.delete(best.index);
  }

  const rightOnly = [...unusedRight].map((index) => rightVariables[index]!);

  return {
    leftDatasetVersionId,
    rightDatasetVersionId,
    mappings,
    leftOnly,
    rightOnly
  };
}
