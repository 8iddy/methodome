import { describe, expect, it } from "vitest";
import {
  evaluateModelRequest,
  type ProjectProcessingPolicy
} from "@methodome/policy-engine";

const basePolicy: ProjectProcessingPolicy = {
  dataClass: "restricted",
  containsIdentifiableData: false,
  allowedProcessors: ["workers-ai"],
  externalModelAllowed: true,
  qualitativeTextExternalAllowed: false,
  rowLevelQuantitativeExternalAllowed: false,
  exportRestrictions: []
};

describe("model processing policy", () => {
  it("allows approved metadata processing", () => {
    const decision = evaluateModelRequest(basePolicy, {
      processorId: "workers-ai",
      providerKind: "external",
      payloadKind: "metadata",
      containsIdentifiers: false
    });

    expect(decision.decision).toBe("allow");
  });

  it("blocks an unapproved processor", () => {
    const decision = evaluateModelRequest(basePolicy, {
      processorId: "other-provider",
      providerKind: "external",
      payloadKind: "metadata",
      containsIdentifiers: false
    });

    expect(decision.decision).toBe("block");
    expect(decision.reasons.join(" ")).toContain("not approved");
  });

  it("blocks external qualitative text when the project forbids it", () => {
    const decision = evaluateModelRequest(basePolicy, {
      processorId: "workers-ai",
      providerKind: "external",
      payloadKind: "qualitative_text",
      containsIdentifiers: false
    });

    expect(decision.decision).toBe("block");
  });

  it("allows identifiable content to an internal approved processor", () => {
    const policy: ProjectProcessingPolicy = {
      ...basePolicy,
      dataClass: "identifiable",
      containsIdentifiableData: true,
      allowedProcessors: ["institution-model"]
    };

    const decision = evaluateModelRequest(policy, {
      processorId: "institution-model",
      providerKind: "internal",
      payloadKind: "document_text",
      containsIdentifiers: true
    });

    expect(decision.decision).toBe("allow");
  });

  it("blocks identifiable content to an external processor", () => {
    const policy: ProjectProcessingPolicy = {
      ...basePolicy,
      dataClass: "identifiable",
      containsIdentifiableData: true
    };

    const decision = evaluateModelRequest(policy, {
      processorId: "workers-ai",
      providerKind: "external",
      payloadKind: "document_text",
      containsIdentifiers: true
    });

    expect(decision.decision).toBe("block");
  });
});
