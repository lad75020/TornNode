# Research: Bazaar Monitoring

## Existing system

- The backend is CommonJS Node.js on Fastify 5, with `@fastify/websocket`, MongoDB (`TORN.Items`), Redis, and a Torn market client.
- `ws/wsBazaarPrice.cjs` already refreshes watched item listings, persists changed minima, records daily variation logs, and broadcasts `priceUpdate` messages.
- `client/src/hooks/useBazaarAlerts.js` already persists watches and thresholds, but it currently treats every listing as a row, alerts without checking the local watch set, uses truthiness for thresholds, and does not reject stale updates.
- `/public-bazaar` is intentionally unguarded, while `/ws` is the authenticated application socket. `PublicBazaarPage` currently opens both `/wsb` and `/ws`; the latter makes the public chart unusable for an unauthenticated visitor.
- `ws/wsDailyPriceAverages.cjs` already returns aggregate item history without an API key, but its error response exposes the internal exception message and its public capability is only reachable through the authenticated `/ws` router.
- Existing tests use Node's built-in `node:test` runner and small handler/socket harnesses. No frontend unit-test framework is configured.

## Decisions

### 1. One canonical validation and minimum-price rule

Create a dependency-free CommonJS helper at `utils/bazaarMarket.cjs`. Both the server and the browser bundle will use it to normalize item IDs, prices, quantities, timestamps, and listing collections. The helper will return the lowest valid positive listing while preserving that listing's quantity and optional seller. Invalid entries are discarded; an empty valid collection is represented as unavailable rather than as price zero.

This directly encodes the clarification: threshold evaluation uses the lowest valid listing, triggers at `minimum <= threshold`, and resets only when a later valid minimum is strictly greater than the threshold.

### 2. Keep private WebSocket authorization unchanged; add a narrow public capability

`authorizeSocket` remains fail-closed for the existing `/ws` route and for all callers by default. It gains an explicit `allowAnonymous` option used only by `/wsb`. The public socket can serve market-only data, public item catalog data, and aggregated daily history; it cannot dispatch private `/ws` commands, build aggregates, refresh item prices on demand, or return session/API-key information.

The public chart and item picker will use `/wsb` exclusively. The authenticated application will continue using `/ws` for its existing commands.

### 3. Separate UI subscriptions from the server refresh set

The existing `dynamicWatchSet` is useful as an internal refresh set and may continue to include seeded historical items. It must not be sent as another visitor's watch list or be removed globally when one visitor un-watches an item. Track subscriptions per socket and use reference counts for dynamically added refresh items. Public watch state remains client-local, satisfying the public-view scope in the specification while preserving efficient shared market refreshes.

### 4. Preserve last valid data and expose transport state

A malformed or empty update will advance the per-item ordering watermark but will not replace the last valid row or reset a threshold episode. A valid update with an older timestamp will be ignored. The UI will derive a stale/unavailable message from the WebSocket status and the age of the last valid snapshot instead of displaying a missing value as zero.

### 5. Reuse persisted history, harden its boundary

Daily price history will continue to come from `Items.dailyPriceAverages` and sales history from the existing IndexedDB log store. Server and client boundaries will filter invalid IDs, dates, prices, and points, preserve valid records, sort chronologically, and return/render a clear empty state. The public history read will use the same aggregate handler with safe, generic client-facing errors.

## Alternatives rejected

- **Alert on any listing**: rejected because the clarification explicitly selected the current minimum.
- **Alert on a user-selected listing**: rejected because it would require a new listing identity and selection workflow not present in the feature.
- **Make `/ws` anonymous**: rejected because it would weaken the protected application boundary and expose unrelated commands.
- **Add a new HTTP/API framework or dependency**: rejected; the existing Fastify/WebSocket paths and built-in test runner are sufficient.
- **Clear rows on empty updates**: rejected because FR-004 requires preserving the last valid summary and the alert episode must not reset without a valid recovery above the threshold.
