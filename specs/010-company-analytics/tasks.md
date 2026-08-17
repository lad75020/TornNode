# Tasks: Company Analytics

**Input**: Design documents from `/specs/010-company-analytics/`
**Prerequisites**: `plan.md`, `research.md`, `data-model.md`, `contracts/company-analytics.md`

**Tests**: Add focused regression coverage before changing the corresponding handlers where practical. Preserve the existing Node.js built-in test runner and existing session-identity coverage.

## Phase 1: Setup and shared normalization

- [x] T001 Inspect the existing company WebSocket handlers, chart components, message-bus dispatch, and session-identity tests to confirm the current payload boundaries before implementation.
- [x] T002 Add focused backend regression fixtures and test helpers in `tests/ws-company-analytics.test.cjs` for authenticated sessions, unauthorized requests, mixed seconds/milliseconds timestamps, legacy stock payload shapes, invalid numeric values, and safe error responses.
- [x] T003 Implement small shared company analytics normalization helpers in `utils/companyAnalytics.cjs` for finite-number validation, epoch-to-millisecond conversion, canonical `{ t, v, p? }` points, stable sorting, and bounded history results.
- [x] T004 Add unit assertions in `tests/ws-company-analytics.test.cjs` for `utils/companyAnalytics.cjs`, including empty history success, reversed ranges, invalid timestamps/values, and preservation of valid zero values.

## Phase 2: User Story 1 — current company snapshots

- [x] T005 [US1] Extend `tests/ws-company-analytics.test.cjs` to cover current stock, profile, and details responses for the requesting session database, including unauthorized and upstream-error cases that never expose API keys or raw exception text.
- [x] T006 [US1] Harden `ws/wsCompanyStock.cjs` so it preserves session/API-key and per-user snapshot reuse while returning bounded, safe error envelopes and finite snapshot values.
- [x] T007 [US1] Harden `ws/wsCompanyProfile.cjs` and `ws/wsCompanyDetails.cjs` with the same safe error, finite-value, and session-isolation behavior without changing their existing WebSocket message types.
- [x] T008 [US1] Update `client/src/CompanyStockChart.jsx`, `client/src/CompanyProfileChart.jsx`, and `client/src/CompanyDetailsHistoryChart.jsx` to handle loading, empty, malformed, and safe error responses without rendering raw errors or coercing invalid values to zero.
- [x] T009 [US1] Verify `client/src/main.jsx` chart registration and `client/src/hooks/useWsMessageBus.js` dispatch remain compatible with all current company snapshot message types.

## Phase 3: User Story 2 — company history charts

- [x] T010 [US2] Add backend regression cases in `tests/ws-company-analytics.test.cjs` for stock/profile/details history across seconds and milliseconds timestamps, ascending and reversed ranges, legacy `stock`/`stocks` shapes, invalid values, duplicate timestamps, and bounded output.
- [x] T011 [US2] Refactor `ws/wsGetCompanyStockHistory.cjs` to use the shared normalization helpers, omit invalid points, preserve valid zeroes, normalize timestamps to milliseconds, sort deterministically, enforce range/limit bounds, and return safe errors.
- [x] T012 [US2] Refactor `ws/wsGetCompanyProfileHistory.cjs` to use canonical finite series normalization, preserve optional metadata, handle empty history as success, and return safe errors without leaking upstream details.
- [x] T013 [US2] Refactor `ws/wsGetCompanyDetailsHistory.cjs` to use canonical finite series normalization, support mixed timestamp units and reversed ranges, omit invalid values, and return safe errors.
- [x] T014 [US2] Update `client/src/CompanyStockHistoryChart.jsx` with request fingerprints, stale-response guards, explicit loading/empty/error states, bounded canonical series handling, and stable time-axis rendering.
- [x] T015 [US2] Update `client/src/CompanyProfileChart.jsx` and `client/src/CompanyDetailsHistoryChart.jsx` with canonical history normalization, stale-response guards, loading/empty/error states, and safe finite-value rendering.
- [x] T016 [US2] Preserve the existing message-bus contract in `client/src/hooks/useWsMessageBus.js` while ensuring malformed JSON, unknown messages, and out-of-order company history responses cannot corrupt chart state.

## Phase 4: User Story 3 — company training ranges

- [x] T017 [US3] Add backend regression cases in `tests/ws-company-analytics.test.cjs` for valid training ranges, invalid/non-numeric ranges, reversed ranges, unauthorized sessions, empty aggregates, and session-specific database reads.
- [x] T018 [US3] Harden `ws/wsCompanyTrainRange.cjs` with explicit session/API-key authorization, bounded validated ranges, safe error envelopes, and preserved UTC daily aggregation semantics.
- [x] T019 [US3] Update `client/src/WorkStatsGraph.jsx` only where needed to ignore malformed/stale training-range responses, show safe empty/error states, and preserve its existing cancellation, retry, and cache behavior.

## Phase 5: User Story 4 — privacy and resilience integration

- [x] T020 [US4] Expand `tests/ws-company-analytics.test.cjs` to verify two sessions cannot read each other’s snapshots/history/training data and that unauthorized requests do not reach the Torn API or user database.
- [x] T021 [US4] Add out-of-order and malformed-response coverage for the company chart request lifecycle, using deterministic request identifiers/fingerprints and asserting only the latest request updates state.
- [x] T022 [US4] Review all changed company handlers and charts for secret/error leakage, unbounded arrays, unsafe `Number(...) || 0` coercion, raw `Error` rendering, and accidental new dependencies; fix any findings.

## Phase 6: Documentation and verification

- [x] T023 Update `specs/010-company-analytics/contracts/company-analytics.md`, `data-model.md`, and `quickstart.md` if implementation details or verified commands differ from the plan.
- [x] T024 Run focused company analytics tests, existing company session-identity tests, and syntax checks for every changed CommonJS/JSX module; record real outputs in this file.
- [x] T025 Run the existing auth and bazaar regression suites, `npm run build:static`, and `git diff --check`; record the real results in this file.
- [x] T026 Re-index `/Volumes/WDBlack4TB/Code/tornnode` with native `codebase-memory-mcp`, verify the index is ready, and confirm all company analytics handlers/helpers/charts are discoverable.
- [x] T027 Mark the Time Machine queue entry complete only after implementation and verification pass, then commit the feature on `feature/time-machine-company-analytics` without pushing.

## Verification record

- Focused company analytics plus session-identity tests: **15 passed, 0 failed** (`node --test tests/ws-company-analytics.test.cjs tests/ws-company-session-identity.test.cjs`).
- Syntax checks for changed CommonJS modules and `git diff --check`: **passed**.
- Auth regression: **23 passed, 0 failed** (`npm run test:auth`).
- Bazaar regression: **16 passed, 0 failed** (`npm run test:bazaar`).
- Torn synchronization regression: **11 passed, 0 failed** (`node --test tests/torn-data-synchronization.test.cjs`).
- Static production build: **passed** (`npm run build:static`, Vite 8.2.1, 413 modules transformed).
- Native codebase-memory index: **ready**, 5,185 nodes and 7,620 edges; company handlers, helper, training range, and details chart are discoverable.
- Queue entry is complete with `pushed: false`; the feature commit follows this verification record on `feature/time-machine-company-analytics`.
