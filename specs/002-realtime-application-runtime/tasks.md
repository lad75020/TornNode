# Tasks: Realtime Application Runtime

**Input**: Design documents from `/specs/002-realtime-application-runtime/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The tasks below include test tasks because the feature specifies automated validation (Node tests and Playwright). Tests are written first and must FAIL before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Path Conventions

- **Web app**: `backend/` (Fastify runtime, routes, socket) and `client/src/`
- **Tests**: `tests/`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization for this feature.

- [X] T001 [P] Create spec directory for feature `002-realtime-application-runtime` with markdown artifacts
- [X] T002 [P] Create tasks.md scaffold for this feature under `specs/002-realtime-application-runtime/`
- [X] T003 [P] Create contract markdown files `contracts/realtime-connection.md` and `contracts/message-dispatch.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core runtime primitives used by all stories; must complete before any story.

- [ ] T004 [P] Verify environment variables for keep-alive: `WS_PING_INTERVAL_MS`, `WS_PONG_TIMEOUT_MS`, `RECONNECT_MS`, `HEARTBEAT_MS` documented in plan
- [ ] T005 [P] Add `socketClose` emission to `socketEvents.cjs` on socket close (new signal for consumers)
- [ ] T006 [P] Ensure Fastify WebSocket route `/ws` is authenticated only via session cookie (no query tokens) in `routes/wsHandler.cjs`
- [ ] T007 [P] Ensure `useAppWebSocket` hook accepts `heartbeatMs`, `reconnectMs`, `maxMessages` options and exposes `status` (`connecting|open|closed`)

**Checkpoint**: Foundation ready - user story implementation can begin.

---

## Phase 3: User Story 1 - Establish an Authenticated Realtime Connection (Priority: P1) 🎯 MVP

**Goal**: Authenticated WebSocket opens on same origin with session cookie; no credential in URL; unauthenticated attempts close with 4401.

**Independent Test**: Sign in, load private app, confirm single WebSocket on same origin using session cookie and receive session greeting.

### Tests for User Story 1

- [ ] T008 [P] [US1] Contract test for authenticated WebSocket connect in `tests/ws/contract/test_ws_auth_connect.mjs`
- [ ] T009 [P] [US1] Contract test for unauthenticated close (4401) in `tests/ws/contract/test_ws_unauth_close.mjs`
- [ ] T010 [P] [US1] Integration test for same-origin URL construction in `tests/client/integration/test_ws_url_origin.mjs`

### Implementation for User Story 1

- [ ] T011 [P] [US1] Implement same-origin WebSocket URL builder in `client/src/hooks/useAppWebSocket.js` (derive from `window.location`, avoid credentials)
- [ ] T012 [P] [US1] Enforce cookie-only auth in `routes/wsHandler.cjs` (reject token/query-string auth; close 4401)
- [ ] T013 [US1] Ensure server sends `auth.ok:false` frame on invalid session before close (contract)
- [ ] T014 [US1] Verify server emits `newSocket` on successful upgrade for consumer registration

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Reconnect Automatically After Transient Loss (Priority: P2)

**Goal**: Transient disconnects trigger bounded reconnect; auth-failing closes never reconnect; timers cancelled on unmount.

**Independent Test**: Establish connection, simulate transient close, confirm automatic reconnect and resume; confirm auth-failing close yields zero reconnects.

### Tests for User Story 2

- [ ] T015 [P] [US2] Contract test for transient reconnect cadence in `tests/ws/contract/test_ws_reconnect_transient.mjs`
- [ ] T016 [P] [US2] Contract test for no-reconnect on 4401 in `tests/ws/contract/test_ws_no_reconnect_4401.mjs`
- [ ] T017 [P] [US2] Integration test for timer cleanup on unmount in `tests/client/integration/test_ws_unmount_cleanup.mjs`

### Implementation for User Story 2

