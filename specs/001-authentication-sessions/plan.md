# Implementation Plan: Authentication and Sessions

**Branch**: `feature/time-machine-authentication-and-sessions` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-authentication-sessions/spec.md`

## Summary

Deliver a secure, rolling, current-browser-only authentication boundary for the existing Torn dashboard. The implementation keeps the Fastify/CommonJS server, React/Vite client, MongoDB user collection, Redis-backed `@fastify/session`, and `/ws` WebSocket endpoint. It makes one Redis-backed Fastify session the authoritative grant and its one signed opaque HttpOnly session cookie the browser's Authentication Evidence. Private HTTP requests and private WebSocket commands validate that same session and renew only its Redis TTL to exactly 24 hours; the browser-session cookie has no `Max-Age`, so WebSocket-only activity is not limited by a client-side fixed expiry.

## Technical Context

**Language/Version**: Node.js CommonJS application; React 19.1.1 client; Vite 7.1.5; Node 22 type definitions are installed.

**Primary Dependencies**: Fastify 5.3.2, `@fastify/session` 11.1.0, `connect-redis` 8.1.0, `redis` 5.8.2, `@fastify/websocket` 11.0.2, `@fastify/mongodb` 9.0.2, Mongoose 8.14.2, `bcrypt` 6.0.0, React Router 7.8.0. Existing `jsonwebtoken` package usage outside this feature remains untouched and is not an authentication dependency of this boundary.

**Storage**: MongoDB `sessions.users` stores registered users and bcrypt passkey hashes; Redis stores Fastify session records and authentication cooldown counters; browser receives one signed opaque HttpOnly Secure session cookie as Authentication Evidence.

**Testing**: Node built-in `node:test` and `node:assert/strict` for unit, route, Redis, MongoDB, and WebSocket contract tests; Playwright 1.52.0 only for browser login, routing, cookie, accessibility, and current-browser logout behavior.

**Target Platform**: Same-origin HTTPS Fastify deployment serving the React/Vite SPA; local test mode may use explicitly configured test MongoDB and Redis endpoints.

**Project Type**: Web application with one Fastify backend and one React/Vite frontend.

**Performance Goals**: Meet SC-001: at least 95% of valid sign-ins show the private app within two seconds under normal operating conditions; add no network round trip before opening the existing WebSockets beyond their authenticated upgrade.

**Constraints**: Rolling inactivity window is exactly 24 hours in the Redis session TTL; lockout is exactly five failures per account or per normalized network source followed by a 15-minute cooldown; login responses must be account-enumeration-safe; access must fail closed on MongoDB, Redis, session, or verification failure; normal logout destroys only the requesting browser's session; no browser JWT, bearer authentication, token query parameter, or source implementation/`tasks.md` is produced in this phase.

**Scale/Scope**: One existing user collection, one Redis session namespace, one login route, protected SPA entry/deep links, `/ws` and `/wsb` upgrades and private messages, one public `/public-bazaar` route. Registration, recovery, account administration, authorization redesign, and unrelated data-import behavior are excluded.

## Constitution Check

The constitution at `.specify/memory/constitution.md` is the untouched Spec Kit template: all principle names, requirements, governance, and version fields are placeholders. It provides no project-specific, enforceable gates. The following default gates therefore apply before research and remain required after design:

| Gate | Before Phase 0 | After Phase 1 | Evidence required before implementation |
|---|---|---|---|
| Secure authentication | PASS: the spec defines generic errors, rate limiting, expiry, fail-closed behavior, and current-browser logout. | PASS: research and contracts require one signed opaque HttpOnly session cookie as Authentication Evidence, no browser JWT/bearer/token query credential, bcrypt comparison, atomic Redis cooldowns, and authenticated WebSocket message guards. | Node tests cover success, generic failures, cooldown, expiry, dependency failures, invalid session state, logout, and unauthorized socket commands. |
| Testability | PASS: acceptance scenarios and measurable success criteria exist. | PASS: test ownership, clock seams, Redis/Mongo fixtures, and browser-only Playwright cases are defined. | `node --test` suite and Playwright suite pass against isolated test services without production secrets. |
| Build readiness | PASS: package dependencies and existing CommonJS/React/Vite layout were inspected. | PASS: no new dependency is required; build and startup commands are named. | `npm run build`, server startup in test mode, and the scoped test commands pass. |
| Scope control | PASS: feature specification limits work to authentication/session boundaries. | PASS: affected files and explicit exclusions are enumerated; no registration, charts, import scheduling, or account-management changes are planned. | Review confirms only listed auth/session, tests, contracts, and planning files change. |

No constitutional exception or complexity justification is needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-authentication-sessions/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── authentication-http.md
    └── authenticated-websocket.md
```

