// One-off repair for variable-mapping rows damaged by the cross-project id
// collision fixed in PR #30 (mapping ids were a hash of the concept wording
// only). Restores the researcher-confirmed values recorded in each project's
// own audit trail and writes a hash-chained repair audit event per row.
//
// Dry run by default. Pass --apply to write.
//
//   node scripts/maintenance/repair-mapping-ownership.mjs [--apply]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { hashAuditEvent } from "../../packages/provenance/src/index.ts";

const APPLY = process.argv.includes("--apply");
const CONFIG = "wrangler.jsonc";

const EAC = "proj_cedb15e39a964266ac494c0342aec61e";
const MZUMBE = "proj_ca76a250ad2e4634b2120a08eafac5b7";
const EAC_SOURCE_EVENT = "evt_80b1f15a93"; // researcher's EAC mapping save, 2026-09-29 01:06 UTC
const MZUMBE_SOURCE_EVENT = "evt_4a510fa623"; // researcher's Mzumbe mapping save, 2026-09-29 06:30 UTC
const DAMAGED_IDS = ["map_8b24cab9", "map_c9a9f0c9", "map_9d24c2d6"];
const REASON =
  "Maintenance repair: these rows were overwritten by another project's save because mapping ids were derived from concept wording only (fixed in PR #30). Values restored from the project's own researcher-confirmed audit event.";

function sql(command) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--remote", "--config", CONFIG, "--json", "--command", command],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const parsed = JSON.parse(out);
  return parsed[0].results;
}

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const normalize = (value) =>
  value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const projectScopedId = (projectId, concept) =>
  `map_${createHash("sha256").update(`${projectId}:${normalize(concept)}`).digest("hex").slice(0, 24)}`;

function latestSpec(projectId) {
  return sql(
    `SELECT id, version FROM study_specifications WHERE project_id = ${q(projectId)} ORDER BY created_at DESC LIMIT 1`
  )[0];
}

function sourceMappings(eventId, projectId) {
  const [row] = sql(
    `SELECT id, project_id, user_id, after_json FROM audit_events WHERE id LIKE ${q(eventId + "%")} AND project_id = ${q(projectId)}`
  );
  if (!row) throw new Error(`Audit event ${eventId} not found for ${projectId}.`);
  return { eventId: row.id, userId: row.user_id, mappings: JSON.parse(row.after_json) };
}

