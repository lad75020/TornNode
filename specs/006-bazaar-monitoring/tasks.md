---

description: "Actionable task list for Bazaar Monitoring"
---

# Tasks: Bazaar Monitoring

**Input**: Design documents from `/specs/006-bazaar-monitoring/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/websocket.md`, `quickstart.md`

**Organization**: Tasks are grouped by user story. The shared normalization and authorization foundation must land first; each story then has an independently runnable test boundary.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish deterministic test entry points and the feature's shared contract surface without adding dependencies.

- [x] T001 [P] Add focused Node test files `tests/bazaar-market.test.cjs`, `tests/ws-bazaar-market.test.cjs`, and `tests/public-bazaar-websocket.test.cjs` using the repository's `node:test` and socket harness conventions.
- [x] T002 [P] Add stable public market error constants and reusable safe-value helpers in `utils/tornSyncHelpers.cjs` without changing existing authenticated error behavior.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared rules that every user story depends on.

- [x] T003 Implement `utils/bazaarMarket.cjs` with positive safe item-ID validation, listing normalization, valid-listing filtering, minimum-listing selection, threshold validation, and the strict recovery state decision described in `data-model.md`; complete the pure assertions in `tests/bazaar-market.test.cjs` first and make them fail before implementation.
- [x] T004 Extend `authorizeSocket` in `routes/wsHandler.cjs` with an explicit opt-in anonymous mode while preserving the default fail-closed behavior; extend `tests/websocket-auth-upgrade.test.cjs` and `tests/websocket-auth-commands.test.cjs` to prove `/ws`-style calls still reject missing sessions.
- [x] T005 Add contract assertions for the validated `priceUpdate`, `dailyPriceAveragesAll`, catalog, and safe-error shapes in `tests/ws-bazaar-market.test.cjs` and `tests/public-bazaar-websocket.test.cjs` before wiring the handlers.

**Checkpoint**: Shared validation, alert semantics, and private/public authorization rules are executable and tested.

---

## Phase 3: User Story 1 - Watch items and monitor live prices (Priority: P1) 🎯 MVP

**Goal**: Let a user select valid items and see the newest lowest valid listing while preserving the last trustworthy summary through invalid, empty, or out-of-order updates.

**Independent Test**: Feed the live handler/client boundary valid multi-listing, invalid, empty, removed-item, and stale snapshots; verify one minimum row, the matching quantity, ordering, local watch filtering, and last-valid preservation without using history or notifications.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add server-focused tests in `tests/ws-bazaar-market.test.cjs` for Torn listing normalization, invalid price/quantity rejection, minimum quantity preservation, empty snapshots, and changed-minimum broadcast behavior.
- [ ] T007 [P] [US1] Add client-state fixture assertions in `tests/bazaar-market.test.cjs` for watch-list sanitization and acceptance/rejection of snapshot IDs, timestamps, and listing collections.

### Implementation for User Story 1

- [x] T008 [US1] Refactor `ws/wsBazaarPrice.cjs` to use `utils/bazaarMarket.cjs`, validate raw Torn listings, and emit a canonical minimum listing with a valid timestamp and `minBazaar` while retaining Mongo/Redis variation persistence.
- [x] T009 [US1] Replace the global UI watch-list behavior in `ws/wsBazaarPrice.cjs` with per-connection subscription tracking plus reference-counted refresh membership; preserve seeded internal refresh items, send each socket only its own subscription list, and remove subscriptions on close.
- [x] T010 [US1] Update `client/src/hooks/useBazaarAlerts.js` to sanitize persisted watches, process only locally watched items, recompute the defensive minimum, ignore older snapshots per item, and preserve the last valid row on malformed/empty/unavailable updates.
- [x] T011 [US1] Update `client/src/BazaarTable.jsx` to render only valid watched rows, persist only valid positive prices/quantities to `ItemsDB`, and provide explicit loading/stale/disconnected/empty messaging without inventing a zero price.

**Checkpoint**: User Story 1 is independently usable with the authenticated `/wsb` connection and can be exercised with the focused live-market tests.

---

## Phase 4: User Story 2 - Configure and receive price-threshold alerts (Priority: P1)

