# Tasks: Wealth and Finance Analytics

**Input**: Design documents from `/specs/008-wealth-and-finance-analytics/`
**Tests**: Focused handler/contract tests use the existing Node harness; client behavior is verified through deterministic helper/source checks and the production Vite build because the repository has no React component-test runner.

## Phase 1: Specify and baseline

- [x] T001 Confirm the spec, plan, data model, and WebSocket contract agree on the authenticated transport, tenant boundary, UTC buckets, and inclusive date semantics.
- [x] T002 [P] Add `/tests/wealth-and-finance-analytics.test.cjs` using the existing in-memory database/socket harness; never call the live Torn API.
- [x] T003 [P] Record baseline static build and synchronization/auth regression results before implementation.

## Phase 2: Net-worth transport and charts

- [x] T004 [P] Add `getNetworth` fixtures for tenant isolation, projection, finite normalization, deterministic ordering, empty data, invalid session, and safe database errors.
- [x] T005 [P] Add `lastNetworth` fixtures for allow-listed breakdown fields, invalid values, empty Stats, invalid session, and safe database errors.
- [x] T006 [P] Add `networthInsert` fixtures for invalid sessions, recent-snapshot throttling, API/DB failure, request serialization, and absence of raw errors/secrets.
- [x] T007 [US1] Harden `ws/wsGetNetworth.cjs`, `ws/wsLastNetworthStats.cjs`, and `ws/wsInsertNetworth.cjs` with shared auth/tenant helpers, safe envelopes, projections, and cleanup.
- [x] T008 [US1] Refactor `client/src/NetworthGraph.jsx` to validate/dedupe/sort snapshots, react to date filters, process replayed responses safely, and render explicit empty/error states.
- [x] T009 [US1] Refactor `client/src/NetworthPieChart.jsx` to validate breakdown values, handle errors/replays, avoid invalid totals, and keep refresh/interval cleanup bounded.

## Phase 3: Faction and gambling

- [x] T010 [P] Add deterministic source fixtures for faction logs 6738/6795, slot logs 8300/8301, poker codes, malformed rows, missing stores, and date ranges.
- [x] T011 [US2] Harden `client/src/FactionBalance.jsx` with safe IndexedDB reads, timestamp/value validation, stable date filtering, cancellation, and empty/error states.
- [x] T012 [US2] Harden `client/src/BetResultsGraph.jsx` with UTC day aggregation, finite amount validation, no locale-dependent keys, cancellation, and empty/error states.
- [x] T013 [US2] Harden `client/src/PokerBetWinGraph.jsx` with valid timestamp/value filtering, deterministic daily aggregation, date-range behavior, cancellation, and empty/error states.

## Phase 4: Income, costs, and bounty

- [x] T014 [P] Add deterministic fixtures for logs 4810, 9015, 1103/1104/1112/1113, and 6710 covering malformed values, duplicate days, empty stores, UTC buckets, and inclusive filtering.
- [x] T015 [US3] Harden `client/src/MoneyLogGraph.jsx` for safe reads, finite amounts, UTC buckets, date dependencies, and bounded loading/error state.
- [x] T016 [US3] Harden `client/src/MoneyGainedGraph.jsx` for safe reads, finite amounts, bucket/modal stability, inclusive filtering, and cleanup.
- [x] T017 [US3] Harden `client/src/CombinedCostsGraph.jsx` for safe concurrent reads, timestamp/value validation, filtered daily/weekly/monthly data, and explicit states.
- [x] T018 [US3] Harden `client/src/BountyRewardChart.jsx` for valid rows only, finite reward/count aggregation, range dependencies, and explicit states.

## Phase 5: Integration and security

- [x] T019 Verify `client/src/main.jsx` keeps lazy routes, component props, chart controls, and authenticated WebSocket message names unchanged.
- [x] T020 Assert focused responses contain no API keys, MongoDB IDs, raw internal messages, or client-supplied tenant identifiers.
- [x] T021 Review all nine chart modules for synchronous I/O, accidental new dependencies, stale effects, duplicate requests, and unhandled IndexedDB rejections.

## Phase 6: Verification

- [x] T022 Run `node --test tests/wealth-and-finance-analytics.test.cjs` and fix failures without weakening assertions.
- [x] T023 Run `node --test tests/torn-data-synchronization.test.cjs`, `npm run test:auth`, and `npm run test:bazaar`.
- [x] T024 Run `npm run build:static` and confirm all nine chart bundles compile.
- [x] T025 Run `git diff --check` and inspect final diff/status for generated files, credentials, raw errors, synchronous I/O, and dependency changes.
- [x] T026 Refresh native codebase-memory indexing, verify project status `ready`, and confirm nine chart plus three handler symbols remain discoverable.
- [x] T027 Validate quickstart commands, mark completed tasks, record verification, and update the Time Machine queue state.

## Verification record

- Focused wealth transport tests: `6/6` passed.
- Regression tests: synchronization `11/11`, authentication `23/23`, and bazaar `16/16` passed.
- Production build: `npm run build:static` passed with `411` modules transformed; all nine wealth chart bundles were emitted.
- Review: `git diff --check` passed; no generated build artifacts were left in the tracked diff, and the reviewed response paths do not expose credentials or raw internal errors.
- Native codebase memory: project `Volumes-WDBlack4TB-Code-tornnode` is `ready` at `4736` nodes and `6984` edges. The symbol search returned the nine chart definitions and three net-worth handler definitions.
- Quickstart commands and the no-live-Torn-API test boundary were checked against the recorded workflow.

## Dependencies

- T001–T003 precede implementation.
- T004–T007 establish server contracts before chart changes.
- T010–T013 and T014–T018 can proceed by independent chart groups after the contracts are fixed.
- T019–T027 require all targeted source changes.
