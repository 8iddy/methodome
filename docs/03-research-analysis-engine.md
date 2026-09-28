# Methodome Research Analysis Engine

## Core rule

Models understand research language. Deterministic rules determine analytical eligibility. Researchers make substantive choices. R and Python calculate.

## Structured study specification

The model extracts facts into a fixed schema. Core fields include research questions, objective type, study design, unit of analysis, outcome concept and type, exposures or predictors and their types, covariates, clustering, repeated measures, weights, strata, sampling design, missing data plan, stated analyses, and estimand when stated.

The researcher can inspect and correct every extracted field.

## Method registry

Every method record defines method id, name, family, maturity, valid outcome types, predictor types, design constraints, clustering support, repeated measure support, survey support, minimum sample conditions, assumptions, diagnostics, warnings, alternatives, implementation adapters, result schema, reporting rules, and reference tests.

The registry is deterministic.

## Candidate selection

The registry may return several valid methods.

Example: clustered binary outcomes may permit mixed effects logistic regression or GEE logistic regression. Methodome should explain the difference and ask the researcher to resolve choices tied to the estimand or scientific question.

## Manual mode

Manual mode lets the researcher choose a method but does not disable the registry. If the researcher overrides a warning, require a written reason and record user, timestamp, registry version, and method version.

## Deterministic checks

Checks can include outcome type, variation, minimum cell counts, event counts, number of clusters, separation, overdispersion, multicollinearity, convergence, proportional hazards, residual assumptions, repeated observations, missingness, zero inflation, and survey design requirements.

## Analysis job

Analysis execution receives a machine readable specification.

```json
{
  "project_id": "proj_123",
  "dataset_version_id": "dsv_3",
  "analysis_plan_version_id": "sap_1",
  "method_id": "mixed_logistic",
  "outcome": "stockout_status",
  "predictors": ["reporting_completeness", "facility_level"],
  "cluster": "district",
  "filters": [],
  "missing_data_strategy": "complete_case"
}
```

## Structured results

Statistical engines return structured results before any narrative is generated. Results include method, sample size, estimates, intervals, p values where relevant, diagnostics, warnings, engine, package, and versions.

Narrative generation receives these values as read only inputs.

## Validation identity

Validation belongs to an exact configuration. Store method registry version, study schema version, extractor model and revision, prompt version, parser version, benchmark version, score, and validation date. A relevant change marks prior validation stale.

## Implementation order

Start with descriptives, cross tabulation, correlations, chi square, Fisher exact, t tests, nonparametric alternatives, ANOVA, Kruskal Wallis, linear regression, logistic regression, Poisson, negative binomial, selected mixed effects models, Kaplan Meier, and Cox regression.
