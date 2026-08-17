---

# Tasks: Item Catalog and Pricing

**Input**: Design documents from `specs/005-item-catalog-and-pricing/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/websocket-catalog.md`, `contracts/websocket-price.md`, and `quickstart.md`

**Testing policy**: Tests are included because the specification defines independent acceptance scenarios and measurable outcomes. Write the focused tests before the corresponding production changes, run them to demonstrate the missing behavior, then implement and rerun them. Credentialed browser tests remain environment-dependent; Node handler tests and the production build are deterministic gates.

**Format**: `[ID] [P?] [Story] Description`

- `[P]` means the task can run in parallel after its dependencies are satisfied.
- Story labels map to `spec.md`: `US1` browse/filter, `US2` local-first synchronization, `US3` price refresh, `US4` complete/reliable server catalog.
- Every task names the exact file or command surface it changes or validates.

## Phase 1: Setup and Test Fixtures

**Purpose**: Establish focused feature coverage without adding dependencies or changing the existing client/server architecture.

- [x] T001 [P] [US3] Create deterministic item, socket, MongoDB, Redis, and market-response fixtures in `tests/item-catalog-pricing.test.cjs`, reusing `tests/helpers/tornSyncTestHarness.cjs` where its fake interfaces are sufficient.
- [x] T002 [P] [US1] Extend `client/tests/autocomplete.spec.ts` with authenticated Item Prices assertions for name-prefix filtering, type filtering, no-results feedback, price visibility, and unchanged watch toggling; keep the test skipped when its existing authentication prerequisite is absent.
- [x] T003 [P] [US2] Record the local-first, ten-minute freshness, marker-after-commit, and credentialed-browser verification commands in `specs/005-item-catalog-and-pricing/quickstart.md` and confirm the root-only dependency installation rule.

---

## Phase 2: Foundational Validation Boundaries

**Purpose**: Lock shared validation and synchronization contracts before story-specific implementation.

- [x] T004 [US2] Write failing regression tests in `tests/item-catalog-pricing.test.cjs` or a deterministic source/build check for complete client catalog records, malformed/empty response retention, stale-marker behavior, and marker advancement only after a successful commit; do not weaken the existing last-known-good guarantees from `specs/003-torn-data-synchronization`.
- [x] T005 [US3] Write failing server tests in `tests/item-catalog-pricing.test.cjs` proving malformed identifiers, invalid supplied prices, missing market prices, missing target items, and persistence failures return `ok: false` without changing the previous durable price.
- [x] T006 [P] [US4] Write failing server tests in `tests/item-catalog-pricing.test.cjs` proving complete cache records are accepted, malformed identifiers/non-finite or negative prices are rejected, and empty/incomplete authoritative catalogs return the documented safe error.

**Checkpoint**: Focused tests describe the missing behavior and existing authentication/message names remain unchanged before production edits begin.

---

## Phase 3: User Story 1 - Browse and Filter the Item Catalog (Priority: P1) 🎯 MVP

**Goal**: Let an authenticated user search and filter the existing Item Prices catalog while preserving row identity and watch behavior.

**Independent Test**: Run the authenticated `client/tests/autocomplete.spec.ts` scenarios against the existing browser fixture; verify prefix search, unique type selection, no-results state, visible price, and watch/unwatch behavior.

### Tests for User Story 1

- [x] T007 [US1] Make the browser assertions in `client/tests/autocomplete.spec.ts` fail for missing/ambiguous no-results, type-filter, and price-refresh state selectors without changing the production authentication setup.

### Implementation for User Story 1

- [x] T008 [US1] Update `client/src/Autocomplete.jsx` to retain case-insensitive prefix filtering, type filtering, visible price rendering, safe no-results feedback, and existing watched-item row/checkbox interactions while adding a safe user-facing catalog/price failure state.
- [x] T009 [P] [US1] Update `client/src/ItemsTypeDropdown.jsx` to derive trimmed non-empty unique types in stable order from committed/local data, clear selections that no longer exist, and avoid exposing invalid incoming catalog records.

**Checkpoint**: The Item Prices view can be tested independently for discovery and watch preservation without changing WebSocket message names.

---

## Phase 4: User Story 2 - Use and Synchronize a Local Catalog (Priority: P1)

**Goal**: Use a fresh IndexedDB snapshot immediately, request only missing/stale data, and preserve the last valid snapshot on every failed replacement.

