# Research: Authentication and Sessions

**Feature**: `001-authentication-sessions`
**Date**: 2026-08-06

## Existing implementation findings

| Area | Observed implementation | Planning consequence |
|---|---|---|
| HTTP login | `routes/authenticate.cjs` looks up a Mongoose user, compares bcrypt passkey, writes Fastify session fields, signs a 24-hour JWT, and returns it in JSON. | Keep bcrypt, MongoDB, and the Redis-backed Fastify session; remove JWT issuance and browser token delivery from this feature boundary. |
| Session store | `server.cjs` already configures `@fastify/session` with a `connect-redis` `RedisStore` and `rolling: true`. It has no explicit max age and creates random crypto keys on each process start. | Use one signed opaque browser-session cookie with no `Max-Age`/`Expires`; set the Redis record TTL to exactly 24 hours on authenticated activity and use a stable server secret. |
| Private pages | `routes/protectIndex.cjs` accepts either `req.session.TornAPIKey` or an `Authorization` bearer JWT. | Replace mixed checks with one session guard, remove bearer authentication from this boundary, no-store private HTML, and retain `/public-bazaar` as public. |
| WebSocket | `server.cjs` decodes a JWT from a `token` query parameter and can permit missing/invalid state. | Use the same-origin HttpOnly session cookie only, validate Redis session state before work, and close invalid connections before handlers. |
| Browser client | `Login.jsx` stores JWT in `localStorage`; `useAppWebSocket.js` appends it to WebSocket URLs. | Remove JavaScript token persistence, bearer handling, and query strings; cookies ride same-origin fetch and socket handshakes. |
| Logout/status | `destroySession` does not await/acknowledge destruction; `checkSession` only checks `TornAPIKey`. | Make both use the shared session validator/destroy helper and establish contract responses. |
| Test tooling | Playwright is installed; existing test material includes a production credential. | New server tests use `node:test`; scoped authentication tests use isolated test data only. |

## Decisions

### D-001 — One Redis-backed Fastify session is the authorization authority

**Decision**: Each successful login regenerates one Fastify session and stores identity/context plus `authenticatedAt` and `lastAuthenticatedActivityAt`. The signed opaque HttpOnly session cookie identifies that Redis record and is itself the browser's Authentication Evidence. No browser JWT, bearer credential, or second authentication cookie participates in this feature.

**Rationale**: Redis sessions provide immediate current-browser revocation and rolling timeout with a single authoritative grant.

**Rejected**: JWT-only authorization cannot deliver reliable current-browser logout without a revocation store; a paired-token/session scheme adds contradictory browser expiry and WebSocket renewal semantics without adding authority.

### D-002 — Authentication Evidence is one HttpOnly browser-session cookie

**Decision**: Login responds with `{ "success": true }` and sends one signed opaque session cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. It deliberately has no `Max-Age` or `Expires`, making it a browser-session cookie. Logout clears that same cookie with the same scope and `Max-Age=0`.

**Rationale**: Browser-session lifetime avoids a client-side fixed expiry defeating a Redis session renewed by WebSocket-only activity. The opaque HttpOnly cookie removes JavaScript and URL credential exposure.

**Rejected**: Returning a JWT for `localStorage`, an Authorization header, or a WebSocket query parameter preserves avoidable exposure. A fixed 24-hour cookie lifetime conflicts with server-side rolling renewal when an established WebSocket cannot receive `Set-Cookie`.

### D-003 — Exact rolling inactivity policy is server-side

**Decision**: `lastAuthenticatedActivityAt` and the Redis record TTL are renewed to exactly 86,400 seconds on every successfully validated protected HTTP request and private WebSocket command. A request or command at or after `lastAuthenticatedActivityAt + 24h` is invalid: destroy the session when possible, clear the cookie only in an HTTP response, deny/close the socket, and require login. An established WebSocket never attempts to roll a cookie or send `Set-Cookie`.

**Rationale**: This precisely implements the clarified rolling 24-hour inactivity requirement while respecting WebSocket protocol constraints.

**Rejected**: Fixed browser-cookie or JWT expiry violates rolling behavior for websocket-only activity; client-side timers are bypassable and cannot authorize server actions.

### D-004 — Combined account-or-network cooldown

**Decision**: Compute privacy-preserving Redis keys for normalized username and normalized trusted-proxy client IP. On every failed login, atomically increment both and apply 900-second TTL when created. Once either counter reaches five, covered attempts are denied for its remaining TTL; the sixth is denied without bcrypt work. A success clears only the authenticated account and current IP keys after both checks succeed.

**Rationale**: This implements the exact five-failure/15-minute rule while limiting enumeration and brute-force attempts.

### D-005 — Fail closed for dependencies

**Decision**: MongoDB lookup, Redis counter/session access, session persistence, and identity/context verification failures deny private access. Logs use structured event names and sanitized identifiers; browser replies never expose exception text.

### D-006 — Current-browser logout

**Decision**: Logout destroys only `req.session` identified by the requesting browser's session cookie, clears that browser's session cookie, closes its active sockets, and does not search/revoke sessions for the same `userId`.

### D-007 — WebSocket authorization happens before and during use

**Decision**: `/ws` and `/wsb` validate the session cookie and Redis state before work. Every private message revalidates state and, on success, renews Redis TTL/activity timestamp to exactly 24 hours. Invalidation, expiry, or Redis failure yields a minimal unauthenticated message and close. `checkSession` reports `false` for every invalid state. No cookie is set or renewed on an established WebSocket.

### D-008 — Tests use realistic boundaries with no secret fixtures

**Decision**: Node built-in tests own server behavior, fake time, Fastify injection, session/Redis/Mongo fixtures, and raw WebSocket protocol tests. Playwright owns browser-only behavior. Tests use a bcrypt-hashed fixture user in an isolated test database and never hit deployment.

## Resolved planning questions

| Question | Resolution |
|---|---|
| What is the Authentication Evidence? | One signed opaque HttpOnly Fastify session cookie that identifies the authoritative Redis session. |
| What expires authentication? | Exactly 24 consecutive hours with no successfully validated private HTTP request or WebSocket command, enforced by `lastAuthenticatedActivityAt` and Redis TTL. |
| Does the cookie have a fixed expiry? | No. It has no `Max-Age`/`Expires`; HTTP may refresh it without fixed expiry, while WebSocket activity renews only Redis state. |
| What counts as a login failure? | Missing/invalid credentials, unknown account, incorrect passkey, or active cooldown; text remains generic. Only validation failures increment counters; dependency errors fail closed without mutation. |
| What is the threshold/cooldown? | Five failures per normalized account or trusted network source; reject covered further attempts for 900 seconds. |
| Which browser session is logged out? | Only the session identified by the requesting browser's session cookie. |
| Are browser JWTs, bearer auth, or token query parameters supported? | No. They are removed from this feature boundary; unrelated existing JWT package usage is untouched. |
| Can unauthenticated users use the market? | Yes, `/public-bazaar` only. |
| Are registration/recovery part of this work? | No. |
| Are new packages required? | No. |
