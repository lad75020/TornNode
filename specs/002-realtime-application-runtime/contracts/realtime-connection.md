# Contract: Realtime Connection Lifecycle

**Feature**: `002-realtime-application-runtime`
**Version**: 1.0 planned contract

## Endpoints

| Endpoint | Auth | Purpose | This feature's scope |
|---|---|---|---|
| `GET /ws` upgrade | Required (signed session cookie) | Private authenticated realtime | Resilient connect, keep-alive, reconnect, status, teardown |
| `GET /wsb` upgrade | Public (no auth; server API key) | Bazaar price stream | In scope only for the reconnect/keep-alive runtime shape; auth scope belongs to Bazaar Monitoring |

## URL construction (client)

- Build the URL as `ws(s)://<same-origin-host>/ws` (or `/wsb`). Protocol is `wss` when the page is `https`, else `ws`; host is `window.location.host`.
- A fallback host may be configured via `VITE_FALLBACK_HOST` for the rare case the page host is unavailable.
- **Forbidden**: any `token`, `jwt`, session-id, username, or host override query/path segment. The session cookie is the sole credential (Feature #001).

## Connection status (client)

| Status | Meaning | Consume |
|---|---|---|
| `connecting` | Initial open or a reconnect attempt in progress | Show reconnecting indicator; do not block the dashboard |
| `open` | Socket open and (for `/ws`) authenticated acknowledgement/session frame observed | Live data flows |
| `closed` | No connection (or an auth-failing close, or unmount) | Sign-in path when caused by 4401 |

## Reconnect classification

| Close cause | Classification | Action |
|---|---|---|
| Application code `4401` (unauthenticated) or an `auth.ok === false` frame | **auth-failing** | Do **not** reconnect; surface sign-in; stop private sends |
| Server restart, pong timeout, network error, any other close | **transient** | Reconnect on a bounded cadence (`reconnectMs`), single pending timer, cancelled on open/unmount |

## Keep-alive

- Client sends a text `ping` every `heartbeatMs` (default 25000); `pong` frames are ignored by the consumer.
- Server pings every `WS_PING_INTERVAL_MS` (default 30000) and closes a dead peer after `WS_PONG_TIMEOUT_MS` (default 60000) without pong. The interval is cleared on every close.

## Teardown

- On owning-view unmount: cancel the heartbeat interval and any pending reconnect timer, set `closed`, and close the socket. No orphaned loop may survive.
- Server: on every socket `close`, clear its ping interval and emit a `socketClose` event on `socketEvents` with the connection id so per-socket consumer state (e.g. import send-wrappers) can be released.
- An established WebSocket never attempts to set or roll a browser cookie.

## Fail closed

- Private `/ws` operations failing on session-store, Mongo, or an upstream dependency return a generic recoverable error and never leak exception text, secrets, or internal identifiers. Unauthenticated upgrades send one `{"type":"auth","ok":false,"error":"unauthenticated"}` frame, then close `4401`.
