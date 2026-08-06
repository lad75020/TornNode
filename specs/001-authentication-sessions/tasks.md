# Tasks: Authentication and Sessions

**Input**: Design documents from `/specs/001-authentication-sessions/`

**Prerequisites**: `./specs/001-authentication-sessions/plan.md`, `./specs/001-authentication-sessions/spec.md`, `./specs/001-authentication-sessions/research.md`, `./specs/001-authentication-sessions/data-model.md`, `./specs/001-authentication-sessions/quickstart.md`, and `./specs/001-authentication-sessions/contracts/`

**Tests**: Write the Node `node:test`/`node:assert/strict` and Playwright tests below first; confirm each fails before its corresponding implementation task.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish isolated, non-production authentication test execution and scoped commands.

- [X] T001 [P] Define isolated MongoDB, Redis, HTTPS origin, session-secret, and cooldown-digest test configuration in `./tests/helpers/authTestEnvironment.cjs`
- [X] T002 [P] Add scoped Node test and Playwright execution scripts without adding dependencies in `./package.json`
- [X] T003 Seed a bcrypt-hashed synthetic registered user and disposable Redis namespace for authentication tests in `./tests/helpers/authTestFixtures.cjs`
- [X] T004 Document test-only startup inputs and the scoped verification commands in `./specs/001-authentication-sessions/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the one authoritative session model and shared test seams required before any user-story implementation.

**CRITICAL**: Complete this phase before starting any user story.

- [X] T005 [P] Add deterministic clock, Redis-TTL inspection, Mongo/Redis outage, and raw WebSocket helpers in `./tests/helpers/authTestHarness.cjs`
- [X] T006 [P] Add test-first unit coverage for session validation result shapes, exact 86,400-second renewal, expiry, cookie clearing, and fail-closed dependency handling in `./tests/session-helper.test.cjs`
- [X] T007 Configure Fastify Redis sessions with a stable environment-backed secret and one signed opaque HttpOnly Secure SameSite=Lax Path=/ browser-session cookie without Max-Age or Expires in `./server.cjs`
- [X] T008 Create shared establish, validate, renew, destroy, and clear-cookie helpers that verify current user context and emit only generic external failures in `./routes/authSession.cjs`
- [X] T009 Wire the shared session helper and explicit trusted-origin/proxy configuration into Fastify registration in `./server.cjs`
- [X] T010 Make the foundational Node tests pass with exact 24-hour Redis TTL renewal and no browser JWT or bearer fallback in `./tests/session-helper.test.cjs`

**Checkpoint**: Foundation ready; user-story work can begin.

---

## Phase 3: User Story 1 - Sign In Securely (Priority: P1) MVP

**Goal**: Let registered users sign in through an accessible form while issuing only a regenerated Redis-backed browser session.

**Independent Test**: From a signed-out browser, valid credentials enter the private application; unknown, wrong, malformed, and unavailable-service cases remain safely denied.

### Tests for User Story 1 — write and observe failures first

- [X] T011 [P] [US1] Add Node contract tests for valid login, fixed dummy bcrypt comparison, session-ID regeneration, and exactly one opaque HttpOnly cookie in `./tests/authentication-login.test.cjs`
- [X] T012 [P] [US1] Add Node contract tests proving unknown, wrong, malformed, and cooldown-denied credentials return the identical generic 401 body without a granting cookie in `./tests/authentication-denial.test.cjs`
- [X] T013 [P] [US1] Add Node tests for MongoDB, Redis, and session-persistence failures returning only the generic 503 authentication response in `./tests/authentication-dependencies.test.cjs`
- [X] T014 [P] [US1] Add Playwright tests for keyboard valid login, generic error announcement, empty-field prevention, disabled duplicate submit, and absent localStorage/sessionStorage token data in `./client/tests/authentication-sessions.spec.ts`

### Implementation for User Story 1

- [X] T015 [US1] Validate bounded non-empty username and passkey strings and consistently normalize only lookup/throttle input in `./routes/authenticate.cjs`
- [X] T016 [US1] Implement account-enumeration-safe Mongo lookup and bcrypt comparison with the fixed dummy hash for absent users in `./routes/authenticate.cjs`
- [X] T017 [US1] Regenerate the session, persist userId/username/userType/Torn context and activity timestamps with an exact 86,400-second Redis TTL, and return only success JSON in `./routes/authenticate.cjs`
- [X] T018 [US1] Apply no-store authentication response headers and sanitized server-side failure events in `./routes/authenticate.cjs`
- [X] T019 [US1] Replace token persistence with credentials-include login, clear generic error handling, pending state, and success-only navigation in `./client/src/Login.jsx`
- [X] T020 [US1] Add associated labels, required inputs, aria-describedby, polite live errors, visible progress text, and keyboard-operable submit behavior in `./client/src/Login.jsx`
- [X] T021 [US1] Make the User Story 1 Node and Playwright tests pass without exposing credential, hash, identity-store, or internal exception details in `./tests/authentication-login.test.cjs`

**Checkpoint**: Secure sign-in is independently functional and testable.

---

## Phase 4: User Story 2 - Retain and Verify Authenticated Access (Priority: P2)

**Goal**: Preserve one valid server-side session across private HTTP and realtime access, with exact rolling server-side inactivity renewal.

**Independent Test**: Sign in, reload and visit protected pages, then use a cookie-authenticated WebSocket; signed-out, expired, malformed, destroyed, and dependency-failed state never reaches private work.

### Tests for User Story 2 — write and observe failures first

- [X] T022 [P] [US2] Add Node route tests for signed-out redirects, no-store private HTML, valid protected deep links, public bazaar access, and HTTP activity renewal to exactly 86,400 seconds in `./tests/protected-routes.test.cjs`
- [X] T023 [P] [US2] Add Node session tests for a request at 23:59 renewing activity/TTL and access failing after 24:00 inactivity in `./tests/session-rolling-expiry.test.cjs`
- [X] T024 [P] [US2] Add raw WebSocket contract tests for valid cookie upgrade, invalid first-frame unauthenticated closure 4401, no query credential, and no pre-validation private handler invocation in `./tests/websocket-auth-upgrade.test.cjs`
- [X] T025 [P] [US2] Add WebSocket command tests for checkSession, per-command revalidation, expiry/store failure, exact TTL renewal, and no Set-Cookie on established activity in `./tests/websocket-auth-commands.test.cjs`
- [X] T026 [P] [US2] Add Playwright tests for protected-route redirect, reload continuity, public-market access, one HttpOnly session cookie without Max-Age/Expires, and credential-free WebSocket URLs in `./client/tests/authentication-sessions.spec.ts`

### Implementation for User Story 2

- [X] T027 [US2] Route index, chart, and memory SPA requests through the shared session guard; redirect invalid state to sign-in before private HTML and preserve public bazaar access in `./routes/protectIndex.cjs`
- [X] T028 [US2] Set Cache-Control no-store/private/max-age=0, Pragma no-cache, and Expires 0 on protected and public SPA boundary responses in `./routes/protectIndex.cjs`
- [X] T029 [US2] Register the `/ws` and `/wsb` cookie-authenticated upgrade boundary without JWT, bearer, or token-query authentication in `./routes/wsHandler.cjs`
- [X] T030 [US2] Validate before every private WebSocket dispatch, renew only Redis activity/TTL after success, and send the fixed unauthenticated frame then close 4401 on failure in `./routes/wsHandler.cjs`
- [X] T031 [US2] Implement checkSession through shared validation with true only for valid sessions and false-plus-close for every invalid state in `./ws/wsCheckSession.cjs`
- [X] T032 [US2] Remove client token/query-string socket construction; stop private reconnects, clear private UI, and route to sign-in after auth failure in `./client/src/hooks/useAppWebSocket.js`
- [X] T033 [US2] Make User Story 2 HTTP, expiry, upgrade, command, and browser tests pass with WebSocket-only activity renewing only server-side Redis state in `./tests/websocket-auth-commands.test.cjs`

**Checkpoint**: Authenticated HTTP and realtime continuity are independently verified.

---

## Phase 5: User Story 3 - Sign Out Completely (Priority: P3)

**Goal**: End only the requesting browser session and immediately remove its private HTTP and realtime access.

**Independent Test**: Log in in two browser contexts, sign out one, and prove its existing/new private access is denied while the other stays authenticated.

### Tests for User Story 3 — write and observe failures first

- [X] T034 [P] [US3] Add Node tests for idempotent POST logout, current-session-only Redis destruction, scoped clearing cookie, and generic 503 destroy failure in `./tests/logout-http.test.cjs`
- [X] T035 [P] [US3] Add WebSocket tests for destroySession acknowledgement after destruction, closure, post-destroy command rejection, and isolation of another session in `./tests/websocket-logout.test.cjs`
- [X] T036 [P] [US3] Add Playwright two-context tests for keyboard logout, immediate private-state removal, denial of existing/new sockets and protected pages, and continued access in context B in `./client/tests/authentication-sessions.spec.ts`

### Implementation for User Story 3

- [X] T037 [US3] Add idempotent POST /logout that awaits destruction of only the request session, clears its cookie with Max-Age=0, applies no-store headers, and returns generic failure safely in `./routes/authenticate.cjs`
- [X] T038 [US3] Implement destroySession to destroy only the validated caller record before its acknowledgement and close the current socket without trying to mutate HTTP cookies in `./ws/wsDestroySession.cjs`
- [X] T039 [US3] Enforce sign-out race safety by rejecting all private dispatches after destruction begins or completes in `./routes/wsHandler.cjs`
- [X] T040 [US3] Implement a keyboard-operable logout control that awaits POST /logout, closes app sockets, clears private UI, removes localStorage.jwt/storage listeners/decoded-token identity, and shows a safe retry path in `./client/src/main.jsx`
- [X] T041 [US3] Make User Story 3 Node, WebSocket, and two-context browser tests pass while preserving another browser session for the same user in `./tests/logout-http.test.cjs`

**Checkpoint**: Current-browser-only sign-out is independently verified.

---

## Phase 6: User Story 4 - Access the Public Market Without Signing In (Priority: P4)

**Goal**: Keep the single public market route available without weakening any private route or realtime boundary.

**Independent Test**: In a clean browser, open public market successfully and verify every private navigation remains sign-in protected.

### Tests for User Story 4 — write and observe failures first

- [X] T042 [P] [US4] Add Node boundary tests confirming public-bazaar returns 200 without creating a session while index, chart, and memory redirect with no private body in `./tests/public-market-boundary.test.cjs`
- [X] T043 [P] [US4] Add Playwright clean-context tests for public-market rendering followed by protected navigation denial and no authentication cookie grant in `./client/tests/authentication-sessions.spec.ts`

### Implementation for User Story 4

- [X] T044 [US4] Preserve an explicitly unauthenticated public-bazaar route with no private capability or authentication-state establishment in `./routes/protectIndex.cjs`
- [X] T045 [US4] Ensure the client public-market route does not infer private identity or bypass the authenticated application gate in `./client/src/main.jsx`
- [X] T046 [US4] Make User Story 4 Node and clean-browser tests pass without granting private routes or WebSocket operations in `./tests/public-market-boundary.test.cjs`

**Checkpoint**: The public market is available signed out while all private boundaries hold.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete security regression coverage, documentation consistency, and final build verification across all stories.

- [X] T047 [P] Add security regression tests for no JWT/bearer/token-query authentication, cache headers, opaque cookie attributes, generic failures, and sanitized logs in `./tests/authentication-security.test.cjs`
- [X] T048 [P] Add a Playwright accessibility/security inspection for labels, live errors, keyboard controls, unreadable HttpOnly cookie, and no browser token storage in `./client/tests/authentication-sessions.spec.ts`
- [X] T049 Review all implementation tasks against exact HTTP and WebSocket contract responses, closure code, and cookie semantics in `./specs/001-authentication-sessions/contracts/authentication-http.md`
- [X] T050 Review WebSocket private-command coverage, logout race behavior, and 86,400-second renewal evidence against `./specs/001-authentication-sessions/contracts/authenticated-websocket.md`
- [X] T051 Run the scoped Node suite and remediate any authentication/session/WebSocket contract failures using `./package.json`
- [X] T052 Run the scoped Playwright suite against isolated test services and remediate browser boundary failures using `./client/tests/authentication-sessions.spec.ts`
- [X] T053 Run the production bundle build and resolve scoped CommonJS/React/Vite build failures using `./package.json`
- [X] T054 Run the isolated test-mode Fastify startup and route smoke check without production credentials using `./specs/001-authentication-sessions/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup has no dependencies and starts immediately.
- Foundational depends on Setup and blocks every user-story phase.
- US1 depends on Foundational; it creates the login/session entry point.
- US2 depends on Foundational and uses the authoritative session created by US1 for its independent signed-in verification.
- US3 depends on Foundational and the session lifecycle from US1/US2 to prove current-browser invalidation.
- US4 depends on Foundational and can proceed independently of the signed-in stories after public/private route classification is in place.
- Polish depends on all desired story phases.

