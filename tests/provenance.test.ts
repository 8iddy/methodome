import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  hashAuditEvent,
  type AuditEventPayload
} from "@methodome/provenance";

describe("audit provenance", () => {
  it("canonicalises object keys", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it("produces a deterministic chained hash", async () => {
    const event: AuditEventPayload = {
      id: "evt_1",
      projectId: "proj_1",
      userId: "user_1",
      action: "analysis_plan_locked",
      objectType: "analysis_plan",
      objectId: "sap_1",
      timestamp: "2026-09-28T10:00:00.000Z"
    };

    const first = await hashAuditEvent(event, null);
    const second = await hashAuditEvent(event, null);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).toHaveLength(64);

    const chained = await hashAuditEvent(
      { ...event, id: "evt_2", action: "analysis_started" },
      first.hash
    );

    expect(chained.previousHash).toBe(first.hash);
    expect(chained.hash).not.toBe(first.hash);
  });
});
