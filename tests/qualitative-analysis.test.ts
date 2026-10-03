import { describe, expect, it } from "vitest";
import {
  segmentQualitativeText,
  validateCodebookReferences,
  validateThemeReferences,
  type QualitativeCodebook,
  type QualitativeCoding,
  qualitativeCodebookSchema,
  type QualitativeSegment
} from "@methodome/qualitative-analysis";

const codebook: QualitativeCodebook = {
  codes: [
    {
      id: "stock_visibility",
      label: "Stock visibility",
      definition: "Ability to see current stock information.",
      inclusionCriteria: ["Mentions seeing or accessing stock information"],
      exclusionCriteria: ["General technology comments without stock information"]
    },
    {
      id: "connectivity_barrier",
      label: "Connectivity barrier",
      definition: "Connectivity limits system use.",
      inclusionCriteria: ["Internet or network access constrains use"],
      exclusionCriteria: []
    }
  ]
};

function segment(id: string, text: string): QualitativeSegment {
  return {
    id,
    analysisId: "qa1",
    projectId: "p1",
    fileId: "f1",
    segmentIndex: Number(id.replace(/\D/g, "")) || 0,
    text,
    startChar: 0,
    endChar: text.length,
    codingState: "reviewed",
    createdAt: "2026-09-29T00:00:00.000Z"
  };
}

describe("qualitative segmentation", () => {
  it("creates deterministic non-overlapping source-linked segments", () => {
    const text =
      "First paragraph describes stock visibility.\n\n" +
      "Second paragraph discusses connectivity and reporting.\n\n" +
      "Third paragraph describes local workarounds.";

    const first = segmentQualitativeText(text, { maxChars: 400 });
    const second = segmentQualitativeText(text, { maxChars: 400 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);

    for (const item of first) {
      expect(text.slice(item.startChar, item.endChar)).toBe(item.text);
      expect(item.endChar).toBeGreaterThan(item.startChar);
    }

    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]!.startChar).toBeGreaterThanOrEqual(
        first[index - 1]!.endChar
      );
    }
  });

  it("keeps each substantive paragraph as its own segment and joins short prompts to the answer", () => {
    const answer = (n: number) =>
      `Participant: ${"This is a substantive answer about data use at the facility. ".repeat(5)}(${n})`;
    const text = [
      "Interviewer: How do you use the data?",
      answer(1),
      "Interviewer: What stops you?",
      answer(2),
      "Interviewer: Anything else?",
      answer(3)
    ].join("\n\n");

    const segments = segmentQualitativeText(text);

    expect(segments).toHaveLength(3);
    for (const item of segments) {
      expect(item.text.startsWith("Interviewer:")).toBe(true);
      expect(item.text).toContain("Participant:");
    }
  });

  it("splits unusually long paragraphs without losing source offsets", () => {
    const text = Array.from(
      { length: 120 },
      (_, index) => `Sentence ${index + 1} contains interview material.`
    ).join(" ");

    const segments = segmentQualitativeText(text, { maxChars: 500 });

    expect(segments.length).toBeGreaterThan(1);
    for (const item of segments) {
      expect(item.text.length).toBeLessThanOrEqual(500);
      expect(text.slice(item.startChar, item.endChar)).toBe(item.text);
    }
  });
});

describe("qualitative reference validation", () => {
  it("rejects model coding references outside the supplied codebook", () => {
    expect(() =>
      validateCodebookReferences(
        {
          assignments: [
            {
              segmentId: "s1",
              codeIds: ["invented_code"],
              rationale: ""
            }
          ]
        },
        codebook,
        ["s1"]
      )
    ).toThrow("unknown code");
  });

  it("requires theme evidence to be backed by a confirmed coding", () => {
    const segments = [
      segment("s1", "We can see stock balances."),
      segment("s2", "The network is often unavailable.")
    ];
    const codings: QualitativeCoding[] = [
      {
        id: "c1",
        analysisId: "qa1",
        segmentId: "s1",
        codeId: "stock_visibility",
        status: "confirmed",
        source: "researcher",
        createdBy: "u1",
        createdAt: "2026-09-29T00:00:00.000Z",
        updatedAt: "2026-09-29T00:00:00.000Z"
      }
    ];

    expect(() =>
      validateThemeReferences(
        {
          themes: [
            {
              id: "theme_1",
              label: "Digital visibility",
              summary: "Stock data can be visible.",
              codeIds: ["stock_visibility"],
              evidenceSegmentIds: ["s2"]
            }
          ],
          synthesis: "Candidate synthesis."
        },
        codebook,
        codings,
        segments.map((item) => item.id)
      )
    ).toThrow("without confirmed evidence");

    expect(
      validateThemeReferences(
        {
          themes: [
            {
              id: "theme_1",
              label: "Digital visibility",
              summary: "Stock data can be visible.",
              codeIds: ["stock_visibility"],
              evidenceSegmentIds: ["s1"]
            }
          ],
          synthesis: "Candidate synthesis."
        },
        codebook,
        codings,
        segments.map((item) => item.id)
      ).themes[0]?.evidenceSegmentIds
    ).toEqual(["s1"]);
  });

  it("requires every code named by a theme to have confirmed cited evidence", () => {
    const segments = [
      segment("s1", "We can see stock balances."),
      segment("s2", "The network is often unavailable.")
    ];
    const codings: QualitativeCoding[] = [
      {
        id: "c1",
        analysisId: "qa1",
        segmentId: "s1",
        codeId: "stock_visibility",
        status: "confirmed",
        source: "model",
        createdBy: "u1",
        reviewedBy: "u1",
        reviewedAt: "2026-09-29T00:05:00.000Z",
        createdAt: "2026-09-29T00:00:00.000Z",
        updatedAt: "2026-09-29T00:05:00.000Z"
      }
    ];

    expect(() =>
      validateThemeReferences(
        {
          themes: [
            {
              id: "theme_1",
              label: "Information constraints",
              summary: "Visibility and connectivity shape data use.",
              codeIds: ["stock_visibility", "connectivity_barrier"],
              evidenceSegmentIds: ["s1"]
            }
          ],
          synthesis: "Candidate synthesis."
        },
        codebook,
        codings,
        segments.map((item) => item.id)
      )
    ).toThrow("without confirmed evidence");
  });

});

describe("qualitative codebook schema tolerance", () => {
  it("accepts criteria given as a single string or null", () => {
    const parsed = qualitativeCodebookSchema.parse({
      codes: [
        {
          id: "staff_time",
          label: "Staff time",
          definition: "Data review competes with clinical duties.",
          inclusionCriteria: "Mentions lacking time for data review",
          exclusionCriteria: null
        }
      ]
    });
    expect(parsed.codes[0]?.inclusionCriteria).toEqual([
      "Mentions lacking time for data review"
    ]);
    expect(parsed.codes[0]?.exclusionCriteria).toEqual([]);
  });
});
