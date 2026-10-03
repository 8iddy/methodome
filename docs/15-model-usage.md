# Model usage audit

Status: October 2026, after model-usage recording was added. All language-model
work runs on Cloudflare Workers AI. Statistical computation never touches a
model.

## Where models are used

Every call goes through `apps/api/src/model-runtime.ts` (`runModel` /
`convertDocumentToMarkdown`) and is recorded in `model_invocations` with its
purpose, model, size, duration and outcome. Summaries: `GET /usage/models`
(per researcher) and `GET /projects/:id/model-usage` (per project); the
Account page shows the researcher's last 30 days.

| Purpose | Model today | Trigger | Typical input | Output cap | Notes |
|---|---|---|---|---|---|
| `document_conversion` | `toMarkdown` | Each PDF/DOCX read (protocol, instrument, codebook, transcript) | Whole file | n/a | Not an LLM call; billed separately per Workers AI pricing. |
| `protocol_extraction` | llama-3.3-70b-instruct-fp8-fast | Once per handoff with a protocol; retried once with a looser format on parse failure | Up to 68,000 chars of protocol, JSON-schema output | 4,096 tokens | The largest and most consequential call. Needs the strongest model. |
| `protocol_question_refinement` | llama-3.3-70b-instruct-fp8-fast | After extraction when there is more than one question or a question lacks objective/outcomes | Protocol again (up to 50,000 chars) plus the first interpretation | 4,096 tokens | Effectively doubles protocol cost. Candidate to skip when the first pass is already complete, or to send only the question section rather than the whole protocol. |
| `variable_mapping` | llama-3.3-70b-instruct-fp8-fast | Once per automatic mapping pass, only for concepts not matched exactly | Dataset field metadata plus up to 30,000 chars of instrument text | 2,048 tokens | Exact name and instrument-wording matches are deterministic and free. Suggestions are always reviewable. A mid-size model is plausible here because output is validated against the field list. |
| `project_assistant` | llama-3.3-70b-instruct-fp8-fast | Every researcher message without attachments | Project state JSON, methodology guidance, last 8 turns (4,000 chars each) | 1,200 tokens | Highest call frequency. The intent classification part is simple; the explanation part benefits from a stronger model. |
| `qualitative_codebook` | llama-3.3-70b-instruct-fp8-fast | Once per workstream (plus re-proposals) | Up to 40 sampled segments × 900 chars | per call | Scientific synthesis; keep strong model. |
| `qualitative_coding` | llama-3.3-70b-instruct-fp8-fast | Per batch of up to 20 segments until all segments are coded | Codebook plus 20 segments × 350 chars | per call | Most calls in a qualitative project (146 segments ≈ 8 calls). Output is validated for coverage and code IDs, so a mid-size model is a candidate, with the 70B as fallback when validation fails. |
| `qualitative_themes` | llama-3.3-70b-instruct-fp8-fast | Once per workstream after coding is confirmed | Confirmed codebook and coding evidence | per call | Scientific synthesis; keep strong model. |

Per project, a typical quantitative handoff costs 3–4 model calls
(conversion, extraction, refinement, mapping); a qualitative workstream adds
roughly 10 (conversion, codebook, ~8 coding batches, themes).

## Recommended tiers (not yet implemented)

Reserve the 70B model for `protocol_extraction`, `protocol_question_refinement`,
`qualitative_codebook`, `qualitative_themes`, and conversation replies that
explain methodology.

Candidates for a smaller model once there is recorded evidence to compare
against: `variable_mapping`, `qualitative_coding`, and the intent
classification inside `project_assistant` (split from the reply). Each
candidate already has deterministic validation of model output, which is the
precondition for downgrading safely.

How to evaluate a change: pick a purpose, run the smaller model in shadow on
the same inputs, and compare validated outputs against the 70B results in
`model_invocations` and the audit trail before switching the default.

## Operational notes

- Workers AI free tier: 10,000 Neurons per day, then calls fail with error
  `4006`. The account is moving to Workers Paid so usage is billed instead of
  stopped. The conversation reports a `stopped` state with a plain message
  when the allowance is exhausted.
- The production smoke suites depend on `protocol_extraction`; a quota
  failure shows up there first.
- Token counts are stored when the runtime returns them; otherwise character
  counts are the usage measure.
