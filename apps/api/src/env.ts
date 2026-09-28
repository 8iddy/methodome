export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  ANALYSIS_QUEUE: Queue<AnalysisQueueMessage>;
  STATS: Fetcher;
  APP_ENV: string;
  AUTH_MODE: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  ALLOWED_ORIGINS?: string;
  MAX_DIRECT_UPLOAD_BYTES?: string;
  STORAGE_MODE?: string;
}

export interface AnalysisQueueMessage {
  jobId: string;
  projectId: string;
}

export interface Variables {
  userId: string;
  userEmail?: string;
}
