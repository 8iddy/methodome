# Guided workflow smoke fixture

This fixture is for post-MVP Methodome product testing.

It is deliberately synthetic and contains no participant information.

Files:

- `synthetic-facility-protocol.md`: a small cross-sectional protocol with three research questions.
- `synthetic-facility-data.csv`: a 40-row facility dataset.
- `expected-workflow.json`: expected study-level extraction, research questions, core variable mappings and executable method families.

The fixture is designed to exercise:

1. protocol upload and text extraction;
2. multiple research questions;
3. study-specification review;
4. dataset upload and profiling;
5. concept-to-variable mapping;
6. deterministic method candidates for descriptive analysis, binary logistic regression and linear regression;
7. creation of more than one planned analysis;
8. plan locking;
9. execution of at least one supported analysis;
10. result review and authenticated documentation navigation.

The protocol intentionally states that there are no repeated observations, survey weights, stratification or cluster-adjusted analyses. This keeps the smoke test inside the current executable MVP boundary.

Do not treat `expected-workflow.json` as model training data. It is an acceptance reference for tests and human review. Extraction wording may vary while still being acceptable if the same research meaning is preserved.
