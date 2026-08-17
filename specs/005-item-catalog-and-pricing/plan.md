# Implementation Plan: Item Catalog and Pricing

**Branch**: `feature/time-machine-item-catalog-and-pricing` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-item-catalog-and-pricing/spec.md`

## Summary

The repository already contains the main Item Prices UI, IndexedDB persistence, RedisJSON item caching, MongoDB fallback, authenticated WebSocket routing, and price-refresh messages. This feature completes and hardens that existing slice rather than introducing a second catalog architecture.

The implementation will centralize the ten-minute local-catalog freshness policy, remove the unconditional five-minute catalog polling from `client/src/main.jsx`, and make the Item Prices view the local-first synchronization owner. Valid catalog responses will be atomically persisted before the synchronization marker is advanced; malformed, empty, or failed writes will preserve the last known-good snapshot. The server catalog handler will keep its cache-first/authoritative-fallback behavior while applying strict item and price validation. The price handler will reject malformed identifiers, invalid supplied prices, unavailable market prices, missing items, and persistence failures without returning a successful `null` price or creating a phantom record. Focused Node integration tests plus the existing client build/browser checks will verify both transport contracts and regression behavior.

## Technical Context

**Language/Version**: JavaScript/JSX; Node.js runtime using the repository's current supported version; browser modules built by Vite

**Primary Dependencies**: Fastify 5, `@fastify/websocket`, MongoDB driver, Redis/RedisJSON, `torn-client`, React 19, `idb`, Vite, Node built-in `node:test`, Playwright

**Storage**: MongoDB `TORN.Items` authoritative catalog; RedisJSON per-item keys `tornItems:v2:<id>` with 24-hour expiry; browser IndexedDB `ItemsDB.items`; browser `localStorage.itemsLastSync` synchronization marker

**Testing**: Node built-in test runner for server handlers and contracts; `npm run build` for the Vite client; existing Playwright Item Prices smoke test when an authenticated browser token/session is available

**Target Platform**: Authenticated browser clients communicating with the TornNode Fastify WebSocket server; local development and production deployments using the existing MongoDB, Redis, and Torn API integrations

**Project Type**: Full-stack web application with a React/Vite client and Fastify/WebSocket backend

**Performance Goals**: Fresh local catalogs should render without waiting for a catalog network response; in-memory name/type filtering should remain within the existing 200 ms interaction target; complete Redis catalogs should avoid an authoritative MongoDB read

**Constraints**: Preserve the last valid catalog on invalid/empty/failed synchronization; advance `itemsLastSync` only after a committed IndexedDB transaction; retain existing authentication, WebSocket message names, Item Prices modal, and watched-item behavior; do not add a client dependency manager or install dependencies from `client/`

**Scale/Scope**: One shared Torn item catalog, potentially hundreds or thousands of records, one authenticated application session per browser tab, and the existing Item Prices/Bazaar alert integration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository constitution is still the untouched Spec Kit placeholder template (`.specify/memory/constitution.md`) and defines no project-specific principles, ratified gates, or governance rules. There are therefore no effective constitutional violations to waive. In its place, this plan uses the established repository gates: preserve existing transport/authentication contracts, validate all untrusted catalog and price data, keep local writes atomic, add focused regression coverage, run the client build, run `git diff --check`, and report pre-existing changes separately from this feature's outputs.

**Post-design re-check**: The design reuses existing modules and message types, adds no new runtime service or dependency, isolates server changes to item catalog/price handlers and shared safe errors, and preserves the existing watch/unwatch flow. The gate remains passed.

## Phase 0: Research Decisions

The detailed evidence and alternatives are recorded in [research.md](./research.md). The decisions are:

1. Treat the already implemented synchronization/cache behavior from `specs/003-torn-data-synchronization` as the baseline and implement only the missing coordination and hardening required by this feature.
2. Keep `getAllTornItems` and `updatePrice` as the public WebSocket message types and reuse the existing session gate.
3. Put the ten-minute freshness calculation and marker parsing beside the existing IndexedDB catalog helpers so `Autocomplete` and any future caller use one policy.
4. Keep the local catalog last-known-good and make the client surface safe failure feedback without replacing valid rows.
5. Validate price updates before MongoDB/Redis writes and return one safe failure envelope for invalid or unavailable updates.
6. Use Node integration tests and the existing Vite/Playwright checks rather than introducing another frontend test framework.

## Phase 1: Design and Implementation Plan

### Server changes

- Extend the shared synchronization safe-error catalog with a generic price-update failure message.
- Harden `ws/wsGetAllTornItems.cjs` item validation so identifiers are real safe integers (numeric strings accepted only when unambiguous), prices are finite non-negative numbers, and authoritative empty/incomplete catalogs fail safely instead of being exposed.
- Preserve cache-first behavior, RedisJSON key format, TTL, MongoDB fallback, chunked cache repopulation, and authenticated access.
- Refactor `ws/wsUpdatePrice.cjs` validation and result handling:
  - accept only a positive safe item identifier;
  - distinguish an omitted price (market lookup) from a supplied invalid price (safe rejection);
  - accept only finite non-negative numeric prices and normalize them consistently;
  - validate the market lookup result before persistence;
  - require an existing item before updating or repopulating its cache record;
  - do not report success with a `null` price or synthetic item;
  - keep variation logging best-effort and keep internal errors in logs only.
- Keep `routes/wsHandler.cjs` dispatch and its existing authenticated WebSocket semantics intact.

### Client synchronization changes

- Add shared catalog synchronization constants/helpers to `client/src/syncItemsToIndexedDB.js` for reading `itemsLastSync` and determining whether a local snapshot is older than ten minutes.
- Strengthen client catalog validation to reject incomplete/non-finite records before replacing IndexedDB, while allowing the existing optional `type` field and stable item representation.
- Preserve atomic clear-and-replace semantics, last-known-good data, and marker-after-commit semantics. An empty incoming catalog must never clear a valid local snapshot.
- Remove `client/src/main.jsx`'s unconditional initial request and five-minute timer. The Item Prices surface will request only when its local snapshot is missing or stale; its response handler will not perform a second competing catalog write.
- Update `client/src/Autocomplete.jsx` to use the shared freshness policy, guard duplicate catalog requests during an in-flight response, retain valid rows on synchronization failure, and display a safe catalog/price-refresh error state. Successful price responses must update the visible row only when the identifier and price are valid.
- Keep `client/src/ItemsTypeDropdown.jsx` synchronized with committed/local data and preserve unique trimmed, stable type ordering. Do not change watched-item selection behavior.
- Update `client/src/UpdatePrice.jsx` to compare normalized identifiers, accept only finite non-negative successful prices, and rewrite the local catalog only after a valid success response.

### Verification changes

- Add `tests/item-catalog-pricing.test.cjs` with focused handler-level integration tests for complete/incomplete catalogs, strict identifiers/prices, safe fallback failures, successful supplied prices, market-price fallback, missing items, and no phantom success records.
- Extend or add client-facing smoke assertions where the existing Playwright setup can run without credentials; otherwise keep the authenticated browser command documented in `quickstart.md` and use the production build as the deterministic client verification gate.
- Run the focused Node tests, the complete client build, `git diff --check`, and the queue/artifact validation commands before marking the feature implemented.

## Project Structure

### Documentation (this feature)

```text
specs/005-item-catalog-and-pricing/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── feature.json
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── websocket-catalog.md
│   └── websocket-price.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/
├── main.jsx
├── Autocomplete.jsx
├── ItemsTypeDropdown.jsx
├── UpdatePrice.jsx
└── syncItemsToIndexedDB.js

routes/
└── wsHandler.cjs

ws/
├── wsGetAllTornItems.cjs
└── wsUpdatePrice.cjs

utils/
├── itemsCacheKey.cjs
└── tornSyncHelpers.cjs

tests/
├── helpers/tornSyncTestHarness.cjs
├── torn-data-synchronization.test.cjs
└── item-catalog-pricing.test.cjs
```

**Structure Decision**: Retain the existing full-stack web application layout. The React client owns local-first catalog presentation and persistence, the existing WebSocket route remains the transport boundary, the two item handlers own server catalog/price behavior, and Node integration tests exercise the backend contracts without adding a new framework.

## Complexity Tracking

No constitution violations or new architectural projects are introduced. The implementation is intentionally limited to existing client helpers/components, existing item WebSocket handlers, shared safe errors, and focused tests. A new service, repository abstraction, cache namespace, or dependency would be unnecessary for this feature and is rejected in favor of the current architecture.
