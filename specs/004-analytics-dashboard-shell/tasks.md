---

# Tasks: Analytics Dashboard Shell

**Input**: Design documents from `./specs/004-analytics-dashboard-shell/`

**Prerequisites**: `./specs/004-analytics-dashboard-shell/plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Included because every user story defines an independent browser test and the specification contains measurable acceptance outcomes.

**Organization**: Tasks are grouped by user story. Tests precede the production changes they protect.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it uses different files and has no incomplete dependency.
- **[Story]**: Maps the task to a user story in `spec.md`.
- Every task names the exact file or command surface it changes or validates.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish focused browser coverage without changing application dependencies.

- [X] T001 [P] Confirm the existing React/Vite/Playwright versions and no-dependency constraint in `./package.json` and `./client/playwright.config.js`; record the baseline commands in `./specs/004-analytics-dashboard-shell/quickstart.md`.
- [X] T002 [P] Extend the reusable browser test fixture in `./client/tests/fixtures.js` with deterministic session, viewport, and shell navigation helpers that do not weaken production authentication.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock shared boundaries before story-specific behavior is changed.

- [X] T003 [P] Add stable accessible labels and testable state hooks for shell loading, empty, and recoverable-error states in `./client/src/main.jsx` and `./client/src/index.css` without changing chart component props.
- [X] T004 [P] Add a regression assertion for repeated side-effect initialization in `./client/tests/analytics-dashboard-shell.spec.ts` and preserve the idempotent Chart.js registration contract in `./client/src/chartSetup.js`.

**Checkpoint**: Existing shell bootstrapping, browser fixtures, Chart.js registration, and state selectors are ready for independent story work.

---

## Phase 3: User Story 1 - Navigate the Analytics Dashboard (Priority: P1) 🎯 MVP

**Goal**: Keep the authenticated chart shell mounted while selecting lazy views, displaying loading/empty/error states, and rotating through valid route-backed views.

**Independent Test**: Use `./client/tests/analytics-dashboard-shell.spec.ts` to open the shell, navigate across several chart routes, observe a non-blank loading state, exercise a recoverable view failure, and verify autoplay advances, wraps, and stops on disable/unmount.

### Tests for User Story 1

- [X] T005 [US1] Write failing browser scenarios in `./client/tests/analytics-dashboard-shell.spec.ts` for direct chart URLs, previous/next navigation, lazy loading feedback, invalid-index normalization, recoverable chart failure, and shell preservation.
- [X] T006 [US1] Write a failing browser lifecycle scenario in `./client/tests/analytics-dashboard-shell.spec.ts` that enables automatic rotation, observes route advancement and wraparound, disables it, and verifies no further route changes after leaving the dashboard.

### Implementation for User Story 1

- [X] T007 [US1] Normalize `/chart/:idx`, preserve browser back/forward behavior, and give previous/next/rotation controls meaningful accessible names in `./client/src/main.jsx`.
- [X] T008 [US1] Synchronize automatic rotation with route navigation, clamp zero/one/many-view cases, and clear every interval on disable, dependency change, and unmount in `./client/src/hooks/useChartSlider.js` and `./client/src/main.jsx`.
- [X] T009 [US1] Add recoverable lazy-view error and explicit no-data rendering that keeps navigation, date, theme, and notification controls mounted in `./client/src/main.jsx` and `./client/src/index.css`.
- [X] T010 [US1] Preserve one-time Chart.js module registration under repeated development-time imports and document the side-effect boundary in `./client/src/chartSetup.js`.

**Checkpoint**: A user can independently navigate and rotate the chart shell without blank states, stale routes, or leaked timers.

---

## Phase 4: User Story 2 - Filter a Chart by Date (Priority: P1)

**Goal**: Apply an inclusive, bounded daily date range to the active chart while preserving label/series alignment and communicating empty or invalid ranges safely.

**Independent Test**: Use `./client/tests/analytics-date-filter.spec.ts` with daily, unsupported, malformed, empty, reversed, and misaligned data; then verify the active shell resets or clamps bounds when the chart changes.

### Tests for User Story 2

- [X] T011 [P] [US2] Write failing utility/browser scenarios in `./client/tests/analytics-date-filter.spec.ts` for inclusive daily filtering, no-date no-op behavior, reversed/out-of-range dates, empty results, unsupported labels, malformed labels, and aligned datasets.
- [X] T012 [US2] Add a failing browser scenario in `./client/tests/analytics-date-filter.spec.ts` for per-chart minimum-date bounds, today as the maximum end date, and range reset/clamping after switching charts.

### Implementation for User Story 2

- [X] T013 [US2] Harden the pure filter contract in `./client/src/dateFilterUtil.js` for non-array inputs, unsupported label formats, inclusive bounds, empty valid ranges, and non-mutating aligned dataset slices.
- [X] T014 [US2] Wire start/end date controls, canonical validation, future-date rejection, and visible invalid/empty feedback into `./client/src/main.jsx`.
- [X] T015 [US2] Apply each chart's `onMinDate` result when selecting a new view and prevent a previous chart's invalid range from being passed to the new view in `./client/src/main.jsx`.

**Checkpoint**: A user can independently focus any supported daily chart without misleading data or broken series alignment.

---

## Phase 5: User Story 3 - Choose a Consistent Display Theme (Priority: P2)

**Goal**: Cycle through automatic, light, and dark modes, persist deliberate choices, and keep shell and Chart.js presentation readable together.

**Independent Test**: Use `./client/tests/theme-cycle.spec.ts` to cycle modes, reload, simulate storage/geolocation failure, and inspect shared chart options/colors in both resolved modes.

### Tests for User Story 3

- [X] T016 [P] [US3] Extend `./client/tests/theme-cycle.spec.ts` with failing assertions for automatic/manual mode labels, cycle order, reload persistence, storage failure fallback, and automatic-mode usability when geolocation is unavailable.
- [X] T017 [US3] Add a failing browser assertion in `./client/tests/theme-cycle.spec.ts` that chart text, grid, legend, tooltip, and series colors change with the same resolved `darkMode` as the shell.

### Implementation for User Story 3

- [X] T018 [US3] Make manual/automatic theme transitions, unknown stored values, geolocation fallback, and automatic recomputation cleanup deterministic in `./client/src/hooks/themeContext.js`.
- [X] T019 [US3] Consolidate readable light/dark palettes, common Chart.js options, and dataset colors without mutating caller data in `./client/src/chartTheme.js` and `./client/src/useChartTheme.js`.
- [X] T020 [US3] Expose the active theme mode through an accessible label/control state in `./client/src/main.jsx` and ensure both root theme classes and chart options use one resolved value in `./client/src/index.css` and `./client/src/useChartTheme.js`.

**Checkpoint**: A user can independently change and restore the display theme without unreadable chart or control states.

---

## Phase 6: User Story 4 - Receive Dashboard Progress and Results (Priority: P2)

**Goal**: Show non-blocking progress and terminal results as one safe, accessible notification per operation with reliable expiry/dismissal cleanup.

**Independent Test**: Use `./client/tests/toast-notifications.spec.ts` to publish ten keyed progress updates, one terminal result, warnings/errors, dismissal, expiry, and unmount; assert one visible item and no leaked subscription/timer.

### Tests for User Story 4

- [X] T021 [P] [US4] Write failing browser scenarios in `./client/tests/toast-notifications.spec.ts` for progress, keyed replacement, success/error terminal states, warning presentation, persistent dismissal, TTL expiry, and post-unmount events.
- [X] T022 [US4] Add a failing safety assertion in `./client/tests/toast-notifications.spec.ts` that visible error details exclude credential/session-secret fields while the dashboard remains interactive.

### Implementation for User Story 4

- [X] T023 [US4] Validate notification details, preserve stable keyed replacement, and provide a safe no-op outside the browser in `./client/src/toastBus.js`.
- [X] T024 [US4] Implement accessible live/status semantics, bounded safe detail rendering, keyed replacement, dismissal, expiry, and complete subscription/timer cleanup in `./client/src/ToastHost.jsx`.
- [X] T025 [US4] Ensure dashboard progress and terminal events use stable operation keys and safe user-facing summaries without changing WebSocket payloads in `./client/src/main.jsx`.

**Checkpoint**: A user can independently understand long-running dashboard operations without duplicate toasts, focus theft, or leaked timers.

---

## Phase 7: User Story 5 - Use the Shell on Different Screens (Priority: P3)

**Goal**: Keep the shell readable, keyboard-operable, and unclipped at supported narrow and wide viewport sizes.

**Independent Test**: Use `./client/tests/app-smoke.spec.ts` with keyboard-only navigation and narrow/wide viewports; verify every core control remains named, focused, visible, and operable.

### Tests for User Story 5

- [X] T026 [P] [US5] Extend `./client/tests/app-smoke.spec.ts` with failing keyboard, visible-focus, narrow-viewport wrapping, loading/notification announcement, and no-horizontal-clipping scenarios.

### Implementation for User Story 5

- [X] T027 [US5] Apply responsive shell layout, focus-visible styling, readable status/error/empty states, and notification-region positioning in `./client/src/index.css`.
- [X] T028 [US5] Align control order, labels, keyboard semantics, and non-focus-stealing state announcements with the shell contract in `./client/src/main.jsx` and `./client/src/ToastHost.jsx`.

**Checkpoint**: A user can independently operate the dashboard shell with keyboard input at both supported viewport extremes.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate all stories together, preserve scope, and refresh structural knowledge.

- [X] T029 [P] Run `git diff --check` and verify changed paths against `./specs/004-analytics-dashboard-shell/quickstart.md`; confirm no server, authentication, Torn synchronization, or storage-schema files changed.
- [X] T030 Run the focused browser suite from `./specs/004-analytics-dashboard-shell/quickstart.md`, including `./client/tests/analytics-dashboard-shell.spec.ts`, `./client/tests/analytics-date-filter.spec.ts`, `./client/tests/theme-cycle.spec.ts`, `./client/tests/toast-notifications.spec.ts`, and `./client/tests/app-smoke.spec.ts`.
- [X] T031 Run `npm run build` using `./package.json` and record the actual result in `./specs/004-analytics-dashboard-shell/quickstart.md`.
- [X] T032 [P] Re-read and validate all feature artifacts under `./specs/004-analytics-dashboard-shell/`, including `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
- [X] T033 Re-index `/Volumes/WDBlack4TB/Code/tornnode` with the existing `codebase-memory-mcp` workflow and verify targeted changed symbols plus project readiness for `Volumes-WDBlack4TB-Code-tornnode`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No production dependency; T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: Depends on Setup; T003 and T004 can run in parallel and block story work.
- **User Stories**: Depend on Phase 2. US1 and US2 share `./client/src/main.jsx` and should be completed sequentially; US3 and US4 can be developed in parallel after their tests are isolated; US5 follows the shared markup changes.
- **Polish (Phase 8)**: Depends on all desired story tasks; T029, T032, and T033 can run in parallel after implementation, while T030 and T031 are validation gates.

