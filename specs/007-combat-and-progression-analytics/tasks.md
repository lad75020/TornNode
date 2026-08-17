# Tasks: Combat and Progression Analytics

**Input**: Design documents from `/specs/007-combat-and-progression-analytics/`

**Prerequisites**: `/specs/007-combat-and-progression-analytics/plan.md`, `/specs/007-combat-and-progression-analytics/spec.md`, `/specs/007-combat-and-progression-analytics/research.md`, `/specs/007-combat-and-progression-analytics/data-model.md`, `/specs/007-combat-and-progression-analytics/contracts/websocket.md`

**Tests**: Focused server-contract tests are required by the specification. Client behavior is verified through deterministic source/data helpers where practical and the production Vite build because this repository has no React component-test runner.

## Phase 1: Setup and baseline

- [x] T001 Confirm `/specs/007-combat-and-progression-analytics/spec.md`, `/specs/007-combat-and-progression-analytics/plan.md`, and `/specs/007-combat-and-progression-analytics/contracts/websocket.md` agree on the existing authenticated `/ws` transport and inclusive date semantics.
- [x] T002 [P] Add the focused Node test harness entry point in `/tests/combat-progression-analytics.test.cjs` using the existing `/tests/helpers/tornSyncTestHarness.cjs` patterns; do not call the live Torn API.
- [x] T003 [P] Record a baseline static build and focused existing synchronization test result for comparison before modifying the analytics handlers.

---

## Phase 2: Foundational server and data-boundary work

**Purpose**: Establish safe session, range, payload, and resource handling before chart-specific changes.

- [x] T004 [P] [US4] Add authenticated tenant-isolation and invalid-session/range cases for `/ws/wsGetTornAttacks.cjs` in `/tests/combat-progression-analytics.test.cjs`.
- [x] T005 [P] [US4] Add racing-skill handler fixtures for valid projections, empty data, invalid session, database failure, and cursor cleanup in `/tests/combat-progression-analytics.test.cjs`.
- [x] T006 [P] [US4] Add stats dry-run and normal-import fixtures that preserve request correlation/recent-snapshot behavior while asserting safe failure payloads in `/tests/combat-progression-analytics.test.cjs`.
- [x] T007 [US4] Define the accepted success/error envelopes and allow-listed response fields from `/specs/007-combat-and-progression-analytics/contracts/websocket.md` as assertions in `/tests/combat-progression-analytics.test.cjs`.

**Checkpoint**: Focused tests exist and fail for each newly required boundary behavior before implementation changes.

---

## Phase 3: User Story 1 - Combat outcomes and skill progression (Priority: P1) 🎯 MVP

**Goal**: Render valid attack, gym, and crime observations with safe missing-data behavior and reactive inclusive date filtering.

**Independent Test**: Seed valid/malformed `LogsDB` records and attack WebSocket responses, then verify the three chart modules build only valid in-range datasets through the production build and deterministic handler tests.

### Tests for User Story 1

- [x] T008 [P] [US1] Add attack aggregation assertions for wins, losses, attacks, defends, chronological range, and duplicate-day behavior in `/tests/combat-progression-analytics.test.cjs`.
- [x] T009 [P] [US1] Add source-contract fixtures covering malformed gym/crime records and missing `LogsDB` stores/indexes in `/tests/combat-progression-analytics.test.cjs` or adjacent deterministic test helpers.

### Implementation for User Story 1

- [x] T010 [US1] Fix cache initialization, manual refresh, duplicate-day handling, response validation, and async cleanup in `/client/src/AttacksStatsGraph.jsx` without changing its existing props or `getTornAttacks` request type.
- [x] T011 [US1] Make local gym reads in `/client/src/GymGraph.jsx` tolerate missing stores/indexes and failed transactions, read independent log identifiers concurrently where safe, validate timestamps/values, and rebuild when `dateFrom` or `dateTo` changes.
- [x] T012 [US1] Make crime reads in `/client/src/CrimeScatterGraph.jsx` validate timestamps, crime labels, and skill values, handle IndexedDB failures with an explicit empty state, and keep series colors stable across rebuilds.
- [x] T013 [US1] Verify `/client/src/main.jsx` continues to lazy-load and route Attacks Stats, Battle Stats, and Crime Skills with the existing WebSocket/date/theme prop interfaces; change `/client/src/main.jsx` only if a verified integration defect is found.

