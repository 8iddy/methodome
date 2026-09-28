# Methodome Integrated MVP Release Readiness

## Purpose

This document defines what must be true before the first integrated Methodome build is merged to `main`.

The target is a complete quantitative research workflow with real persistence and real statistical execution. It is not a claim that every method family in the long term product vision is already implemented.

## Integrated architecture

### Web

`methodome-web`

Next.js application deployed through Cloudflare.

Target production origin:

`https://methodome.com`

### API

`methodome-api`

Cloudflare Worker using Hono.

Target production origin:

`https://api.methodome.com`

### Database

Cloudflare D1:

`methodome`

Database id:

`2a7e2a38-14fb-4fca-882b-8bac86d44536`

### Research file storage

Private Cloudflare R2 bucket:

`methodome-files`

The bucket is not configured for public access.

### Statistical execution

`methodome-stats`

Cloudflare Python Worker.

The API submits jobs to:

`methodome-analysis`

The Python Worker consumes the queue, loads the dataset from R2, executes deterministic Python statistics, persists the structured result and provenance in D1, records an audit event, and marks the job complete.

Interactive dataset profiling and harmonisation use the API to Python Worker service binding.

## Authentication

Better Auth is hosted by the Methodome API Worker.

Authentication records use dedicated D1 tables.

The first release supports email and password authentication.

The `BETTER_AUTH_SECRET` value is stored only as a Cloudflare Worker secret.

Email verification and password reset delivery are intentionally outside this release because a transactional email provider has not been configured.

## Research workflow covered by the release

The deployed smoke test must prove all of the following with temporary data:

1. An unauthenticated project request is rejected.
2. A temporary account can be created.
3. A Better Auth session is established.
4. A research project can be created.
5. A protocol can be uploaded to private R2 storage.
6. An instrument can be uploaded to private R2 storage.
7. Two source datasets can be uploaded and registered as immutable dataset versions.
8. Both datasets can be profiled.
9. Their schemas can be compared.
10. Renamed fields and changed form versions can be harmonised into a derived dataset.
11. The derived dataset has lineage back to both source datasets.
12. A structured study specification can be saved.
13. Research concepts can be confirmed against dataset variables.
14. The deterministic method registry returns a valid executable candidate.
15. An analysis plan can be created.
16. The analysis plan can be locked and receives a deterministic hash.
17. A statistical analysis job can be submitted to the queue.
18. The Python Worker consumes and executes the job.
19. The structured result is stored and returned.
20. A known linear-regression reference result is recovered.
21. The audit trail includes harmonisation and analysis completion events.
22. The temporary research project and account are deleted.
23. The deleted session no longer has access to protected project data.

The automated deployed workflow is:

`scripts/e2e-smoke.mjs`

## Executable statistical methods

The initial Python engine executes:

- descriptive statistics
- Pearson correlation
- Spearman correlation
- chi square test
- Fisher exact test
- linear regression
- binary logistic regression

Only methods marked `executable: true` in the deterministic registry can be submitted automatically.

Methods that are represented in the broader Methodome catalogue but do not yet have an execution adapter are displayed as unavailable for execution.

## Statistical validation in this release

Automated reference tests cover known outputs for:

- Pearson correlation
- linear regression
- binary logistic regression
- Fisher exact test
- chi square execution
- harmonised append

The first release is an engineering validation of the executable pipeline.

It does not replace the planned expert benchmark across real published studies. Broad automatic method-selection claims remain bounded by the benchmark programme described in `docs/07-benchmark-validation.md`.

## Data governance

Original uploaded files remain immutable.

Derived harmonised datasets receive new dataset version ids and checksums.

Transformations store:

- input dataset versions
- output dataset version
- operation
- mapping specification
- reason
- user
- timestamp

Analysis results store provenance including the dataset checksum, method registry version, method id, requester, execution time, and statistical software.

Project processing policy remains backend enforced.

## Deliberately incomplete capabilities

The following belong to later releases and must not be presented as already available:

- broad qualitative coding
- mixed methods synthesis
- automatic protocol extraction using an external model
- production email verification and password reset
- advanced survey-weighted execution
- mixed effects models
- GEE execution
- Poisson and negative-binomial execution
- survival execution
- Bayesian models
- psychometrics and SEM
- causal estimation
- complete publication report generation
- institutional teams and billing

The user interface may represent the broader product architecture, but unsupported functionality must be labelled honestly and must not silently fabricate results.

## CI release gate

The `integration` branch must pass:

- production dependency audit
- backend TypeScript
- backend unit tests
- local D1 migrations
- API Worker dry-run bundle
- Python statistical tests
- Python Worker dry-run package
- frontend TypeScript
- Next.js production build
- Cloudflare web package

## Production deployment gate

After CI passes, production deployment must:

1. verify the authenticated Cloudflare account
2. create or reuse the private `methodome-files` bucket
3. apply all D1 migrations
4. configure `BETTER_AUTH_SECRET` if absent
5. deploy `methodome-stats`
6. deploy `methodome-api`
7. deploy `methodome-web`
8. verify `https://api.methodome.com/api/health`
9. verify `https://methodome.com/`
10. execute `scripts/e2e-smoke.mjs` successfully

The deployment command is:

```bash
bash scripts/deploy-production.sh
```

Do not merge `integration` into `main` until the production smoke test reports:

`METHODOME E2E PASS`
