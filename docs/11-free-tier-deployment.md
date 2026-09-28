# Free tier deployment mode

Methodome can run its current backend foundation without enabling R2.

## Enabled resources

- Cloudflare Worker: `methodome-api`
- D1: `methodome`
- Queue: `methodome-analysis`

These can be used on the Workers Free plan within Cloudflare's included limits.

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
