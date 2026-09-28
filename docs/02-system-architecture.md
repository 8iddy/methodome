# Methodome System Architecture

## Goal

Separate product interaction, research interpretation, analytical rules, statistical execution, storage, and optional model services. The application must remain usable with no language model connected.

## High level architecture

```
Browser
  |
Next.js application
  |
Cloudflare Worker API
  |-- D1: application metadata
  |-- R2: source files, derived data, reports, checkpoints
  |-- Queues: analysis jobs
  |-- Workflows: multi stage execution
  |-- Model Adapter: optional model calls
  |
Execution Adapter
  |-- Python container
  |-- R container
  |-- Quarto/report container
  |-- external runner later
```

## Front end

Use Next.js and TypeScript. Desktop is the main work environment. The application needs project navigation, uploads, data tables, schema comparison, study design forms, variable mapping, analysis plan review, execution states, results, diagnostics, and audit history.

## API layer

Cloudflare Workers handle session validation, access control, project metadata, upload authorisation, job creation, model routing, result retrieval, policy enforcement, and provenance recording. Long statistical jobs must not run inside normal request handlers.

## Storage

D1 stores users, projects, membership, file metadata, study specifications, mappings, plans, jobs, result metadata, audit events, project policies, and validation configuration.

R2 stores original uploads, derived datasets, documents, transcripts, generated code, analysis artefacts, reports, and job checkpoints. Original uploads are immutable.

## Execution adapter

The web application must not care where an analysis runs.

```ts
interface AnalysisRunner {
  run(job: AnalysisJob): Promise<AnalysisResult>;
  getStatus(jobId: string): Promise<JobStatus>;
  cancel(jobId: string): Promise<void>;
}
```

Cloudflare Containers are the default runner. The same container images should later run on larger infrastructure when jobs exceed Cloudflare resource limits.

## Python environment

Likely packages include pandas, NumPy, SciPy, statsmodels, scikit-learn, lifelines, PyMC, pyreadstat, and openpyxl.

## R environment

Likely packages include tidyverse, broom, modelsummary, lme4, survival, survey, mice, lavaan, MASS, and nlme.

## Model adapter

All model calls use one interface.

```ts
interface ModelProvider {
  generateStructured<T>(request: StructuredModelRequest<T>): Promise<T>;
  generateText(request: TextModelRequest): Promise<string>;
}
```

Providers can include Workers AI, self hosted endpoints, OpenAI, Anthropic, Google, or later providers. No domain logic may depend on one provider.

## Model role

Models may extract structured study information, suggest mappings, summarise protocol text, explain statistical results, and later suggest qualitative codes. They must not calculate statistical values, bypass the method registry, silently modify data, or silently resolve substantive methodological choices.

## Policy engine

Every external model call checks project data class, allowed processors, provider, payload type, identifiable content, and qualitative content. The result is allow, block, or require user action. Enforcement happens in code.

## Authentication

Do not bind Methodome to Cloudflare Access alone. Private deployments may use Access. A public product needs account creation, sign in, recovery, session management, and later organisation membership.

## Observability

Track API failures, analysis failures, execution time, model calls, model cost, compute cost, storage use, registry warnings, and overrides. Do not log sensitive payloads unless explicitly required.
