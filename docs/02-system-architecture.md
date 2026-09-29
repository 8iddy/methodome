# Methodome System Architecture

## Goal

Methodome separates the researcher-facing conversation from scientific state, methodology rules, statistical execution, storage and model assistance. The researcher interacts with the research problem. The backend owns the analytical pipeline.

## Runtime architecture

The primary product surface is a Next.js research conversation. Messages and attachments are sent to the Methodome API, which persists the interaction in D1 and stores research files in R2. The API reconstructs canonical project state, applies the workflow engine and methodology rules, and queues safe background work. The browser displays progress and decisions but does not control the workflow.

The quantitative execution path is:

```
Browser
  -> methodome-web
  -> methodome-api
  -> D1 / R2
  -> methodome-analysis queue
  -> methodome-api queue consumer
  -> STATS service binding
  -> methodome-stats Python Worker
  -> structured result
  -> D1
  -> server-side orchestration resumes
  -> conversation result
```

The Python Worker remains the numerical authority for supported quantitative methods. The language model does not calculate statistical results.

## Canonical research state

Conversation messages are interaction history, not the scientific source of truth. Canonical research state remains in the existing project tables for files, dataset versions, protocol extractions, study specifications, variable mappings, analysis plans, jobs, results, qualitative analyses and audit events.

The conversation references that state and presents it in a form a researcher can use without operating the internal pipeline.

## Server-side orchestration

A project message or research decision creates a bounded orchestration run. The API repeatedly reads canonical state, assesses readiness, performs one safe automatic action, persists the result, recomputes readiness and continues. It stops only when researcher judgment or new source material is required, an asynchronous statistical job is running, the project is complete, or an error prevents safe continuation.

The loop is deliberately bounded and its actions are idempotent. Existing plans, workstreams and analysis jobs are reused rather than recreated. When a Python analysis finishes, the queue consumer starts a new orchestration run so progress does not depend on the researcher keeping a browser tab open.

## Methodology knowledge

The source-supported methodology corpus is bundled into a Worker-safe runtime package. Relevant rules can be retrieved for protocol interpretation, method selection, safeguards, diagnostics, reporting and explanation. Method decisions carry methodology version, rule, evidence and source provenance where available.

Operational safeguards remain deterministic. The language model may explain a rule or interpret documents in light of retrieved guidance, but it does not override method eligibility.

## Language-model role

Workers AI currently assists with protocol interpretation, semantic variable mapping, qualitative proposals and grounded project conversation. Model output is schema validated before it can affect canonical state.

Models may interpret research text and explain verified state. They may not invent dataset fields, fabricate numerical results, bypass the method registry, silently redefine a research question, or directly execute arbitrary project mutations.

## Storage and provenance

D1 stores application and research metadata, canonical analytical state, persistent conversation history, orchestration runs and audit events. R2 stores original uploads and data objects. Original source uploads remain immutable; transformations create derived dataset versions with explicit provenance.

Important methodological and analytical actions are written to the audit trail. Planned analyses retain plan hashes, registry versions and execution provenance.

## Specialist inspection surfaces

The application still exposes study design, variable mapping, analysis plan, qualitative review, results and audit pages. These are inspection and correction surfaces. They are not stages that an ordinary researcher must navigate in sequence.

## Deployment boundary

Cloudflare Workers and D1/R2/Queues form the current application platform. The statistics service is a separate Python Worker reached through a service binding. Do not restore the older architecture in which the Python Worker consumes the analysis queue directly.
