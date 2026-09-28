# Methodome frontend handoff

## Branch and scope

The front end is implemented on `frontend-implementation`. It is a self-contained Next.js App Router application in `apps/web/`. No backend packages, schemas, services, or API routes were changed.

## Routes implemented

Public routes: `/`, `/methods`, `/how-it-works`, `/documentation`, `/sign-in`, and `/sign-up`.

Authenticated routes: `/app/projects`, `/app/projects/new`, `/app/methods`, `/app/history`, `/app/settings`, and the project workspace routes under `/app/projects/[projectId]/`: `overview`, `protocol`, `instruments`, `data`, `data-preparation`, `study-design`, `variables`, `analysis-plan`, `analysis`, `results`, `reports`, `audit-trail`, and `settings`.

## Components and local interactions

The implementation provides a reusable public header, app shell, project sidebar, stage indicator, status badges, method badges, tables, forms, dataset cards, schema comparison modal, combination panel, cleaning issue panel, method catalogue, analysis plan selector, job progress representation, results tabs, diagnostic details, audit timeline, and export controls.

The prototype supports local interaction for search and filter, project navigation, onboarding/project type selection, method expansion, schema mapping confirmation, append or merge selection, cleaning mapping confirmation, dataset version switching, candidate method selection, plan locking, guided/manual analysis mode, warning override reasons, analysis progress display, result tabs, diagnostics expansion, and export selection.

## Mock data and typed API boundary

Fixtures are centralised in `apps/web/src/mocks/fixtures.ts`. UI code does not contain fetch logic. `apps/web/src/lib/api/index.ts` is the narrow integration boundary and currently returns typed fixture data.

The backend should provide implementations for:

- `getProjects`, `getProject`, `getDatasets`
- `getStudySpecification`, `getVariableMappings`, `getAnalysisPlan`
- `getMethods`, `getAnalysisHistory`, `getResults`, `getAuditTrail`

It will also need mutation and job interfaces for project creation, uploads, versioned transformations and mappings, study specification confirmation, plan locking, analysis execution/cancellation/status, exports, profile/preferences, and project processing policies.

## Known gaps

There is no authentication, persistence, real upload transport, analysis execution, downloads, or live job polling. All success feedback is explicitly local prototype state. The data, analysis, and policy UI must be wired to versioned backend records and deterministic registry responses before use with real research data.

## Design assets used

The visual reference was inspected from the supplied Stitch exports at `/Users/luper/methodome/stitch_methodome_research_analysis_platform/`, specifically the landing, projects directory, analysis plan builder, dataset harmonisation comparison, data preparation issue review, and `academic_instrument/DESIGN.md` assets. They remain outside this repository and were not copied into the application.

## Workspace integration

Because the repository had no root workspace configuration, `apps/web/` has its own `package.json`. A later monorepo setup may add this application as a workspace without changing its package scripts.
