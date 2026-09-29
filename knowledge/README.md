# Methodome Methodology Knowledge

This directory contains Methodome's structured methodology knowledge. Raw literature remains in the linked Google Drive corpus; raw PDFs and documents are not committed to the application repository.

## v1 release boundary

The 2026-09-29 v1 source freeze contains 87 Drive files across 40 source families. The structured repository layer contains 107 source-grounded evidence statements, 62 operational rules, and 32 synthetic methodology regression cases.

v1 is **source-supported**, not methodology-validated. A supported rule has traceable source evidence and has passed corpus consistency review. The stronger `validated` state is reserved for the planned expert-labelled protocol-to-analysis benchmark. Synthetic cases protect software behaviour from regressions but are not a substitute for expert methodological validation.

See `coverage/release-v1.json` for the release manifest and explicit deferred boundary.

## Separation of concerns

- `sources/registry.json`: source inventory and provenance metadata.
- `sources/families.json`: source-family grouping so duplicate files or chapters from one work are not treated as independent votes.
- `evidence/`: source-grounded methodological statements.
- `rules/`: operational Methodome decision rules derived from evidence.
- `coverage/`: domain coverage and release boundaries.
- `audits/`: comparisons between software capabilities and methodology support.
- `benchmarks/`: synthetic regression cases and, later, expert-labelled cases.
- `gaps/`: explicit closed or deferred source/methodology gaps.
- `schemas/`: schemas for methodology records.

Methodome keeps three layers distinct:

1. **Evidence**: what a source actually supports.
2. **Methodome rule**: how that evidence is operationalised.
3. **Implementation**: how software applies the rule and calculates results.

A source mentioning a method is not enough to create a Methodome rule. Rules require conditions, scope, assumptions, diagnostics, warnings, exceptions, or another defensible decision principle.

## Rule lifecycle

- `draft`: extracted or translated but not yet through corpus review.
- `supported`: backed by source evidence and internal consistency review.
- `validated`: passed an expert-labelled methodology benchmark.
- `retired`: preserved for provenance but no longer active.

## Source roles

- `primary`: can directly support Methodome methodological decisions.
- `supporting`: supports explanation, implementation, diagnostics, or secondary confirmation.
- `reporting`: primarily informs reporting completeness rather than method selection.

Multiple files from the same source family do not count as independent methodological votes. Known duplicate files are registered for provenance but do not create duplicate evidence.

## v1 methodological scope

The source-supported v1 layer covers research-question intent and estimands; observational and randomized study-design recognition; probability, non-probability and complex-survey sampling; descriptive analysis; Pearson and Spearman correlation; chi-square and Fisher exact tests; linear and binary logistic regression; independent/Welch and paired t-test routing; one-way ANOVA; Wilcoxon signed-rank, Mann-Whitney and Kruskal-Wallis safeguards; repeated and clustered observations; survey weighting/variance/domain analysis; missing-data and MICE safeguards; survival and competing-risk recognition; prediction versus explanation; causal identification and difference-in-differences gates; interrupted time series; diagnostic accuracy; psychometric safeguards; mixed-method design recognition; statistical analysis plans; and reporting standards.

The deterministic runtime remains narrower than the knowledge layer. The currently executable methods are descriptive statistics, Pearson correlation, Spearman correlation, chi-square, Fisher exact, linear regression, and binary logistic regression.

Advanced count-model selection, autonomous qualitative analysis, Bayesian methods, SEM/CFA/IRT execution, advanced causal estimators, and other specialized executors remain explicitly deferred rather than silently approximated with simpler methods.

## Design principle

**Build broad. Validate narrow. Expand the validated boundary continuously.**

Methodome may understand a method family before it can safely recommend or execute it. When the design, estimand, assumptions, or runtime support are insufficient, the correct behaviour is to stop, warn, or defer rather than force an available method.
