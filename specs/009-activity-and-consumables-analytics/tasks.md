# Tasks: Activity and Consumables Analytics

**Input**: Design documents from `/specs/009-activity-and-consumables-analytics/`
**Tests**: Focused Node source/contract tests plus production static build; no live Torn API or MongoDB calls.

## Phase 1: Specify and baseline

- [x] T001 Confirm the spec, research, data model, source contract, and plan agree on local IndexedDB sources, UTC buckets, finite values, inclusive dates, and migration safety.
- [x] T002 [P] Add `/tests/activity-and-consumables-analytics.test.cjs` with deterministic source/contract assertions; never call the live Torn API or MongoDB.
- [x] T003 [P] Record baseline static build and synchronization/auth/bazaar regression results before implementation.

## Phase 2: Revive and Xanax charts

- [x] T004 [P] Add focused fixtures/contracts for log 5410, logs 2290/2291, log 4103, malformed timestamps/values, duplicate buckets, missing stores, and range changes.
- [x] T005 [US1] Refactor `client/src/LogsGraph.jsx` to use safe asynchronous reads, finite Unix-second validation, shared UTC buckets, cancellation, date dependencies, and explicit states.
- [x] T006 [US1] Refactor `client/src/XanaxBarGraph.jsx` to normalize both source logs, preserve use/cooldown semantics and modal behavior, and recompute from retained source rows.
- [x] T007 [US1] Refactor `client/src/XanaxReceivedChart.jsx` to validate receipt item/quantity/timestamp fields, preserve item 206 filtering, and handle empty/error/cancellation paths.

## Phase 3: Blood and medical activity

- [x] T008 [P] Add focused blood and medical fixtures covering logs 2340/2100, title matching, locale-independent dates, invalid amounts, and unmount/filter races.
- [x] T009 [US2] Refactor `client/src/BloodCountGraph.jsx` to use safe reads and UTC aggregation, correct deposit/withdrawal source mapping, inclusive filters, and safe states.
- [x] T010 [US2] Refactor `client/src/BloodAidDailyChart.jsx` to use cancellable asynchronous source access, stable title matching, UTC buckets, filter dependencies, and explicit errors.

## Phase 4: Items, travel, and preview

- [x] T011 [P] Add focused item/travel/preview fixtures covering log 9020, cached price gaps, log 6000, malformed durations, bucket modal payloads, large arrays, and unmounts.
- [x] T012 [US3] Refactor `client/src/ItemsGainedGraph.jsx` and `client/src/hooks/useBarBucketModal.js` for finite quantity/price/value handling, error propagation, stable bucket payloads, and range recomputation.
- [x] T013 [US3] Refactor `client/src/TravelDurationGraph.jsx` to retain normalized source rows, avoid destructive filter mutation, use UTC keys, validate durations, and expose safe states.
- [x] T014 [US4] Harden `client/src/JsonPreview.jsx` and `client/src/jsonview.js` with bounded asynchronous rendering, unmount cleanup, safe fallback messages, and no full-payload browser logging.

## Phase 5: Migration utility and integration

- [x] T015 [US4] Harden `utils/computeStatsFromOldStats.js` to apply `find(query)`, support `MONGODB_URI_TEST` fallback, validate nested stats/finite derived fields, skip malformed documents, preserve dry-run, and close resources.
- [x] T016 Verify `client/src/main.jsx` keeps lazy routes, component props, chart controls, log identifiers, and modal behavior unchanged.
- [x] T017 Assert the targeted client modules contain no locale-dependent bucket keys, synchronous IndexedDB callbacks, raw full-payload console logging, or Error-object rendering.
- [x] T018 Review the migration utility for no connection-string logging, no stack-trace user output, bounded cursor processing, and no new dependency.

## Phase 6: Verification

- [x] T019 Run `node --test tests/activity-and-consumables-analytics.test.cjs` and fix failures without weakening assertions.
- [x] T020 Run `node --check utils/computeStatsFromOldStats.js`, `node --test tests/torn-data-synchronization.test.cjs`, `npm run test:auth`, and `npm run test:bazaar`.
- [x] T021 Run `npm run build:static` and confirm all seven targeted chart bundles and preview code compile.
- [x] T022 Run `git diff --check` and inspect the final diff/status for generated files, credentials, raw errors, synchronous I/O, and dependency changes.
- [x] T023 Refresh native codebase-memory indexing, verify project status `ready`, and confirm all targeted chart, preview, hook, helper, and migration symbols remain discoverable.
- [x] T024 Validate quickstart commands and source-data contract against the implementation.
- [x] T025 Record focused and regression verification results with real command output.
- [x] T026 Mark all completed tasks and update the Time Machine queue entry to `done` with actual completion metadata.
- [x] T027 Commit the completed feature on its feature branch without pushing; verify the clean/expected working tree.

## Verification record

The following checks were run after implementation:

- `node --test tests/activity-and-consumables-analytics.test.cjs`: **7 passed, 0 failed**.
- `node --check utils/computeStatsFromOldStats.js`: **passed**.
- `node --check client/src/jsonview.js`: **passed**.
- `node --test tests/torn-data-synchronization.test.cjs`: **11 passed, 0 failed**.
- `npm run test:auth`: **23 passed, 0 failed**.
- `npm run test:bazaar`: **16 passed, 0 failed**.
- `npm run build:static`: **passed**; Vite transformed **412 modules** and emitted the seven activity chart bundles plus preview/helper bundles.
- `git diff --check`: **passed**.
- Targeted source review: **passed**; no full-payload `console.log`, synchronous IndexedDB access, raw Error-object rendering, or locale-dependent activity bucket keys found.
- Documentation review: `quickstart.md` uses the implemented `--target` migration flag and `contracts/source-data.md` matches the migration CLI.
- Native codebase memory refresh: project `Volumes-WDBlack4TB-Code-tornnode` is **ready** with **5,003 nodes** and **7,398 edges**; all targeted charts, preview, modal hook, helper, migration, dashboard wiring, and focused test symbols are discoverable.
- Commit and queue metadata are completed in the finalization step below; the feature is not pushed.


## Dependencies

- T001–T004 precede implementation.
- T005–T007, T009–T010, T012–T015 can proceed in independent chart/utility groups after the source contract is fixed.
- T016–T027 require all targeted source changes.
