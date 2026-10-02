import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  listVariableMappings,
  saveVariableMappings
} from "../apps/api/src/db";

// D1 is SQLite. Run the real statements against node:sqlite so the test
// exercises the actual upsert semantics rather than a hand-written fake.
let DatabaseSync: (new (path: string) => any) | null = null;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}

function createD1() {
  const sqlite = new DatabaseSync!(":memory:");
  sqlite.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  // Only mapping rows are under test; skip seeding their parent rows.
  sqlite.exec("PRAGMA foreign_keys = OFF;");

  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...values: unknown[]) => statement(sql, values),
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    run: async () => {
      const info = sqlite.prepare(sql).run(...params);
      return { meta: { changes: Number(info.changes) } };
    }
  });

  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: Array<ReturnType<typeof statement>>) =>
      Promise.all(statements.map((item) => item.run()))
  };

  for (const project of ["project-a", "project-b"]) {
    sqlite
      .prepare(
        `INSERT INTO study_specifications
         (id, project_id, version, specification_json, created_at)
         VALUES (?, ?, '1', '{}', '2026-10-02T00:00:00.000Z')`
      )
      .run(`spec-${project}`, project);
  }
  return db as unknown as D1Database;
}

const staffMapping = (id: string, datasetVariable: string, confirmedBy?: string) => ({
  id,
  researchConcept: "Number of clinical staff",
  datasetVariable,
  mappingStatus: "direct_match" as const,
  evidence: ["evidence"],
  ...(confirmedBy ? { confirmedBy } : {})
});

describe.skipIf(!DatabaseSync)("variable mapping storage", () => {
  it("keeps two projects' mappings separate when they share a concept and a caller id", async () => {
    const db = createD1();

    await saveVariableMappings(db, {
      projectId: "project-a",
      studySpecificationId: "spec-project-a",
      mappings: [staffMapping("map_auto_42cc9c1c", "staff_count", "researcher-a")]
    });
    await saveVariableMappings(db, {
      projectId: "project-b",
      studySpecificationId: "spec-project-b",
      mappings: [staffMapping("map_auto_42cc9c1c", "n_staff")]
    });

    const a = await listVariableMappings(db, "project-a");
    const b = await listVariableMappings(db, "project-b");

    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      datasetVariable: "staff_count",
      confirmedBy: "researcher-a"
    });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ datasetVariable: "n_staff" });
    expect(b[0]?.confirmedBy).toBeUndefined();
    expect(b[0]?.id).not.toBe(a[0]?.id);
  });

  it("updates a project's own mapping in place, matched by concept", async () => {
    const db = createD1();

    const [first] = await saveVariableMappings(db, {
      projectId: "project-a",
      studySpecificationId: "spec-project-a",
      mappings: [staffMapping("any-caller-id", "staff_count")]
    });
    const [second] = await saveVariableMappings(db, {
      projectId: "project-a",
      studySpecificationId: "spec-project-a",
      mappings: [staffMapping("a-different-caller-id", "n_staff", "researcher-a")]
    });

    const stored = await listVariableMappings(db, "project-a");
    expect(second).toBe(first);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      datasetVariable: "n_staff",
      confirmedBy: "researcher-a"
    });
  });
});
