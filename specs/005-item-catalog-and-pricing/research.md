# Research: Item Catalog and Pricing

## Evidence Reviewed

- Codebase-memory project `Volumes-WDBlack4TB-Code-tornnode` is indexed and ready. The graph identifies `Autocomplete`, `ItemsTypeDropdown`, `wsGetAllTornItems`, `wsUpdatePrice`, the WebSocket dispatcher, IndexedDB helpers, and Redis cache utilities as the relevant dependency slice.
- Direct source reads covered `client/src/main.jsx`, `client/src/Autocomplete.jsx`, `client/src/ItemsTypeDropdown.jsx`, `client/src/UpdatePrice.jsx`, `client/src/syncItemsToIndexedDB.js`, `routes/wsHandler.cjs`, `ws/wsGetAllTornItems.cjs`, `ws/wsUpdatePrice.cjs`, `utils/itemsCacheKey.cjs`, and `utils/tornSyncHelpers.cjs`.
- Existing feature `specs/003-torn-data-synchronization` documents and tests the baseline cache-first catalog, atomic IndexedDB replacement, and last-known-good retention behavior.
- The root `package.json` confirms the existing Node test runner, Vite build, React, `idb`, MongoDB, Redis, Torn client, and Playwright dependencies. The deprecated `client/package.json` must not be used for installation.

## Existing Baseline

The application already has:

- An authenticated Item Prices modal wired to `Autocomplete` and `ItemsTypeDropdown`.
- Existing `getAllTornItems` and `updatePrice` WebSocket messages dispatched by `routes/wsHandler.cjs`.
- A server catalog handler that scans RedisJSON per-item keys, rejects incomplete cache records, falls back to `TORN.Items`, repopulates Redis in chunks, and returns a safe catalog error.
- A browser `ItemsDB.items` store and `itemsLastSync` marker. `writeItemsToIndexedDB` uses a read/write transaction and writes the marker after `tx.done`.
- Existing watch/unwatch callbacks and Bazaar alert state that must not be redesigned.

The gap is not a new end-to-end subsystem. The gap is that `main.jsx` still performs an unconditional request and five-minute poll while `Autocomplete` already contains a partial local-first policy, and `wsUpdatePrice` can return a successful envelope with a null price or synthetic fallback item after an invalid/missing update.

## Decisions

### Decision 1: Keep IndexedDB as the local-first catalog

**Chosen**: Read `ItemsDB.items` first, show the last valid snapshot immediately, and request a fresh catalog only when the snapshot is missing or its marker is more than ten minutes old.

**Why**: This matches the existing UI and synchronization implementation, avoids duplicate network traffic, and supports temporary server/API outages without erasing usable local data.

**Rejected**: A new React context or a new client cache library. It would duplicate the existing IndexedDB contract and increase scope.

### Decision 2: Use one freshness policy and storage marker

**Chosen**: Define the ten-minute threshold and marker parsing beside the IndexedDB helpers. Keep `itemsLastSync` as the cross-tab notification marker and write it only after a successful transaction.

**Why**: `Autocomplete`, future Item Prices callers, and tests need identical missing/stale behavior. The storage event already provides cross-tab refresh without polling.

**Rejected**: Keep the five-minute application-wide timer. It violates the local-first requirement and causes catalog traffic even when no Item Prices view is open.

### Decision 3: Preserve last-known-good data on every failed replacement

**Chosen**: Treat non-array, empty, incomplete, and transaction-failing responses as failed synchronization. Do not clear IndexedDB or advance the marker in those cases.

**Why**: A failed refresh must not make a previously usable catalog disappear. It also makes marker time a trustworthy commit timestamp rather than a response timestamp.

**Rejected**: Clear first and refill later. That creates an avoidable empty window and loses offline tolerance.

### Decision 4: Keep the current WebSocket contracts

**Chosen**: Preserve `getAllTornItems` and `updatePrice` message types and the existing authenticated WebSocket route.

**Why**: Existing components, tests, and route dispatch already depend on these names. The feature is a reliability correction, not a transport migration.

**Rejected**: Add REST endpoints or a second message namespace. That would duplicate authentication and client plumbing.

### Decision 5: Reject invalid price updates instead of returning partial success

**Chosen**: Validate the item identifier, supplied price, market lookup result, MongoDB item existence, and resulting price before writing. Return a generic safe failure response for invalid/unavailable cases.

**Why**: The current handler can parse prefixes such as `1abc`, can leave `price` undefined, and can synthesize `{ id, price }` when MongoDB has no item. Those states can corrupt the client catalog or cache.

**Rejected**: Allow a nullable success response and let the client decide. A successful transport envelope must mean the durable update is valid.

### Decision 6: Use existing verification tools

**Chosen**: Add focused `node:test` coverage for backend handlers, run `npm run build`, and run the existing authenticated Playwright smoke test when credentials/session setup is available.

**Why**: Node tests can deterministically stub MongoDB, Redis, sockets, and market responses. The production build verifies JSX/module integration without adding a frontend unit-test stack.

**Rejected**: Add Vitest or another test runner only for this feature. The repository has no such baseline and the feature does not justify a new dependency.

## Open Questions Resolved During Clarification

No critical ambiguities remained after applying the preserved decisions from the workflow context. The ten-minute freshness threshold, storage marker, failure retention, cache strategy, authentication boundary, price-source behavior, and watched-item preservation are explicitly encoded in `spec.md`.
