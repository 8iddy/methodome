import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { methodRegistry } from "@methodome/method-registry";

const root = process.cwd();

function readJson(path: string): any {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

describe("methodology knowledge corpus", () => {
  const registry = readJson("knowledge/sources/registry.json");
  const release = readJson("knowledge/coverage/release-v1.json");
  const sourceIds = new Set(
    registry.entries.map((entry: { source_id: string }) => entry.source_id)
  );

  it("matches the frozen v1 source inventory with unique ids", () => {
    expect(registry.file_count).toBe(release.source_freeze.raw_files);
    expect(registry.entries).toHaveLength(release.source_freeze.raw_files);
    expect(sourceIds.size).toBe(release.source_freeze.raw_files);

    const driveIds = new Set(
      registry.entries.map((entry: { drive_id: string }) => entry.drive_id)
    );
    expect(driveIds.size).toBe(release.source_freeze.raw_files);

    for (const entry of registry.entries) {
      expect(entry.source_id).toBeTruthy();
      expect(entry.drive_id).toBeTruthy();
      expect(entry.file_name).toBeTruthy();
      expect(entry.source_family).toBeTruthy();
      expect(["A", "B", "C"]).toContain(entry.authority_tier);
      expect(["primary", "supporting", "reporting"]).toContain(entry.role);
    }
  });

  it("keeps source families separate from individual file counts", () => {
    const families = readJson("knowledge/sources/families.json");
    expect(families.family_count).toBe(release.source_freeze.source_families);
    expect(families.family_count).toBeLessThan(registry.file_count);

    const represented = new Set<string>();
    for (const family of families.families) {
      expect(family.file_source_ids.length).toBe(family.file_count);
      for (const sourceId of family.file_source_ids) {
        expect(sourceIds.has(sourceId)).toBe(true);
        represented.add(sourceId);
      }
    }
    expect(represented.size).toBe(registry.file_count);
  });

  it("requires every methodology rule to be unique, supported, and source-grounded", () => {
    const ruleFiles = readdirSync(join(root, "knowledge/rules")).filter((name) =>
      name.endsWith(".json")
    );

    const seenRuleIds = new Set<string>();

    for (const file of ruleFiles) {
      const payload = readJson(`knowledge/rules/${file}`);
      expect(payload.status).toBe("supported");
      expect(payload.rules.length).toBeGreaterThan(0);

      for (const rule of payload.rules) {
        expect(rule.rule_id).toBeTruthy();
        expect(seenRuleIds.has(rule.rule_id)).toBe(false);
        seenRuleIds.add(rule.rule_id);

        expect(rule.topic).toBeTruthy();
        expect(rule.decision).toBeTruthy();
        expect(Array.isArray(rule.conditions)).toBe(true);
        expect(rule.action).toBeTruthy();
        expect(rule.validation_status).toBe("supported");
        expect(rule.source_evidence.length).toBeGreaterThan(0);

        for (const evidence of rule.source_evidence) {
          expect(sourceIds.has(evidence.source_id)).toBe(true);
          expect(evidence.support).toBeTruthy();
        }
      }
    }

    expect(seenRuleIds.size).toBe(release.corpus.operational_rules);
  });

  it("requires evidence records to be unique, supported, and cite registered sources", () => {
    const evidenceFiles = readdirSync(join(root, "knowledge/evidence")).filter(
      (name) => name.endsWith(".json")
    );

    const seenEvidenceIds = new Set<string>();

    for (const file of evidenceFiles) {
      const payload = readJson(`knowledge/evidence/${file}`);
      expect(payload.status).toBe("supported");

      for (const record of payload.records) {
        expect(record.evidence_id).toBeTruthy();
        expect(seenEvidenceIds.has(record.evidence_id)).toBe(false);
        seenEvidenceIds.add(record.evidence_id);

        expect(record.topic).toBeTruthy();
        expect(record.statement).toBeTruthy();
        expect(sourceIds.has(record.source_id)).toBe(true);
        expect(["direct", "supporting"]).toContain(record.support_type);
      }
    }

    expect(seenEvidenceIds.size).toBe(release.corpus.evidence_records);
  });

  it("audits every current method-registry entry without inventing registry methods", () => {
    const audit = readJson(
      "knowledge/audits/method-registry-evidence-v0.1.json"
    );

    const registryMethodIds = Object.keys(methodRegistry).sort();
    const auditedMethodIds = audit.methods
      .map((item: { method_id: string }) => item.method_id)
      .sort();

    expect(auditedMethodIds).toEqual(registryMethodIds);

    for (const item of audit.methods) {
      expect([
        "source_supported",
        "source_supported_concept",
        "deferred"
      ]).toContain(item.methodology_status);

      const method = methodRegistry[item.method_id];
      expect(method).toBeTruthy();
      if (!method) throw new Error(`Unknown audited method: ${item.method_id}`);

      expect(item.registry_maturity).toBe(method.maturity);
      expect(item.executable).toBe(method.executable);
    }
  });

  it("labels synthetic benchmarks as non-expert regression tests with unique cases", () => {
    const benchmark = readJson(
      "knowledge/benchmarks/synthetic-method-selection-v0.1.json"
    );

    expect(benchmark.purpose).toContain("NOT a substitute");
    expect(benchmark.cases).toHaveLength(
      release.corpus.synthetic_methodology_regression_cases
    );

    const caseIds = benchmark.cases.map(
      (item: { case_id: string }) => item.case_id
    );
    expect(new Set(caseIds).size).toBe(caseIds.length);
  });

  it("keeps unresolved v1 source gaps explicitly non-blocking", () => {
    const gaps = readJson("knowledge/gaps/source-gaps-v0.1.json");

    for (const gap of gaps.gaps) {
      expect(["closed", "deferred"]).toContain(gap.status);
      if (gap.status === "deferred") {
        expect(gap.non_blocking_for_release).toBe(true);
      }
    }
  });
});
