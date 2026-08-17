# Implementation Plan: Company Analytics

**Branch**: `feature/time-machine-company-analytics` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-company-analytics/spec.md`

## Summary

Harden the existing company analytics flow so authenticated users can view current stock, profile, and details snapshots; request bounded historical series; and inspect validated company training ranges. The implementation will preserve the existing Fastify/WebSocket, per-user MongoDB, React 19/Vite, Chart.js, lazy-dashboard, and message-bus boundaries. Backend handlers will validate session and ranges before I/O, normalize timestamps and finite metrics at the response boundary, and emit safe typed errors. Frontend charts will track request/loading/error/empty states, ignore malformed or stale responses, and render only canonical finite series.

No new dependency or public route is required.

## Technical Context

**Language/Version**: Node.js CommonJS server and React 19 JavaScript frontend; repository runtime is Node.js 25.

**Primary Dependencies**: Fastify 5, `@fastify/websocket`, `@fastify/mongodb`, MongoDB 7 driver, React 19, Vite 8, Chart.js 4, `react-chartjs-2`, and the existing `useWsMessageBus` hook.

**Storage**: Per-user MongoDB databases containing `CompanyStock`, `CompanyProfile`, `CompanyDetails`, `logs`, and `Stats` collections. Existing snapshot documents are retained; no migration is required.

**Testing**: Node built-in test runner (`node --test`), handler contract tests, source-level assertions for pure normalization helpers, and the production Vite build. The repository has no React component test runner.

**Target Platform**: Authenticated browser dashboard with a Fastify WebSocket backend.

**Project Type**: Full-stack web application with a CommonJS realtime backend and lazy-loaded React analytics frontend.

**Performance Goals**: Company history responses remain bounded by the requested date range and top-item limit; chart state updates are O(number of returned points) and do not retain unbounded WebSocket history for a single request.

**Constraints**: Preserve existing message types and session middleware; never expose API keys, full external payloads, or raw stack traces; reject invalid ranges before database scans; do not add dependencies or a public company route.

**Scale/Scope**: Four lazy dashboard charts, thirteen queued company handlers/components, existing per-user snapshot collections, and focused regression coverage for all company request families.

## Constitution Check

No repository constitution file is present under `.specify/` or `specs/`. The project-level gates from `CLAUDE.md`, the existing queue workflow, and the Node.js best-practices review are applied:

- **Authentication and isolation**: PASS — all handlers gate on the authenticated session and use its `userId` for MongoDB access.
- **Compatibility**: PASS — retain existing WebSocket message types, lazy imports, Chart.js, Mongo collections, and CommonJS module style.
- **Dependency discipline**: PASS — no dependency or public route is introduced.
- **Operational safety**: PASS — validate inputs, use bounded queries/series, use async/await with explicit error paths, and keep logs generic.
- **Verification**: PASS — add focused Node tests, run existing company/session regressions, build the Vite bundle, and perform source/diff checks.

## Research Summary

Phase 0 findings are recorded in [research.md](./research.md). The important decisions are:

1. Normalize timestamp units, finite numbers, legacy stock shapes, and chronological ordering at the backend response boundary; apply a defensive frontend normalization before Chart.js.
2. Use request fingerprints and bounded state in the charts because `useWsMessageBus` dispatches only the latest message and does not correlate responses itself.
3. Treat empty history as a successful typed response with empty series, while mapping operational failures to safe generic error messages.
4. Validate and authenticate `companyTrainRange` before accessing either `logs` or `Stats`; keep UTC `YYYY-MM-DD` day keys.
5. Keep the existing snapshot reuse helper and per-user database model, but ensure company-facing responses never pass raw exception text or credentials to the browser.

## Project Structure

### Documentation (this feature)

```text
specs/010-company-analytics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── company-analytics.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
client/src/
├── CompanyStockChart.jsx
├── CompanyStockHistoryChart.jsx
├── CompanyProfileChart.jsx
├── CompanyDetailsHistoryChart.jsx
├── WorkStatsGraph.jsx
├── hooks/useWsMessageBus.js
└── main.jsx

utils/
└── fetchOrReuseSnapshot.cjs

ws/
├── wsCompanyStock.cjs
├── wsGetCompanyStock.cjs
├── wsGetCompanyStockHistory.cjs
├── wsCompanyProfile.cjs
├── wsGetCompanyProfile.cjs
├── wsGetCompanyProfileHistory.cjs
├── wsCompanyDetails.cjs
├── wsGetCompanyDetailsHistory.cjs
└── wsCompanyTrainRange.cjs

routes/
└── wsHandler.cjs

tests/
├── ws-company-session-identity.test.cjs
└── ws-company-analytics.test.cjs
```

**Structure Decision**: Retain the repository's existing `client/src`, `ws`, `utils`, `routes`, and `tests` layout. Add only small pure helpers or focused tests when they reduce duplicated validation; do not create a new service or package.

## Implementation Phases

### Phase 1: Backend contract hardening

- Add reusable local validation/normalization functions where needed for epoch ranges, finite metric points, stock snapshot shapes, and safe response errors.
- Apply session/API-key gating and authenticated `userId` database selection consistently to all company handlers, including training range and history reads.
- Bound date ranges and stock `top` values, normalize seconds/milliseconds, sort points, omit invalid values, and preserve supported legacy fields.
- Return typed empty/success/error responses and keep operational log entries free of credentials and full payloads.

### Phase 2: Frontend chart state and rendering

- Update current snapshot and history charts to maintain explicit loading, empty, reused, stale, and safe error states.
- Correlate requests with bounded fingerprints or sequence guards so stale messages cannot replace a newer range/metric result.
- Normalize response series defensively before passing data to Chart.js; render selectable profile/detail metrics and useful no-data states.
- Preserve existing props, lazy loading, theme integration, and dashboard registrations.

### Phase 3: Training range and message integration

- Make training-range validation and UTC daily aggregation deterministic for both log deltas and absolute `Stats` overlays.
- Preserve existing `companyTrainRange` response consumption in `WorkStatsGraph` while ensuring malformed responses and disconnected sockets leave the chart in a recoverable state.
- Touch `routes/wsHandler.cjs` or `useWsMessageBus.js` only where required to keep all company message types routed consistently.

### Phase 4: Automated verification and documentation

- Add focused Node tests for session isolation, unauthorized access, range validation, response shape, legacy stock normalization, invalid metric filtering, and safe errors.
- Mark implementation tasks complete only after focused tests, existing authentication/bazaar regressions, syntax checks, `npm run build:static`, and `git diff --check` pass.
- Re-index the repository with native `codebase-memory-mcp` and confirm the company symbols remain discoverable.

## Complexity Tracking

No constitution violations or architectural exceptions are required. The feature uses the existing handlers, storage, transport, and charting layers; no additional project, repository abstraction, or dependency is justified.
