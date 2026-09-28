export interface StructuredModelRequest<TSchema = unknown> {
  task: string;
  systemInstruction?: string;
  input: unknown;
  schema: TSchema;
  projectId: string;
}

export interface TextModelRequest {
  task: string;
  systemInstruction?: string;
  input: unknown;
  projectId: string;
}

export interface ModelCallMetadata {
  provider: string;
  model: string;
  modelRevision?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface ModelResponse<T> {
  value: T;
  metadata: ModelCallMetadata;
}

export interface ModelProvider {
  readonly providerId: string;
  generateStructured<T>(
    request: StructuredModelRequest
  ): Promise<ModelResponse<T>>;
  generateText(request: TextModelRequest): Promise<ModelResponse<string>>;
}
