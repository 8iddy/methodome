# Methodome Methodology Knowledge Layer

## Purpose

Methodome should behave like a research analyst, not like a form that asks a researcher to supply analytical knowledge the software is supposed to provide.

The methodology knowledge layer is the part of Methodome that interprets research intent before deterministic statistical selection and execution.

It is separate from:

- research-document storage;
- dataset profiling;
- variable mapping;
- deterministic method selection;
- statistical computation.

## What the knowledge layer does

The first implemented version supplies versioned methodological guidance for:

- research-question objective classification;
- outcome, predictor/exposure and covariate roles;
- estimand interpretation;
- quantitative study-design classification;
- sampling-design interpretation;
- unit-of-analysis interpretation;
- repeated-measure, cluster, survey-weight and stratification flags.

The protocol interpreter uses this knowledge with the protocol text to propose a structured study specification.

Researchers can edit the proposal before confirmation.

## What it does not do

It does not calculate statistics.

It does not invent dataset variables.

It does not override confirmed researcher decisions.

It does not treat an LLM response as methodological ground truth.

## Why this is not foundation-model pretraining

Methodome does not need to train a general language model from scratch.

The near-term approach is:

1. use a capable language model for document interpretation;
2. provide versioned methodology knowledge in context;
3. constrain output to the Methodome study-specification schema;
4. apply deterministic rules for method eligibility;
5. require researcher review before locking the analysis plan;
6. benchmark the interpretation and method-selection decisions against expert annotations.

This is cheaper, easier to inspect and easier to revise than pretraining or fine-tuning a model before Methodome has a labelled benchmark.

## Knowledge expansion

The methodology layer should grow into a source-backed, versioned knowledge base.

Candidate content includes:

- epidemiologic study design;
- biostatistical method selection;
- survey methodology;
- missing-data handling;
- repeated-measure and clustered-data analysis;
- diagnostic and prognostic modelling;
- causal inference;
- survival analysis;
- psychometrics;
- mixed-methods design;
- qualitative analysis.

Each guidance item should record:

- topic;
- rule or decision principle;
- scope;
- exceptions;
- supporting source;
- version;
- validation status.

## Retrieval

As the knowledge base grows, Methodome can retrieve only the guidance relevant to the current protocol and research question.

The LLM then receives:

- the protocol evidence;
- the structured research question;
- the relevant methodology guidance;
- the allowed Methodome schema.

This avoids stuffing an entire statistics textbook into every request.

## Validation

Methodology knowledge is useful only if Methodome can be tested against expert decisions.

The benchmark should contain protocols with expert-labelled:

- research questions;
- objective types;
- outcomes;
- predictors/exposures;
- covariates;
- estimands;
- study design;
- unit of analysis;
- sampling design;
- clustering/repeated-measure features;
- acceptable method sets;
- unacceptable method sets and reasons.

The benchmark should be versioned separately from computational reference tests.

## Fine-tuning threshold

Fine-tuning should be considered only when:

- the benchmark is large enough to measure recurring errors;
- prompt + retrieval + rules no longer fix those errors reliably;
- the target behaviour is stable enough to justify model training.

Until then, Methodome should improve through versioned knowledge, retrieval, deterministic rules and benchmark feedback.
