import { auditEntries, datasets, methods, project, projects, result } from "@/mocks/fixtures";

/** Fixture-backed integration boundary. Replace implementations, not component call sites, when Worker APIs are available. */
export async function getProjects() { return projects; }
export async function getProject(_projectId: string) { return project; }
export async function getDatasets(_projectId: string) { return datasets; }
export async function getStudySpecification(_projectId: string) { return { design: "Cross sectional", unit: "Health facility", cluster: "district", source: "Extracted from protocol" }; }
export async function getVariableMappings(_projectId: string) { return [{ concept: "Reporting completeness", variable: "Q14a_pct", question: "Monthly reports submitted during previous six months", type: "Continuous", range: "0 to 100", status: "Probable match" }]; }
export async function getAnalysisPlan(_projectId: string) { return { status: "Planned before analysis", question: "Is reporting completeness associated with medicine stockout?", outcome: "stockout_status", predictor: "reporting_completeness", covariates: ["facility_level", "patient_volume"], cluster: "district" }; }
export async function getMethods() { return methods; }
export async function getAnalysisHistory() { return [{ date: "28 Sep 2026", project: project.name, method: result.method, dataset: "Analysis Dataset v3", plan: "Planned before analysis", status: "Complete" }]; }
export async function getResults(_projectId: string) { return result; }
export async function getAuditTrail(_projectId: string) { return auditEntries; }
