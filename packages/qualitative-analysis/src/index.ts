import { z } from "zod";

export const qualitativeAnalysisStatuses = [
  "prepared",
  "codebook_review",
  "codebook_confirmed",
  "coding_in_progress",
  "coding_review",
  "coding_confirmed",
  "theme_review",
  "complete"
] as const;

export type QualitativeAnalysisStatus =
  (typeof qualitativeAnalysisStatuses)[number];

export interface QualitativeAnalysisRecord {
  id: string;
  projectId: string;
  researchQuestionId: string;
  status: QualitativeAnalysisStatus;
  sourceFileIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualitativeSegment {
  id: string;
  analysisId: string;
  projectId: string;
  fileId: string;
  segmentIndex: number;
  text: string;
  startChar: number;
  endChar: number;
  codingState: "uncoded" | "proposed" | "reviewed";
  createdAt: string;
}

export const qualitativeCodeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  definition: z.string().trim().min(1).max(2000),
  inclusionCriteria: z.array(z.string().trim().min(1).max(1000)).default([]),
  exclusionCriteria: z.array(z.string().trim().min(1).max(1000)).default([])
});

export const qualitativeCodebookSchema = z.object({
  codes: z.array(qualitativeCodeSchema).min(1).max(80)
});

export type QualitativeCodebook = z.infer<typeof qualitativeCodebookSchema>;
export type QualitativeCode = z.infer<typeof qualitativeCodeSchema>;

export interface QualitativeCodebookVersion {
  id: string;
  analysisId: string;
  version: number;
  source: "model" | "researcher";
  codebook: QualitativeCodebook;
  model?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export const codingProposalSchema = z.object({
  assignments: z.array(
    z.object({
      segmentId: z.string().min(1),
      codeIds: z.array(z.string().min(1)).max(20),
      rationale: z.string().trim().max(2000).default("")
    })
  )
});

export type CodingProposal = z.infer<typeof codingProposalSchema>;

export interface QualitativeCoding {
  id: string;
  analysisId: string;
  segmentId: string;
  codeId: string;
  status: "proposed" | "confirmed" | "rejected";
  source: "model" | "researcher";
  rationale?: string;
  createdBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const qualitativeThemeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(4000),
  codeIds: z.array(z.string().min(1)).min(1).max(40),
  evidenceSegmentIds: z.array(z.string().min(1)).min(1).max(200)
});

export const qualitativeThemeSetSchema = z.object({
  themes: z.array(qualitativeThemeSchema).min(1).max(30),
  synthesis: z.string().trim().min(1).max(20000)
});

export type QualitativeTheme = z.infer<typeof qualitativeThemeSchema>;
export type QualitativeThemeSet = z.infer<typeof qualitativeThemeSetSchema>;

export interface QualitativeThemeVersion {
  id: string;
  analysisId: string;
  version: number;
  source: "model" | "researcher";
  themes: QualitativeTheme[];
  synthesis: string;
  model?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface SegmentDraft {
  segmentIndex: number;
  text: string;
  startChar: number;
  endChar: number;
}

function trimmedRange(
  text: string,
  start: number,
  end: number
): { start: number; end: number } | null {
  let left = start;
  let right = end;
  while (left < right && /\s/.test(text[left] ?? "")) left += 1;
  while (right > left && /\s/.test(text[right - 1] ?? "")) right -= 1;
  return right > left ? { start: left, end: right } : null;
}

function paragraphRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const separator = /\n\s*\n/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(text)) !== null) {
    const range = trimmedRange(text, start, match.index);
    if (range) ranges.push(range);
    start = match.index + match[0].length;
  }

  const finalRange = trimmedRange(text, start, text.length);
  if (finalRange) ranges.push(finalRange);
  return ranges;
}

function splitLongRange(
  text: string,
  range: { start: number; end: number },
  maxChars: number
): Array<{ start: number; end: number }> {
  const output: Array<{ start: number; end: number }> = [];
  let start = range.start;

  while (range.end - start > maxChars) {
    const hardEnd = Math.min(range.end, start + maxChars);
    const window = text.slice(start, hardEnd);
    const minimumBreak = Math.floor(maxChars * 0.6);
    let breakAt = -1;

    for (let index = window.length - 1; index >= minimumBreak; index -= 1) {
      const char = window[index];
      if (char === "\n" || char === "." || char === "!" || char === "?") {
        breakAt = index + 1;
        break;
      }
      if (breakAt < 0 && /\s/.test(char ?? "")) {
        breakAt = index;
      }
    }

    const end = breakAt > 0 ? start + breakAt : hardEnd;
    const trimmed = trimmedRange(text, start, end);
    if (trimmed) output.push(trimmed);
    start = end;
    while (start < range.end && /\s/.test(text[start] ?? "")) start += 1;
  }

  const finalRange = trimmedRange(text, start, range.end);
  if (finalRange) output.push(finalRange);
  return output;
}