**Checkpoint**: User Story 1 charts render valid data, exclude malformed records, react to date changes, and build successfully without changing dashboard navigation.

---

## Phase 4: User Story 2 - Work-stat growth (Priority: P1)

**Goal**: Provide deterministic cached/live cumulative work statistics with bounded retries and safe empty/error states.

**Independent Test**: Supply cached rows and replayed/malformed `companyTrainRange` messages, then verify one row per date, correct absolute/incremental accumulation, and bounded request/timer behavior.

### Tests for User Story 2

- [x] T014 [P] [US2] Add deterministic work-stat fixtures for incremental rows, absolute snapshots, duplicate dates, out-of-order rows, malformed payloads, and empty responses in `/tests/combat-progression-analytics.test.cjs` or a pure helper extracted from `/client/src/WorkStatsGraph.jsx`.

### Implementation for User Story 2

- [x] T015 [US2] Refactor `/client/src/WorkStatsGraph.jsx` data normalization and merge flow so valid cache data renders promptly, invalid rows are ignored, duplicate dates replace deterministically, and absolute snapshots reset the baseline.
- [x] T016 [US2] Update `/client/src/WorkStatsGraph.jsx` to apply inclusive date filtering consistently, avoid redundant fetches on date-only changes, expose explicit empty/error states, cap retries, and clear timers/async work on cleanup.

**Checkpoint**: Work statistics remain usable from cache during live refresh and do not create duplicate records or unbounded retries.

---

## Phase 5: User Story 3 - Racing progression (Priority: P1)

**Goal**: Display validated racing position aggregates and racing-skill snapshots from all relevant authenticated messages.

**Independent Test**: Seed valid/invalid position logs and deliver multiple racing-skill/replayed messages, then verify day/week/month aggregates, date filtering before aggregation, chronological skill points, and safe empty behavior.

### Tests for User Story 3

- [x] T017 [P] [US3] Add racing-position input/aggregation fixtures for invalid positions, invalid timestamps, date filtering, UTC Monday week buckets, monthly buckets, and counts in `/tests/combat-progression-analytics.test.cjs` or deterministic helpers.
- [x] T018 [P] [US3] Add racing-skill response fixtures for multiple relevant messages, unrelated messages, duplicate dates, malformed dates/values, and empty data in `/tests/combat-progression-analytics.test.cjs`.

### Implementation for User Story 3

- [x] T019 [US3] Harden `/client/src/RacingPositionGraph.jsx` validation, cancellation, date filtering, memo dependencies, and day/week/month aggregation while preserving its existing chart controls and labels.
- [x] T020 [US3] Update `/client/src/RacingSkillGraph.jsx` to process every unprocessed relevant payload, validate dates/values, deduplicate snapshots, report loading/empty states, and preserve the existing `racingskill` request and chart props.

**Checkpoint**: Racing charts remain correct when messages are interleaved/replayed and when the user changes aggregation or date context.

---

## Phase 6: User Story 4 - Reliable authenticated analytics transport (Priority: P2)

**Goal**: Keep server responses tenant-scoped, safe, serializable, and resource-clean while preserving scheduled and dry-run behavior.

### Implementation for User Story 4

