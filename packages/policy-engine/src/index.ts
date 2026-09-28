export type DataClass = "public" | "restricted" | "identifiable";

export interface ProjectProcessingPolicy {
  dataClass: DataClass;
  containsIdentifiableData: boolean;
  ethicsApprovalReference?: string;
  allowedProcessors: string[];
  externalModelAllowed: boolean;
  qualitativeTextExternalAllowed: boolean;
  rowLevelQuantitativeExternalAllowed: boolean;
  retentionRule?: string;
  exportRestrictions: string[];
}

export type ModelPayloadKind =
  | "metadata"
  | "summary_statistics"
  | "structured_results"
  | "row_level_quantitative"
  | "qualitative_text"
  | "document_text";

export interface ModelRequestPolicyContext {
  processorId: string;
  providerKind: "internal" | "external";
  payloadKind: ModelPayloadKind;
  containsIdentifiers: boolean;
}

export interface PolicyDecision {
  decision: "allow" | "block";
  reasons: string[];
}

export function evaluateModelRequest(
  policy: ProjectProcessingPolicy,
  context: ModelRequestPolicyContext
): PolicyDecision {
  const reasons: string[] = [];

  if (context.providerKind === "external" && !policy.externalModelAllowed) {
    reasons.push("External model processing is disabled for this project.");
  }

  if (
    policy.allowedProcessors.length > 0 &&
    !policy.allowedProcessors.includes(context.processorId)
  ) {
    reasons.push("The selected processor is not approved for this project.");
  }

  if (context.containsIdentifiers && policy.dataClass === "identifiable") {
    reasons.push("Identifiable content cannot be sent to this model request.");
  }

  if (
    context.payloadKind === "qualitative_text" &&
    context.providerKind === "external" &&
    !policy.qualitativeTextExternalAllowed
  ) {
    reasons.push("External processing of qualitative text is disabled.");
  }

  if (
    context.payloadKind === "row_level_quantitative" &&
    context.providerKind === "external" &&
    !policy.rowLevelQuantitativeExternalAllowed
  ) {
    reasons.push("External processing of row level quantitative data is disabled.");
  }

  return reasons.length > 0
    ? { decision: "block", reasons }
    : { decision: "allow", reasons: [] };
}

export function assertModelRequestAllowed(
  policy: ProjectProcessingPolicy,
  context: ModelRequestPolicyContext
): void {
  const result = evaluateModelRequest(policy, context);
  if (result.decision === "block") {
    throw new Error(result.reasons.join(" "));
  }
}
