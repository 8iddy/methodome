import type {
  AnalysisPlan,
  PlannedAnalysis
} from "@methodome/analysis-contracts";
import { canonicalJson, sha256Hex } from "@methodome/provenance";

export interface CreateAnalysisPlanInput {
  id: string;
  projectId: string;
  versionId: string;
  studySpecificationVersion: string;
  datasetVersionId?: string;
  status: AnalysisPlan["status"];
  analyses: PlannedAnalysis[];
  createdBy: string;
  createdAt: string;
}

export function createAnalysisPlan(input: CreateAnalysisPlanInput): AnalysisPlan {
  return {
    id: input.id,
    projectId: input.projectId,
    versionId: input.versionId,
    ...(input.datasetVersionId ? { datasetVersionId: input.datasetVersionId } : {}),
    studySpecificationVersion: input.studySpecificationVersion,
    status: input.status,
    analyses: input.analyses,
    createdBy: input.createdBy,
    createdAt: input.createdAt
  };
}

export async function lockAnalysisPlan(
  plan: AnalysisPlan,
  lockedAt: string
): Promise<AnalysisPlan> {
  if (plan.lockedAt || plan.lockHash) {
    throw new Error("Analysis plan is already locked.");
  }

  const payload = {
    id: plan.id,
    projectId: plan.projectId,
    versionId: plan.versionId,
    datasetVersionId: plan.datasetVersionId ?? null,
    studySpecificationVersion: plan.studySpecificationVersion,
    status: plan.status,
    analyses: plan.analyses,
    createdBy: plan.createdBy,
    createdAt: plan.createdAt,
    lockedAt
  };

  const lockHash = await sha256Hex(canonicalJson(payload));

  return {
    ...plan,
    lockedAt,
    lockHash
  };
}

export function addExploratoryAnalysis(
  lockedPlan: AnalysisPlan,
  analysis: PlannedAnalysis
): AnalysisPlan {
  if (!lockedPlan.lockedAt) {
    throw new Error("Exploratory additions require an already locked plan.");
  }

  return {
    ...lockedPlan,
    status: "exploratory",
    analyses: [
      ...lockedPlan.analyses,
      {
        ...analysis,
        addedAfterLock: true
      }
    ]
  };
}
