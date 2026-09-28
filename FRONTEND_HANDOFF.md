# Methodome frontend handoff

## Current state

The frontend is integrated with the Methodome backend on the `integration` branch.

The primary quantitative research workflow no longer depends on fixture data.

## Public routes

- `/`
- `/methods`
- `/how-it-works`
- `/documentation`
- `/sign-in`
- `/sign-up`

## Authenticated routes

- `/app/projects`
- `/app/projects/new`
- `/app/methods`
- `/app/history`
- `/app/settings`

Project workspace routes:

- Overview
- Protocol
- Instruments
- Data
- Data Preparation
- Study Design
- Variables
- Analysis Plan
- Analysis
- Results
- Reports
- Audit Trail
- Project Settings

## Live backend integration

The browser API boundary is:

`apps/web/src/lib/api/index.ts`

The production API origin defaults to:

`https://api.methodome.com/api`

Requests use browser credentials so Better Auth sessions are sent to the API origin.

The frontend currently uses live endpoints for:

- account sign-up
- account sign-in
- account sign-out
- session validation
- project listing
- project creation
- project details
- research file listing
- protocol upload
- instrument and codebook upload
- dataset upload
- dataset registration
- dataset listing
- dataset profiling
- schema comparison
- harmonised dataset append
- study specification
- variable mappings
- deterministic method candidates
- analysis plans
- analysis plan locking
- analysis job submission
- analysis job status
- structured results
- analysis history
- audit trail
- project processing policy

## Data preparation

The Data page supports the form-version workflow:

1. upload multiple source datasets
2. profile both datasets
3. compare schemas
4. inspect direct, probable and uncertain field mappings
5. create a harmonised append
6. store the result as a derived dataset version

The Data Preparation page shows real dataset lineage and the real dataset profile.

General arbitrary cleaning and recoding rules beyond the implemented harmonisation path remain a later versioned transformation feature.

## Statistical execution

The Analysis screen submits a real queue job.

The API Worker consumes the queue job and calls the Python statistics Worker through a service binding. The API Worker stores the structured result and provenance after Python returns the deterministic calculation.

The Results screen reads the stored result.

The current executable method boundary is intentionally smaller than the visible long term Methodome method catalogue.

## Reports

The Reports page exports the current structured result and audit record as JSON.

Publication report generation for DOCX, PDF, HTML and LaTeX is not implemented in the integrated MVP and is labelled accordingly.

## Prototype fallback

A small number of future product surfaces may still reuse visual prototype components for capabilities outside the integrated MVP boundary.

They must not be treated as evidence that the corresponding backend capability exists.

The release boundary is documented in:

`docs/13-release-readiness.md`

## Cloudflare web deployment

The web application is packaged through OpenNext for Cloudflare.

The integration CI separately installs `apps/web` deployment dependencies before the Cloudflare package step to keep the standalone Next output independent of npm workspace hoisting.

Target production origin:

`https://methodome.com`

## Release status

The integrated application passed its production release gate on 28 September 2026.

- integration CI passed
- Cloudflare services deployed successfully
- the production API health endpoint passed
- the public site responded
- `scripts/e2e-smoke.mjs` reported `METHODOME E2E PASS`