- [x] T021 [US4] Harden `/ws/wsRacingSkill.cjs` with `getAuthenticatedSession`, safe `sendJson`, allow-listed projection/normalization, chronological ordering, cursor cleanup, and generic client errors with server-side logging.
- [x] T022 [US4] Harden `/ws/wsStats.cjs` session/API-key validation and error handling while preserving the normal `statsInsert` shape, 12-hour recent-snapshot throttle, `TORN_API_URL` override, and `wsStatsTestResult` request correlation.
- [x] T023 [US4] Review `/ws/wsGetTornAttacks.cjs` against `/specs/007-combat-and-progression-analytics/contracts/websocket.md`; retain its tenant-scoped projected cursor and safe range/error behavior, adding only verified cleanup/validation fixes.
- [x] T024 [US4] Complete the server assertions in `/tests/combat-progression-analytics.test.cjs` and ensure no response contains API keys, database identifiers, raw stack traces, or client-supplied tenant identifiers.

**Checkpoint**: All four user stories are independently testable and the authenticated transport contract remains compatible with `/routes/wsHandler.cjs`.

---

## Phase 7: Polish and verification

- [x] T025 [P] Run `node --test /tests/combat-progression-analytics.test.cjs` and fix all failures without weakening assertions.
- [x] T026 [P] Run `node --test /tests/torn-data-synchronization.test.cjs` and the relevant authentication/WebSocket regression tests from `/package.json`.
- [x] T027 [P] Run `npm run build:static` and verify the generated client bundle succeeds with no new compile errors.
- [x] T028 [P] Run `git diff --check` and inspect the final diff for accidental generated files, credentials, raw internal errors, synchronous I/O, or dependency changes.
- [x] T029 Refresh the repository with native `codebase-memory-mcp` indexing, verify the index status is `ready`, and confirm the six chart and three handler symbols remain discoverable.
- [x] T030 Validate `/specs/007-combat-and-progression-analytics/quickstart.md`, update completed task checkboxes, and record test/build results in the Time Machine completion state.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; establishes the test entry point and baseline.
- **Foundational (Phase 2)**: Depends on the design documents and blocks implementation so boundary behavior is explicit.
- **User Story 1 (Phase 3)**: Depends on Phase 2; is the MVP chart slice.
- **User Story 2 (Phase 4)**: Depends on Phase 2 and can proceed independently of Story 1 except for shared WebSocket message conventions.
- **User Story 3 (Phase 5)**: Depends on Phase 2 and can proceed independently of Stories 1 and 2.
- **User Story 4 (Phase 6)**: Depends on the focused tests and is completed before final regression verification.
- **Polish (Phase 7)**: Depends on all desired stories being implemented.

### Parallel Opportunities

- T004–T006 can be written in parallel because they cover separate server handlers.
- T010–T012 can be implemented in parallel because they touch separate client modules.
- T015–T016 are sequential within `WorkStatsGraph`.
- T019–T020 can be implemented in parallel because they touch separate racing modules.
- T025–T028 can run in parallel after implementation, subject to build/test resource limits.

### Within Each User Story

- Tests are written first and must fail for the new behavior before implementation.
- Boundary normalization precedes chart state updates.
- Server session/range validation precedes database/API access.
- Resource cleanup and cancellation are verified before the story checkpoint.

## Implementation Strategy

1. Establish deterministic server tests and contracts.
2. Deliver the combat/chart MVP with no transport changes.
3. Harden work and racing client processing independently.
4. Finish server handlers and security/error assertions.
5. Run focused tests, regressions, build, diff checks, and codebase-memory re-indexing before the Time Machine satisfaction gate.

## Verification record

- Focused analytics tests: `7/7` passing (`node --test tests/combat-progression-analytics.test.cjs`).
- Synchronization regression tests: `11/11` passing (`node --test tests/torn-data-synchronization.test.cjs`).
- Authentication regression tests: `23/23` passing (`npm run test:auth`).
- Bazaar regression tests: `16/16` passing (`npm run test:bazaar`).
- Static production build: passing with Vite `8.2.1` and `410` modules transformed.
- Native codebase-memory index: project `Volumes-WDBlack4TB-Code-tornnode`, status `ready`, `4,620` nodes, `6,783` edges.
- `git diff --check`: passing; no generated build files or dependency changes are present in the working tree.