- [ ] T018 [P] [US2] Implement bounded single-timer reconnect loop in `client/src/hooks/useAppWebSocket.js` (single pending timer, cancel on open/unmount)
- [ ] T019 [P] [US2] Distinguish transient vs auth-failing close in `client/src/hooks/useAppWebSocket.js` (4401 → no reconnect, else reconnect)
- [ ] T020 [US2] Ensure reconnect respects `reconnectMs` config and avoids duplicate timers (merge with T018)
- [ ] T021 [US2] Add `status` state machine updates (`connecting`/`open`/`closed`) in `client/src/hooks/useAppWebSocket.js`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Observe the Connection Status (Priority: P3)

**Goal**: Non-blocking status indicator reflecting `connecting|open|closed`; never blocks dashboard.

**Independent Test**: With connection in each state verify status reflects it accurately and transitions promptly.

### Tests for User Story 3

- [ ] T022 [P] [US3] Contract test for status transitions in `tests/client/contract/test_ws_status.mjs`
- [ ] T023 [P] [US3] Playwright test for status indicator UI in `tests/e2e/status_indicator.spec.js`

### Implementation for User Story 3

- [ ] T024 [P] [US3] Expose `status` from `useAppWebSocket` hook with discrete states
- [ ] T025 [P] [US3] Render non-blocking status indicator in `client/src/components/RealtimeStatus.jsx`
- [ ] T026 [US3] Wire status to dashboard (read-only) without gating renders

**Checkpoint**: All three stories independently functional.

---

## Phase 6: User Story 4 - Deliver Realtime Messages to the Right Handlers (Priority: P4)

**Goal**: Type-based dispatch with safe handling of malformed/unregistered messages; bounded backlog; latest-intent handler ref.

**Independent Test**: Emit mixed valid/malformed messages; confirm handlers fire for valid, malformed skipped, later messages unaffected.

### Tests for User Story 4

- [ ] T027 [P] [US4] Contract test for message dispatch by type in `tests/ws/contract/test_message_dispatch_type.mjs`
- [ ] T028 [P] [US4] Contract test for malformed frame skip in `tests/ws/contract/test_message_malformed_skip.mjs`
- [ ] T029 [P] [US4] Contract test for bounded backlog in `tests/client/contract/test_message_backlog_bound.mjs`

### Implementation for User Story 4

- [ ] T030 [P] [US4] Ensure `useWsMessageBus.js` uses latest-intent handler ref (already present) and skips undecodable frames without throwing
- [ ] T031 [P] [US4] Enforce `maxMessages` backlog (default 800) in `useWsMessageBus.js` (drop oldest beyond bound)
- [ ] T032 [US4] Harden server command router in `routes/wsHandler.cjs` to catch JSON parse failures and log safely without throwing
- [ ] T033 [US4] Add optional `onMalformed` hook stub in `useWsMessageBus.js` for future use without breaking existing consumers

**Checkpoint**: Stories 1–4 independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple stories.

- [ ] T034 [P] Update `openapi-ws.yaml` to document reconnect/classification and keep-alive semantics for consumers
- [ ] T035 [P] Add documentation in `specs/002-realtime-application-runtime/quickstart.md` for validation commands
- [ ] T036 [P] Code cleanup and refactor for hook options defaults
- [ ] T037 [P] Add unit tests for keep-alive watchdog timer cleanup in `tests/server/unit/test_ws_keepalive_cleanup.mjs`
- [ ] T038 [P] Security hardening: ensure no exception text leaks to client on dependency failure in `routes/wsHandler.cjs`
- [ ] T039 [P] Run quickstart.md validation (`npm run test:runtime`, `npm run test:runtime:browser`, `npm run build`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - Integrates with US1 connection
- **User Story 3 (P3)**: Can start after Foundational - Reads status from US1/US2
- **User Story 4 (P4)**: Can start after Foundational - Builds on US1 connection; dispatch independent of UI

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch contract tests together:
tests/ws/contract/test_ws_auth_connect.mjs
tests/ws/contract/test_ws_unauth_close.mjs
tests/client/integration/test_ws_url_origin.mjs

# Parallel implementation:
client/src/hooks/useAppWebSocket.js (URL builder)
routes/wsHandler.cjs (auth enforcement)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3 + 4
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
