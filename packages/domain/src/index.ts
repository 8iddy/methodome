export type ProjectId = string;
export type UserId = string;
export type DatasetVersionId = string;
export type AnalysisPlanVersionId = string;
export type AnalysisJobId = string;

export const researchTypes = ["quantitative", "qualitative", "mixed_methods"] as const;
export type ResearchType = (typeof researchTypes)[number];

export const projectStates = [
  "draft",
  "protocol_ready",
  "data_uploaded",
  "data_prepared",
  "study_design_confirmed",
  "variable_mapping_complete",
  "analysis_plan_draft",
  "analysis_plan_locked",
  "analysis_running",
  "results_ready",
  "report_ready",
  "archived"
] as const;

export type ProjectState = (typeof projectStates)[number];

export const analysisPlanStatuses = [
  "preregistered",
  "planned_before_analysis",
  "exploratory"
] as const;

export type AnalysisPlanStatus = (typeof analysisPlanStatuses)[number];

export interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  researchType: ResearchType;
  state: ProjectState;
  ownerId: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetVersion {
  id: DatasetVersionId;
  projectId: ProjectId;
  label: string;
  sourceKind: "original" | "derived";
  parentVersionIds: DatasetVersionId[];
  objectKey: string;
  checksumSha256: string;
  rowCount?: number;
  columnCount?: number;
  createdAt: string;
  createdBy: UserId;
}