**Goal**: Configure valid per-item thresholds and receive at most one visible alert per below-threshold episode, using the clarified minimum-price rule.

**Independent Test**: Set a threshold, deliver minimums above, equal to, below, repeated below, empty, invalid, recovered above, and below again; verify exactly one alert in the first episode, no reset on empty/invalid data, and a new alert only after strict recovery.

### Tests for User Story 2

- [x] T012 [P] [US2] Add threshold state-machine cases to `tests/bazaar-market.test.cjs` covering `minimum <= threshold`, duplicate suppression, strict `minimum > threshold` recovery, invalid thresholds, and no reset for empty snapshots.
- [ ] T013 [P] [US2] Add a notification-boundary test fixture in `tests/bazaar-market.test.cjs` proving an alert message contains the item identity, observed minimum, and configured threshold and is not emitted for an unwatched item.

### Implementation for User Story 2

- [x] T014 [US2] Complete `client/src/hooks/useBazaarAlerts.js` threshold persistence sanitization and alert episode bookkeeping, including timer cleanup and safe numeric notification formatting while preserving the existing browser Notification semantics.
- [x] T015 [US2] Update `client/src/BazaarTable.jsx` threshold editing to reject/remove zero, negative, non-numeric, and malformed values and to use `<=` for the visible alert state; retain the existing item-market link and unwatch controls.
- [x] T016 [US2] Verify the P1 alert scenarios through `tests/bazaar-market.test.cjs` and add regression coverage for threshold changes while an episode is active.

**Checkpoint**: User Story 2 is independently testable with no dependency on daily history or the public route.

---

## Phase 5: User Story 3 - Inspect current and historical bazaar activity (Priority: P1)

**Goal**: Render valid daily price and sales history in chronological order, honor date ranges, and show safe empty states when no valid observations match.

**Independent Test**: Supply valid, duplicate, malformed, future, and out-of-range observations; verify valid chronological points, stable daily aggregation, date filtering, and a distinct empty state.

### Tests for User Story 3

- [x] T017 [P] [US3] Add validated daily-history payload cases to `tests/ws-bazaar-market.test.cjs` for malformed IDs/dates/averages, future points, duplicate days, chronological ordering, and generic server errors.
- [ ] T018 [P] [US3] Add sales-history fixture cases to `tests/bazaar-market.test.cjs` for invalid timestamps/costs, valid chronological buckets, and date-range filtering.

### Implementation for User Story 3

- [x] T019 [US3] Harden `ws/wsDailyPriceAverages.cjs` to validate and sort `TORN.Items.dailyPriceAverages`, exclude invalid/future points, allow only public fields, and return a stable generic error message while logging details server-side.
- [x] T020 [US3] Update `client/src/DailyPriceAveragesChart.jsx` to validate incoming lines/points, refresh filtered data when `dateFrom`/`dateTo` changes, render loading/unavailable/empty states, and support a read-only mode that never requests aggregate building.
- [x] T021 [US3] Update `client/src/BazaarSalesGraph.jsx` to reject non-finite/negative sales records and invalid timestamps, apply date ranges reactively, sort buckets chronologically, and render a clear empty state instead of an empty chart.
- [ ] T022 [US3] Complete the history-specific assertions in `tests/ws-bazaar-market.test.cjs` and `tests/bazaar-market.test.cjs` and confirm they pass independently of authenticated session state.

**Checkpoint**: User Story 3 is independently usable from existing authenticated history data and the public aggregate read contract.

---

## Phase 6: User Story 4 - Use a public bazaar view safely (Priority: P2)

**Goal**: Make `/public-bazaar` usable with no session while exposing only market/catalog/aggregate history data and keeping all protected commands private.

**Independent Test**: Open the route with no cookie, verify `/wsb` opens and catalog/history/own watch interactions work, verify `/ws` is not opened, and attempt a protected command/direct access to confirm no protected response or internal error is returned.

### Tests for User Story 4