### Within Each User Story

- Write the listed Node and Playwright tests first and verify they fail before implementation.
- Complete shared/session work before handlers, route/UI integration, then make that story's tests pass.
- Do not begin a task that edits the same path as an unfinished prerequisite task.

### Parallel Opportunities

- T001 and T002 can run in parallel; T005 and T006 can run in parallel after Setup.
- Within each story, all `[P]` test tasks use separate coverage concerns and can be prepared in parallel.
- After Foundational, US1 and US4 can be staffed in parallel; US2 and US3 follow the session lifecycle needed for their end-to-end checks.

## Parallel Example: User Story 2

```text
Task: "T022 [US2] protected HTTP and TTL tests in ./tests/protected-routes.test.cjs"
Task: "T024 [US2] WebSocket upgrade tests in ./tests/websocket-auth-upgrade.test.cjs"
Task: "T026 [US2] browser session tests in ./client/tests/authentication-sessions.spec.ts"
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational.
2. Complete US1 through T021.
3. Run its Node and Playwright tests against isolated services; confirm valid login, generic denial, one opaque cookie, and accessible pending/error states.
4. Demo only that secure sign-in increment before adding route, WebSocket, logout, and public-market work.

### Incremental Delivery

1. Add US2 to enforce protected HTTP/WebSocket access and rolling Redis activity.
2. Add US3 to provide current-browser-only logout and invalidation-race protection.
3. Add US4 to lock in the public-market/private-boundary distinction.
4. Finish Polish with the scoped Node, Playwright, build, and test-mode startup checks.
