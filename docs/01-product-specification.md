# Methodome Product Specification

## Product definition

Methodome is a research analysis platform that brings protocol interpretation, data preparation, study specification, statistical analysis, diagnostics, reproducibility, qualitative analysis, mixed methods, and reporting into one research workspace.

The first product claim is testable: Methodome can turn a research protocol, instrument, study declaration, and dataset metadata into a structured study specification that supports valid analytical choices.

## Core principles

1. R and Python calculate statistical results.
2. Language models may extract, map, summarise, and explain.
3. Deterministic rules control analytical eligibility.
4. Researchers make substantive methodological choices.
5. Original uploads remain immutable.
6. Cleaning creates versioned derived datasets.
7. Manual analysis still runs method checks.
8. Every result remains traceable to data, method, code, diagnostics, and package versions.
9. Data processing permissions are enforced in code.
10. A method is only called validated for the exact tested configuration.

## Primary users

Initial users include academic researchers, public health researchers, social scientists, monitoring and evaluation teams, graduate students, humanitarian researchers, and analysts working with survey and facility data.

## Main jobs

A researcher should be able to create a project, upload a protocol and instruments, upload one or more datasets, compare form versions, harmonise and combine datasets, clean data, confirm study design, map research concepts to variables, create an analysis plan, select valid method candidates, run analysis, inspect diagnostics, review an interpretation, reproduce the analysis, and export data, tables, figures, code, and reports.

## Product areas

Public product: landing page, Methods, How it works, Documentation, Sign in, Create account.

Authenticated product: onboarding, Projects, Methods Library, Analysis History, Profile and Settings.

Project workspace: Overview, Protocol, Instruments, Data, Data Preparation, Study Design, Variables, Analysis Plan, Analysis, Results, Reports, Audit Trail, Project Settings.

## Analysis plan status

Use three labels.

### Preregistered

The plan was registered before relevant data were inspected.

### Planned before analysis

The plan was locked after data upload or preparation but before inferential analysis.

### Exploratory

The analysis was added after analysis began or after results were inspected.

## Method maturity

### Validated

The method passed computational tests and the automatic eligibility logic passed the benchmark for a specific model, prompt, schema, parser, and registry configuration.

### Supported

The engine can execute the method and produce diagnostics, but automatic selection is restricted.

### Experimental

The method is available for researcher directed use and requires additional review.

## Initial validated method target

Descriptive statistics, cross tabulation, Pearson correlation, Spearman correlation, chi square, Fisher exact test, independent t test, paired t test, Mann Whitney U, Wilcoxon signed rank, one way ANOVA, Kruskal Wallis, linear regression, binary logistic regression, Poisson regression, negative binomial regression, selected mixed models, Kaplan Meier, and Cox regression.

Advanced methods can exist as Supported or Experimental.

## First proof

Do not start with the polished commercial product. The first proof is:

Protocol + instrument + study declaration -> structured study specification -> deterministic method candidates -> benchmark score.

The product moves beyond proof stage when extraction reaches the agreed benchmark threshold, candidate methods are acceptable on benchmark cases, core statistical outputs match reference results within tolerance, provenance is complete, prohibited model calls are blocked, and exported analyses can be reproduced outside Methodome.