`tasks.md` is intentionally not created; it belongs to the separate Spec Kit tasks phase.

### Source Code (repository root)

```text
server.cjs                              # Fastify plugins, Redis session cookie configuration, shared auth registration
routes/
├── authenticate.cjs                    # POST /authenticate credential verification and session establishment
├── protectIndex.cjs                    # protected SPA and public-market route boundary
└── wsHandler.cjs                       # /ws upgrade and message authorization boundary
ws/
├── wsCheckSession.cjs                  # session-status command
└── wsDestroySession.cjs                # current-session destruction command
client/src/
├── Login.jsx                           # accessible sign-in UI, generic errors, pending state
├── main.jsx                            # authenticated app gate and logout flow
└── hooks/useAppWebSocket.js            # cookie-authenticated socket connection lifecycle
tests/                                  # new Node built-in test files for auth/session behavior
client/tests/                           # new or amended Playwright browser behavior tests
```

**Structure Decision**: Retain the existing single Fastify server and embedded React/Vite SPA. Add only a small server-side authentication helper module under `routes/` or `utils/` if implementation needs one reusable guard; it must own session verification, Redis-TTL renewal, cookie clearing, and safe failures so HTTP and WebSocket paths cannot diverge.

## Implementation Phases

### Phase 1 — Establish one authoritative authentication model

**Goal**: Make one Redis session the only grant for private access and its signed opaque HttpOnly session cookie the sole browser Authentication Evidence.

| ID | File(s) | Deterministic implementation action | Completion criteria |
|---|---|---|---|
| PLAN-001 | `server.cjs`; new shared auth helper | Configure `@fastify/session` with one signed opaque session cookie using `httpOnly: true`, `secure: true` in HTTPS production, `sameSite: 'lax'`, and `Path=/`, with no `cookie.maxAge` or `Expires`. Use a browser-session cookie; use `secure: 'auto'` only if local HTTP test mode requires it. Require an environment-backed, stable session secret; remove per-process random session crypto material that would make persistent sessions unverifiable across restarts. | The browser cookie has no `Max-Age`/`Expires`; deployment without required secrets fails startup rather than issuing insecure sessions. |
| PLAN-002 | new shared auth helper | Define `establishAuthenticatedSession`, `validateAuthenticatedRequest`, `renewAuthenticatedState`, `destroyCurrentSession`, and `clearAuthenticationCookie`. Store `userId`, `username`, `userType`, required Torn context, `authenticatedAt`, and `lastAuthenticatedActivityAt` in the Redis session. Verify session presence, 24-hour inactivity, Redis record TTL/state, and registered-user context before private access. On every successfully validated protected HTTP request and private WebSocket command, update `lastAuthenticatedActivityAt` and renew the Redis record TTL to exactly 86,400 seconds. Return a single internal result shape; external failures are generic. | HTTP and WebSocket paths call the same validation path and grant access only when session state is valid; every validated activity renews Redis TTL to exactly 24 hours. |
| PLAN-003 | `routes/authenticate.cjs` | Accept only non-empty bounded username/passkey strings; normalize the username consistently for lookup and throttle keys without altering stored identity semantics. Look up the user, perform bcrypt comparison using a fixed dummy bcrypt hash when no user exists, and always return the contract's generic failure body for denied credentials. Never return exception text, hashes, Torn keys, or user-existence signals. | Unknown username, wrong passkey, malformed credential input, and cooldown all have indistinguishable user-facing credential failure text. |
| PLAN-004 | `routes/authenticate.cjs`; shared auth helper | On valid credentials, regenerate the existing session identifier before setting identity fields and persist the authenticated Redis record with a TTL of exactly 86,400 seconds. Send only the signed opaque HttpOnly browser-session cookie; do not issue a JWT or accept/place any bearer token in response JSON, `localStorage`, URLs, logs, WebSocket query parameters, or error payloads. Clear relevant failure counters after successful authentication. | Successful JSON response contains `{ success: true }` only; browser receives one session cookie; a newly authenticated session cannot reuse the pre-login session ID. |

