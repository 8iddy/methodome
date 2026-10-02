# Methodome frontend handoff

Current as of main after PR #34 (October 2026). Source code is the authority;
this document describes the shape, not every detail.

## Architecture in one paragraph

The researcher works in a persistent project conversation. The backend
orchestrator does every safe step on the server (protocol interpretation,
variable mapping, plan drafting, statistical execution, qualitative
preparation and proposals) and stops only for decisions that need scientific
judgement. Specialist screens are secondary workbenches that render canonical
backend state and send corrections back. The frontend keeps no workflow state
machine of its own.

## Where state comes from

| Need | Endpoint | Notes |
|---|---|---|
| Conversation, open decisions, whether Methodome is working | `GET /projects/:id/conversation` | `activity` is `idle`, `working`, `running_analysis` or `stopped`. Decisions are only offered when no run is in progress. `datasetVariables` accompanies mapping decisions. |
| Workflow readiness, blockers, next action, guidance visibility | `GET /projects/:id/readiness?section=…` | `guidance.visible` is false when the researcher is already on the relevant surface. |
| Orchestrator view | `GET /projects/:id/orchestrator` | Used by the qualitative workbench. |
| Everything the project has produced | `GET /projects/:id/research-outputs` | Plan state, each planned analysis with execution state and stored result, each qualitative workstream with codebook, coding progress and researcher-confirmed themes with source segments. Includes `activity`. |

Rules:

- Never recompute readiness, "mapping complete", "plan ready" or "can run"
  in React. Read it.
- Never store job state in `localStorage`.
- Numbers shown anywhere come from stored statistical output; the frontend
  only formats what the API already formatted.

## Components

`apps/web/src/components/`

| File | Role |
|---|---|
| `conversation-workspace.tsx` | The primary surface: thread, decision cards (study interpretation, mapping, method, plan approval, qualitative review handoff), result tables, composer with multi-file attachment. |
| `workbenches.tsx` | `VariablesWorkbench`, `AnalysisWorkbench`, `ResultsWorkbench`, `ReportsWorkbench`, `SourcesWorkbench`. All driven by readiness or research outputs. |
| `research-workspace.tsx` | `ResearchSectionContext` (backend next-action card, hidden on its own surface) and `ResearchAnalysisSurface` / `QualitativeWorkbench` (codebook, coding and theme review against source segments). |
| `live.tsx` | Auth pages, project list, project creation, the section router, and the remaining legacy specialist screens: protocol/instrument files, data (dataset registration, schema comparison, harmonisation), data preparation, study design, analysis plan, settings, audit, methods and history pages. |
| `ui.tsx` | Shell, sidebar navigation, buttons, badges, theme toggle. |
| `public.tsx`, `documentation.tsx` | Public site. |

`apps/web/src/lib/api/index.ts` is the only place that talks to the API.

## Routes

Public: `/`, `/methods`, `/how-it-works`, `/documentation`, `/sign-in`,
`/sign-up`.

Authenticated: `/app/projects`, `/app/projects/new`, `/app/methods`,
`/app/history`, `/app/settings`, and
`/app/projects/:projectId/:section` with sections `overview` (the
conversation), `protocol`, `instruments`, `data`, `data-preparation`,
`study-design`, `variables`, `analysis-plan`, `analysis` (`?workstream=`
opens a qualitative workstream), `results`, `reports`, `audit-trail`,
`settings`.

## Design

Warm paper background, academic blue accent, muted teal, IBM Plex Sans for
the application, Source Serif 4 for headings and decision prompts, IBM Plex
Mono for statistical output. Fine rules, small radii, no cards inside cards,
no chat bubbles. Styles live in `apps/web/src/app/globals.css`; the active
token block is the last `:root` definition, and conversation and workbench
styles are the final two sections.

## Working locally

`npm run web:typecheck` and `npm run web:build` from the repository root.
The dev server (`npx next dev` in `apps/web`) talks to the production API
by default (`NEXT_PUBLIC_METHODOME_API_URL` overrides it). Browser sessions
are cross-site from `localhost`, so authenticated screens cannot be exercised
locally against production; validate them on `https://methodome.com` with a
temporary account and delete it afterwards, or run the API locally.

## Known debt

- Study design, analysis plan and data-preparation screens in `live.tsx`
  predate the workbench model and still carry local validation and
  navigation copy.
- Files cannot be reclassified or deleted (no API yet).
- Formatted manuscripts (DOCX, PDF, LaTeX) are not produced; Reports exports
  a Markdown summary and a JSON record built from stored outputs.
- `GET /projects/:id/conversation` takes several seconds because it
  re-profiles the dataset on each call.