- [ ] T023 [P] [US4] Add anonymous `/wsb` upgrade and allow-list tests in `tests/public-bazaar-websocket.test.cjs` for welcome, own watch acknowledgements, public catalog/history reads, private-command rejection, and generic errors.
- [x] T024 [P] [US4] Extend `tests/public-market-boundary.test.cjs` to retain the unguarded `/public-bazaar` boundary while asserting protected SPA routes remain guarded.

### Implementation for User Story 4

- [x] T025 [US4] Update `ws/wsBazaarPrice.cjs` to opt into anonymous authorization only for `/wsb`, route `getAllTornItems` and `dailyPriceAveragesAll` read commands, ignore/reject private commands, and never dispatch the authenticated `dailyPriceAverage` build operation.
- [x] T026 [US4] Add a public catalog read path in `ws/wsGetAllTornItems.cjs` (or a dedicated helper beside it) that reuses the committed cache/Mongo snapshot, returns only allow-listed item fields, and uses the stable catalog error without requiring a user/API key.
- [x] T027 [US4] Update `client/src/PublicBazaarPage.jsx` to use only `/wsb`, send/restore public-local subscriptions, pass the same public socket to `Autocomplete` and `DailyPriceAveragesChart`, enable the chart read-only mode, and show safe connection/unavailable states.
- [x] T028 [US4] Add public-route client regression assertions to `tests/public-bazaar-websocket.test.cjs` or the existing Playwright smoke location, proving no protected WebSocket is opened and visitor watch state is not merged from another connection.

**Checkpoint**: User Story 4 is usable without authentication and does not weaken protected application routes or commands.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Run the complete verification matrix and leave the repository in an auditable state.

- [x] T029 [P] Add a focused `test:bazaar` script in `package.json` for the deterministic feature tests without changing existing test scripts.
- [x] T030 Run focused Bazaar tests, `npm run test:auth`, `npm run build:static`, and `git diff --check`; fix all failures rather than weakening assertions.
- [x] T031 Inspect `git diff`, `git status --short --branch`, and the generated feature artifacts; confirm no push occurred and do not set `pushed: true` in `.specify/extensions/time-machine/features-queue.yml`.
- [x] T032 [P] Update `specs/006-bazaar-monitoring/quickstart.md` with any command/output differences discovered during verification and ensure all checklist items remain traceable to the implementation/tests.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code dependency; establish test files and safe constants.
- **Foundational (Phase 2)**: Depends on Setup; blocks all story implementation.
- **User Stories 1–3 (Phases 3–5)**: Depend on Foundational. US2 depends on the normalized snapshot path from US1; US3 can proceed in parallel with US1 after the shared contract is complete.
- **User Story 4 (Phase 6)**: Depends on the public-safe handler foundation and the US1/US3 payload paths; it must be verified after both public read contracts are implemented.
- **Polish (Phase 7)**: Depends on all implementation phases.

### User Story Dependencies

- **US1 (P1)**: Foundational only; MVP.
- **US2 (P1)**: Foundational plus the normalized snapshot/state path from US1.
- **US3 (P1)**: Foundational only for history contracts; integrates with US1's shared item identity rules.
- **US4 (P2)**: Foundational plus the validated public market and history handlers from US1/US3; it must not depend on private `/ws` behavior.

### Parallel Opportunities

- T001–T002 can run in parallel.
- T006–T007, T012–T013, T017–T018, and T023–T024 can run in parallel because they are separate test fixtures.
- After T003–T005, US1 server work and US3 history work can be developed in parallel if file ownership is separated.
- Public boundary tests can run in parallel with public catalog/history implementation once the contract is fixed.

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Implement and verify US1 live minimum monitoring.
3. Stop and validate with the focused live-market tests before adding alerts/history/public access.

### Incremental Delivery

1. Add US2 alert episodes without changing the transport contract.
2. Add US3 hardened history and date-range behavior.
3. Add US4 anonymous `/wsb` allow-listing and public-only client wiring.
4. Run the full regression/build matrix and review the final diff.

## Notes

- Every task includes an exact file path and follows the required `- [ ] T### [P?] [US?]` format.
- Tests for pure rules are written before implementation and must demonstrate the intended failure before the code is added.
- No task authorizes a commit, push, queue completion flag, or change to the general authentication design.