### Phase 2 — Enforce cooldown and protected HTTP boundaries

**Goal**: Enforce the exact account-or-IP cooldown rule atomically and apply the shared guard to every protected page/deep link while keeping the public market public.

| ID | File(s) | Deterministic implementation action | Completion criteria |
|---|---|---|---|
| PLAN-005 | `routes/authenticate.cjs`; shared auth helper | Use Redis atomic counters with keys derived from a keyed cryptographic digest of normalized account and normalized client network source; never store raw username/IP in a key that may be exposed in diagnostics. Before bcrypt validation, deny when either cooldown key is active. On each failed attempt, increment both counters and set a 900-second expiry on first increment; the fifth failure begins/continues the 900-second cooldown and the sixth and later attempt is denied without credential verification. If Redis is unavailable, fail closed with the generic authentication failure and log only a sanitized server event. | Five failures for one account across IPs, or one IP across accounts, block the sixth request for 15 minutes; counters expire and a valid login works after simulated time advances. |
| PLAN-006 | `routes/protectIndex.cjs`; `server.cjs` | Replace ad hoc session-or-bearer checks with the shared session guard on `/index.html`, `/chart`, `/chart/*`, `/memory`, and `/memory/*`; ensure all protected SPA HTML responses are `Cache-Control: no-store, private, max-age=0`, `Pragma: no-cache`, and `Expires: 0`. Redirect a browser navigation lacking valid state to `/`; return no private HTML before redirect. Do not weaken the explicitly public `/public-bazaar` route, which must be served with its existing no-store headers. | Missing, expired, destroyed, or dependency-unverifiable state cannot receive protected HTML; `/public-bazaar` remains available signed out. |
| PLAN-007 | `server.cjs`; `routes/authenticate.cjs` | Set no-store response headers on authentication responses and cookie-clearing responses. Configure CORS to an explicit configured first-party origin in production rather than reflecting arbitrary origins with credentials. Keep local development/test origin configuration explicit and documented. | Credentialed cross-origin requests from an unconfigured origin fail; auth JSON is not cacheable. |

### Phase 3 — Make WebSocket authentication and logout fail closed

**Goal**: Bind existing WebSocket connections and all private commands to current server-side authentication, and invalidate only the caller's browser session on sign-out.

| ID | File(s) | Deterministic implementation action | Completion criteria |
|---|---|---|---|
| PLAN-008 | `server.cjs`; `routes/wsHandler.cjs`; `client/src/hooks/useAppWebSocket.js` | Retain the existing `/ws` and `/wsb` endpoints. Let the browser send its same-origin HttpOnly session cookie during the upgrade; validate the Redis-backed session before accepting/using a private connection. Do not accept a JWT, bearer credential, or any credential query parameter. For every invalid upgrade, send `{"type":"auth","ok":false,"error":"unauthenticated"}` as the first and only frame, then close with code 4401 before `newSocket`, scheduled work, or private handlers run. | No browser authentication evidence appears in WebSocket URLs, browser history, proxy logs, or client storage; unauthenticated sockets cannot trigger private work. |
| PLAN-009 | `routes/wsHandler.cjs`; `ws/wsCheckSession.cjs`; all private handlers reachable from `/ws` and `/wsb` | Validate session state at connection establishment and before dispatching every private command, including `checkSession`, `destroySession`, `torn`, `tornAttacks`, stats, networth, data retrieval, and price updates. On every successfully validated private command, renew `lastAuthenticatedActivityAt` and the Redis TTL to exactly 86,400 seconds; do not attempt to set or renew a cookie on an established WebSocket. On failure, send only `{"type":"auth","ok":false,"error":"unauthenticated"}` and close with code 4401; never call data functions or scheduled jobs. Make `checkSession` return `session_active: false` for every invalid state without leaking why. | A valid connection that expires, is logged out, or loses Redis access cannot run the next private command; WebSocket activity alone maintains the server-side 24-hour window without any `Set-Cookie`. |
| PLAN-010 | `routes/authenticate.cjs`; `ws/wsDestroySession.cjs`; `routes/wsHandler.cjs`; `client/src/main.jsx`; shared auth helper | Add `POST /logout` as the browser logout operation: await destruction of the requesting Redis session, clear the one session cookie in the HTTP response, then return 204. Have `main.jsx` call it before closing current-browser app sockets and clearing private UI. Keep `destroySession` for socket compatibility: it destroys the matching server session, sends its acknowledgement, and closes; it does not attempt to alter HTTP cookie headers. On destroy failure, clear client-only UI state, close sockets, show a safe retryable failure, and do not present private UI as authenticated. Do not enumerate or revoke sessions belonging to other browsers. Remove `localStorage.jwt`, its storage listener, and decoded-token UI identity; obtain display identity from validated session/status data only. | After acknowledged logout, the same browser cookie and open/new sockets have no private access while an independently authenticated second browser remains active. |

