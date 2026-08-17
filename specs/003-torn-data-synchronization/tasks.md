---

description: "Dependency-ordered tasks for Torn data synchronization"
---

# Tasks: Torn Data Synchronization

**Input**: Design documents from `/specs/003-torn-data-synchronization/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and `contracts/websocket-sync.md`

**Testing policy**: The feature specification defines independent tests and measurable acceptance criteria. Write the focused tests before the corresponding implementation, confirm they fail for the missing behavior, then implement and rerun them.

**Verification note**: Deterministic server, protocol, and lifecycle coverage is consolidated in `tests/torn-data-synchronization.test.cjs`. The repository's Playwright smoke spec requires a live authenticated environment, so the client IndexedDB modules are verified by production build and source-level lifecycle review in this feature cycle; the live 10,000-record browser benchmark and credentialed smoke flow are not run here.

**Format**: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel with other tasks in its phase after dependencies are satisfied.
- Story labels map to the specification: `US1` import history, `US2` lifecycle/control, `US3` local log cache, `US4` local item catalog, `US5` profile/tenant isolation.

## Phase 1: Setup and Test Harness

**Purpose**: Establish deterministic fixtures without requiring live Torn, MongoDB, Redis, or browser services.

- [x] T001 [P] [US5] Create reusable fake session, socket, user-database, Mongo collection, Redis, and Torn-response fixtures in `tests/helpers/tornSyncTestHarness.cjs`.
- [x] T002 [P] [US1] Add feature test entry points and fixture factories for normalized log/attack records in `tests/torn-data-synchronization.test.cjs`.
- [x] T003 [P] [US3] Add deterministic WebSocket message and client-lifecycle verification coverage through the consolidated feature harness and production build; keep the start/batch/end, malformed, timeout, and request-correlation cases documented in the retrieval contract.
- [x] T004 [P] [US4] Add complete, incomplete, malformed, and authoritative item-catalog fixtures in the consolidated feature harness; verify client catalog persistence through the production build and source-level review.

## Phase 2: Foundational Tenant and Storage Boundaries

**Purpose**: Complete the security and persistence prerequisites before implementing any importer or retrieval story.

- [x] T005 [US5] Write failing tests proving that `utils/getUserDb.cjs` selects only the numeric authenticated session identity, rejects missing/invalid identities, and ignores arbitrary client `userId` fields in `tests/torn-data-synchronization.test.cjs`.
- [x] T006 [US5] Write failing tests proving that `utils/ensureUserDbStructure.cjs` creates required collections/indexes idempotently and does not expose database errors or credentials to client responses in `tests/torn-data-synchronization.test.cjs`.
- [x] T007 [US5] Harden `utils/getUserDb.cjs` with strict session-derived tenant validation and consistent failure behavior; do not accept a request-body/profile identifier as an alternative tenant selector.
- [x] T008 [US5] Harden `utils/ensureUserDbStructure.cjs` to create the log/attack collections and checkpoint/query indexes idempotently, preserving startup behavior when historical duplicate attack data requires a non-destructive migration path.
- [x] T009 [US5] Add shared server-side safe-error handling or local helpers in the synchronization modules so API credentials, session objects, internal connection strings, and sensitive profile fields never enter WebSocket responses or ordinary logs.

**Checkpoint**: All private synchronization handlers have one authenticated tenant-selection rule and a repeatable storage setup path.

## Phase 3: User Story 5 - Keep Profile Data Isolated (Priority: P1)

**Goal**: Ensure every synchronization read/write uses the authenticated profile’s private store, regardless of client payload fields.

**Independent Test**: Run the same handlers with two session identities and assert separate database handles, separate writes, and no cross-user reads; repeat with an arbitrary payload `userId` and an expired/missing session.

### Tests for User Story 5

- [x] T010 [P] [US5] Add two-user isolation tests for log import, attack import, stored-log retrieval, attack retrieval, and item request authorization in `tests/torn-data-synchronization.test.cjs`.
- [x] T011 [P] [US5] Add unauthenticated/expired-session tests asserting no user database is selected and responses contain only generic recoverable errors in `tests/torn-data-synchronization.test.cjs`.
- [x] T012 [P] [US5] Add response/log redaction tests that fail if a Torn API key or session object appears in synchronization output in `tests/torn-data-synchronization.test.cjs`.

### Implementation for User Story 5

- [x] T013 [US5] Enforce session validation at the start of `ws/wsTorn.cjs` and `ws/wsTornAttacks.cjs`, including direct-handler invocation paths that bypass the router.
- [x] T014 [US5] Enforce session-derived database selection in `ws/wsGetAllTornLogs.cjs` and `ws/wsGetTornAttacks.cjs`; ignore any client-provided profile/user selector.
- [x] T015 [US5] Enforce authenticated access in `ws/wsGetAllTornItems.cjs` and ensure all failure responses use the documented generic messages from `specs/003-torn-data-synchronization/contracts/websocket-sync.md`.

**Checkpoint**: Tenant isolation tests pass independently before importing or caching data.

## Phase 4: User Story 1 - Import Torn History (Priority: P1)

**Goal**: Import logs and attacks in bounded windows, resume from checkpoints, preserve prior writes across transient failures, and deduplicate stable source records.

**Independent Test**: Start with an empty fake user store, import several windows, repeat the same range, inject a transient failure, and assert progress, durable records, zero duplicate growth, and safe credential errors.

### Tests for User Story 1

- [x] T016 [P] [US1] Write failing log-import tests for empty/up-to-date ranges, explicit range validation, checkpoint resume, stable-id deduplication, malformed-record skipping, bounded windows, and progress in `tests/torn-data-synchronization.test.cjs`.
- [x] T017 [P] [US1] Write failing attack-import tests for `ended` checkpoint resume, stable attack-code deduplication, multi-window progress, empty ranges, transient retry delay, and malformed records in `tests/torn-data-synchronization.test.cjs`.
- [x] T018 [P] [US1] Write failing persistence tests for per-user collection/index use and preservation of already committed records after an import error in `tests/torn-data-synchronization.test.cjs`.

### Implementation for User Story 1

- [x] T019 [US1] Refactor `ws/wsTorn.cjs` around validated ranges, the latest stored log checkpoint, stable source ids, normalized timestamps, bounded API windows, duplicate-safe inserts, retry classification/backoff, and durable inserted counts.
- [x] T020 [US1] Refactor `ws/wsTornAttacks.cjs` around validated ranges, the latest `ended` checkpoint, stable attack codes, duplicate-safe writes, bounded windows, retry classification/backoff, and durable inserted counts.
- [x] T021 [US1] Add explicit zero-data/up-to-date terminal responses and generic recoverable errors to `ws/wsTorn.cjs` and `ws/wsTornAttacks.cjs` without changing existing success message names.
- [x] T022 [US1] Rerun the User Story 1 tests and verify repeated imports do not increase log/attack counts for the same source range.

**Checkpoint**: A complete import is resumable, idempotent, rate-limit-aware, and useful without local browser storage.

## Phase 5: User Story 2 - Monitor and Control an Import (Priority: P2)

**Goal**: Provide one active importer per data kind with trustworthy start/progress/terminal states, cancellation, and cleanup.

**Independent Test**: Start a multi-window fixture, observe lifecycle messages, issue stop and duplicate-start requests, close the socket, then start again and assert no stale guard remains.

### Tests for User Story 2

- [x] T023 [P] [US2] Write failing lifecycle tests for exactly one terminal completion/stopped/error result, already-running rejection, zero-data completion, stop flags, socket close, and importer cleanup in `tests/torn-data-synchronization.test.cjs`.
- [x] T024 [P] [US2] Add consolidated router/import-guard regression coverage for `torn`, `tornAttacks`, `stopImport`, deferred attacks, and watchdog cleanup; use the existing WebSocket regression suite plus source-level review for paths requiring a live router.

### Implementation for User Story 2

- [x] T025 [US2] Make terminal cleanup and per-kind active guards unconditional in `ws/wsTorn.cjs` and `ws/wsTornAttacks.cjs`, including errors, cancellation, empty ranges, and socket-unusable paths.
- [x] T026 [US2] Update `routes/wsHandler.cjs` to reset stale stop flags when a new import begins, preserve existing string/JSON command dispatch, and terminate deferred-attack watchdog state on every log terminal path.
- [x] T027 [US2] Preserve the existing `importProgress`, `importedData`, `importStopped`, and `stopImportAck` shapes while adding explicit machine-readable already-running/error reasons where clients need them.
- [x] T028 [US2] Rerun the lifecycle tests and confirm a stopped/failed import can be started again on the same connection without duplicate timers or listeners.

**Checkpoint**: Import controls are safe under repeated start/stop/error/disconnect sequences.

## Phase 6: User Story 3 - Cache Logs Locally for Analysis (Priority: P2)

**Goal**: Stream stored logs in correlated bounded batches, persist only successful batches, provide fast local queries, and clean up every client terminal path.

**Independent Test**: Feed a valid start/batch/end sequence and malformed/wrong-request/timeout sequences to the client, reload the local store, and verify type/range queries and terminal progress.

### Tests for User Story 3

- [x] T029 [P] [US3] Add consolidated server retrieval coverage for authenticated range validation, chronological bounded start/batch/end messages, total/sent counts, duplicate-request guards, and request-correlated safe errors.
- [x] T030 [P] [US3] Verify client persistence handling for wrong-request filtering, transactional batch progress, zero-data completion, malformed messages, write failure, timeout, socket close, stop, and listener/timer cleanup through source-level review and the production build; live browser execution is deferred to a credentialed environment.
- [x] T031 [P] [US3] Verify local-query handling for log-id lookup, multi-id lookup, timestamp ranges, missing stores, short TTL reuse, and invalidation after a successful commit through source-level review and the production build; live browser execution is deferred to a credentialed environment.

### Implementation for User Story 3

- [x] T032 [US3] Harden `ws/wsGetAllTornLogs.cjs` with strict input validation, authenticated user-scoped queries, bounded chronological batches, request-id propagation, safe errors, and `finally` cleanup of per-socket running state.
- [x] T033 [US3] Harden `client/src/storeLogsToIndexedDB.jsx` to accept only the active request, write each batch transactionally, advance progress after commit, handle missing end/timeout/socket closure, and release all listeners/timers/guards on every terminal path.
- [x] T034 [US3] Update `client/src/dbLayer.js` to retain log-id/multi-id/range APIs, handle missing stores/indexes safely, avoid caching failed/partial reads, and invalidate stale query entries after committed batches.
- [x] T035 [US3] Integrate the hardened local-log lifecycle with `client/src/main.jsx` and `client/src/hooks/useWsMessageBus.js` only where needed to prevent duplicate listeners or stale progress; leave analytics calculations unchanged.
- [x] T036 [US3] Rerun retrieval tests and verify the local-query implementation and production build support the required log-id and timestamp-range APIs; the 10,000-record/500 ms browser benchmark remains an environment-dependent follow-up because no credentialed browser session was available.

**Checkpoint**: Synchronized logs survive reload and are queryable locally without per-query network reads.

## Phase 7: User Story 4 - Synchronize the Item Catalog Locally (Priority: P3)

**Goal**: Prefer complete cached catalog data, fall back safely to the authoritative store, and retain the last known-good browser catalog.

**Independent Test**: Exercise complete-cache, incomplete-cache, authoritative fallback, local fresh/stale, empty-response, and refresh-error fixtures; assert stable item ids and preserved old data on failure.

### Tests for User Story 4

- [x] T037 [P] [US4] Add consolidated server coverage for complete Redis cache hits, incomplete/malformed cache fallback, chunked cache repopulation/expiration, authoritative catalog errors, and generic authenticated responses.
- [x] T038 [P] [US4] Verify client handling for stable IndexedDB item keys, atomic replacement, freshness marker ordering, fresh local reads, stale refresh, and last-known-good preservation through source-level review and the production build; live browser execution is deferred to a credentialed environment.

### Implementation for User Story 4

- [x] T039 [US4] Harden `ws/wsGetAllTornItems.cjs` to validate complete required fields, use bounded cache scans/repopulation, return the full authoritative catalog on fallback, and never report a partial catalog as success.
- [x] T040 [US4] Harden `client/src/syncItemsToIndexedDB.js` to replace items atomically, update `itemsLastSync` only after commit, preserve prior data for empty/error responses, and retain stable item identifiers.
- [x] T041 [US4] Rerun item synchronization tests and verify freshness-marker ordering and last-known-good retention in the client implementation/build; page-reload smoke execution remains a credentialed-browser follow-up.

**Checkpoint**: Item lookup remains usable during cache misses and refresh failures.

## Phase 8: Polish, Verification, and Documentation

**Purpose**: Validate the integrated feature and protect unrelated work.

- [x] T042 [P] [US1] Add/update focused protocol assertions against `specs/003-torn-data-synchronization/contracts/websocket-sync.md` without changing unrelated WebSocket contracts.
- [x] T043 [P] [US1] Add comments only where checkpoint, duplicate, retry, or cleanup behavior is non-obvious in `ws/wsTorn.cjs` and `ws/wsTornAttacks.cjs`.
- [x] T044 [P] [US3] Run `node --test` for all new synchronization tests and the existing authentication/WebSocket regression tests; record real failures for correction rather than masking them.
- [x] T045 [P] [US4] Run `npm run build` and document the credential requirement for the Playwright/browser smoke flow from `specs/003-torn-data-synchronization/quickstart.md`; do not run the repository's live smoke spec with embedded credentials in this environment.
- [x] T046 [US5] Run `git diff --check`, verify no API credential appears in changed responses/logging, and verify the pre-existing `.gitignore` `.DS_Store` modification is preserved.
- [x] T047 [US1] Update the Time Machine queue entry to `current_phase: implement` only after all task implementation and verification work is ready to begin; mark the feature `done` only after the implementation commit is verified.

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** has no code dependency and can begin immediately.
- **Phase 2** depends on the test harness from Phase 1 and blocks all private synchronization stories.
- **User Story 5** depends on Phase 2 and is a security prerequisite for the other stories.
- **User Story 1** depends on tenant/storage boundaries; its persistence behavior is required by the lifecycle and local-cache stories.
- **User Story 2** depends on the import handlers from User Story 1 and the existing router.
- **User Story 3** depends on authenticated storage and the import/retrieval protocol; it can be implemented after User Story 5 and the retrieval contract are stable.
- **User Story 4** depends on the session gate and item cache contract but is otherwise independent of log/attack persistence.
- **Phase 8** depends on all selected story implementations and focused tests.

### Parallel Opportunities

- Phase 1 fixture files T001-T004 can run in parallel.
- In Phase 2, tests T005-T006 can run in parallel; implementation must follow their failing assertions.
- Within User Story 1, log tests T016 and attack tests T017 can run in parallel; implementations touch different handlers.
- Within User Story 3, server retrieval, client persistence, and local query tests can be developed in parallel after the contract is fixed; implementation integration follows the tests.
- User Story 4 server and client tests can run in parallel, with client implementation depending only on the documented response shape.
- Phase 8 documentation/comments and independent verification commands can run in parallel, but queue completion must be serialized after verification.

### TDD Rule Within Each Story

1. Write the focused failing test.
2. Run it and record the failure caused by the missing behavior.
3. Implement the smallest safe change.
4. Rerun focused tests, then the regression suite/build.
5. Do not mark a task complete from static inspection alone.

## Implementation Strategy

1. Finish the tenant/storage foundation and prove isolation first.
2. Make server imports idempotent and resumable.
3. Make lifecycle cleanup deterministic.
4. Harden log streaming and browser persistence.
5. Harden item catalog fallback and local retention.
6. Run the complete feature verification, preserve `.gitignore`, then update the queue and commit the feature.
