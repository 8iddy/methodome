import release from "../../../knowledge/coverage/release-v1.json";
import sources from "../../../knowledge/sources/registry.json";

import categoricalRegressionRules from "../../../knowledge/rules/categorical-regression-v0.1.json";
import comparisonRules from "../../../knowledge/rules/comparison-methods-v0.1.json";
import coreRules from "../../../knowledge/rules/core-methodology-v0.1.json";
import countRules from "../../../knowledge/rules/count-models-v0.1.json";
import executableRules from "../../../knowledge/rules/current-executable-methods-v0.1.json";
import descriptiveRules from "../../../knowledge/rules/descriptive-two-group-v0.1.json";
import designRules from "../../../knowledge/rules/design-sampling-v0.1.json";
import logisticRules from "../../../knowledge/rules/logistic-safeguards-v0.1.json";
import causalRules from "../../../knowledge/rules/method-selection-causal-sap-v0.2.json";
import reportingRules from "../../../knowledge/rules/reporting-guidance-v0.1.json";
import specializedRules from "../../../knowledge/rules/specialized-methodology-v0.1.json";
import surveyRules from "../../../knowledge/rules/survey-missing-data-v0.1.json";

import categoricalRegressionEvidence from "../../../knowledge/evidence/categorical-regression-batch-4.json";
import comparisonEvidence from "../../../knowledge/evidence/comparison-methods-batch-1.json";
import coreEvidence from "../../../knowledge/evidence/core-methodology-batch-1.json";
import countEvidence from "../../../knowledge/evidence/count-models-batch-1.json";
import executableEvidence from "../../../knowledge/evidence/current-executable-methods-batch-1.json";
import descriptiveEvidence from "../../../knowledge/evidence/descriptive-two-group-batch-3.json";
import designEvidence from "../../../knowledge/evidence/design-sampling-finalization-batch-1.json";
import logisticEvidence from "../../../knowledge/evidence/logistic-safeguards-batch-1.json";
import causalEvidence from "../../../knowledge/evidence/method-selection-causal-sap-batch-2.json";
import reportingEvidence from "../../../knowledge/evidence/reporting-guidance-batch-5.json";
import specializedEvidence from "../../../knowledge/evidence/specialized-methodology-batch-1.json";
import surveyEvidence from "../../../knowledge/evidence/survey-missing-data-batch-1.json";

export const methodologyKnowledgeVersion = release.release_id;
export const methodologyKnowledgeStatus = release.release_status;

export interface MethodologyEvidenceReference {
  evidenceId: string;
  sourceId: string;
  statement: string;
  section: string;
  page: string | null;
  sourceFamily?: string;
}

export interface MethodologyRule {
  ruleId: string;
  topic: string;
  decision: string;
  conditions: string[];
  action: string;
  assumptions: string[];
  diagnostics: string[];
  warnings: string[];
  exceptions: string[];
  evidence: MethodologyEvidenceReference[];
  status: "supported";
}

export interface MethodologyGuidance {
  version: string;
  status: string;
  rules: MethodologyRule[];
  evidenceIds: string[];
  sourceIds: string[];
}

type RawRule = (typeof coreRules.rules)[number] & {
  rule_id: string;
  topic: string;
  decision: string;
  conditions: string[];
  action: string;
  assumptions: string[];
  diagnostics: string[];
  warnings: string[];
  exceptions: string[];
  source_evidence: Array<{ source_id: string; support: string; section: string; page: string | null }>;
};

type RawEvidence = {
  evidence_id: string;
  topic: string;
  statement: string;
  source_id: string;
  section: string;
  page: string | null;
};

const rulePayloads = [
  categoricalRegressionRules, comparisonRules, coreRules, countRules,
  executableRules, descriptiveRules, designRules, logisticRules, causalRules,
  reportingRules, specializedRules, surveyRules
] as Array<{ rules: unknown[] }>;

