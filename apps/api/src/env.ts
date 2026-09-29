export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  AI?: any;
  EMAIL?: {
    send(message: {
      to: string;
      from: string;
      subject: string;
      text?: string;
      html?: string;
    }): Promise<unknown>;
  };
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL_VERIFICATION_REQUIRED?: string;
  EMAIL_FROM?: string;
  ANALYSIS_QUEUE: Queue<MethodomeQueueMessage>;
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
  type?: "analysis";
  jobId: string;
  projectId: string;
}

export interface OrchestrationQueueMessage {
  type: "orchestration";
  runId: string;
  projectId: string;
  userId: string;
  userEmail?: string;
}

export type MethodomeQueueMessage = AnalysisQueueMessage | OrchestrationQueueMessage;

export interface Variables {
  userId: string;
  userEmail?: string;
}
