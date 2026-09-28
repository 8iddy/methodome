# Methodome Build Plan

## Phase 0: Product contracts

Finalise the study specification schema, method registry schema, analysis job schema, result schema, project policy schema, benchmark scoring, and design system.

Exit condition: machine readable contracts are stable enough for implementation.

## Phase 1: Benchmark proof

Build an internal proof screen.

Flow:

1. Select or upload protocol.
2. Add instrument.
3. Add study declaration.
4. Extract structured study specification.
5. Review extracted values.
6. Run deterministic method registry.
7. Show valid method candidates.
8. Compare to expert benchmark.
9. Show score.

Do not build polished reports or qualitative analysis yet.

Exit condition: agreed extraction and registry thresholds are met.

## Phase 2: Project shell

Build authentication, project creation, navigation, file upload, D1 metadata, R2 storage, project permissions, and audit events.

## Phase 3: Data preparation

Build profiling, multiple dataset support, schema comparison, variable mapping, harmonisation, append, merge, cleaning, dataset versioning, and transformation logs.

## Phase 4: Study specification and plan

Build protocol parsing, study design confirmation, variable mapping, deterministic candidate selection, plan review, plan status, locking, and overrides.

## Phase 5: Statistical execution

Implement the first validated methods, job queues, Python and R runners, structured results, diagnostics, failures, result storage, and reproducibility metadata.

## Phase 6: Results

Build Summary, Model, Diagnostics, Reproduce, Analysis History, and code export.

## Phase 7: Reporting

Build CSV, XLSX, figures, R scripts, Python scripts, notebooks, Quarto, DOCX, PDF, HTML, and LaTeX exports.

## Phase 8: Model assistance

Add model backed features only where evaluation supports them. The statistical engine must remain usable without them.

## Phase 9: Qualitative and mixed methods

Start after the quantitative workflow is stable and language specific evaluation exists.

## Phase 10: Commercial readiness

Later add organisations, teams, billing, quotas, institution deployment, alternative runners, public documentation, and support.

## Discipline

Do not start a later phase because it looks impressive. Statistical correctness, benchmark evidence, and stable contracts come first.
