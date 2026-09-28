import { describe, expect, it } from "vitest";
import {
  containsNumeral,
  mayUseFuzzyCategoryMatching
} from "@methodome/data-pipeline";

describe("category normalisation guardrails", () => {
  it("detects Arabic and Roman numerals", () => {
    expect(containsNumeral("HC 3")).toBe(true);
    expect(containsNumeral("HC III")).toBe(true);
  });

  it("blocks fuzzy matching when category labels contain numerals", () => {
    expect(mayUseFuzzyCategoryMatching("HC II", "HC III")).toBe(false);
  });

  it("permits fuzzy comparison only as a candidate mechanism for non numeric labels", () => {
    expect(mayUseFuzzyCategoryMatching("Hospital", "Hospitl")).toBe(true);
  });
});