**Independent Test**: Seed a fresh/stale/missing local snapshot, open Item Prices, inspect WebSocket requests, simulate valid/invalid/empty/failed responses, and verify IndexedDB plus `itemsLastSync` behavior. Use the credentialed browser flow when available and the deterministic build/source checks otherwise.

### Tests for User Story 2

- [x] T010 [US2] Add failing client lifecycle scenarios to `client/tests/autocomplete.spec.ts` for fresh local data with no request, missing/stale data with one request, repeated activation during an in-flight request, cross-tab `itemsLastSync` reload, and preservation after invalid/empty response.

### Implementation for User Story 2

- [x] T011 [US2] Add shared `ITEMS_SYNC_MAX_AGE_MS`, marker parsing, staleness, and complete-record validation helpers to `client/src/syncItemsToIndexedDB.js`; make an empty catalog preserve the existing snapshot regardless of response shape.
- [x] T012 [US2] Preserve atomic IndexedDB replacement and marker-after-`tx.done` behavior in `client/src/syncItemsToIndexedDB.js`, ensuring malformed records, transaction failures, marker failures, and unavailable IndexedDB return a safe preserved result without clearing valid data.
- [x] T013 [US2] Remove the unconditional catalog request and five-minute interval from `client/src/main.jsx`, remove the competing catalog write path, and retain the central WebSocket bus for unrelated message types.
- [x] T014 [US2] Update `client/src/Autocomplete.jsx` to use the shared freshness policy, guard duplicate catalog requests until a response arrives, reload committed data on `itemsLastSync` storage events, and retain old rows when a refresh fails.
- [x] T015 [P] [US2] Ensure `client/src/ItemsTypeDropdown.jsx` refreshes from the committed/local catalog on synchronization notifications and does not replace valid type options from an invalid response.

**Checkpoint**: A fresh local catalog is network-independent, a stale/missing catalog refreshes once, and every failed replacement leaves the previous snapshot and marker intact.

---

## Phase 5: User Story 3 - Inspect and Refresh an Item Price (Priority: P1)

**Goal**: Show a valid stored price and safely refresh it from a supplied non-negative value or the authorized market source.

**Independent Test**: Invoke `updatePrice` with valid supplied and market-derived prices plus invalid/failing inputs; then verify visible/local updates occur only for valid success responses.

### Tests for User Story 3

- [x] T016 [US3] Complete the failing server contract tests in `tests/item-catalog-pricing.test.cjs` for successful supplied-price persistence, market-price fallback, RedisJSON update/TTL best effort, safe errors, and variation-log non-interference.
- [x] T017 [US3] Add failing client assertions in `client/tests/autocomplete.spec.ts` for short-lived refresh feedback, duplicate-click suppression, valid success price replacement, and unchanged price after a failure response.

### Implementation for User Story 3

- [x] T018 [US3] Refactor `ws/wsUpdatePrice.cjs` to strictly parse positive safe identifiers, distinguish omitted from invalid supplied prices, validate market results, require an existing MongoDB item, persist a finite non-negative price, update the complete RedisJSON record best-effort, and never send successful `null` or phantom item data.
- [x] T019 [US3] Add the generic safe price-update error to `utils/tornSyncHelpers.cjs` and ensure `ws/wsUpdatePrice.cjs` logs internal diagnostics server-side without exposing exception details, credentials, or session data in WebSocket responses.
- [x] T020 [US3] Update `client/src/UpdatePrice.jsx` to normalize identifier comparison, accept only finite non-negative successful prices, and rewrite IndexedDB only after a valid matching row update succeeds.
- [x] T021 [US3] Integrate `client/src/Autocomplete.jsx` refresh controls with the hardened response handling, preserving the existing two-second per-item duplicate guard and showing immediate in-progress/safe failure feedback without changing watch state.

**Checkpoint**: A valid price refresh updates MongoDB, the visible row, and the local catalog; all invalid/failing paths preserve the prior price.

---

## Phase 6: User Story 4 - Receive a Complete and Reliable Catalog (Priority: P2)

**Goal**: Serve a complete authenticated catalog from Redis when possible and use a validated authoritative fallback otherwise.

**Independent Test**: Run complete-cache, incomplete-cache, cache-failure, complete-Mongo, incomplete-Mongo, empty-Mongo, and unauthenticated handler cases from `tests/item-catalog-pricing.test.cjs`.

### Tests for User Story 4

