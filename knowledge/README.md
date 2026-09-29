# Methodome Methodology Knowledge

This directory contains the structured methodological knowledge derived from the Methodome source corpus.

Raw PDFs and documents remain in the linked Google Drive corpus. They are not committed to the application repository.

## Separation of concerns

- `sources/registry.json`: source inventory and provenance metadata.
- `evidence/`: source-grounded methodological statements extracted from the corpus.
- `rules/`: operational Methodome decision rules derived from evidence.
- `benchmarks/`: expert-labelled and synthetic cases used to test interpretation and method selection.
- `schemas/`: schemas for evidence and decision-rule records.

Methodome must keep three layers distinct:

1. **Evidence**: what a source actually supports.
2. **Methodome rule**: how that evidence is operationalised.
3. **Implementation**: how software applies the rule.

A source mentioning a method is not enough to create a Methodome rule. Rules need stated conditions, scope, assumptions, warnings, or a defensible decision principle.

## Rule lifecycle

Rules use these validation states:

- `draft`: extracted and translated but not yet reviewed against multiple sources or benchmark cases.
- `supported`: backed by adequate source evidence and internal review.
- `validated`: tested against an expert-labelled methodology benchmark.
- `retired`: preserved for provenance but no longer active.

## Source roles

- `primary`: can directly support Methodome methodological decisions.
- `supporting`: useful for explanation, examples, diagnostics, or secondary confirmation.
- `reporting`: primarily informs reporting completeness rather than analysis selection.

## Current priority

The first knowledge release focuses on the quantitative workflow that Methodome already exposes:

- research-question intent;
- estimands and analytical roles;
- study and sampling design;
- descriptive analysis;
- association tests;
- linear and logistic regression;
- repeated or clustered observations;
- missing data;
- survival/time-to-event recognition;
- prediction versus explanation;
- reporting and prespecification boundaries.

Specialised Bayesian, SEM, psychometric, qualitative, mixed-method synthesis, and advanced causal workflows remain separate expansion tracks.
