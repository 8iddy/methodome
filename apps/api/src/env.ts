export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ANALYSIS_QUEUE: Queue<AnalysisQueueMessage>;
  APP_ENV: string;
  AUTH_MODE: string;
  ALLOWED_ORIGINS?: string;
  MAX_DIRECT_UPLOAD_BYTES?: string;
}

export interface AnalysisQueueMessage {
  jobId: string;
  projectId: string;
}

export interface Variables {
  userId: string;
  userEmail?: string;
}
