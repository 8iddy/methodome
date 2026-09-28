import type { DatasetVersionId, ProjectId, UserId } from "@methodome/domain";

export type TransformationOperation =
  | "clean"
  | "recode"
  | "append"
  | "merge"
  | "reshape"
  | "derive_variable"
  | "filter";

export interface TransformationEvent {
  id: string;
  projectId: ProjectId;
  inputDatasetVersionIds: DatasetVersionId[];
  outputDatasetVersionId: DatasetVersionId;
  operation: TransformationOperation;
  specification: Record<string, unknown>;
  reason?: string;
  createdBy: UserId;
  createdAt: string;
}

export type SchemaMappingStatus =
  | "direct_match"
  | "probable_match"
  | "uncertain"
  | "no_match";

export interface VariableSchema {
  sourceDatasetVersionId: DatasetVersionId;
  variableName: string;
  label?: string;
  dataType: string;
  responseChoices?: Array<{ value: string | number; label: string }>;
}

export interface VariableMappingCandidate {
  left: VariableSchema;
  right?: VariableSchema;
  status: SchemaMappingStatus;
  evidence: string[];
  requiresConfirmation: boolean;
}

export interface AppendPlan {
  sourceDatasetVersionIds: DatasetVersionId[];
  variableMappings: VariableMappingCandidate[];
  unresolvedVariables: string[];
}

export interface MergePlan {
  leftDatasetVersionId: DatasetVersionId;
  rightDatasetVersionId: DatasetVersionId;
  leftKey: string[];
  rightKey: string[];
  variableMappings: VariableMappingCandidate[];
  duplicateKeyPolicy: "block" | "require_review";
}

export function containsNumeral(value: string): boolean {
  return /\d|\b(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/i.test(value);
}

export function mayUseFuzzyCategoryMatching(a: string, b: string): boolean {
  return !containsNumeral(a) && !containsNumeral(b);
}

export * from "./normalisation";