const evidencePayloads = [
  categoricalRegressionEvidence, comparisonEvidence, coreEvidence, countEvidence,
  executableEvidence, descriptiveEvidence, designEvidence, logisticEvidence,
  causalEvidence, reportingEvidence, specializedEvidence, surveyEvidence
] as Array<{ records: unknown[] }>;

const rawEvidence = evidencePayloads.flatMap((payload) => payload.records) as RawEvidence[];
const sourceById = new Map(sources.entries.map((source) => [source.source_id, source]));

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function evidenceFor(rule: RawRule): MethodologyEvidenceReference[] {
  return rule.source_evidence.flatMap((citation) => {
    const matches = rawEvidence.filter(
      (item) => item.source_id === citation.source_id && item.topic === rule.topic
    );
    const evidence = matches.length > 0
      ? matches
      : rawEvidence.filter((item) => item.source_id === citation.source_id).slice(0, 1);
    return evidence.map((item) => ({
      evidenceId: item.evidence_id,
      sourceId: item.source_id,
      statement: item.statement,
      section: item.section,
      page: item.page,
      ...(sourceById.get(item.source_id)?.source_family
        ? { sourceFamily: sourceById.get(item.source_id)!.source_family }
        : {})
    }));
  });
}

export const methodologyRules: MethodologyRule[] = rulePayloads
  .flatMap((payload) => payload.rules)
  .map((value) => {
    const rule = value as RawRule;
    return {
      ruleId: rule.rule_id,
      topic: rule.topic,
      decision: rule.decision,
      conditions: rule.conditions,
      action: rule.action,
      assumptions: rule.assumptions,
      diagnostics: rule.diagnostics,
      warnings: rule.warnings,
      exceptions: rule.exceptions,
      evidence: evidenceFor(rule),
      status: "supported"
    };
  });

const ruleById = new Map(methodologyRules.map((rule) => [rule.ruleId, rule]));

export function getMethodologyRule(ruleId: string): MethodologyRule | undefined {
  return ruleById.get(ruleId);
}

export function retrieveMethodologyGuidance(input: {
  topics?: string[];
  query?: string;
  ruleIds?: string[];
  limit?: number;
}): MethodologyGuidance {
  const requestedIds = new Set(input.ruleIds ?? []);
  const topicTokens = (input.topics ?? []).flatMap((topic) => normalize(topic).split(" "));
  const queryTokens = normalize(input.query ?? "").split(" ").filter((token) => token.length > 2);
  const tokens = new Set([...topicTokens, ...queryTokens]);

  const ranked = methodologyRules
    .map((rule) => {
      const searchable = normalize([
        rule.topic, rule.decision, rule.action, ...rule.conditions,
        ...rule.assumptions, ...rule.diagnostics, ...rule.warnings
      ].join(" "));
      let score = requestedIds.has(rule.ruleId) ? 1000 : 0;
      for (const token of tokens) {
        if (normalize(rule.topic).includes(token)) score += 8;
        else if (searchable.includes(token)) score += 1;
      }
      return { rule, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.rule.ruleId.localeCompare(b.rule.ruleId))
    .slice(0, input.limit ?? 8)
    .map(({ rule }) => rule);

  const evidenceIds = [...new Set(ranked.flatMap((rule) => rule.evidence.map((item) => item.evidenceId)))];
  const sourceIds = [...new Set(ranked.flatMap((rule) => rule.evidence.map((item) => item.sourceId)))];
  return {
    version: methodologyKnowledgeVersion,
    status: methodologyKnowledgeStatus,
    rules: ranked,
    evidenceIds,
    sourceIds
  };
}

export function formatMethodologyGuidance(guidance: MethodologyGuidance): string {
  return [
    `Methodology knowledge: ${guidance.version} (${guidance.status}).`,
    ...guidance.rules.map((rule) =>
      `[${rule.ruleId}] ${rule.decision} Action: ${rule.action} Warnings: ${rule.warnings.join(" ")} Evidence: ${rule.evidence.map((item) => item.evidenceId).join(", ")}.`
    )
  ].join("\n");
}
