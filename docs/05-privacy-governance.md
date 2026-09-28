# Methodome Privacy, Governance, and Provenance

## Project data class

Every project has a data class: Public, Restricted, or Identifiable.

## Processing policy

Store data class, identifiable data flag, ethics approval reference, approved processors, external model permission, qualitative text processing permission, retention rule, export restrictions, and institution notes.

The system checks this policy before any external model call.

## Data minimisation

Models usually need variable names, labels, types, ranges, missingness summaries, and structured statistical output. They usually do not need row level quantitative data.

Qualitative text can contain direct and contextual identifiers. External model processing should be disabled by default for identifiable projects unless the project policy permits it.

## Audit trail

Record user, action, object, before state, after state, timestamp, reason where required, software version, and model id where relevant.

## Tamper evidence

Audit events should form a hash chain. For higher trust use cases, write the head hash to R2 with retention controls where appropriate and support export to an external registration service later.

An internal hash does not prove independent preregistration.

## Provenance

Every analysis run records source and derived dataset checksums, protocol version, study specification version, variable mapping version, plan version, registry version, method id, formula, filters, exclusions, transformations, statistical package versions, runtime version, container image digest, model used for explanations, approvals, and timestamps.

## Cost accounting

Track storage, statistical compute, model inference, and report generation per project from the beginning. Do not promise a fixed monthly cost before measured workloads exist.

## Language support

Do not claim trusted qualitative coding for a language until it has been evaluated. Luganda, Ateso, Kiswahili, and code switched research material require separate evidence.
