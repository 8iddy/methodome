export type Maturity = "Validated" | "Supported" | "Experimental";
export type MappingStatus = "Direct match" | "Probable match" | "Uncertain" | "No match";
export type JobState = "Preparing dataset" | "Checking requirements" | "Running model" | "Running diagnostics" | "Preparing results" | "Complete";

export interface Project {
  id: string; name: string; researchType: string; stage: string; lastActivity: string;
  datasetStatus: string; planStatus: string; owner: string; files: number;
}
export interface Dataset { id: string; name: string; formVersion: string; records: number; variables: number; status: string; }
export interface Method { id: string; name: string; family: string; purpose: string; maturity: Maturity; requirements: string[]; diagnostics: string[]; implementations: string[]; }
export interface AuditEntry { timestamp: string; user: string; action: string; before: string; after: string; reason?: string; version: string; }
export interface Diagnostic { name: string; status: "Passed" | "Review" | "Failed" | "Not applicable"; detail: string; }
export interface AnalysisResult { method: string; outcome: string; sampleSize: string; clusters: string; estimate: string; interval: string; pValue: string; interpretation: string; }
