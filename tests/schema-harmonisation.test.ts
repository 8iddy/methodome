import { describe, expect, it } from "vitest";
import {
  compareDatasetSchemas,
  compareVariableSchemas
} from "@methodome/schema-harmonisation";
import type { VariableSchema } from "@methodome/data-pipeline";

function variable(
  dataset: string,
  variableName: string,
  label: string,
  dataType = "string"
): VariableSchema {
  return {
    sourceDatasetVersionId: dataset,
    variableName,
    label,
    dataType
  };
}

describe("schema harmonisation", () => {
  it("directly matches unchanged variables", () => {
    const candidate = compareVariableSchemas(
      variable("day1", "facility_id", "Facility identifier"),
      variable("day2", "facility_id", "Facility identifier")
    );

    expect(candidate.status).toBe("direct_match");
    expect(candidate.requiresConfirmation).toBe(false);
  });

  it("proposes renamed variables when question labels are identical", () => {
    const candidate = compareVariableSchemas(
      variable("day1", "facility_type", "Type of health facility"),
      variable("day2", "facility_level", "Type of health facility")
    );

    expect(candidate.status).toBe("probable_match");
    expect(candidate.requiresConfirmation).toBe(true);
  });

  it("does not fuzzily collapse numeral-sensitive labels", () => {
    const candidate = compareVariableSchemas(
      variable("day1", "level_old", "Facility level HC II"),
      variable("day2", "level_new", "Facility level HC III")
    );

    expect(candidate.status).not.toBe("probable_match");
    expect(
      candidate.evidence.some((item) =>
        item.includes("fuzzy label matching was disabled")
      )
    ).toBe(true);
  });

  it("separates variables present in only one form version", () => {
    const comparison = compareDatasetSchemas(
      "day1",
      [
        variable("day1", "facility_id", "Facility identifier"),
        variable("day1", "old_question", "Question removed after day one")
      ],
      "day2",
      [
        variable("day2", "facility_id", "Facility identifier"),
        variable("day2", "new_question", "New question added on day two")
      ]
    );

    expect(comparison.mappings).toHaveLength(1);
    expect(comparison.leftOnly.map((item) => item.variableName)).toEqual([
      "old_question"
    ]);
    expect(comparison.rightOnly.map((item) => item.variableName)).toEqual([
      "new_question"
    ]);
  });
});