### Phase 4 — Complete accessible client behavior and verification

**Goal**: Make the sign-in/sign-out UX conform to the contract and prove all boundaries with the allowed test tools and build checks.

| ID | File(s) | Deterministic implementation action | Completion criteria |
|---|---|---|---|
| PLAN-011 | `client/src/Login.jsx`; `client/src/main.jsx` | Use explicit `htmlFor`/`id` labels, `required` inputs, `aria-describedby`, an `aria-live="polite"` generic error region, disabled submit while pending, and a visible progress label. On network/5xx response show a recoverable generic service message; on 401/429 show the same generic credential error. Redirect/reload only after `{ success: true }`; never parse or persist a token. Provide a keyboard-operable logout control that awaits the server result. | Empty inputs make no request; repeated click/Enter creates one pending request; errors are announced without internal detail. |
| PLAN-012 | new `tests/authentication*.test.cjs`; new `tests/session*.test.cjs`; new `tests/websocket-auth*.test.cjs` | Add Node built-in tests with isolated MongoDB/Redis fixtures, deterministic clock injection or fake timers, and a real Fastify instance. Cover password success/failure indistinguishability, dummy compare, session fixation prevention, the one-cookie session contract, rolling 24-hour Redis TTL expiry/renewal, five-failure account/IP cooldown and 900-second release, Redis/Mongo/session failures, protected HTTP headers/routes, public market, status, logout isolation, socket upgrade/message rejection, no `Set-Cookie` expectation for established WebSocket activity, and no private handler invocation after invalidation. | Tests fail against the current insecure behavior and pass only when every contract assertion is met. |
| PLAN-013 | `client/tests/authentication-sessions.spec.ts`; Playwright config/fixtures only if needed | Add Playwright tests using test-only provisioned users and isolated storage states: keyboard login success, generic invalid error, duplicate-submit prevention, public-market access, protected redirect, reload continuity, no JWT in `localStorage` or WS URL, one HttpOnly browser-session cookie with no `Max-Age`, current-browser logout, and accessible labels/live error. Use a second isolated browser context to prove logout does not end another browser's session. Do not use production URLs or credentials. | Browser tests pass locally against the isolated test server; no test contains a real account, passkey, API key, or production endpoint. |
| PLAN-014 | planning artifacts; repository commands | Validate all planning files for placeholders and contract consistency. Then, during implementation validation, run `node --test` with the scoped files, the scoped Playwright command, `npm run build`, and a test-mode Fastify startup/route smoke check. | No planning placeholder, unresolved marker, or template instruction remains; all prescribed validation commands exit zero. |

## Alternatives Considered

- **ALT-001 — Keep JWT in `localStorage` and `?token=` WebSocket URLs**: Rejected. Browser JWT evidence creates avoidable XSS, URL, log, and referrer exposure; one HttpOnly opaque session cookie avoids that exposure.
- **ALT-002 — Use JWT alone with no Redis session**: Rejected. It cannot provide immediate current-browser-only invalidation, reliable rolling inactivity, or server-side logout without adding a revocation list that duplicates the existing session store.
- **ALT-003 — Invalidate every session for a user on logout**: Rejected. FR-009 explicitly requires current-browser-only logout and permits concurrent browser sessions.
- **ALT-004 — Add a generic rate-limit plugin**: Rejected. The requirement is a combined account-or-network-source rule with a precise fifth-failure/15-minute policy, best implemented atomically in the existing Redis dependency.
- **ALT-005 — Replace WebSockets with authenticated REST polling**: Rejected. It changes the established realtime architecture and is outside this feature.