async function appendRepairEvent(projectId, userId, objectId, before, after) {
  const [head] = sql(
    `SELECT hash FROM audit_events WHERE project_id = ${q(projectId)} ORDER BY timestamp DESC, rowid DESC LIMIT 1`
  );
  const event = await hashAuditEvent(
    {
      id: `evt_${createHash("sha256").update(`${projectId}:${objectId}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 10)}`,
      projectId,
      userId,
      action: "variable_mapping_repaired",
      objectType: "variable_mapping",
      objectId,
      before,
      after,
      reason: REASON,
      timestamp: new Date().toISOString()
    },
    head?.hash ?? null
  );
  sql(
    `INSERT INTO audit_events (id, project_id, user_id, action, object_type, object_id, before_json, after_json, reason, software_version, model_id, timestamp, previous_hash, hash)
     VALUES (${q(event.id)}, ${q(projectId)}, ${q(userId)}, ${q(event.action)}, ${q(event.objectType)}, ${q(objectId)}, ${q(JSON.stringify(before))}, ${q(JSON.stringify(after))}, ${q(REASON)}, NULL, NULL, ${q(event.timestamp)}, ${event.previousHash ? q(event.previousHash) : "NULL"}, ${q(event.hash)})`
  );
  return event.id;
}

async function main() {
  const now = new Date().toISOString();
  const eacSpec = latestSpec(EAC);
  const mzumbeSpec = latestSpec(MZUMBE);
  const eacSource = sourceMappings(EAC_SOURCE_EVENT, EAC);
  const mzumbeSource = sourceMappings(MZUMBE_SOURCE_EVENT, MZUMBE);

  console.log(`EAC specification: ${eacSpec.id} (${eacSpec.version})`);
  console.log(`Mzumbe specification: ${mzumbeSpec.id} (${mzumbeSpec.version})`);

  // --- EAC: restore the three damaged rows in place -------------------------
  const current = sql(
    `SELECT id, project_id, study_specification_id, research_concept, dataset_variable, mapping_status, evidence_json, confirmed_by FROM variable_mappings WHERE id IN (${DAMAGED_IDS.map(q).join(",")})`
  );
  const plan = [];
  for (const row of current) {
    if (row.project_id !== EAC) throw new Error(`${row.id} is not an EAC row (project ${row.project_id}).`);
    const source = eacSource.mappings.find((m) => m.id === row.id);
    if (!source) throw new Error(`No source value for ${row.id} in ${eacSource.eventId}.`);
    const already =
      row.study_specification_id === eacSpec.id &&
      row.research_concept === source.researchConcept &&
      (row.dataset_variable ?? null) === (source.datasetVariable ?? null) &&
      row.mapping_status === source.mappingStatus;
    plan.push({ row, source, already });
  }

  // --- Mzumbe: insert the three rows that were never stored -----------------
  const mzumbeTargets = mzumbeSource.mappings.filter((m) => DAMAGED_IDS.includes(m.id));
  const existing = sql(`SELECT id, research_concept FROM variable_mappings WHERE project_id = ${q(MZUMBE)}`);
  const existingConcepts = new Set(existing.map((r) => normalize(r.research_concept)));
  const inserts = mzumbeTargets
    .filter((m) => !existingConcepts.has(normalize(m.researchConcept)))
    .map((m) => ({ ...m, newId: projectScopedId(MZUMBE, m.researchConcept) }));

  console.log("\nEAC repairs:");
  for (const { row, source, already } of plan) {
    console.log(
      `  ${row.id} "${row.research_concept}" ${row.dataset_variable ?? "—"}/${row.mapping_status} spec ${row.study_specification_id.slice(-8)}` +
        ` -> "${source.researchConcept}" ${source.datasetVariable ?? "—"}/${source.mappingStatus} spec ${eacSpec.id.slice(-8)}${already ? "  (already correct)" : ""}`
    );
  }
  console.log("\nMzumbe inserts:");
  for (const m of inserts) {
    console.log(`  ${m.newId} "${m.researchConcept}" ${m.datasetVariable ?? "—"}/${m.mappingStatus} confirmed=${m.confirmed} spec ${mzumbeSpec.id.slice(-8)}`);
  }
  if (inserts.length < mzumbeTargets.length) {
    console.log(`  (${mzumbeTargets.length - inserts.length} already present in Mzumbe; skipped)`);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these changes.");
    return;
  }

  for (const { row, source, already } of plan) {
    if (already) continue;
    sql(
      `UPDATE variable_mappings SET study_specification_id = ${q(eacSpec.id)}, research_concept = ${q(source.researchConcept)}, dataset_variable = ${source.datasetVariable ? q(source.datasetVariable) : "NULL"}, mapping_status = ${q(source.mappingStatus)}, evidence_json = ${q(JSON.stringify(source.evidence))}, confirmed_by = ${q(eacSource.userId)}, updated_at = ${q(now)} WHERE id = ${q(row.id)} AND project_id = ${q(EAC)}`
    );
    const eventId = await appendRepairEvent(
      EAC,
      eacSource.userId,
      row.id,
      {
        studySpecificationId: row.study_specification_id,
        researchConcept: row.research_concept,
        datasetVariable: row.dataset_variable,
        mappingStatus: row.mapping_status,
        evidence: JSON.parse(row.evidence_json)
      },
      {
        restoredFromAuditEvent: eacSource.eventId,
        studySpecificationId: eacSpec.id,
        researchConcept: source.researchConcept,
        datasetVariable: source.datasetVariable ?? null,
        mappingStatus: source.mappingStatus,
        evidence: source.evidence,
        confirmedBy: eacSource.userId
      }
    );
    console.log(`  repaired ${row.id} (audit ${eventId})`);
  }

  for (const m of inserts) {
    sql(
      `INSERT INTO variable_mappings (id, project_id, study_specification_id, research_concept, dataset_variable, mapping_status, evidence_json, confirmed_by, created_at, updated_at)
       VALUES (${q(m.newId)}, ${q(MZUMBE)}, ${q(mzumbeSpec.id)}, ${q(m.researchConcept)}, ${m.datasetVariable ? q(m.datasetVariable) : "NULL"}, ${q(m.mappingStatus)}, ${q(JSON.stringify(m.evidence))}, ${m.confirmed ? q(mzumbeSource.userId) : "NULL"}, ${q(now)}, ${q(now)})`
    );
    const eventId = await appendRepairEvent(MZUMBE, mzumbeSource.userId, m.newId, null, {
      restoredFromAuditEvent: mzumbeSource.eventId,
      studySpecificationId: mzumbeSpec.id,
      researchConcept: m.researchConcept,
      datasetVariable: m.datasetVariable ?? null,
      mappingStatus: m.mappingStatus,
      evidence: m.evidence,
      confirmedBy: m.confirmed ? mzumbeSource.userId : null
    });
    console.log(`  inserted ${m.newId} (audit ${eventId})`);
  }

  const verify = sql(
    `SELECT m.project_id, COUNT(*) AS rows, SUM(s.project_id <> m.project_id) AS cross_project FROM variable_mappings m JOIN study_specifications s ON s.id = m.study_specification_id WHERE m.project_id IN (${q(EAC)}, ${q(MZUMBE)}) GROUP BY m.project_id`
  );
  console.log("\nAfter repair:", JSON.stringify(verify));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
