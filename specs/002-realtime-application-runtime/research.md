# Research: Realtime Application Runtime

**Feature**: `002-realtime-application-runtime`
**Date**: 2026-08-17

## Existing implementation findings

| Area | Observed implementation | Planning consequence |
|---|---|---|
| Server runtime | `server.cjs` builds a Fastify 5.x app, registers `@fastify/session` (Redis-backed via `connect-redis`), `@fastify/websocket`, and `routes/wsHandler.cjs`. Test mode reads isolated Mongo/Redis loopback URLs. | Keep the Fastify/Redis/WebSocket stack. This feature hardens the *runtime* around the existing `/ws` upgrade and keep-alive, not the transport itself. |
| WebSocket boundary | `routes/wsHandler.cjs` registers `GET /ws` with a 60/minute rate limit, calls `authorizeSocket` (validate+renew the Redis session, close `4401` on failure), emits `socketEvents.emit('newSocket', socket, req)`, and runs a `setInterval` ping/pong watchdog with `WS_PING_INTERVAL_MS`/`WS_PONG_TIMEOUT_MS`. | Keep the authenticated-upgrade and watchdog. Verify the watchdog cleanly closes a dead peer (no leak of the interval on close) and that an established socket never sets a cookie. |
| Socket registry | `socketEvents.cjs` is a single `EventEmitter`; `newSocket` is emitted on open. There is no `removeSocket`/teardown signal. | Add a teardown signal so consumers and the runtime can detect socket close without each owning timer leaking. |
| Message dispatch (server) | `wsHandler.cjs` switches on the raw command string (`ping`, `torn`, `stats`, `checkSession`, `destroySession`, …) and falls back to a JSON parse for structured commands (`companyTrainRange`, `getTornAttacks`, `updatePrice`, …). Unknown plain commands fall through to a default branch. | Formalize dispatch: ensure an undecodable/JSON-failure frame does not throw, is logged at a safe level, and does not stop later frames; preserve the existing command routing. |
| Client connection hook | `client/src/hooks/useAppWebSocket.js` opens a same-origin `ws(s)://` URL, sends a `ping` heartbeat (`heartbeatMs`), auto-reconnects on transient close (`schedule()` with `reconnectMs`), stops reconnect and calls `onUnauthorized()` on close code `4401`, and cleans up on unmount. It already tracks a `status` (`open`/`closed`). | Gap-fill: expose a `connecting`/`reconnecting` distinct from `open`; bound the reconnect attempts/cadence; ensure reconnect timers are cleared on unmount and when `open` succeeds; confirm the `status` enum used by consumers. |
| Client message bus | `client/src/hooks/useWsMessageBus.js` inspects only the latest message of the `messages` array, `JSON.parse`s it, and dispatches by `parsed.type` to registered handlers (with `onAny` fallback). `useAppWebSocket` caps `messages` to `maxMessages` (default 800). | Gap-fill: guarantee a malformed frame is skipped (already `try/catch`), add an `onMalformed`/ignore path that never throws, and document the bounded backlog (`maxMessages`) as the memory bound. Confirm latest-handler identity via the existing `handlersRef` pattern. |
| WebSocket contract | `openapi-ws.yaml` documents `/ws` (authenticated, session cookie, keep-alive timing envs, client-to-server and server-to-client message types incl. `session`) and `/wsb` (public bazaar, `watch`/`unwatch`, no auth). | Extend the contract to record reconnect/transient-vs-authfailing semantics and the bounded-backlog rule for consumers; keep it the source of truth. |
| Test tooling | Node `node:test` + `node:assert/strict` and Playwright are installed (mirrors Feature #001). | Reuse the isolated test harness: raw WebSocket contract tests for transient close/reconnect and 4401 no-reconnect; Playwright only for status indicator and unmount cleanup in the browser. |

## Decisions

### D-001 — Same-origin secure-websocket connection is the single realtime transport

**Decision**: The client opens exactly one authenticated `/ws` connection per private view using the same-origin `wss`(ws) URL and the browser's signed HttpOnly session cookie. Protocol and host are derived from `window.location` (HTTPS ⇒ `wss`); no credential, token, session ID, or host override is embedded in the URL.

**Rationale**: Same-origin + session cookie is the only authentication evidence that already exists (Feature #001). Deriving the URL from the page origin avoids hard-coded hosts and keeps the connection resilient to environment changes.

**Rejected**: Hard-coded host, token-in-URL, and a second parallel connection per view. They break the "session is the sole identity source" invariant and multiply reconnect surfaces.

### D-002 — Transient vs. auth-failing close, with no auto-reconnect on 4401

**Decision**: A close with the application's "unauthenticated" code (4401) or an `auth.ok === false` frame is an **auth-failing** close: never auto-reconnect, and surface a sign-in path. Every other close (server restart, idle/pong-timeout, network blip, non-application close) is **transient** and triggers a bounded, non-hammering reconnect.

**Rationale**: This is the clarified behavior (clarification #1). It prevents a logged-out user from being hammered while reconnecting on a transient blip, and it prevents a logged-out user from silently reconnecting into private data.

**Rejected**: Always-reconnect (leaks private data to a logged-out user) and always-stop (degrades the dashboard after every transient blip).

### D-003 — Bounded, single, idempotent reconnect loop with full teardown

**Decision**: The reconnect cadence uses `reconnectMs` (default 1000ms) with a single outstanding timer at any moment. When a socket reaches `open`, any pending reconnect timer is cancelled. On unmount, all timers are cancelled and the socket is closed so no orphaned loop survives. A `shouldReconnect` flag plus the cancelled pending timer prevent stacked/duplicate reconnects.

**Rationale**: Prevents reconnect storms on a flapping connection and guarantees no timer/interval leaks after the owning view unmounts (SC-007).

**Rejected**: Fire-and-forget timers that can stack; unbounded retry with no cancellation.

### D-004 — Discrete, non-blocking connection status

**Decision**: Expose a `status` of `connecting | open | closed` (with `connecting` covering the initial open and any reconnect attempt). The status is consumed by a non-blocking indicator; it never gates the primary dashboard render.

**Rationale**: Implements clarification #2 (non-blocking status indicator) and FR-007 (SC-001/SC-002 visibility).

**Rejected**: A blocking modal or a status that pauses dashboard rendering.

### D-005 — Safe, non-throwing type-based dispatch with bounded backlog

**Decision**: Both the server command router and the client bus dispatch by a message `type`. An undecodable/malformed frame is skipped (never throws), logged at a safe level without internal detail, and does not block later frames. Unregistered types are ignored cleanly. The client holds at most `maxMessages` (default 800) undelivered messages (bounded backlog). The client uses a latest-intent handler ref so dispatch never sees a stale closure.

**Rationale**: Implements FR-008..FR-010 (SC-005, SC-006) — robustness and memory boundedness under mixed/malformed traffic.

**Rejected**: Throwing on bad frames; unbounded message arrays; dispatching against a captured handler closure.

### D-006 — Server keep-alive watchdog with clean teardown

**Decision**: The server keeps each socket alive with a configurable heartbeat (`WS_PING_INTERVAL_MS`, default 30000) and closes a dead peer when no pong arrives within `WS_PONG_TIMEOUT_MS` (default 2× interval). The interval is cleared on every socket close so a dead/removed socket leaves no running timer.

**Rationale**: Detects a dead peer deterministically and frees it so a transient condition can be recovered by a client reconnect; prevents timer leaks (SC-007 on the server side).

### D-007 — Fail closed / generic failures for private operations

**Decision**: Private realtime operations fail closed on session-store, Mongo, or upstream dependency failure, returning a generic recoverable error and never leaking exception text, secrets, or internal identifiers to the client or unredacted logs.

**Rationale**: Mirrors Feature #001's fail-closed posture (D-005 there) and FR-012.

### D-008 — `socketEvents` gains a teardown signal

**Decision**: Add a `socketClose` event on the `socketEvents` `EventEmitter`, emitted on socket close, carrying the connection id. Consumers can release per-socket state (e.g. the `torn` import wrappers that monkey-patch `socket.send`).

**Rationale**: Today only `newSocket` is emitted, so downstream per-socket cleanup is ad hoc. A teardown signal makes runtime cleanup deterministic and testable without changing `wsHandler` routing.

## Alternatives considered

- A message-queue/replay layer on top of WebSocket — rejected as out of scope (belongs to domain features); the backlog bound suffices for this feature.
- Server-side push registry keyed by user for multi-tab fan-out — rejected; one connection per view and per-socket dispatch already meet the requirement.
- A shared external pub/sub (Redis pub/sub) for cross-instance fan-out — rejected as out of scope for a single Fastify runtime.
