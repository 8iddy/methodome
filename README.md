# Methodome

Methodome is a research analysis platform that brings data preparation, study specification, statistical methods, diagnostics, reproducibility, qualitative analysis, mixed methods, and reporting into one research workspace.

**Public domain:** methodome.com  
**Repository:** `8iddy/methodome`

## Core technical principle

Methodome separates research language, analytical decision rules, and statistical computation.

```
Protocol + instruments + study information
                    ↓
        Structured study specification
                    ↓
        Deterministic method registry
                    ↓
          Valid analytical options
                    ↓
             Researcher choice
                    ↓
              R / Python
                    ↓
        Diagnostics + structured results
                    ↓
          Optional model explanation
```

Language models may extract, map, summarise, and explain. They are not the numerical source of statistical results.

## Product principles

- The quantitative engine must remain usable with no language model connected.
- Statistical eligibility and guardrails live in deterministic code.
- Researchers retain control of substantive methodological choices.
- Original uploaded data is immutable.
- Cleaning and harmonisation create versioned derived datasets.
- Multiple form versions and datasets can be compared, mapped, normalised, appended, or merged.
- Every result can be traced to the dataset version, analysis plan, method, code, package versions, transformations, and diagnostics that produced it.
- Manual analysis still runs registry checks and records overrides.
- Model use is controlled by project data policy.
- Automatic method recommendation expands only after benchmark validation.
- The first engineering proof is protocol and instrument → structured study specification → valid method candidates.

## Planning documents

The `docs/` directory is the build source of truth.

1. [Product specification](docs/01-product-specification.md)
2. [System architecture](docs/02-system-architecture.md)
3. [Research analysis engine](docs/03-research-analysis-engine.md)
4. [Data preparation and harmonisation](docs/04-data-pipeline.md)
5. [Privacy, governance, and provenance](docs/05-privacy-governance.md)
6. [UX and product flow](docs/06-ux-product-flow.md)
7. [Benchmark and validation](docs/07-benchmark-validation.md)
8. [Build plan](docs/08-build-plan.md)
9. [Codex build brief](docs/09-codex-build-brief.md)
10. [Cloudflare bootstrap](docs/10-cloudflare-bootstrap.md)
11. [Cloudflare deployment mode](docs/11-free-tier-deployment.md)
12. [Authentication](docs/12-authentication.md)
13. [Release readiness](docs/13-release-readiness.md)

Machine-readable planning artefacts live under `spec/`.

## Current stage

Integrated MVP implementation.

The `integration` branch contains the working full-stack implementation: authenticated research projects, R2-backed research files and datasets, form-version profiling and harmonisation, structured study specifications, deterministic method selection, locked analysis plans, queued Python statistical execution, structured results, provenance, audit history, and the Next.js research workspace.

Production deployment remains gated on the automated integration checks and the complete deployed smoke workflow.

## Initial infrastructure direction

Cloudflare-first:

- Next.js + TypeScript
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Queues and Workflows
- Cloudflare Containers for R/Python execution
- Cloudflare Workers AI or another provider behind a model adapter
- Quarto for reproducible reporting

The execution interface must remain portable so larger jobs can run on another compute provider without changing the analysis specification.

## Design direction

Methodome should feel like serious research software that is easy to use.

Visual direction:

- warm paper background
- academic blue
- muted teal
- Source Serif 4 for major editorial headings
- IBM Plex Sans for the application
- IBM Plex Mono for technical output
- fine borders and restrained radius
- tables, working surfaces, side panels, and clear analytical states
- no generic AI visual language

## Writing style

Product copy and documentation should use plain traditional prose.

- Do not use em dashes.
- Avoid unnecessary hyphenation.
- Avoid inflated adjectives and filler language.
- Avoid constructions such as “not just X, but Y.”
- State what the product does directly.