- [x] T022 [US4] Add/finish failing integration assertions for cache-first reads, incomplete-cache fallback, authoritative validation, chunked Redis repopulation/expiry, safe unauthenticated responses, and absence of internal error details in `tests/item-catalog-pricing.test.cjs`.

### Implementation for User Story 4

- [x] T023 [US4] Harden `ws/wsGetAllTornItems.cjs` complete-record validation for positive safe identifiers, strings, finite non-negative prices, and non-empty authoritative catalogs while preserving RedisJSON `tornItems:v2:<id>` cache-first behavior and MongoDB fallback.
- [x] T024 [P] [US4] Preserve the existing cache-key/TTL contract in `utils/itemsCacheKey.cjs` and `utils/warmupItemsCache.cjs`; change only any validation or normalization needed so warmup cannot publish records rejected by `ws/wsGetAllTornItems.cjs`.
- [x] T025 [US4] Verify `routes/wsHandler.cjs` continues to dispatch `getAllTornItems` and `updatePrice` only through the existing authenticated `/ws` path, with no new public catalog or price route.

**Checkpoint**: Authenticated clients receive only complete item records, cache misses recover from MongoDB, and no private catalog/price details leak on failure.

---

## Phase 7: Polish, Verification, and Queue Completion

**Purpose**: Validate the integrated feature, refresh structural knowledge, and keep Time Machine metadata accurate.

- [x] T026 [P] Run `node --test tests/item-catalog-pricing.test.cjs tests/torn-data-synchronization.test.cjs` and correct every real failure without weakening assertions.
- [x] T027 [P] Run `npm run build` from the repository root and verify the generated client integrates the updated JSX/module contracts.
- [x] T028 [P] Run the authenticated Playwright command from `specs/005-item-catalog-and-pricing/quickstart.md` when the required test session is available; otherwise record the credential limitation and retain Node/build evidence.
- [x] T029 [P] Validate all feature artifacts under `specs/005-item-catalog-and-pricing/`, including required sections, contract consistency, absence of template placeholders, and all acceptance-checklist items.
- [x] T030 [P] Run `git diff --check`, inspect `git status --short`, and separate pre-existing changes from generated feature files and implementation files.
- [x] T031 Re-index `/Volumes/WDBlack4TB/Code/tornnode` with the existing `codebase-memory-mcp` workflow after verification and confirm the normalized project remains ready with targeted item-catalog symbols present.
- [x] T032 Update `.specify/extensions/time-machine/features-queue.yml` to `current_phase: implement` before implementation begins, then mark the feature `done`, set `completed_at`, and set `pushed` only after the implementation verification and explicit push decision.

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No production dependency; T001-T003 can run in parallel.
- **Foundational (Phase 2)**: Depends on fixtures and blocks story implementation; T004-T006 are test-first and can be developed in parallel where they touch isolated assertions.
- **US1 and US2 (Phases 3-4)**: Depend on the foundational client validation policy; tasks touching `Autocomplete.jsx` should be applied sequentially (T008, T014, T021).
- **US3 (Phase 5)**: T018 depends on T016 failing assertions; T020-T021 depend on the server response contract and can follow T018-T019.
- **US4 (Phase 6)**: T023 depends on T022 failing assertions; T024 and T025 can proceed after the contract is fixed.
- **Polish (Phase 7)**: Depends on all desired story implementations; queue completion is serialized after tests/build/artifact checks.

### Within Each User Story

1. Write the focused failing test.
2. Run it and confirm the failure is caused by missing feature behavior.
3. Implement the smallest change that satisfies the contract.
4. Rerun the story test and verify the independent acceptance scenarios.
5. Preserve unrelated authentication, routing, and watched-item behavior.

### Parallel Opportunities

- Fixture/documentation setup tasks T001-T003 are independent.
- Server catalog tests and price tests can be prepared independently in the shared test file before implementation.
- `ItemsTypeDropdown.jsx` and server validation tasks can run in parallel once their contracts are stable.
- Final test/build/artifact checks T026-T030 can run in parallel, but T031 and T032 must follow the final verified state.

## Implementation Strategy

1. Finish and run the failing validation tests.
2. Implement the local-first client policy and safe UI states.
3. Implement strict server price handling and complete catalog validation.
4. Run focused tests, build, optional authenticated browser checks, artifact validation, and `git diff --check`.
5. Re-index codebase-memory and verify the changed symbol slice.
6. Mark the queue feature implemented only after the verification evidence is real, then ask whether to push the branch before continuing to the next queue feature.
