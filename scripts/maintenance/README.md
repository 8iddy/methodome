# Maintenance scripts

One-off, operator-run tools. None of them is deployed or called by the application.

- `repair-mapping-ownership.mjs` — restored the EAC and Mzumbe variable-mapping
  rows damaged by the cross-project id collision fixed in PR #30, from each
  project's own researcher-confirmed audit events, writing hash-chained
  `variable_mapping_repaired` audit events. Dry run by default; `--apply` writes.
  Applied on 2026-10-03.
- `r2-orphans/` — disposable Worker run with
  `npx wrangler dev --remote --config scripts/maintenance/r2-orphans/wrangler.jsonc`.
  `GET /` lists bucket objects that no `files` or `dataset_versions` row references;
  `POST /delete` with `{"confirm":"delete-orphans"}` removes them. On 2026-10-03 the
  bucket held 18 objects, all referenced. (The `wrangler r2 bucket info` object
  count lags and should not be used as evidence.)