### User Story Dependencies

- **US1 (P1)**: Foundation only; MVP shell and route lifecycle.
- **US2 (P1)**: Foundation plus US1's active-chart route/bounds plumbing; date filtering must be verified before final shell acceptance.
- **US3 (P2)**: Foundation only; consumes the existing shell theme boundary and can proceed independently of domain charts.
- **US4 (P2)**: Foundation only; consumes the existing event bus and can proceed independently of date filtering.
- **US5 (P3)**: Depends on the final shared control markup from US1–US4.

### Within Each User Story

- Write the failing test before the production task it protects.
- Complete shared state/contract changes before visual polish.
- Keep tasks touching `./client/src/main.jsx` sequential.
- Validate each checkpoint independently before moving to the next priority story.

### Parallel Opportunities

- T001/T002 and T003/T004 are independent setup/foundation work.
- T016/T017 and T021/T022 can run in parallel because they use different test files.
- T027 can run in parallel with T026's test authoring only when the test's expected selectors are already agreed; production fixes follow failing assertions.
- T029, T032, and T033 are independent post-implementation inspections.

---

## Implementation Strategy

### MVP First (User Stories 1 and 2)

1. Complete Phase 1 and Phase 2.
2. Complete US1 route/lazy-loading/rotation work and validate the shell independently.
3. Complete US2 date filter and per-chart bounds work and validate aligned data independently.
4. Stop at the MVP checkpoint for a build and focused browser run before adding theme/notification polish.

### Incremental Delivery

1. Add US3 theme consistency and persistence; validate independently.
2. Add US4 keyed progress/result notifications; validate lifecycle and safety independently.
3. Add US5 responsive/keyboard refinements.
4. Run the full suite, build, scope check, and graph refresh.

### Notes

- Tests are intentionally browser-focused because the client source is Vite-managed and the repository has no separate frontend unit-test runner.
- No task changes the existing authentication/session contract or domain-specific chart payloads.
- If a test requires a server behavior outside this feature, use a deterministic test stub rather than broadening the implementation scope.
