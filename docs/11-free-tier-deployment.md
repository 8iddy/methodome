# Free tier deployment mode

Methodome can run its current backend foundation without enabling R2.

## Enabled resources

- Cloudflare Worker: `methodome-api`
- D1: `methodome`
- Queue: `methodome-analysis`

These can be used on the Workers Free plan within Cloudflare's included limits.

## Deployment record — 28 September 2026

- D1 database: `methodome` (`2a7e2a38-14fb-4fca-882b-8bac86d44536`), bound as `DB`.
- Queue: `methodome-analysis`, bound as `ANALYSIS_QUEUE`; no consumer Worker has been created.
- Worker: `methodome-api` at `https://methodome-api.abakogideon.workers.dev`.
- Migration: remote `0001_initial.sql` completed successfully (26 commands); the expected Methodome tables were verified with a read-only query.
- Health check: `GET /api/health` returned HTTP 200 with `service: methodome-api` and `status: ok`.
- Protected endpoint check: `GET /api/projects` returned HTTP 503 `AUTH_NOT_CONFIGURED` and exposed no project data.
- R2: still disabled. There is no `FILES` binding and no R2 bucket or subscription.
- Billing: no paid Cloudflare service, billing commitment, or purchase was accepted.

## Deferred resource

R2 remains disabled because Cloudflare requires adding an R2 subscription to the account. The subscription can bill the configured payment method if usage exceeds the included allowance.

The default `wrangler.jsonc` therefore has no R2 binding.

`STORAGE_MODE` is set to `disabled`.

Research file upload endpoints return:

```
503 OBJECT_STORAGE_NOT_CONFIGURED
```

until object storage is deliberately enabled.

## What remains usable

Without R2, Methodome can still develop and deploy:

- account and project metadata
- study specifications
- study design
- variable mapping
- method candidate selection
- analysis plans
- analysis plan locking
- project policies
- audit events
- benchmark logic
- analysis job metadata

Remote research file ingestion and statistical execution against uploaded datasets remain disabled until an object storage solution is configured.

## Later R2 activation

If R2 is activated later:

1. Create the private `methodome-files` bucket.
2. Add the `FILES` R2 binding.
3. Set `STORAGE_MODE` to `r2`.
4. Run the storage integration tests.
5. Keep the bucket private.