export function segmentQualitativeText(
  text: string,
  options: { maxChars?: number } = {}
): SegmentDraft[] {
  const maxChars = Math.max(400, options.maxChars ?? 1600);
  const inputRanges = paragraphRanges(text).flatMap((range) =>
    range.end - range.start > maxChars
      ? splitLongRange(text, range, maxChars)
      : [range]
  );

  const output: Array<{ start: number; end: number }> = [];
  let current: { start: number; end: number } | null = null;

  for (const range of inputRanges) {
    if (!current) {
      current = { ...range };
      continue;
    }

    if (range.end - current.start <= maxChars) {
      current.end = range.end;
      continue;
    }

    output.push(current);
    current = { ...range };
  }
  if (current) output.push(current);

  return output.map((range, index) => ({
    segmentIndex: index,
    text: text.slice(range.start, range.end),
    startChar: range.start,
    endChar: range.end
  }));
}

export function validateCodebookReferences(
  proposal: CodingProposal,
  codebook: QualitativeCodebook,
  segmentIds: Iterable<string>
): CodingProposal {
  const allowedCodes = new Set(codebook.codes.map((code) => code.id));
  const allowedSegments = new Set(segmentIds);
  const seen = new Set<string>();

  return {
    assignments: proposal.assignments.map((assignment) => {
      if (!allowedSegments.has(assignment.segmentId)) {
        throw new Error(
          `Coding proposal references unknown segment ${assignment.segmentId}.`
        );
      }

      const codeIds = Array.from(new Set(assignment.codeIds));
      for (const codeId of codeIds) {
        if (!allowedCodes.has(codeId)) {
          throw new Error(
            `Coding proposal references unknown code ${codeId}.`
          );
        }
      }

      if (seen.has(assignment.segmentId)) {
        throw new Error(
          `Coding proposal repeats segment ${assignment.segmentId}.`
        );
      }
      seen.add(assignment.segmentId);

      return { ...assignment, codeIds };
    })
  };
}

export function validateThemeReferences(
  themeSet: QualitativeThemeSet,
  codebook: QualitativeCodebook,
  confirmedCodings: QualitativeCoding[],
  segmentIds: Iterable<string>
): QualitativeThemeSet {
  const allowedCodes = new Set(codebook.codes.map((code) => code.id));
  const allowedSegments = new Set(segmentIds);
  const confirmedPairs = new Set(
    confirmedCodings
      .filter((coding) => coding.status === "confirmed")
      .map((coding) => `${coding.segmentId}\u0000${coding.codeId}`)
  );

  const themeIds = new Set<string>();
  for (const theme of themeSet.themes) {
    if (themeIds.has(theme.id)) {
      throw new Error(`Theme set repeats theme id ${theme.id}.`);
    }
    themeIds.add(theme.id);

    for (const codeId of theme.codeIds) {
      if (!allowedCodes.has(codeId)) {
        throw new Error(`Theme ${theme.id} references unknown code ${codeId}.`);
      }
      const codeHasEvidence = theme.evidenceSegmentIds.some((segmentId) =>
        confirmedPairs.has(`${segmentId}\u0000${codeId}`)
      );
      if (!codeHasEvidence) {
        throw new Error(
          `Theme ${theme.id} includes code ${codeId} without confirmed evidence among its cited segments.`
        );
      }
    }
    for (const segmentId of theme.evidenceSegmentIds) {
      if (!allowedSegments.has(segmentId)) {
        throw new Error(
          `Theme ${theme.id} references unknown segment ${segmentId}.`
        );
      }
      const hasSupportingCoding = theme.codeIds.some((codeId) =>
        confirmedPairs.has(`${segmentId}\u0000${codeId}`)
      );
      if (!hasSupportingCoding) {
        throw new Error(
          `Theme ${theme.id} cites segment ${segmentId} without a confirmed supporting code.`
        );
      }
    }
  }

  return themeSet;
}
