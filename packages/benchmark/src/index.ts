import type { CandidateSelection } from "@methodome/method-registry";
import type { StudySpecification } from "@methodome/study-spec";

export interface BenchmarkAcceptedSpecification {
  id: string;
  specification: StudySpecification;
}

export interface AcceptedMethodPath {
  questionId: string;
  acceptedMethodIds: string[];
  rationale?: string;
}

export interface BenchmarkCase {
  id: string;
  title: string;
  domain: string;
  acceptedSpecifications: BenchmarkAcceptedSpecification[];
  acceptedMethodPaths: AcceptedMethodPath[];
}

export interface FieldScore {
  field: string;
  correct: boolean;
  expected: unknown;
  actual: unknown;
}

export interface SpecificationScore {
  acceptedSpecificationId: string;
  fields: FieldScore[];
  correct: number;
  total: number;
  proportion: number;
}

export interface BenchmarkScore {
  caseId: string;
  specification: SpecificationScore;
  methodScores: Array<{
    questionId: string;
    accepted: boolean;
    expectedAnyOf: string[];
    actual: string[];
  }>;
  methodProportion: number;
}

function normaliseText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function comparePrimitive(field: string, expected: unknown, actual: unknown): FieldScore {
  const correct =
    typeof expected === "string" && typeof actual === "string"
      ? normaliseText(expected) === normaliseText(actual)
      : expected === actual;

  return { field, correct, expected, actual };
}

function scoreAgainstAccepted(
  actual: StudySpecification,
  accepted: BenchmarkAcceptedSpecification
): SpecificationScore {
  const expected = accepted.specification;
  const fields: FieldScore[] = [
    comparePrimitive("studyDesign", expected.studyDesign, actual.studyDesign),
    comparePrimitive("unitOfAnalysis", expected.unitOfAnalysis, actual.unitOfAnalysis),
    comparePrimitive("repeatedMeasures", expected.repeatedMeasures, actual.repeatedMeasures),
    comparePrimitive("clustered", expected.clustered, actual.clustered),
    comparePrimitive("clusterVariable", expected.clusterVariable, actual.clusterVariable),
    comparePrimitive("surveyWeights", expected.surveyWeights, actual.surveyWeights),
    comparePrimitive("weightVariable", expected.weightVariable, actual.weightVariable),
    comparePrimitive("stratified", expected.stratified, actual.stratified),
    comparePrimitive("strataVariable", expected.strataVariable, actual.strataVariable)
  ];

  for (const expectedQuestion of expected.researchQuestions) {
    const actualQuestion = actual.researchQuestions.find(
      (question) => question.id === expectedQuestion.id
    );

    fields.push(
      comparePrimitive(
        `${expectedQuestion.id}.objectiveType`,
        expectedQuestion.objectiveType,
        actualQuestion?.objectiveType
      )
    );

    const expectedOutcome = expectedQuestion.outcomes[0];
    const actualOutcome = actualQuestion?.outcomes[0];

    fields.push(
      comparePrimitive(
        `${expectedQuestion.id}.outcome.variableType`,
        expectedOutcome?.variableType,
        actualOutcome?.variableType
      )
    );

    const expectedPredictorTypes = expectedQuestion.predictors
      .map((item) => item.variableType ?? "unknown")
      .sort();
    const actualPredictorTypes = (actualQuestion?.predictors ?? [])
      .map((item) => item.variableType ?? "unknown")
      .sort();

    fields.push({
      field: `${expectedQuestion.id}.predictorTypes`,
      correct: JSON.stringify(expectedPredictorTypes) === JSON.stringify(actualPredictorTypes),
      expected: expectedPredictorTypes,
      actual: actualPredictorTypes
    });
  }

  const correct = fields.filter((field) => field.correct).length;

  return {
    acceptedSpecificationId: accepted.id,
    fields,
    correct,
    total: fields.length,
    proportion: fields.length === 0 ? 0 : correct / fields.length
  };
}

export function scoreBenchmarkCase(
  benchmarkCase: BenchmarkCase,
  actualSpecification: StudySpecification,
  methodSelections: CandidateSelection[]
): BenchmarkScore {
  if (benchmarkCase.acceptedSpecifications.length === 0) {
    throw new Error("Benchmark case has no accepted specifications.");
  }

  const scoredSpecifications = benchmarkCase.acceptedSpecifications.map((accepted) =>
    scoreAgainstAccepted(actualSpecification, accepted)
  );

  scoredSpecifications.sort((a, b) => b.proportion - a.proportion);
  const bestSpecification = scoredSpecifications[0]!;

  const methodScores = benchmarkCase.acceptedMethodPaths.map((expected) => {
    const actual = methodSelections.find(
      (selection) => selection.questionId === expected.questionId
    );
    const actualIds = actual?.candidates.map((candidate) => candidate.methodId) ?? [];

    const accepted = expected.acceptedMethodIds.some((methodId) =>
      actualIds.includes(methodId)
    );

    return {
      questionId: expected.questionId,
      accepted,
      expectedAnyOf: expected.acceptedMethodIds,
      actual: actualIds
    };
  });

  const acceptedMethods = methodScores.filter((score) => score.accepted).length;
  const methodProportion =
    methodScores.length === 0 ? 1 : acceptedMethods / methodScores.length;

  return {
    caseId: benchmarkCase.id,
    specification: bestSpecification,
    methodScores,
    methodProportion
  };
}
