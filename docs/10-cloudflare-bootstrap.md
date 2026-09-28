# Cloudflare bootstrap

Date: 28 September 2026

## Completed free-tier deployment

Methodome's backend is deployed on the Cloudflare Workers Free plan. The deployed Worker is `methodome-api` at:

`https://methodome-api.abakogideon.workers.dev`

| Resource | Name | Deployment record |
| --- | --- | --- |
| Worker | `methodome-api` | Deployed to the workers.dev URL above |
| D1 database | `methodome` | UUID `2a7e2a38-14fb-4fca-882b-8bac86d44536` |
| Queue producer | `methodome-analysis` | Bound as `ANALYSIS_QUEUE`; no consumer Worker was created |
| R2 | Not configured | No R2 binding, bucket, or subscription |

`wrangler.jsonc` binds the database as `DB` and the queue as `ANALYSIS_QUEUE`. It keeps `workers_dev` enabled and `STORAGE_MODE` set to `disabled`.

## Migration and deployment checks

- Remote D1 migration `0001_initial.sql` completed successfully (26 commands).
- The expected Methodome tables are present, including `users`, `projects`, `project_members`, `project_policies`, `files`, `dataset_versions`, `dataset_version_parents`, `transformation_events`, `transformation_inputs`, `study_specifications`, `variable_mappings`, `analysis_plans`, `analysis_jobs`, `analysis_results`, `audit_events`, `model_calls`, and `validation_profiles`.
- `npm run typecheck` passed.
- `npm test` passed: 18 tests in 7 test files.
- `npm run d1:migrate:local` passed.
- `npx wrangler deploy --dry-run --config wrangler.jsonc` passed.
- `GET /api/health` returned HTTP 200 with `service: methodome-api` and `status: ok`.
- `GET /api/projects` returned HTTP 503 with `AUTH_NOT_CONFIGURED`; no project data was exposed without production authentication.

## Authentication and storage posture

Production authentication remains intentionally unconfigured. The deployment does not switch `AUTH_MODE` to `development_header`, and protected application APIs remain unavailable until production authentication is configured.

R2 remains disabled. No `FILES` binding or R2 bucket exists, so upload endpoints intentionally return `503 OBJECT_STORAGE_NOT_CONFIGURED` until object storage is deliberately added later. No paid Cloudflare service, billing commitment, or purchase was accepted during this bootstrap.

No OAuth credentials, tokens, cookies, or other secrets are recorded in this document.
