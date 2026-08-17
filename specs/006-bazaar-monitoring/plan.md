# Implementation Plan: Bazaar Monitoring

**Branch**: `feature/time-machine-bazaar-monitoring` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-bazaar-monitoring/spec.md`

## Summary

Harden the existing Bazaar live-monitoring path around one validated lowest-listing representation, then carry that representation through threshold alerts, persistence, history, and the public view. The server will retain the existing Torn refresh, Mongo/Redis persistence, and Fastify WebSocket architecture. A dependency-free market-normalization helper will be shared by server code, the Vite client bundle, and deterministic Node tests. `/wsb` will gain a narrow anonymous market-only capability; `/ws` remains protected.

The clarified alert rule is authoritative: calculate the minimum of valid listings, trigger when `minimum <= threshold`, suppress repeats until a valid minimum is strictly greater than the threshold, and do not reset on empty/malformed data.

## Technical Context

**Language/Version**: Node.js CommonJS backend; React 19/Vite JavaScript frontend

**Primary Dependencies**: Fastify 5, `@fastify/websocket`, MongoDB, Redis, `torn-client`, React 19, IndexedDB via `idb`; no new dependency

**Storage**: MongoDB `TORN.Items`; Redis item/variation caches; browser `localStorage` for watches/thresholds; IndexedDB `ItemsDB` and `LogsDB` for client snapshots/history

**Testing**: Node built-in `node:test` for pure logic and WebSocket/handler harnesses; existing auth regression suite; Vite static build; optional Playwright smoke check if the local server is available

**Target Platform**: Fastify server and modern browser clients

**Project Type**: Full-stack web application with authenticated and public WebSocket surfaces

**Performance Goals**: Preserve the existing refresh interval and API rate cap; process one market snapshot in the client without unbounded history growth; public read commands must not trigger Torn API calls or aggregate writes

**Constraints**: Do not weaken private WebSocket authorization; do not expose sessions, API keys, account analytics, or internal exception text; preserve the last valid current row across invalid/empty updates; do not add a framework or dependency

**Scale/Scope**: Existing item catalog and watch set, multiple simultaneous WebSocket clients, current daily aggregate/history collections; feature changes are limited to Bazaar and shared public market boundaries

## Constitution Check

The repository constitution is still the untouched Spec Kit placeholder and defines no project-specific gates. No constitution violation is introduced. The following feature gates are applied instead from the specification and existing security tests:

- [x] `/ws` remains authenticated and fail-closed.
- [x] Anonymous `/wsb` dispatch is explicitly allow-listed to market/catalog/aggregate reads only.
- [x] Public responses use allow-listed fields and generic client errors.
- [x] External Torn and database data is validated before persistence, broadcast, or display.
- [x] Existing Fastify/CommonJS/React/WebSocket architecture is reused.

## Project Structure

### Documentation (this feature)

```text
specs/006-bazaar-monitoring/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── websocket.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
utils/
└── bazaarMarket.cjs                 # shared normalization/minimum/threshold helpers

ws/
├── wsBazaarPrice.cjs                # refresh, per-socket subscriptions, public commands
├── wsDailyPriceAverages.cjs         # validated aggregate history and safe errors
└── wsGetAllTornItems.cjs            # reuse catalog reads for public allow-listed access

routes/
└── wsHandler.cjs                    # opt-in anonymous authorization; private path unchanged

client/src/
hooks/
└── useBazaarAlerts.js               # persisted state, ordering, min-price alerts
├── BazaarTable.jsx                   # min/threshold/stale/unavailable presentation
├── BazaarSalesGraph.jsx              # history validation and date-range refresh
├── DailyPriceAveragesChart.jsx       # public read-only mode and validated empty states
└── PublicBazaarPage.jsx              # `/wsb` only; no authenticated socket

tests/
├── bazaar-market.test.cjs           # pure normalization and threshold behavior
├── ws-bazaar-market.test.cjs         # server payload/subscription behavior
└── public-bazaar-websocket.test.cjs  # anonymous allow-list and private rejection
```

**Structure Decision**: Keep business logic in a small framework-independent utility, retain WebSocket handlers at their existing paths, and test the public/private boundary with the repository's existing socket harness style. No new service layer or frontend test framework is necessary for this incremental feature.

## Implementation Phases

### Phase 0 — Research and contracts

Completed in `research.md`, `data-model.md`, `contracts/websocket.md`, and `quickstart.md`. The clarification and public/private boundary are explicit before code changes.

### Phase 1 — Core data and server transport

1. Add and test shared input normalization and minimum/threshold helpers.
2. Make Torn listing mapping reject invalid prices and quantities, and emit a canonical minimum snapshot.
3. Add opt-in anonymous authorization only for `/wsb`; keep `/ws` tests and behavior unchanged.
4. Separate per-connection subscriptions from the internal refresh set so public selections are local and unwatching one client cannot remove another client's refresh item.
5. Route public catalog and daily-history reads through `/wsb` with field allow-lists and safe errors; never expose the authenticated aggregate-build command.

### Phase 2 — Client monitoring and history

1. Sanitize persisted watch/threshold state and expose stable setter wrappers.
2. Process only watched, valid, newest snapshots; preserve the last valid row through empty/malformed messages.
3. Implement the clarified threshold episode state machine and retain existing browser Notification/toast semantics.
4. Update the table to use `<=`, avoid invalid threshold display, and show disconnected/stale/empty states.
5. Make the public page use only `/wsb`, request its own public catalog/history, and keep public watch selections local.
6. Harden daily and sales history filtering/date-range behavior and ensure read-only public mode cannot build aggregates.

### Phase 3 — Verification

Run focused unit/handler tests, the authentication/boundary regression suite, the static build, `git diff --check`, and inspect the final diff/status. Fix any build or test failure before marking the feature complete. Do not push or set `pushed: true`.

## Complexity Tracking

No constitution violations or unnecessary architectural additions are planned. The per-socket subscription map is required to satisfy the public-local watch scope without weakening the existing shared refresh optimization; a global UI watch list was rejected because it leaks one visitor's selection into another visitor's public experience.
