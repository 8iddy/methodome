# Methodome Benchmark and Validation

## Purpose

The benchmark tests the main claim: can Methodome turn research material into a correct structured study specification that supports acceptable analytical choices?

## Sources

Start with published protocol papers that have open datasets or openly documented analysis plans. Prefer studies with clear research questions, instruments, accessible data, and common health or social science designs.

## Expert reference process

For every case:

1. Statistician A writes a reference study specification and analysis plan.
2. Statistician B writes one independently.
3. Differences are recorded.
4. Adjudication creates an acceptable answer set.

Several methods may be valid. Do not force one answer where the study permits more than one defensible choice.

## Extraction scoring

Score outcome, outcome type, predictor, predictor type, covariates, design, unit of analysis, clustering, cluster variable, repeated measures, weights, strata, sampling design, missing data plan, and estimand where stated.

Test method registry behaviour separately from model extraction.

## Model comparison

Test several extractors, including at least one open weight model and one high performing frontier model.

Set a quality threshold before comparing price. Among models that pass, compare cost, latency, reliability, context support, and structured output quality.

## Validation identity

Store results against model id and revision, prompt version, schema version, parser version, registry version, benchmark version, and date.

Changing a relevant component makes the old validation claim stale.

## Computational validation

Every statistical method gets fixed reference datasets and expected results. Compare coefficients, standard errors, intervals, p values, test statistics, likelihoods, sample counts, and diagnostics within defined numerical tolerance.

## Regression tests

Rerun relevant tests when statistical packages, container images, method code, registry logic, extraction prompts, or schemas change.

## Language evaluation

Qualitative model features require separate benchmarks by language. English performance does not establish performance for Luganda, Ateso, Kiswahili, or code switched material.

## Scale

Start with 20 studies to test feasibility and refine the schema. Expand to 40, 100, 250, and 500. Treat the benchmark as a product and research asset.
