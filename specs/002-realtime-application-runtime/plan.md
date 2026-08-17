# Implementation Plan: Realtime Application Runtime

**Branch**: `feature/time-machine-realtime-application-runtime` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-realtime-application-runtime/spec.md`

## Summary

Deliver resilient realtime runtime around the existing WebSocket transport: same-origin authenticated up-grades, keep-alive/heart-beat, bounded transient reconnect, discrete non-blocking status, type-based safe message dispatch with bounded backlog, and a `socketClose` teardown signal so consumers can release per-socket state. The implementation leaves domain payloads untouched; it only hardens the connection lifecycle and dispatch mechanism.

## Technical Context

**Language/Version**: Node.js CommonJS (server) / React 19.1.1 + Vite 7.1.5 (client). Node 22 type defs installed.

**Primary Dependencies**: Fastify 5.3.2, `@fastify/session` 11.1.0, `connect-redis` 8.1.0, `redis` 5.8.2, `@fastify/websocket` 11.0.2, Mongoose 8.14.2, React 19, Vite 7.1.5. Existing WebSocket routing and auth from Feature #001.

**Storage**: Redis for Fastify sessions; no new persistence. Client holds a bounded message backlog in memory.

**Testing**: Node built-in `node:test` + `node:assert/strict` for raw WebSocket contract, reconnect, keep-alive and teardown tests. Playwright for browser status indicator and unmount cleanup only.

**Target Platform**: Same-origin HTTPS Fastify deployment serving the React/Vite SPA; local test mode uses isolated Mongo/Redis.

**Performance Goals**: Meet SC-001/SC-002: first realtime update after sign-in within 2 s; auto-reconnect after transient loss within the bounded retry cadence; no UI blocking.

**Constraints**: No new dependency. No domain payload changes. Keep existing session cookie as sole credential. Do not embed credentials/tokens in WebSocket URLs. Client reconnect must never fire on a 4401/unauthenticated close. Client must cancel all timers on unmount (SC-007). Server intervals must be cleared on socket close. Keep-alive timings are env-configurable but with sensible defaults.

**Scale/Scope**: One private `/ws` endpoint, one public `/wsb` (unaffected). Client hooks `useAppWebSocket.js` and `useWsMessageBus.js`, server `routes/wsHandler.cjs`, `socketEvents.cjs` are the affected files.

## Constitution Check

No project-specific constitution; the untouched Spec-Kit template provides no enforceable gates. The following gates apply:

| Gate | Evidence required before implementation |
|---|---|
| Secure transport | Same-origin wss, cookie-only auth, no credential in URL. |
| Testability | Isolated Node WebSocket tests covering transient reconnect, 4401 no-reconnect, teardown cleanup, malformed frame skip; Playwright checks status indicator and unmount cleanup. |
| Build readiness | `npm run build` passes; Fastify startup in test mode works. |
| Scope control | Only runtime resilience & dispatch changes; domain payloads untouched. |

## Project Structure

### Documentation (this feature)

```text
specs/002-realtime-application-runtime/
├── spec.md
├── plan.md
├── research.md        ← generated
├── data-model.md      ← generated
├── quickstart.md      ← generated
└── contracts/
    ├── realtime-connection.md   ← generated
    └── message-dispatch.md      ← generated
```

`tasks.md` is intentionally not created; it belongs to the separate Speckit tasks phase.

## Phase 0: Research and Clarifications

Research artifacts (`research.md`, `data-model.md`) and clarifications are already captured in spec.md. The unknowns identified pre-plan have been resolved via the three clarifications (transient auto-reconnect with 4401 no-reconnect; discrete non-blocking status; transport/runtime only, no domain payloads). The plan proceeds.

## Phase 1: Design & Contracts

The design is captured in the generated artifacts:

- `research.md` — Existing findings and decisions (D-001 … D-008)
- `data-model.md` — Runtime entities: Realtime Connection, Message Dispatch, Reconnect/Keep-alive policy
- `contracts/realtime-connection.md` — URL construction, status lifecycle, reconnect classification, keep-alive, teardown, fail-closed
- `contracts/message-dispatch.md` — Server and client routing by `type`, robustness for malformed/unregistered, bounded backlog, handler freshness
- `quickstart.md` — Isolated validation steps, Node/WebSocket contract tests and Playwright status checks

The artifacts are ready for the tasks phase.
