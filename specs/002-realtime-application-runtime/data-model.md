# Data Model: Realtime Application Runtime

**Feature**: `002-realtime-application-runtime`
**Date**: 2026-08-17

This feature is transport/runtime; it introduces no new persisted entity. It consumes the authenticated session from Feature #001 and the message types documented in `openapi-ws.yaml`. The entities below are *runtime* entities with no storage.

## Realtime Connection (runtime entity)

|| Field | Type | Rules |
|---|---|---|
| `id` | string (connection id) | Unique per open socket; used for logging and per-socket cleanup. |
| `url` | string | Same-origin `wss`/`ws` URL for `/ws` (private) or `/wsb` (public bazaar). No credential/token/session-id/host override. |
| `status` | enum `connecting \| open \| closed` | User-visible lifecycle; `connecting` covers initial open and any reconnect attempt. |
| `authenticated` | boolean | `true` only after the server validates the session and the client observes an authenticated acknowledgement/session frame. |
| `reconnectPending` | boolean | Exactly one reconnect timer may be pending at a time; cleared on `open` and on unmount. |
| `heartbeat` | interval | Client `ping` cadence (`heartbeatMs`, default 25000); cleared on close/unmount. |
| `closeReason` | string/number | Application close code `4401` (unauthenticated) ⇒ auth-failing (no reconnect). Anything else ⇒ transient (reconnect). |

**State transitions**

```text
closed --mount--> connecting --socket open + authenticated --> open
open --transient close/pong-timeout--> connecting --retry--> open
open --4401 / auth.ok===false--> closed (no reconnect; surface sign-in)
connecting --unmount--> closed (cancel heartbeat + reconnect timer)
open --server peer-dead (pong timeout)--> closed (clean teardown; client reconnects)
```

## Message Dispatch (runtime entity)

|| Aspect | Behavior |
|---|---|
| Routing key | `type` field of the decoded JSON frame (client bus and server router). |
| Registration | `onImportedData`, `onGetAllTornItems`, `onManualLogs`, `onImportStopped`, `onNetworthInsert`, `onStatsInsert`, `onCompanyStock`, …, plus a generic `onAny`. |
| Malformed frame | Skipped without throwing; optional `onMalformed` hook; later frames unaffected. |
| Unregistered type | Ignored cleanly; no error surfaced to the user. |
| Handler freshness | Latest handler identity used per dispatch (ref pattern); no stale-closure drops. |
| Backlog bound | `maxMessages` (default 800) undelivered messages retained per consumer; oldest dropped beyond the bound. |

## Reconnect / Keep-alive Policy (runtime, configured)

|| Field | Default | Source |
|---|---|---|
| `heartbeatMs` (client ping) | 25000 | hook option |
| `reconnectMs` (retry backoff) | 1000 | hook option |
| `maxMessages` (backlog bound) | 800 | hook option |
| `WS_PING_INTERVAL_MS` (server ping) | 30000 | env |
| `WS_PONG_TIMEOUT_MS` (server dead-peer) | 2× interval (default 60000) | env |

These are configuration values, not user-facing guarantees (Assumptions in spec.md).

## Contract message reference (consumed, not defined here)

Client→server and server→client message types are authoritative in `openapi-ws.yaml` and mirrored in `contracts/realtime-connection.md` and `contracts/message-dispatch.md`. This feature changes only the *transport/resilience* semantics (reconnect classification, status, bounded dispatch), not individual domain payload shapes.
