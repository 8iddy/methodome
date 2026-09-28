export interface AuditEventPayload {
  id: string;
  projectId: string;
  userId: string;
  action: string;
  objectType: string;
  objectId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  softwareVersion?: string;
  modelId?: string;
  timestamp: string;
}

export interface HashedAuditEvent extends AuditEventPayload {
  previousHash: string | null;
  hash: string;
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalise(item)])
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashAuditEvent(
  event: AuditEventPayload,
  previousHash: string | null
): Promise<HashedAuditEvent> {
  const hash = await sha256Hex(
    canonicalJson({
      previousHash,
      event
    })
  );

  return {
    ...event,
    previousHash,
    hash
  };
}

export interface AnalysisProvenance {
  analysisJobId: string;
  projectId: string;
  sourceDatasetChecksum: string;
  derivedDatasetChecksum: string;
  protocolVersion?: string;
  studySpecificationVersion: string;
  variableMappingVersion?: string;
  analysisPlanVersion?: string;
  registryVersion: string;
  methodId: string;
  formula?: string;
  filters: Array<Record<string, unknown>>;
  exclusions: Array<Record<string, unknown>>;
  transformations: string[];
  engine: "r" | "python";
  engineVersion: string;
  packageVersions: Record<string, string>;
  containerImageDigest?: string;
  narrativeModel?: {
    provider: string;
    model: string;
    modelRevision?: string;
    promptVersion?: string;
  };
  approvals: Array<{
    userId: string;
    action: string;
    timestamp: string;
  }>;
  createdAt: string;
}