## Dependencies

- **DEP-001**: MongoDB availability and the existing `sessions.users` identity records with bcrypt passkey hashes.
- **DEP-002**: Redis availability for `connect-redis` session records and atomic cooldown state.
- **DEP-003**: Deployment configuration supplies strong stable `SESSION_SECRET`, a keyed cooldown-digest secret, configured first-party origin, and HTTPS/proxy settings.
- **DEP-004**: Existing Fastify, Redis, MongoDB, bcrypt, React, Vite, and Playwright packages in `package.json`; no new runtime dependency is planned. Unrelated existing JWT package usage is outside this feature's scope.

## Files

- **FILE-001**: `server.cjs` — session/cookie, origin, WebSocket registration, and secure startup configuration.
- **FILE-002**: `routes/authenticate.cjs` — login, generic denial, cooldown, session regeneration, and session-cookie issue.
- **FILE-003**: `routes/protectIndex.cjs` — shared protected-route guard and cache policy.
- **FILE-004**: `routes/wsHandler.cjs`, `ws/wsCheckSession.cjs`, `ws/wsDestroySession.cjs` — socket guard, status, and logout contract.
- **FILE-005**: `client/src/Login.jsx`, `client/src/main.jsx`, `client/src/hooks/useAppWebSocket.js` — no-token client flow, accessibility, and logout behavior.
- **FILE-006**: New scoped `tests/*.test.cjs` and `client/tests/authentication-sessions.spec.ts` — automated verification only.

## Testing

- **TEST-001**: Node built-in tests verify server logic and contracts with isolated stores and deterministic expiry/cooldown time.
- **TEST-002**: Node WebSocket tests prove that missing, malformed, expired, mismatched, destroyed, and dependency-unverifiable state cannot establish or use private channels.
- **TEST-003**: Playwright verifies real browser cookie, routing, accessibility, reload, public market, and current-browser-only logout behavior.
- **TEST-004**: Build and test-server smoke checks prove CommonJS/Vite compatibility and route registration.

## Risks & Assumptions

- **RISK-001**: Cookie `Secure` and `SameSite` behavior differs in HTTP local development. Mitigation: production is HTTPS-only; test mode has an explicit, isolated cookie policy and a browser test that exercises it.
- **RISK-002**: Reverse-proxy IP normalization can be spoofed if `trustProxy` is too broad. Mitigation: configure trusted proxy addresses explicitly before relying on `req.ip` for cooldowns.
- **RISK-003**: Existing non-auth socket handlers may presume `req.session` is always populated. Mitigation: guard before dispatch and add tests asserting no handler invocation when unauthenticated.
- **RISK-004**: Redis outage prevents session and cooldown verification. Mitigation: fail closed and provide only a generic retryable message; availability remediation is operational, not a client bypass.
- **ASSUMPTION-001**: Registered users already exist and their `passkey` values are bcrypt hashes; registration/recovery are out of scope.
- **ASSUMPTION-002**: A valid same-origin HTTPS deployment can set and return the signed opaque HttpOnly session cookie on HTTP login/logout; established WebSocket connections do not set cookies.
- **ASSUMPTION-003**: `TornAPIKey` is necessary private server-side context but is never serialized to browser clients, logs, or contracts.

## Related Specifications / Further Reading

- [Feature specification](./spec.md)
- [Research decisions](./research.md)
- [Data model](./data-model.md)
- [Quickstart validation guide](./quickstart.md)
- [HTTP authentication contract](./contracts/authentication-http.md)
- [Authenticated WebSocket contract](./contracts/authenticated-websocket.md)
- [Fastify session documentation](https://github.com/fastify/session)
- [Fastify WebSocket documentation](https://github.com/fastify/fastify-websocket)
