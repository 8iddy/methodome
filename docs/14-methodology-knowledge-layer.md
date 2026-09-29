# Methodome Methodology Knowledge Layer

## Purpose

Methodome's methodology corpus is an active runtime knowledge layer, not a document archive. It exists so analytical decisions can be informed by versioned, source-supported research methodology rather than relying on a language model's general memory.

The current release is `methodome-methodology-knowledge-v1` with status `source_supported`. That status means the evidence statements and operational rules are traceable to registered sources and have passed corpus consistency review. It does not mean the rules have completed the planned expert-labelled methodology benchmark.

## Runtime representation

The repository keeps source metadata, evidence statements, operational rules, coverage information, audits and regression cases under `knowledge/`. The runtime application bundles the operational layer through `@methodome/methodology-knowledge` so Cloudflare Workers do not need live access to Google Drive or the original literature during ordinary execution.

Raw source files remain provenance material. The structured rules are the application-facing representation.

## How Methodome uses it

Protocol interpretation retrieves relevant guidance about research-question intent, study design, sampling, estimands, repeated measures, clustering, survey design, causal intent, prediction and related methodological structure.

The deterministic method registry associates candidate and blocked methods with relevant operational rules. A method decision can therefore retain the methodology knowledge version together with rule, evidence and source identifiers.

The same layer can provide relevant diagnostics and reporting guidance after deterministic computation. It informs what should be checked and what can be claimed. It does not alter numerical output.

The project conversation also receives relevant retrieved guidance when it explains why Methodome made a methodological decision. The language model explains the current study state and deterministic decision; it does not replace them.

## Operational rules and evidence

Operational rules contain conditions, actions, assumptions, diagnostics, warnings, exceptions and supporting source evidence. Wherever a safeguard can be expressed deterministically, the software should enforce it in code.

Evidence records support explanation and provenance. They are not votes, and duplicate files from one source family do not count as independent methodological support.

This separation matters. A source can support a principle while the current Methodome runtime still lacks an executor for the corresponding advanced method.

## Safety boundary

The knowledge layer can know more than Methodome can execute. That breadth is useful because it lets the system recognise when a simpler available method would be inappropriate.

For example, the corpus contains safeguards against treating clustered or repeated observations as independent, turning observational adjustment into a causal claim, choosing negative-binomial regression solely because overdispersion exists, treating Mann-Whitney as a generic median test, or selecting a missing-data strategy solely from a missingness percentage.

If Methodome understands the methodological requirement but lacks a safe executor, it should stop or defer rather than approximate with an inappropriate supported method.

## Conversation and provenance

Normal researchers should not see rule IDs during ordinary use. They should be able to ask why Methodome chose an analysis and receive a plain-language explanation grounded in the study, observed data structure, deterministic rule evaluation and source-supported methodology guidance.

Advanced inspection and the audit record may expose the methodology knowledge version, applied rule IDs, evidence IDs, source IDs, registry version and model or prompt version where relevant.

## Validation

The existing synthetic cases protect software behaviour from regression. They are not a substitute for expert methodological validation.

The next validation stage remains an expert-labelled protocol-to-analysis benchmark covering research questions, analytical roles, estimands, study design, sampling, dependence structure, acceptable method sets and unacceptable methods with reasons. The stronger `validated` label remains reserved for that stage.

## Development principle

Build broad, validate narrow, and expand the validated boundary continuously. Methodome should improve through source-backed knowledge, deterministic constraints, benchmark feedback and carefully bounded model assistance before considering fine-tuning.
