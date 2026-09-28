# Methodome Codex Build Brief

## Read first

Read README.md, all documents under docs/, and all schemas under spec/. Treat them as the current source of truth.

## Current task boundary

The first implementation target is Phase 0 and Phase 1. Do not jump directly to the full commercial product.

## Engineering rules

1. Use TypeScript strict mode.
2. Keep domain logic separate from provider adapters.
3. Keep statistical execution separate from web request handling.
4. Keep original files immutable.
5. Every derived dataset gets a new version id.
6. Every model call passes through policy enforcement.
7. Method eligibility comes from deterministic registry logic.
8. Manual overrides require a reason.
9. Results are structured before narrative generation.
10. No language model calculates statistical values.
11. Do not hard code one model provider.
12. Do not hard code one execution provider.
13. Add tests for domain rules.

## Suggested repository structure

```
apps/
  web/
packages/
  domain/
  study-spec/
  method-registry/
  data-pipeline/
  analysis-contracts/
  model-adapter/
  policy-engine/
  provenance/
  ui/
services/
  runner-python/
  runner-r/
  report-builder/
spec/
docs/
tests/
```

Change this structure only for a concrete technical reason.

## First implementation milestone

Build a basic Next.js shell, design tokens, project domain model, study specification types, method registry types, benchmark case types, model adapter interface, policy engine interface, analysis runner interface, provenance types, and fixture based unit tests.

Do not implement broad statistics yet.

## Second milestone

Build an internal benchmark page that can select a protocol fixture, show extracted study specification, allow correction, run deterministic registry logic, show method candidates, compare against an answer set, and show a score.

## Design rules

Use #F7F8F6 background, #FFFFFF surface, #17202A primary text, #667085 secondary text, #274C77 brand blue, #3D6FB4 interactive blue, and #2A7F78 accent teal.

Use Source Serif 4 for major editorial headings, IBM Plex Sans for the application, and IBM Plex Mono for technical output.

Avoid generic AI gradients, excessive rounded cards, chat first UX, glass effects, and unnecessary animation.

## Writing rules

Use plain English. Do not use em dashes. Avoid unnecessary hyphenation, filler language, inflated adjectives, and “not just X, but Y.”

## Before major implementation steps

State what is changing, which contract it implements, files affected, tests added, and assumptions made.

If research logic is ambiguous, surface the ambiguity instead of inventing a rule.
