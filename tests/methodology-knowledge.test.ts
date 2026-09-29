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
  const sourceIds = new Set(
    registry.entries.map((entry: { source_id: string }) => entry.source_id)
  );

  it("registers every corpus file with a unique source id", () => {
    expect(registry.file_count).toBe(74);
    expect(registry.entries).toHaveLength(74);
    expect(sourceIds.size).toBe(74);

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

  it("requires every methodology rule to be unique and point to registered source evidence", () => {
    const ruleFiles = readdirSync(join(root, "knowledge/rules")).filter((name) =>
      name.endsWith(".json")
    );

    expect(ruleFiles.length).toBeGreaterThan(0);

    const seenRuleIds = new Set<string>();

    for (const file of ruleFiles) {
      const payload = readJson(`knowledge/rules/${file}`);
      expect(payload.rules.length).toBeGreaterThan(0);

      for (const rule of payload.rules) {
        expect(rule.rule_id).toBeTruthy();
        expect(seenRuleIds.has(rule.rule_id)).toBe(false);
        seenRuleIds.add(rule.rule_id);

        expect(rule.topic).toBeTruthy();
        expect(rule.decision).toBeTruthy();
        expect(Array.isArray(rule.conditions)).toBe(true);
        expect(rule.action).toBeTruthy();
        expect(["draft", "supported", "validated", "retired"]).toContain(
          rule.validation_status
        );
        expect(rule.source_evidence.length).toBeGreaterThan(0);

        for (const evidence of rule.source_evidence) {
          expect(sourceIds.has(evidence.source_id)).toBe(true);
          expect(evidence.support).toBeTruthy();
        }
      }
    }
  });

  it("requires evidence records to be unique and cite registered corpus sources", () => {
    const evidenceFiles = readdirSync(join(root, "knowledge/evidence")).filter(
      (name) => name.endsWith(".json")
    );

    expect(evidenceFiles.length).toBeGreaterThan(0);

    const seenEvidenceIds = new Set<string>();

    for (const file of evidenceFiles) {
      const payload = readJson(`knowledge/evidence/${file}`);
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
  });

  it("audits every method-registry entry without inventing extra methods", () => {
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
        "source_backed_draft",
        "source_backed_concept",
        "partial",
        "gap",
        "out_of_runtime"
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
    expect(benchmark.cases.length).toBeGreaterThanOrEqual(20);

    const caseIds = benchmark.cases.map(
      (item: { case_id: string }) => item.case_id
    );
    expect(new Set(caseIds).size).toBe(caseIds.length);
  });
});
