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

export interface MethodSelectionUpdate {
  analysisId: string;
  methodId: string;
}

export function updateAnalysisMethodSelections(
  plan: AnalysisPlan,
  selections: MethodSelectionUpdate[]
): AnalysisPlan {
  if (plan.lockedAt || plan.lockHash) {
    throw new Error("A locked analysis plan cannot be changed.");
  }

  const byAnalysis = new Map(
    selections.map((selection) => [selection.analysisId, selection.methodId])
  );

  return {
    ...plan,
    analyses: plan.analyses.map((analysis) => {
      const methodId = byAnalysis.get(analysis.id);
      if (!methodId) return analysis;
      if (!analysis.candidateMethodIds.includes(methodId)) {
        throw new Error(
          `Method ${methodId} is not a candidate for analysis ${analysis.id}.`
        );
      }
      return {
        ...analysis,
        selectedMethodId: methodId
      };
    })
  };
}

export function assertAnalysisPlanReadyToLock(plan: AnalysisPlan): void {
  if (plan.analyses.length === 0) {
    throw new Error("An analysis plan must contain at least one planned analysis before locking.");
  }
  const unresolved = plan.analyses.filter((analysis) => !analysis.selectedMethodId);
  if (unresolved.length > 0) {
    throw new Error(
      `Select a method for every planned analysis before locking. Unresolved: ${unresolved
        .map((analysis) => analysis.id)
        .join(", ")}.`
    );
  }
}

export async function lockAnalysisPlan(
  plan: AnalysisPlan,
  lockedAt: string
): Promise<AnalysisPlan> {
  if (plan.lockedAt || plan.lockHash) {
    throw new Error("Analysis plan is already locked.");
  }
  assertAnalysisPlanReadyToLock(plan);

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
